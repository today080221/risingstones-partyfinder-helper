import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8"));
const version = packageJson.version;
const targetName = `${packageJson.name}-v${version}-win-x64`;
const releaseDir = path.join(rootDir, "release");
const stageDir = path.join(releaseDir, targetName);
const zipPath = path.join(releaseDir, `${targetName}.zip`);
const appDir = path.join(stageDir, "app");
const runtimeDir = path.join(stageDir, "runtime");
const exeName = "RisingStones-PartyFinder.exe";
const nodeVersion = normalizeNodeVersion(process.env.PORTABLE_NODE_VERSION ?? process.version);
const nodeRuntime = await prepareNodeRuntime(nodeVersion);
const releaseConfig = await readReleaseConfig();

await fs.rm(stageDir, { recursive: true, force: true });
await fs.rm(zipPath, { force: true });
await fs.mkdir(appDir, { recursive: true });
await fs.mkdir(runtimeDir, { recursive: true });

await copyDir(path.join(rootDir, "dist"), path.join(appDir, "dist"));
await fs.copyFile(path.join(rootDir, "build", "server.cjs"), path.join(appDir, "server.cjs"));
await fs.copyFile(nodeRuntime.exePath, path.join(runtimeDir, "node.exe"));
await createPortableExe(nodeRuntime.exePath, path.join(stageDir, exeName));

if (nodeRuntime.licensePath) {
  await fs.copyFile(nodeRuntime.licensePath, path.join(runtimeDir, "LICENSE-Node.js.txt"));
}

await copyOptionalPath("LICENSE", "LICENSE");
await copyOptionalPath("NOTICE.md", "NOTICE.md");
await copyOptionalPath("THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md");
await copyOptionalPath("README.md", "README.md");
await copyOptionalPath("CHANGELOG.md", "CHANGELOG.md");
await copyOptionalPath("CONTRIBUTING.md", "CONTRIBUTING.md");
await copyOptionalPath("ROADMAP.md", "ROADMAP.md");
await copyOptionalPath("SECURITY.md", "SECURITY.md");
await copyOptionalPath("docs", "docs");
await copyOptionalPath("userscripts", "userscripts");

await fs.writeFile(path.join(stageDir, "start-windows.bat"), createLauncher(), "utf8");
await fs.writeFile(path.join(stageDir, "README-使用说明.txt"), createPortableReadme(), "utf8");
await fs.writeFile(
  path.join(stageDir, "release-manifest.json"),
  `${JSON.stringify(
    {
      name: packageJson.name,
      version,
      target: "win-x64",
      builtAt: new Date().toISOString(),
      nodeRuntime: {
        version: nodeVersion,
        source: nodeRuntime.source,
        licenseIncluded: Boolean(nodeRuntime.licensePath)
      },
      updateRepositories: releaseConfig.updateRepositories
    },
    null,
    2
  )}\n`,
  "utf8"
);

await compressStage();

console.log(`Portable package created: ${zipPath}`);

async function readReleaseConfig() {
  const localConfig = await readOptionalJson(path.join(rootDir, "config", "release.local.json"));
  const githubRepo =
    normalizeRepo(process.env.RISINGSTONES_UPDATE_GITHUB_REPO) ||
    normalizeRepo(localConfig?.updateRepositories?.github) ||
    "today080221/risingstones-partyfinder-helper";
  const giteeRepo =
    normalizeRepo(process.env.RISINGSTONES_UPDATE_GITEE_REPO) ||
    normalizeRepo(localConfig?.updateRepositories?.gitee) ||
    "";

  return {
    updateRepositories: {
      github: githubRepo,
      ...(giteeRepo ? { gitee: giteeRepo } : {})
    }
  };
}

async function readOptionalJson(target) {
  try {
    return JSON.parse(await fs.readFile(target, "utf8"));
  } catch {
    return null;
  }
}

async function prepareNodeRuntime(version) {
  const cacheDir = path.join(rootDir, ".cache", "node-runtime");
  const archiveName = `node-${version}-win-x64.zip`;
  const archivePath = path.join(cacheDir, archiveName);
  const extractDir = path.join(cacheDir, `node-${version}-win-x64`);
  const nodeRoot = path.join(extractDir, `node-${version}-win-x64`);
  const nodeExe = path.join(nodeRoot, "node.exe");
  const nodeLicense = path.join(nodeRoot, "LICENSE");
  const downloadUrl = process.env.PORTABLE_NODE_URL ?? `https://nodejs.org/dist/${version}/${archiveName}`;

  try {
    await fs.access(nodeExe);
  } catch {
    try {
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.rm(extractDir, { recursive: true, force: true });
      await downloadFile(downloadUrl, archivePath);
      runPowerShell(`Expand-Archive -LiteralPath ${psQuote(archivePath)} -DestinationPath ${psQuote(extractDir)} -Force`);
    } catch (error) {
      console.warn(`Could not prepare official Node runtime (${error.message}). Falling back to current node.exe.`);
      return {
        exePath: process.execPath,
        licensePath: "",
        source: "local-process-execPath"
      };
    }
  }

  return {
    exePath: nodeExe,
    licensePath: await exists(nodeLicense) ? nodeLicense : "",
    source: downloadUrl
  };
}

async function downloadFile(url, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });

  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        downloadFile(new URL(response.headers.location, url).href, destination).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} while downloading ${url}`));
        return;
      }

      const file = createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => {
        file.close(resolve);
      });
      file.on("error", reject);
    });

    request.on("error", reject);
  });
}

async function copyOptionalPath(from, to) {
  const source = path.join(rootDir, from);
  const target = path.join(stageDir, to);
  if (!(await exists(source))) {
    return;
  }

  const stats = await fs.stat(source);
  if (stats.isDirectory()) {
    await copyDir(source, target);
  } else {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
}

async function copyDir(source, target) {
  await fs.mkdir(target, { recursive: true });
  await fs.cp(source, target, { recursive: true });
}

async function compressStage() {
  await fs.mkdir(releaseDir, { recursive: true });
  runPowerShell(
    `$items = Get-ChildItem -LiteralPath ${psQuote(stageDir)}; ` +
      `Compress-Archive -Path $items.FullName -DestinationPath ${psQuote(zipPath)} -Force`
  );
}

function createLauncher() {
  return `@echo off
setlocal
if "%PORT%"=="" set PORT=8797
if "%AUTO_OPEN_BROWSER%"=="" set AUTO_OPEN_BROWSER=true
set SERVE_STATIC=true
set STATIC_DIR=%~dp0app\\dist
echo FF14 RisingStones Party Finder Helper
echo Local URL: http://127.0.0.1:%PORT%
echo Close this window to stop the local service.
"%~dp0runtime\\node.exe" "%~dp0app\\server.cjs"
echo.
echo Local service stopped.
pause
`;
}

function createPortableReadme() {
  return `FF14 副本招募筛选工具 - Windows 便携包

使用方式：
1. 解压整个 zip。
2. 双击 RisingStones-PartyFinder.exe。
3. 浏览器会打开 http://127.0.0.1:8797。
4. 关闭命令行窗口即可停止本地服务。

备用方式：
- 如果 exe 被安全软件拦截，可以双击 start-windows.bat。

端口被占用时：
- 可以先在命令行设置 PORT，例如：
  set PORT=8897
  start-windows.bat

安全说明：
- 本工具只读取石之家公开招募列表和详情接口。
- 本工具不保存账号、Cookie、Token 或联系信息。
- 响应招募请使用官方页面登录态，或安装 userscripts 目录中的 Tampermonkey 脚本后手动确认。
`;
}

async function createPortableExe(nodeExePath, targetExePath) {
  const seaEntryPath = path.join(rootDir, "build", "portable-sea-entry.cjs");
  const seaConfigPath = path.join(rootDir, "build", "portable-sea-config.json");
  const seaBlobPath = path.join(rootDir, "build", "portable-sea.blob");
  const postjectCli = path.join(rootDir, "node_modules", "postject", "dist", "cli.js");

  await fs.mkdir(path.dirname(seaEntryPath), { recursive: true });
  await fs.writeFile(seaEntryPath, createSeaEntry(), "utf8");
  await fs.writeFile(
    seaConfigPath,
    `${JSON.stringify(
      {
        main: seaEntryPath,
        output: seaBlobPath,
        disableExperimentalSEAWarning: true,
        useCodeCache: false
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  execFileSync(nodeExePath, ["--experimental-sea-config", seaConfigPath], {
    cwd: rootDir,
    stdio: "inherit"
  });
  await fs.copyFile(nodeExePath, targetExePath);
  execFileSync(process.execPath, [
    postjectCli,
    targetExePath,
    "NODE_SEA_BLOB",
    seaBlobPath,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
  ], {
    cwd: rootDir,
    stdio: "inherit"
  });
}

function createSeaEntry() {
  return `const path = require("node:path");
const { createRequire } = require("node:module");

const appRoot = path.dirname(process.execPath);
process.env.PORT ||= "8797";
process.env.SERVE_STATIC ||= "true";
process.env.STATIC_DIR ||= path.join(appRoot, "app", "dist");
process.env.AUTO_OPEN_BROWSER ||= "true";

console.log("FF14 RisingStones Party Finder Helper");
console.log("Local URL: http://127.0.0.1:" + process.env.PORT);
console.log("Close this window to stop the local service.");

const requireFromExe = createRequire(process.execPath);
requireFromExe(path.join(appRoot, "app", "server.cjs"));
`;
}

function runPowerShell(command) {
  execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    cwd: rootDir,
    stdio: "inherit"
  });
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeNodeVersion(value) {
  return value.startsWith("v") ? value : `v${value}`;
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
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    return owner && repo ? `${owner}/${repo.replace(/\.git$/, "")}` : "";
  } catch {
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed) ? trimmed : "";
  }
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
