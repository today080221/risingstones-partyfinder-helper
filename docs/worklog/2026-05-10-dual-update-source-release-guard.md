# Release 双更新源防呆

## 开始状态

- 当前分支：`main`。
- 开始前 `git status --short --branch`：干净，`main` 与 `origin/main` 同步。
- 已执行 `git fetch origin`。
- 触发原因：`v1.0.0` 品牌化包曾在未设置 `RISINGSTONES_UPDATE_GITEE_REPO` 的本机环境中构建，导致包内 `release-manifest.json` 只有 GitHub 更新源；即使随后上传到 Gitee，另一台电脑仍显示“国内镜像未配置发布源”。

## 目标

- 不论用户从 GitHub Release 还是 Gitee Release 下载，同一个正式发布包都应支持 GitHub 与 Gitee 两个更新来源。
- 降低本机手工发布时漏注入 Gitee 源的概率。
- 保持真实 Gitee 仓库地址不写入公开源码和文档。

## 计划

- 抽出发布源解析 helper，供桌面包、Node 备用包和 Gitee 上传脚本复用。
- Gitee 源解析顺序扩展为：环境变量、本机 `config/release.local.json`、本机 `gitee` remote。
- GitHub 源解析顺序扩展为：环境变量、本机配置、`origin` remote、官方默认仓库。
- 当 `RISINGSTONES_REQUIRE_DUAL_UPDATE_SOURCES=true` 时，缺少 Gitee 源继续直接失败。
- Gitee 上传脚本在上传 zip 前检查 zip 根目录的 `release-manifest.json`，拒绝上传没有双源的包。
- 更新 release 文档，明确正式包应同一份 zip 同步上传 GitHub 与 Gitee。

## 风险

- zip 内 manifest 检查依赖 Windows PowerShell 的 `System.IO.Compression.FileSystem`；当前发布环境为 Windows，可以接受。
- 旧的单源 `v1.0.0` 客户端不会因同版本 SHA 变化自动更新；要让已下载旧包的用户自动吃到双源配置，仍需要发布更高版本号。

## 设计判断

- 更新提示继续以版本号为主，`latestVersion > currentVersion` 才作为常规更新触发条件。
- SHA256 不作为常规“有新版本”的主条件；同版本资产 SHA 变化代表 Release 资产被替换，应按重新下载/修复或补发 patch 版本处理。
- SHA256 更适合用于下载后完整性校验，后续如实现自动校验，应在安装前比对同名 `.sha256`，而不是用它替代版本号语义。

## 实现

- 新增 `scripts/release-sources.mjs`，统一解析 GitHub/Gitee 更新源。
- Gitee 更新源解析顺序：`RISINGSTONES_UPDATE_GITEE_REPO`、未提交的 `config/release.local.json`、本机 `gitee` remote。
- GitHub 更新源解析顺序：`RISINGSTONES_UPDATE_GITHUB_REPO`、未提交的本机配置、`origin` remote、官方默认仓库。
- `scripts/build-portable.mjs` 和 `scripts/package-tauri-portable.mjs` 改用共用解析 helper。
- `scripts/publish-gitee-release.mjs` 上传前检查 zip 根目录 `release-manifest.json`，缺少 `github` 或 `gitee` 任一更新源时拒绝上传。
- Release 文档补充正式包应同一份 zip 同步发布到 GitHub/Gitee，且本机有 `gitee` remote 时无需每次手动设置仓库环境变量。

## 验证

- `node --check scripts/release-sources.mjs scripts/package-tauri-portable.mjs scripts/build-portable.mjs scripts/publish-gitee-release.mjs`：通过。
- `node -e "import('./scripts/release-sources.mjs').then(async m => console.log(JSON.stringify(await m.readUpdateRepositories(process.cwd()), null, 2)))"`：解析出 `github` 和 `gitee` 两个源。
- 使用旧单源 `release/risingstones-partyfinder-helper-v1.0.0-desktop-win-x64-portable.zip` 触发上传前 manifest 检查：正确失败。
- `node scripts/package-tauri-portable.mjs`：通过，生成双源桌面包。
- `node scripts/build-portable.mjs`：通过，生成双源 Node 备用包。
- 新生成桌面包 `release-manifest.json` 更新源：
  - `github`: `today080221/risingstones-partyfinder-helper`
  - `gitee`: `jianwen1126/risingstones-partyfinder-helper`
- 新生成 Node 备用包同样通过双源 manifest 检查。
- 新桌面包 SHA256：`C050D8ACA1157653931D4B28854768F52EC5F19CA195173B8A0D525651A180FC`
- 新 Node 备用包 SHA256：`38348EF9AF35BCD4E2EC67EE1102DECD9BA61DE26B52FC4E7E866D0CE64F9372`
- `npm test`：7 个测试文件、167/167 通过。
- `git diff --check`：通过，仅有 Windows 换行提示。

## 下一步

- 对已经流出的单源 `v1.0.0`，推荐发布 `v1.0.1`，让旧客户端通过版本号触发更新到双源包。
- 若仍要替换 `v1.0.0` 资产，只能覆盖后续新下载用户；已在使用旧 `v1.0.0` 的客户端不会因为同版本 SHA 变化自动提示更新。
