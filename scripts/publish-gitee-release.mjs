import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8"));
const version = packageJson.version;
const tagName = process.env.RELEASE_TAG || `v${version}`;
const token = process.env.GITEE_ACCESS_TOKEN || process.env.GITEE_TOKEN || "";
const repo = await resolveGiteeRepo();
const zipPath =
  process.env.RELEASE_ZIP ||
  path.join(rootDir, "release", `${packageJson.name}-v${version}-win-x64.zip`);

if (!token) {
  throw new Error("Missing GITEE_ACCESS_TOKEN. Set it locally before publishing the Gitee Release.");
}

if (!repo) {
  throw new Error(
    "Missing RISINGSTONES_UPDATE_GITEE_REPO. Set it locally or add config/release.local.json on this machine."
  );
}

await fs.access(zipPath);

console.log(`Preparing Gitee release ${tagName} with ${path.basename(zipPath)}...`);
const release = await getOrCreateRelease(repo, tagName);
console.log(`Using Gitee release id ${release.id}. Uploading asset...`);
await uploadAsset(repo, release.id, zipPath);

console.log(`Gitee release ready: ${release.html_url || `https://gitee.com/${repo}/releases/tag/${tagName}`}`);

async function getOrCreateRelease(targetRepo, targetTag) {
  const existing = await findReleaseByTag(targetRepo, targetTag);
  if (existing) {
    return existing;
  }

  return apiJson(`https://gitee.com/api/v5/repos/${targetRepo}/releases`, {
    context: "create Gitee release",
    method: "POST",
    body: formBody({
      access_token: token,
      tag_name: targetTag,
      target_commitish: process.env.RELEASE_TARGET || "main",
      name: targetTag,
      body: `Windows 便携包：${path.basename(zipPath)}`,
      prerelease: "false"
    })
  });
}

async function findReleaseByTag(targetRepo, targetTag) {
  const releases = await apiJson(
    `https://gitee.com/api/v5/repos/${targetRepo}/releases?access_token=${encodeURIComponent(token)}&page=1&per_page=20`,
    { context: "list Gitee releases" }
  );
  if (!Array.isArray(releases)) {
    return null;
  }
  return releases.find((release) => release?.tag_name === targetTag) ?? null;
}

async function uploadAsset(targetRepo, releaseId, targetZipPath) {
  const formData = new FormData();
  formData.set("access_token", token);
  formData.set("release_id", String(releaseId));
  formData.set("file", new Blob([await fs.readFile(targetZipPath)], { type: "application/zip" }), path.basename(targetZipPath));

  return apiJson(`https://gitee.com/api/v5/repos/${targetRepo}/releases/${releaseId}/attach_files`, {
    context: "upload Gitee release asset",
    method: "POST",
    body: formData
  });
}

async function apiJson(url, init = {}) {
  const { context = "Gitee API request", ...fetchInit } = init;
  const response = await fetch(url, {
    ...fetchInit,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(fetchInit.headers ?? {})
    }
  });
  const text = await response.text();
  const json = safeJsonParse(text);
  if (!response.ok) {
    throw new Error(formatApiError(context, response, json, text));
  }
  return json;
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
