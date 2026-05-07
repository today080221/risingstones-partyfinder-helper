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
const nodeVersion = normalizeNodeVersion(process.env.PORTABLE_NODE_VERSION ?? process.version);
const nodeRuntime = await prepareNodeRuntime(nodeVersion);

await fs.rm(stageDir, { recursive: true, force: true });
await fs.rm(zipPath, { force: true });
await fs.mkdir(appDir, { recursive: true });
await fs.mkdir(runtimeDir, { recursive: true });

await copyDir(path.join(rootDir, "dist"), path.join(appDir, "dist"));
await fs.copyFile(path.join(rootDir, "build", "server.cjs"), path.join(appDir, "server.cjs"));
await fs.copyFile(nodeRuntime.exePath, path.join(runtimeDir, "node.exe"));

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
      }
    },
    null,
    2
  )}\n`,
  "utf8"
);

await compressStage();

console.log(`Portable package created: ${zipPath}`);

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
set SERVE_STATIC=true
set STATIC_DIR=%~dp0app\\dist
echo FF14 RisingStones Party Finder Helper
echo Local URL: http://127.0.0.1:%PORT%
echo Close this window to stop the local service.
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 900; Start-Process ('http://127.0.0.1:' + $env:PORT)"
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
2. 双击 start-windows.bat。
3. 浏览器会打开 http://127.0.0.1:8797。
4. 关闭命令行窗口即可停止本地服务。

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

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
