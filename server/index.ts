import express from "express";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AreaGroup,
  FbConfig,
  FbLabel,
  JobConfigEntry,
  JobConfigMap,
  MetaPayload,
  OfficialApiResponse,
  RecruitDetail,
  RecruitFetchPayload,
  RecruitQuery,
  RecruitRow,
  UpdateAsset,
  UpdateCheckPayload,
  UpdateProvider
} from "../src/types";
import { DEFAULT_UPDATE_PROVIDER, OFFICIAL_SOURCE_REPO, UPDATE_PROVIDER_LABELS } from "../src/config";
import { buildOfficialRecruitParams, collectPaginatedRows } from "../src/lib/pagination";

const PORT = Number(process.env.PORT ?? 8797);
const OFFICIAL_API_HOME = "https://apiff14risingstones.web.sdo.com/api/home/";
const PAGE_SIZE = 100;
const PAGE_DELAY_MS = 180;
const MAX_PAGES = 80;
const UPDATE_DOWNLOAD_RETRIES = 3;
const UPDATE_DOWNLOAD_TIMEOUT_MS = 600_000;
const UPDATE_DOWNLOAD_TIMEOUT_SECS = 600;
const OFFICIAL_ORIGIN = "https://ff14risingstones.web.sdo.com";
const OFFICIAL_REFERER = `${OFFICIAL_ORIGIN}/pc/index.html#/recruit/party`;
const moduleDir = getModuleDir();
const bundledStaticDir = path.resolve(moduleDir, "dist");
const workspaceStaticDir = path.resolve(moduleDir, "../dist");
const DEFAULT_STATIC_DIR = fs.existsSync(path.join(bundledStaticDir, "index.html")) ? bundledStaticDir : workspaceStaticDir;
const STATIC_DIR = process.env.STATIC_DIR ?? DEFAULT_STATIC_DIR;
const APP_INFO = readAppInfo(moduleDir);
const UPDATE_REPOSITORIES = readUpdateRepositories(APP_INFO);
const GEOIP_ENDPOINTS = [
  {
    name: "ipwho.is",
    url: "https://ipwho.is/",
    countryCodeKey: "country_code",
    countryNameKey: "country"
  },
  {
    name: "ipapi.co",
    url: "https://ipapi.co/json/",
    countryCodeKey: "country_code",
    countryNameKey: "country_name"
  }
];

const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.setHeader(
    "Access-Control-Allow-Origin",
    origin && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) ? origin : "http://127.0.0.1:5173"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use(express.json({ limit: "32kb" }));

app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/api/health", (_, res) => {
  res.json({ ok: true, service: "risingstones-partyfinder-helper" });
});

app.get("/api/version", (_, res) => {
  res.json({
    name: APP_INFO.name,
    version: APP_INFO.version,
    builtAt: APP_INFO.builtAt,
    portable: APP_INFO.portable,
    platform: `${process.platform}-${process.arch}`,
    runtime: APP_INFO.runtime
  });
});

app.get("/api/geoip", async (req, res) => {
  const controller = requestAbortController(req);

  try {
    const geo = await detectGeoIp(controller.signal);
    res.json(geo);
  } catch (error) {
    const message = error instanceof Error ? error.message : "GeoIP 检测失败";
    res.json({
      countryCode: "",
      countryName: "",
      recommendedProvider: getFallbackUpdateProvider(),
      source: "fallback",
      fallback: true,
      fetchedAt: new Date().toISOString(),
      message
    });
  }
});

app.get("/api/update/check", async (req, res) => {
  const controller = requestAbortController(req);
  const provider = readUpdateProvider(req.query.provider);
  const repo = provider ? UPDATE_REPOSITORIES[provider] : "";

  if (!provider) {
    res.status(400).json({ message: "更新源只支持 github 或 gitee。" });
    return;
  }

  if (!repo) {
    res.status(503).json({ message: `${UPDATE_PROVIDER_LABELS[provider]} 尚未配置发布源。` });
    return;
  }

  try {
    const release = await fetchLatestRelease(provider, repo, controller.signal);
    const payload: UpdateCheckPayload = {
      provider,
      sourceLabel: UPDATE_PROVIDER_LABELS[provider],
      currentVersion: APP_INFO.version,
      latestVersion: release.tagName,
      latestName: release.name || release.tagName,
      latestUrl: release.htmlUrl,
      publishedAt: release.publishedAt,
      body: release.body,
      assets: release.assets,
      isNewer: isVersionNewer(release.tagName, APP_INFO.version),
      fetchedAt: new Date().toISOString()
    };

    res.json(payload);
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/update/install", async (req, res) => {
  const request = readUpdateInstallRequest(req.body);
  if (!request) {
    res.status(400).json({ message: "更新请求缺少有效的更新包名称或下载地址。" });
    return;
  }

  try {
    const result = await preparePortableUpdate(request.assetName, request.downloadUrl);
    res.json(result);
    scheduleProcessExitForUpdate();
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/meta", async (req, res) => {
  const controller = requestAbortController(req);

  try {
    const [fbConfigs, labels, areas, jobConfig] = await Promise.all([
      fetchOfficial<FbConfig[]>("recruit/getFbConfigList", {}, controller.signal),
      fetchOfficial<FbLabel[]>("recruit/fbLabelList", {}, controller.signal),
      fetchOfficial<AreaGroup[]>("groupAndRole/getAreaAndGroupList", {}, controller.signal),
      fetchOfficial<JobConfigMap>("recruit/getJobConfigList", {}, controller.signal)
    ]);

    const payload: MetaPayload = {
      fbConfigs,
      labels,
      areas,
      jobConfig,
      jobMeta: normalizeJobMeta(jobConfig),
      fetchedAt: new Date().toISOString()
    };

    res.json(payload);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/recruits", async (req, res) => {
  const controller = requestAbortController(req);
  const query = extractRecruitQuery(req.query);

  if (!query.fb_name.trim()) {
    res.status(400).json({
      message: "必须先选择副本名称，才允许全量拉取招募。"
    });
    return;
  }

  const warnings: string[] = [];

  try {
    const firstPage = await fetchRecruitPage(query, 1, controller.signal);
    const collected = await collectPaginatedRows({
      firstPage,
      maxPages: MAX_PAGES,
      fetchPage: (page) => fetchRecruitPage(query, page, controller.signal),
      beforePage: () => sleep(PAGE_DELAY_MS, controller.signal)
    });
    warnings.push(...collected.warnings);

    const payload: RecruitFetchPayload = {
      count: collected.count,
      fetched: collected.rows.length,
      rows: collected.rows,
      query,
      pageSize: PAGE_SIZE,
      fetchedAt: new Date().toISOString(),
      warnings
    };

    res.json(payload);
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/recruit-detail", async (req, res) => {
  const controller = requestAbortController(req);
  const id = readQueryString(req.query.id);

  if (!/^\d+$/.test(id)) {
    res.status(400).json({ message: "招募 ID 格式不正确。" });
    return;
  }

  try {
    const detail = await fetchOfficial<RecruitDetail>("recruit/getRecruitFbDetail", { id }, controller.signal);
    res.json({
      detail,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    sendError(res, error);
  }
});

if (process.env.SERVE_STATIC !== "false" && fs.existsSync(path.join(STATIC_DIR, "index.html"))) {
  app.use(express.static(STATIC_DIR));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }

    res.sendFile(path.join(STATIC_DIR, "index.html"), (error) => {
      if (error) {
        next(error);
      }
    });
  });
}

app.listen(PORT, "127.0.0.1", () => {
  const localUrl = `http://127.0.0.1:${PORT}`;
  console.log(`RisingStones helper API listening on ${localUrl}`);
  if (process.env.AUTO_OPEN_BROWSER === "true") {
    openLocalUrl(localUrl);
  }
});

async function fetchRecruitPage(
  query: RecruitQuery,
  page: number,
  signal: AbortSignal
): Promise<{ count: string | number; rows: RecruitRow[] }> {
  return fetchOfficial<{ count: string | number; rows: RecruitRow[] }>(
    "recruit/recruitFbList",
    buildOfficialRecruitParams(query, page, PAGE_SIZE),
    signal
  );
}

async function fetchOfficial<T>(
  path: string,
  params: Record<string, string | undefined>,
  signal: AbortSignal,
  attempt = 0
): Promise<T> {
  const url = new URL(path, OFFICIAL_API_HOME);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        Origin: OFFICIAL_ORIGIN,
        Referer: OFFICIAL_REFERER,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`官方接口 HTTP ${response.status}`);
    }

    const json = (await response.json()) as OfficialApiResponse<T>;
    const code = json.code ?? json.Code;
    if (code !== 10000 && code !== 0) {
      throw new Error(json.msg || `官方接口返回异常 code=${code}`);
    }

    return json.data;
  } catch (error) {
    if (signal.aborted || attempt >= 2) {
      throw error;
    }
    await sleep(300 * (attempt + 1), signal);
    return fetchOfficial<T>(path, params, signal, attempt + 1);
  }
}

async function fetchLatestRelease(
  provider: UpdateProvider,
  repo: string,
  signal: AbortSignal
): Promise<{
  tagName: string;
  name: string;
  htmlUrl: string;
  publishedAt: string;
  body: string;
  assets: UpdateAsset[];
}> {
  const url = getLatestReleaseUrl(provider, repo);
  let json: Record<string, unknown>;

  try {
    json = (await fetchJson(url, signal)) as Record<string, unknown>;
  } catch {
    return fetchLatestTag(provider, repo, signal);
  }

  const tagName = readObjectString(json, "tag_name");
  if (!tagName) {
    throw new Error("发布源没有返回有效版本号。");
  }

  return {
    tagName,
    name: readObjectString(json, "name"),
    htmlUrl:
      readObjectString(json, "html_url") ||
      (provider === "gitee" ? `https://gitee.com/${repo}/releases/tag/${encodeURIComponent(tagName)}` : ""),
    publishedAt: readObjectString(json, "published_at") || readObjectString(json, "created_at"),
    body: readObjectString(json, "body"),
    assets: normalizeReleaseAssets(json.assets ?? json.attach_files)
  };
}

async function fetchLatestTag(
  provider: UpdateProvider,
  repo: string,
  signal: AbortSignal
): Promise<{
  tagName: string;
  name: string;
  htmlUrl: string;
  publishedAt: string;
  body: string;
  assets: UpdateAsset[];
}> {
  const tagsUrl =
    provider === "github"
      ? `https://api.github.com/repos/${repo}/tags?per_page=1`
      : `https://gitee.com/api/v5/repos/${repo}/tags?page=1&per_page=1`;
  const tags = (await fetchJson(tagsUrl, signal)) as unknown[];
  const first = Array.isArray(tags) && tags[0] && typeof tags[0] === "object" ? (tags[0] as Record<string, unknown>) : null;
  const tagName = first ? readObjectString(first, "name") : "";
  if (!tagName) {
    throw new Error("发布源没有 Release，也没有可用标签。");
  }

  return {
    tagName,
    name: tagName,
    htmlUrl:
      provider === "github"
        ? `https://github.com/${repo}/releases/tag/${encodeURIComponent(tagName)}`
        : `https://gitee.com/${repo}/releases/tag/${encodeURIComponent(tagName)}`,
    publishedAt: readTagDate(first),
    body: "未找到正式 Release，已使用最新 Git tag 作为版本参考。",
    assets: [
      {
        name: `${tagName}-source.zip`,
        downloadUrl:
          provider === "github"
            ? `https://github.com/${repo}/archive/refs/tags/${encodeURIComponent(tagName)}.zip`
            : `https://gitee.com/${repo}/repository/archive/${encodeURIComponent(tagName)}.zip`
      }
    ]
  };
}

function getLatestReleaseUrl(provider: UpdateProvider, repo: string): string {
  return provider === "github"
    ? `https://api.github.com/repos/${repo}/releases/latest`
    : `https://gitee.com/api/v5/repos/${repo}/releases/latest`;
}

async function detectGeoIp(signal: AbortSignal) {
  const errors: string[] = [];

  for (const endpoint of GEOIP_ENDPOINTS) {
    try {
      const json = (await fetchJsonWithTimeout(endpoint.url, signal, 5000)) as Record<string, unknown>;
      const countryCode = readObjectString(json, endpoint.countryCodeKey).toUpperCase();
      const countryName = readObjectString(json, endpoint.countryNameKey);
      if (!countryCode) {
        errors.push(`${endpoint.name}: empty country code`);
        continue;
      }

      return {
        countryCode,
        countryName,
        recommendedProvider: recommendUpdateProvider(countryCode),
        source: endpoint.name,
        fallback: false,
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      errors.push(`${endpoint.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(errors.join("; ") || "GeoIP 检测失败");
}

function recommendUpdateProvider(countryCode: string): UpdateProvider {
  return countryCode === "CN" && UPDATE_REPOSITORIES.gitee ? "gitee" : "github";
}

function getFallbackUpdateProvider(): UpdateProvider {
  return UPDATE_REPOSITORIES.gitee ? DEFAULT_UPDATE_PROVIDER : "github";
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: "application/json",
      "User-Agent": "risingstones-partyfinder-helper"
    }
  });

  if (!response.ok) {
    throw new Error(`更新源 HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchJsonWithTimeout(url: string, signal: AbortSignal, timeoutMs: number): Promise<unknown> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const abort = () => timeoutController.abort();
  signal.addEventListener("abort", abort, { once: true });

  try {
    return await fetchJson(url, timeoutController.signal);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

function normalizeReleaseAssets(value: unknown): UpdateAsset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((asset) => {
      if (!asset || typeof asset !== "object") {
        return null;
      }
      const record = asset as Record<string, unknown>;
      const name = readObjectString(record, "name");
      const downloadUrl = readObjectString(record, "browser_download_url") || readObjectString(record, "download_url");
      if (!name || !downloadUrl) {
        return null;
      }
      const size = Number(record.size);
      return {
        name,
        downloadUrl,
        ...(Number.isFinite(size) && size > 0 ? { size } : {})
      };
    })
    .filter((asset): asset is UpdateAsset => Boolean(asset));
}

function readUpdateInstallRequest(value: unknown): { assetName: string; downloadUrl: string } | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const assetName = readObjectString(record, "assetName").trim();
  const downloadUrl = readObjectString(record, "downloadUrl").trim();
  return assetName && downloadUrl ? { assetName, downloadUrl } : null;
}

async function preparePortableUpdate(assetName: string, downloadUrl: string) {
  if (process.platform !== "win32") {
    throw new Error("当前一键更新仅支持 Windows 便携版。");
  }
  if (APP_INFO.runtime !== "portable") {
    throw new Error("开发模式或非 Node 便携版不支持通过本地服务覆盖更新。");
  }

  validateUpdateAsset(assetName, downloadUrl, "portable");
  const appRoot = path.dirname(process.execPath);
  const manifestPath = path.join(appRoot, "release-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("当前目录没有 release-manifest.json，无法确认便携包根目录。");
  }

  const updateDir = path.join(process.env.TEMP || appRoot, `risingstones-update-${process.pid}`);
  const zipPath = path.join(updateDir, sanitizeFileName(assetName));
  const extractDir = path.join(updateDir, "extract");
  const scriptPath = path.join(updateDir, "apply-update.ps1");
  const logPath = path.join(updateDir, "apply-update.log");

  await fs.promises.rm(updateDir, { recursive: true, force: true });
  await fs.promises.mkdir(updateDir, { recursive: true });
  await downloadUpdateFile(downloadUrl, zipPath);
  await fs.promises.writeFile(
    scriptPath,
    createSelfUpdateScript({
      processId: process.pid,
      zipPath,
      extractDir,
      appRoot,
      executablePath: process.execPath,
      logPath
    }),
    "utf8"
  );
  startPowerShellScript(scriptPath);

  return {
    message: `更新包已下载，程序即将退出并自动重启新版。若没有自动重启，可查看日志：${logPath}`,
    restart: true,
    assetName
  };
}

async function downloadUpdateFile(url: string, destination: string) {
  let systemProxyError: unknown = null;
  if (process.platform === "win32" && isGithubUpdateUrl(url)) {
    try {
      await downloadUpdateFileWithWindowsSystemProxy(url, destination);
      await assertDownloadedUpdateFile(destination);
      return;
    } catch (error) {
      systemProxyError = error;
      await fs.promises.rm(destination, { force: true }).catch(() => undefined);
      // Fall back to Node fetch so machines without Windows PowerShell are still usable.
    }
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= UPDATE_DOWNLOAD_RETRIES; attempt += 1) {
    try {
      await downloadUpdateFileWithFetch(url, destination);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < UPDATE_DOWNLOAD_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }
  }

  const fallbackMessage = lastError instanceof Error ? lastError.message : String(lastError);
  const proxyMessage =
    systemProxyError instanceof Error ? `；系统代理下载失败：${systemProxyError.message}` : systemProxyError ? `；系统代理下载失败：${String(systemProxyError)}` : "";
  throw new Error(`更新包读取失败：${fallbackMessage}${proxyMessage}`);
}

async function downloadUpdateFileWithFetch(url: string, destination: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/octet-stream, application/zip, */*",
      "Accept-Encoding": "identity",
      "User-Agent": "risingstones-partyfinder-helper-updater"
    }
  });
  if (!response.ok) {
    throw new Error(`更新包下载失败：HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength < 1024) {
    throw new Error("更新包内容异常，文件过小。");
  }
  await fs.promises.writeFile(destination, buffer);
}

async function downloadUpdateFileWithWindowsSystemProxy(url: string, destination: string) {
  const scriptPath = path.join(path.dirname(destination), "download-update.ps1");
  await fs.promises.writeFile(
    scriptPath,
    `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$downloadUrl = ${psQuote(url)}
$destination = ${psQuote(destination)}
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$headers = @{
  'User-Agent' = 'risingstones-partyfinder-helper-updater'
  'Accept' = 'application/octet-stream, application/zip, */*'
  'Accept-Encoding' = 'identity'
}
Invoke-WebRequest -Uri $downloadUrl -OutFile $destination -Headers $headers -TimeoutSec ${UPDATE_DOWNLOAD_TIMEOUT_SECS} -UseBasicParsing
`,
    "utf8"
  );
  await runPowerShellScript(scriptPath, UPDATE_DOWNLOAD_TIMEOUT_MS + 15_000);
}

async function runPowerShellScript(scriptPath: string, timeoutMs: number) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("PowerShell 下载超时"));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const message = (stderr || stdout || `PowerShell exit ${code}`).trim();
      reject(new Error(message.slice(0, 500)));
    });
  });
}

async function assertDownloadedUpdateFile(destination: string) {
  const stat = await fs.promises.stat(destination);
  if (stat.size < 1024) {
    throw new Error("更新包内容异常，文件过小。");
  }
}

function validateUpdateAsset(assetName: string, downloadUrl: string, runtime: "portable" | "desktop") {
  const lowerName = assetName.toLowerCase();
  if (!lowerName.endsWith(".zip") || !lowerName.startsWith("risingstones-partyfinder-helper-v")) {
    throw new Error("只允许安装本项目 Release 中的 zip 更新包。");
  }
  if (runtime === "portable" && (!lowerName.includes("-win-x64.zip") || lowerName.includes("desktop"))) {
    throw new Error("当前客户端只能安装 Node 便携版 win-x64 更新包。");
  }
  if (runtime === "desktop" && !lowerName.includes("desktop-win-x64-portable")) {
    throw new Error("当前客户端只能安装桌面便携版更新包。");
  }
  if (!isTrustedUpdateUrl(downloadUrl)) {
    throw new Error("更新包下载地址不在受信任的发布源内。");
  }
}

function isTrustedUpdateUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)github\.com$|(^|\.)gitee\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function isGithubUpdateUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(^|\.)github\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function createSelfUpdateScript(input: {
  processId: number;
  zipPath: string;
  extractDir: string;
  appRoot: string;
  executablePath: string;
  logPath: string;
}) {
  return `$ErrorActionPreference = 'Stop'
$processId = ${input.processId}
$zipPath = ${psQuote(input.zipPath)}
$extractDir = ${psQuote(input.extractDir)}
$appRoot = ${psQuote(input.appRoot)}
$executablePath = ${psQuote(input.executablePath)}
$logPath = ${psQuote(input.logPath)}

function Write-UpdateLog([string]$message) {
  $line = ('{0:O} {1}' -f (Get-Date), $message)
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

try {
  Write-UpdateLog 'update script started'
  try {
    Wait-Process -Id $processId -Timeout 60 -ErrorAction SilentlyContinue
    Write-UpdateLog ('waited for process ' + $processId)
  } catch {
    Write-UpdateLog ('wait process skipped: ' + $_.Exception.Message)
  }
  Start-Sleep -Milliseconds 700
  if (Test-Path -LiteralPath $extractDir) { Remove-Item -LiteralPath $extractDir -Recurse -Force }
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
  Write-UpdateLog 'zip extracted'
  $payloadDir = $extractDir
  $items = @(Get-ChildItem -LiteralPath $extractDir -Force)
  if ($items.Count -eq 1 -and $items[0].PSIsContainer -and (Test-Path -LiteralPath (Join-Path $items[0].FullName 'release-manifest.json'))) {
    $payloadDir = $items[0].FullName
  }
  if (!(Test-Path -LiteralPath (Join-Path $payloadDir 'release-manifest.json'))) {
    throw '更新包缺少 release-manifest.json，已取消覆盖。'
  }
  for ($attempt = 1; $attempt -le 8; $attempt++) {
    try {
      Get-ChildItem -LiteralPath $payloadDir -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $appRoot -Recurse -Force
      }
      Write-UpdateLog ('copy completed on attempt ' + $attempt)
      break
    } catch {
      Write-UpdateLog ('copy failed on attempt ' + $attempt + ': ' + $_.Exception.Message)
      if ($attempt -eq 8) { throw }
      Start-Sleep -Milliseconds 800
    }
  }
  Start-Process -FilePath $executablePath -WorkingDirectory $appRoot
  Write-UpdateLog 'restarted application'
} catch {
  Write-UpdateLog ('update failed: ' + $_.Exception.Message)
  throw
}
`;
}

function startPowerShellScript(scriptPath: string) {
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
}

let updateExitScheduled = false;

function scheduleProcessExitForUpdate() {
  if (updateExitScheduled) {
    return;
  }
  updateExitScheduled = true;
  setTimeout(() => process.exit(0), 1500).unref();
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

function psQuote(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function extractRecruitQuery(raw: Record<string, unknown>): RecruitQuery {
  const fbName = readQueryString(raw.fb_name);
  const query: RecruitQuery = { fb_name: fbName };
  const mappings: Array<[keyof RecruitQuery, unknown]> = [
    ["fb_type", raw.fb_type],
    ["target_area_id", raw.target_area_id],
    ["label", raw.label],
    ["team_composition", raw.team_composition],
    ["position", raw.position],
    ["son_team_key", raw.son_team_key],
    ["son_team_position", raw.son_team_position]
  ];

  for (const [key, value] of mappings) {
    const stringValue = readQueryString(value);
    if (stringValue) {
      query[key] = stringValue as never;
    }
  }

  return query;
}

function readQueryString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim();
  }
  return "";
}

function readUpdateProvider(value: unknown): UpdateProvider | "" {
  const provider = readQueryString(value).toLowerCase();
  return provider === "github" || provider === "gitee" ? provider : "";
}

function normalizeRepo(value: string): string {
  const trimmed = value.trim().replace(/\.git$/, "");
  if (!trimmed) {
    return "";
  }

  let candidate = trimmed;
  try {
    const url = new URL(trimmed);
    if (!/^(github\.com|www\.github\.com|gitee\.com|www\.gitee\.com)$/i.test(url.hostname)) {
      return "";
    }
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    candidate = owner && repo ? `${owner}/${repo.replace(/\.git$/, "")}` : "";
  } catch {
    candidate = trimmed;
  }

  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(candidate) ? candidate : "";
}

function readObjectString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function readTagDate(record: Record<string, unknown> | null): string {
  if (!record) {
    return "";
  }
  const commit = record.commit;
  if (!commit || typeof commit !== "object") {
    return "";
  }
  return readObjectString(commit as Record<string, unknown>, "date");
}

function isVersionNewer(latest: string, current: string): boolean {
  const latestParts = parseVersionParts(latest);
  const currentParts = parseVersionParts(current);
  if (!latestParts || !currentParts) {
    return normalizeVersionText(latest) !== normalizeVersionText(current);
  }

  for (let index = 0; index < Math.max(latestParts.length, currentParts.length); index += 1) {
    const latestValue = latestParts[index] ?? 0;
    const currentValue = currentParts[index] ?? 0;
    if (latestValue > currentValue) {
      return true;
    }
    if (latestValue < currentValue) {
      return false;
    }
  }

  return false;
}

function parseVersionParts(value: string): number[] | null {
  const match = normalizeVersionText(value).match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) {
    return null;
  }
  return [match[1], match[2] ?? "0", match[3] ?? "0"].map(Number);
}

function normalizeVersionText(value: string): string {
  return value.trim().replace(/^v/i, "");
}

function normalizeJobMeta(jobConfig: JobConfigMap) {
  const jobs: JobConfigEntry[] = [];
  const jobsById: Record<string, JobConfigEntry> = {};
  const childIdsByCategoryId: Record<string, string[]> = {};
  const categories = asArray(jobConfig["职能分类"]);

  for (const value of Object.values(jobConfig)) {
    for (const job of asArray(value)) {
      jobs.push(job);
      jobsById[job.id] = job;
    }
  }

  for (const category of categories) {
    const children = asArray(jobConfig[category.value]);
    childIdsByCategoryId[category.id] = children.map((job) => job.id);
  }

  const attack = categories.find((category) => category.value === "进攻职业");
  if (attack) {
    childIdsByCategoryId[attack.id] = [
      ...asArray(jobConfig["近战职业"]),
      ...asArray(jobConfig["远程物理职业"]),
      ...asArray(jobConfig["远程魔法职业"])
    ].map((job) => job.id);
  }

  return { jobs, jobsById, childIdsByCategoryId };
}

function asArray(value: JobConfigEntry[] | JobConfigEntry | undefined): JobConfigEntry[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function requestAbortController(req: express.Request): AbortController {
  const controller = new AbortController();
  req.on("close", () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  });
  return controller;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("请求已取消"));
      },
      { once: true }
    );
  });
}

function sendError(res: express.Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "未知错误";
  if (message === "This operation was aborted") {
    res.status(499).json({ message: "请求已取消" });
    return;
  }
  res.status(502).json({ message });
}

function openLocalUrl(url: string): void {
  const command =
    process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
  } catch (error) {
    console.warn(`Could not open browser automatically: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readAppInfo(baseDir: string): {
  name: string;
  version: string;
  builtAt: string;
  portable: boolean;
  runtime: "development" | "portable" | "desktop";
  updateRepositories?: Partial<Record<UpdateProvider, string>>;
} {
  const manifestPaths = [path.resolve(baseDir, "../release-manifest.json"), path.resolve(baseDir, "release-manifest.json")];
  const packagePaths = [path.resolve(baseDir, "../package.json"), path.resolve(process.cwd(), "package.json")];
  const manifest = readFirstJsonFile<{
    name?: string;
    version?: string;
    builtAt?: string;
    runtime?: "development" | "portable" | "desktop";
    updateRepositories?: Partial<Record<UpdateProvider, string>>;
  }>(manifestPaths);

  if (manifest?.name && manifest.version) {
    return {
      name: manifest.name,
      version: manifest.version,
      builtAt: manifest.builtAt ?? "",
      portable: true,
      runtime: manifest.runtime ?? "portable",
      updateRepositories: manifest.updateRepositories
    };
  }

  for (const packagePath of packagePaths) {
    const packageJson = readJsonFile<{ name?: string; version?: string }>(packagePath);
    if (packageJson?.name && packageJson.version) {
      return {
        name: packageJson.name,
        version: packageJson.version,
        builtAt: process.env.BUILD_TIME ?? "",
        portable: false,
        runtime: "development"
      };
    }
  }

  return {
    name: "risingstones-partyfinder-helper",
    version: "0.0.0",
    builtAt: process.env.BUILD_TIME ?? "",
    portable: false,
    runtime: "development"
  };
}

function readFirstJsonFile<T>(targets: string[]): T | null {
  for (const target of targets) {
    const value = readJsonFile<T>(target);
    if (value) {
      return value;
    }
  }
  return null;
}

function readUpdateRepositories(appInfo: { updateRepositories?: Partial<Record<UpdateProvider, string>> }) {
  return {
    github: normalizeRepo(process.env.RISINGSTONES_UPDATE_GITHUB_REPO ?? appInfo.updateRepositories?.github ?? OFFICIAL_SOURCE_REPO),
    gitee: normalizeRepo(process.env.RISINGSTONES_UPDATE_GITEE_REPO ?? appInfo.updateRepositories?.gitee ?? "")
  };
}

function readJsonFile<T>(target: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(target, "utf8")) as T;
  } catch {
    return null;
  }
}

function getModuleDir(): string {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }
  return path.dirname(fileURLToPath(import.meta.url));
}
