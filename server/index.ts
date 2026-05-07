import express from "express";
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
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

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
    platform: `${process.platform}-${process.arch}`
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
  console.log(`RisingStones helper API listening on http://127.0.0.1:${PORT}`);
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
    assets: normalizeReleaseAssets(json.assets)
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
      const downloadUrl = readObjectString(record, "browser_download_url");
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

function readAppInfo(baseDir: string): {
  name: string;
  version: string;
  builtAt: string;
  portable: boolean;
  updateRepositories?: Partial<Record<UpdateProvider, string>>;
} {
  const manifestPath = path.resolve(baseDir, "../release-manifest.json");
  const packagePaths = [path.resolve(baseDir, "../package.json"), path.resolve(process.cwd(), "package.json")];
  const manifest = readJsonFile<{
    name?: string;
    version?: string;
    builtAt?: string;
    updateRepositories?: Partial<Record<UpdateProvider, string>>;
  }>(manifestPath);

  if (manifest?.name && manifest.version) {
    return {
      name: manifest.name,
      version: manifest.version,
      builtAt: manifest.builtAt ?? "",
      portable: true,
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
        portable: false
      };
    }
  }

  return {
    name: "risingstones-partyfinder-helper",
    version: "0.0.0",
    builtAt: process.env.BUILD_TIME ?? "",
    portable: false
  };
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
