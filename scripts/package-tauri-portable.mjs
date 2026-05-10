import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { productDisplayName, productExecutableName, releaseTargetName } from "./release-names.mjs";
import { readReleaseConfig } from "./release-sources.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8"));
const version = packageJson.version;
const targetName = releaseTargetName(version, "desktop-win-x64-portable");
const releaseDir = path.join(rootDir, "release");
const stageDir = path.join(releaseDir, targetName);
const zipPath = path.join(releaseDir, `${targetName}.zip`);
const appExe = path.join(rootDir, "src-tauri", "target", "release", "risingstones-partyfinder-helper.exe");
const friendlyExeName = productExecutableName();
const releaseConfig = await readReleaseConfig(rootDir);

await assertBuiltExecutable();
await fs.rm(stageDir, { recursive: true, force: true });
await fs.rm(zipPath, { force: true });
await fs.rm(`${zipPath}.sha256`, { force: true });
await fs.mkdir(stageDir, { recursive: true });

await fs.copyFile(appExe, path.join(stageDir, friendlyExeName));
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

await fs.writeFile(path.join(stageDir, "README-桌面便携版.txt"), createReadme(), "utf8");
await fs.writeFile(
  path.join(stageDir, "release-manifest.json"),
  `${JSON.stringify(
    {
      name: packageJson.name,
      displayName: productDisplayName,
      version,
      target: "desktop-win-x64-portable",
      runtime: "desktop",
      executableName: friendlyExeName,
      builtAt: new Date().toISOString(),
      sourceRepository: "https://github.com/today080221/risingstones-partyfinder-helper",
      updateRepositories: releaseConfig.updateRepositories
    },
    null,
    2
  )}\n`,
  "utf8"
);

await compressStage();
const zipSha256 = await sha256File(zipPath);
await fs.writeFile(`${zipPath}.sha256`, `${zipSha256}  ${path.basename(zipPath)}\n`, "utf8");

console.log(`Tauri portable package created: ${zipPath}`);
console.log(`Tauri portable package SHA256: ${zipSha256}`);

async function assertBuiltExecutable() {
  try {
    await fs.access(appExe);
  } catch {
    throw new Error("Missing Tauri release executable. Run `npm run desktop:build:portable` first.");
  }
}

async function copyOptionalPath(from, to) {
  const source = path.join(rootDir, from);
  const target = path.join(stageDir, to);
  if (!(await exists(source))) {
    return;
  }

  const stats = await fs.stat(source);
  if (stats.isDirectory()) {
    await fs.cp(source, target, { recursive: true });
  } else {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
}

async function compressStage() {
  await fs.mkdir(releaseDir, { recursive: true });
  runPowerShell(
    `$items = Get-ChildItem -LiteralPath ${psQuote(stageDir)}; ` +
      `Compress-Archive -Path $items.FullName -DestinationPath ${psQuote(zipPath)} -Force`
  );
}

async function sha256File(target) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(target);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex").toUpperCase()));
  });
}

function createReadme() {
  return `${productDisplayName} - Tauri 桌面便携版

使用方式：
1. 解压整个 zip。
2. 双击 ${friendlyExeName}。
3. 直接在桌面窗口内使用筛选器。

这个版本不需要安装 Node.js，也不会启动本地浏览器或本地 Express 服务。

系统要求：
- Windows 10/11 x64。
- 系统需要可用的 Microsoft Edge WebView2 Runtime。绝大多数 Windows 10/11 已内置或自动安装。

安全说明：
- 本工具只读取石之家公开招募列表和详情接口。
- 本工具不保存账号、Cookie、Token 或联系信息。
- 响应招募请使用官方页面登录态，或安装 userscripts 目录中的 Tampermonkey 脚本后手动确认。

当前限制：
- 未签名时仍可能被 Windows SmartScreen 提醒，正式降低拦截率仍需要代码签名证书和用户安装量积累。
- 安装器版本需要 NSIS 打包工具；如果本机下载 NSIS 超时，可先使用本桌面便携版。
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


async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
