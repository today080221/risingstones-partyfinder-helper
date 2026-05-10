import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export const officialGithubRepo = "today080221/risingstones-partyfinder-helper";

export async function readReleaseConfig(rootDir, options = {}) {
  const updateRepositories = await readUpdateRepositories(rootDir, options);
  return { updateRepositories };
}

export async function readUpdateRepositories(rootDir, options = {}) {
  const requireDualSources = options.requireDualSources ?? process.env.RISINGSTONES_REQUIRE_DUAL_UPDATE_SOURCES === "true";
  const localConfig = await readOptionalJson(path.join(rootDir, "config", "release.local.json"));
  const githubRepo =
    resolveRepoCandidate([
      { source: "RISINGSTONES_UPDATE_GITHUB_REPO", value: process.env.RISINGSTONES_UPDATE_GITHUB_REPO, strict: true },
      { source: "config/release.local.json updateRepositories.github", value: localConfig?.updateRepositories?.github, strict: true },
      { source: "git remote origin", value: readGitRemote(rootDir, "origin"), strict: false },
      { source: "official default GitHub repository", value: officialGithubRepo, strict: true }
    ]) || officialGithubRepo;
  const giteeRepo = await resolveGiteeRepo(rootDir, localConfig);

  if (requireDualSources && !giteeRepo) {
    throw new Error(
      "Missing Gitee update source while dual update sources are required for release builds. " +
        "Set RISINGSTONES_UPDATE_GITEE_REPO, add config/release.local.json, or configure a gitee git remote."
    );
  }

  return {
    github: githubRepo,
    ...(giteeRepo ? { gitee: giteeRepo } : {})
  };
}

export async function resolveGiteeRepo(rootDir, existingLocalConfig = undefined) {
  const localConfig =
    existingLocalConfig === undefined
      ? await readOptionalJson(path.join(rootDir, "config", "release.local.json"))
      : existingLocalConfig;
  return resolveRepoCandidate([
    { source: "RISINGSTONES_UPDATE_GITEE_REPO", value: process.env.RISINGSTONES_UPDATE_GITEE_REPO, strict: true },
    { source: "config/release.local.json updateRepositories.gitee", value: localConfig?.updateRepositories?.gitee, strict: true },
    { source: "git remote gitee", value: readGitRemote(rootDir, "gitee"), strict: false }
  ]);
}

export function assertDualUpdateSources(updateRepositories, context) {
  if (!updateRepositories?.github || !updateRepositories?.gitee) {
    throw new Error(`${context} must include both github and gitee updateRepositories before release publishing.`);
  }
}

export function assertZipReleaseManifestHasDualSources(rootDir, zipPath) {
  const manifest = readZipReleaseManifest(rootDir, zipPath);
  assertDualUpdateSources(manifest.updateRepositories, `${path.basename(zipPath)} release-manifest.json`);
  return manifest;
}

function readZipReleaseManifest(rootDir, zipPath) {
  const command = [
    "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `$archive = [System.IO.Compression.ZipFile]::OpenRead(${psQuote(zipPath)})`,
    "try {",
    "  $entry = $archive.Entries | Where-Object { $_.FullName -eq 'release-manifest.json' } | Select-Object -First 1",
    "  if ($null -eq $entry) { throw 'release-manifest.json not found in zip root.' }",
    "  $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)",
    "  try { $reader.ReadToEnd() } finally { $reader.Dispose() }",
    "} finally {",
    "  $archive.Dispose()",
    "}"
  ].join("; ");
  const output = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    cwd: rootDir,
    encoding: "utf8"
  });
  return JSON.parse(output);
}

function resolveRepoCandidate(candidates) {
  for (const candidate of candidates) {
    const rawValue = typeof candidate.value === "string" ? candidate.value.trim() : "";
    if (!rawValue) {
      continue;
    }
    if (looksLikePlaceholder(rawValue)) {
      throw new Error(`${candidate.source} still contains a placeholder. Use the real owner/repo value.`);
    }
    const repo = normalizeRepo(rawValue);
    if (repo) {
      return repo;
    }
    if (candidate.strict) {
      throw new Error(`${candidate.source} is invalid. Use owner/repo or a GitHub/Gitee repository URL.`);
    }
  }
  return "";
}

function readGitRemote(rootDir, remote) {
  try {
    return execFileSync("git", ["remote", "get-url", remote], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
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

  const sshMatch = trimmed.match(/^[^@]+@[^:]+:([^/]+)\/(.+)$/);
  if (sshMatch) {
    return normalizeOwnerRepo(sshMatch[1], sshMatch[2]);
  }

  try {
    const url = new URL(trimmed);
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    return normalizeOwnerRepo(owner, repo);
  } catch {
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed) ? trimmed : "";
  }
}

function normalizeOwnerRepo(owner, repo) {
  const normalizedRepo = typeof repo === "string" ? repo.replace(/\.git$/, "") : "";
  return owner && normalizedRepo ? `${owner}/${normalizedRepo}` : "";
}

function looksLikePlaceholder(value) {
  return /<[^>]+>/.test(value) || /^owner\/repo$/i.test(value) || /^your[-_]owner\/your[-_]repo$/i.test(value);
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
