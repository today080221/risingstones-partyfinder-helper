import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { releaseTargetName } from "./release-names.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8"));
const version = packageJson.version;
const tagName = process.env.RELEASE_TAG || `v${version}`;
const token = process.env.GITEE_ACCESS_TOKEN || process.env.GITEE_TOKEN || "";
const repo = await resolveGiteeRepo();
const zipPath =
  process.env.RELEASE_ZIP ||
  path.join(rootDir, "release", `${releaseTargetName(version, "win-x64")}.zip`);
const assetPaths = await resolveAssetPaths(zipPath);
const maxRetries = readRetryCount();

if (!token) {
  throw new Error("Missing GITEE_ACCESS_TOKEN. Set it locally before publishing the Gitee Release.");
}

if (!repo) {
  throw new Error(
    "Missing RISINGSTONES_UPDATE_GITEE_REPO. Set it locally or add config/release.local.json on this machine."
  );
}

for (const assetPath of assetPaths) {
  await fs.access(assetPath);
}

console.log(`Preparing Gitee release ${tagName} with ${assetPaths.map((assetPath) => path.basename(assetPath)).join(", ")}...`);
const release = await getOrCreateRelease(repo, tagName);
console.log(`Using Gitee release id ${release.id}. Uploading assets...`);
for (const assetPath of assetPaths) {
  await uploadAssetWithRetry(repo, release.id, assetPath);
}

console.log(`Gitee release ready: ${release.html_url || `https://gitee.com/${repo}/releases/tag/${tagName}`}`);

async function getOrCreateRelease(targetRepo, targetTag) {
  const existing = await findReleaseByTag(targetRepo, targetTag);
  if (existing) {
    return existing;
  }

  return withRetry("create Gitee release", () =>
    apiJson(`https://gitee.com/api/v5/repos/${targetRepo}/releases`, {
      context: "create Gitee release",
      method: "POST",
      body: formBody({
        access_token: token,
        tag_name: targetTag,
        target_commitish: process.env.RELEASE_TARGET || "main",
        name: targetTag,
        body: `Windows 便携包：${assetPaths.map((assetPath) => path.basename(assetPath)).join(", ")}`,
        prerelease: "false"
      })
    })
  );
}

async function findReleaseByTag(targetRepo, targetTag) {
  const releases = await withRetry("list Gitee releases", () =>
    apiJson(
      `https://gitee.com/api/v5/repos/${targetRepo}/releases?access_token=${encodeURIComponent(token)}&page=1&per_page=20`,
      { context: "list Gitee releases" }
    )
  );
  if (!Array.isArray(releases)) {
    return null;
  }
  return releases.find((release) => release?.tag_name === targetTag) ?? null;
}

async function uploadAssetWithRetry(targetRepo, releaseId, targetPath) {
  try {
    return await withRetry(`upload ${path.basename(targetPath)}`, async () => {
      const formData = new FormData();
      formData.set("access_token", token);
      formData.set("release_id", String(releaseId));
      formData.set("file", new Blob([await fs.readFile(targetPath)], { type: contentTypeFor(targetPath) }), path.basename(targetPath));

      return apiJson(`https://gitee.com/api/v5/repos/${targetRepo}/releases/${releaseId}/attach_files`, {
        context: `upload Gitee release asset ${path.basename(targetPath)}`,
        method: "POST",
        body: formData
      });
    });
  } catch (error) {
    if (isDuplicateAssetError(error)) {
      console.warn(`Asset already exists on Gitee, keeping existing file: ${path.basename(targetPath)}`);
      return null;
    }
    throw error;
  }
}

async function apiJson(url, init = {}) {
  const { context = "Gitee API request", ...fetchInit } = init;
  let response;
  try {
    response = await fetch(url, {
      ...fetchInit,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(fetchInit.headers ?? {})
      }
    });
  } catch (error) {
    const wrapped = new Error(`${context} failed before response: ${redactSecrets(error?.message || String(error))}`);
    wrapped.cause = error;
    throw wrapped;
  }
  const text = await response.text();
  const json = safeJsonParse(text);
  if (!response.ok) {
    const error = new Error(formatApiError(context, response, json, text));
    error.status = response.status;
    error.responseText = text;
    throw error;
  }
  return json;
}

async function withRetry(context, action) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !isRetryableError(error)) {
        throw error;
      }
      const delayMs = 1200 * attempt;
      console.warn(`${context} failed on attempt ${attempt}/${maxRetries}: ${redactSecrets(error.message || String(error))}`);
      console.warn(`Retrying in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

function safeJsonParse(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatApiError(context, response, json, text) {
  const details = [];
  const message = json?.message || json?.error;
  if (message) {
    details.push(String(message));
  }
  if (json?.errors) {
    details.push(JSON.stringify(json.errors));
  }
  if (!details.length && text) {
    details.push(redactSecrets(text.slice(0, 600)));
  }
  const suffix = details.length ? `: ${details.join(" ")}` : "";
  return `${context} failed: HTTP ${response.status} ${response.statusText}${suffix}`;
}

function redactSecrets(value) {
  if (!token) {
    return value;
  }
  return value.replaceAll(token, "[redacted]");
}

function formBody(entries) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  return params;
}

async function resolveAssetPaths(targetZipPath) {
  const normalizedZipPath = path.resolve(rootDir, targetZipPath);
  const assets = [normalizedZipPath];
  const checksumPath = `${normalizedZipPath}.sha256`;
  try {
    await fs.access(checksumPath);
    assets.push(checksumPath);
  } catch {
    // The checksum is optional for backwards compatibility with older locally built packages.
  }
  return assets;
}

async function resolveGiteeRepo() {
  const localConfig = await readOptionalJson(path.join(rootDir, "config", "release.local.json"));
  const candidates = [
    { source: "RISINGSTONES_UPDATE_GITEE_REPO", value: process.env.RISINGSTONES_UPDATE_GITEE_REPO },
    { source: "config/release.local.json updateRepositories.gitee", value: localConfig?.updateRepositories?.gitee }
  ];

  for (const candidate of candidates) {
    const rawValue = typeof candidate.value === "string" ? candidate.value.trim() : "";
    if (!rawValue) {
      continue;
    }
    if (looksLikePlaceholder(rawValue)) {
      throw new Error(
        `${candidate.source} still contains a placeholder. Use the real Gitee owner/repo value without angle brackets.`
      );
    }
    const repo = normalizeRepo(rawValue);
    if (repo) {
      return repo;
    }
    throw new Error(`${candidate.source} is invalid. Use owner/repo or https://gitee.com/owner/repo.`);
  }

  return "";
}

async function readOptionalJson(target) {
  try {
    return JSON.parse(await fs.readFile(target, "utf8"));
  } catch {
    return null;
  }
}

function normalizeRepo(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().replace(/\.git$/, "");
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(trimmed);
    const [owner, repoName] = url.pathname.split("/").filter(Boolean);
    return owner && repoName ? `${owner}/${repoName.replace(/\.git$/, "")}` : "";
  } catch {
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed) ? trimmed : "";
  }
}

function looksLikePlaceholder(value) {
  return /<[^>]+>/.test(value);
}

function contentTypeFor(targetPath) {
  return targetPath.endsWith(".sha256") ? "text/plain" : "application/zip";
}

function readRetryCount() {
  const parsed = Number(process.env.GITEE_RELEASE_RETRIES || 4);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 4;
}

function isRetryableError(error) {
  const status = Number(error?.status || 0);
  if (status === 429 || status >= 500) {
    return true;
  }
  const message = `${error?.message || ""} ${error?.cause?.message || ""} ${error?.cause?.code || ""}`;
  return /terminated|socket|UND_ERR_SOCKET|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|other side closed/i.test(message);
}

function isDuplicateAssetError(error) {
  const message = `${error?.message || ""} ${error?.responseText || ""}`;
  return /already|exists|duplicate|taken|已存在|重复|同名/i.test(message);
}

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
