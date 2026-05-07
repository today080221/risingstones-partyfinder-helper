# Gitee 更新源配置修复工作记录

## Start

- 开始：用户反馈国内镜像 Release 已经存在，但客户端仍提示“国内镜像尚未配置发布源”。
- 初步定位：
  - `npm run release:gitee` 只负责把已有 zip 上传到 Gitee Release，不会改写 zip 内的更新源配置。
  - Node 便携包需要在构建阶段通过 `RISINGSTONES_UPDATE_GITEE_REPO` 或本机 `config/release.local.json` 写入 `release-manifest.json`。
  - Tauri 桌面包当前虽然写了 `release-manifest.json`，但未写入 `updateRepositories`，Rust 更新检查也未读取该 manifest。
- 目标：让桌面便携包和发布工作流都能在不写入公开源码的前提下，正确携带并读取国内镜像更新源。

## Requirement Alignment

- 公开源码、README、docs 仍不写入国内镜像真实地址。
- 国内镜像地址只通过发布机环境变量、未提交本地配置或 Release 包 manifest 注入。
- 客户端进入前端后自动检查更新时，如果发布包带有国内镜像配置，就可以选择并检查国内镜像 Release。
- 已经构建好的旧 zip 不会因为上传到 Gitee 而自动获得镜像配置；需要重新构建并重新发布。

## Implementation

- Tauri 运行时：
  - `risingstones_check_update("gitee")` 先读运行环境变量，再读 exe 同目录或当前目录的 `release-manifest.json`。
  - GeoIP 推荐节点同样复用该配置判断；发布包带有国内镜像配置时，中国大陆用户可自动推荐国内镜像。
- Tauri 桌面便携打包：
  - `scripts/package-tauri-portable.mjs` 读取 `RISINGSTONES_UPDATE_GITEE_REPO` 或本机未提交 `config/release.local.json`。
  - 生成的桌面便携包 `release-manifest.json` 写入 `updateRepositories`。
- GitHub Release workflow：
  - 构建 Tauri 桌面便携包时也传入 `RISINGSTONES_UPDATE_GITEE_REPO` secret。
- 版本：
  - 升级为 `0.1.4`，用于修复 `0.1.3` 桌面包国内镜像未配置问题。

## Verification

- 使用本机发布环境变量重新构建：
  - `npm run build:portable`：通过。
  - `npm run package:desktop:portable`：通过。
- Manifest 探针：
  - Node 便携包 `release-manifest.json`：包含 GitHub 和国内镜像更新源配置。
  - Tauri 桌面便携包 `release-manifest.json`：包含 GitHub 和国内镜像更新源配置。
- 产物：
  - `release/risingstones-partyfinder-helper-v0.1.4-desktop-win-x64-portable.zip`
  - `release/risingstones-partyfinder-helper-v0.1.4-win-x64.zip`
- SHA256：
  - 桌面便携包：`220108F0F4EF2231DC70BC620311B07CFBF42A91567F3EAB32001C28BC65A9C4`
  - Node 便携包：`1C2A7313C9CE20E506D43EAEEA2F3BC93520A607249AC5BEE2D9A63E51D25D44`

## End

- 根因：Release 已存在不等于客户端已配置国内镜像；客户端需要在构建时携带镜像仓库配置，Tauri 还需要运行时读取该配置。
- 修复状态：`0.1.4` 已让 Tauri 桌面包写入并读取 `release-manifest.json` 的 `updateRepositories`。
- 使用提醒：发布国内镜像包前，需要先带 `RISINGSTONES_UPDATE_GITEE_REPO` 重新构建，再上传新生成的 zip。

## Release Result

- 已提交 `修复国内镜像更新源配置`，并推送 `main` 到 GitHub 主仓库和国内镜像 remote。
- 已推送 `v0.1.4` 标签到 GitHub 主仓库和国内镜像 remote。
- GitHub Release workflow：通过。
  - Run ID：`25515112690`
  - Release URL：`https://github.com/today080221/risingstones-partyfinder-helper/releases/tag/v0.1.4`
- GitHub CI：通过。
  - Run ID：`25515078223`
- GitHub Release 资产：
  - `risingstones-partyfinder-helper-v0.1.4-desktop-win-x64-portable.zip`
  - `risingstones-partyfinder-helper-v0.1.4-desktop-win-x64-portable.zip.sha256`
  - `risingstones-partyfinder-helper-v0.1.4-win-x64.zip`
  - `risingstones-partyfinder-helper-v0.1.4-win-x64.zip.sha256`
- 发布物探针：
  - 本机带发布环境变量构建的 `0.1.4` Node 与 Tauri 包均包含国内镜像配置。
  - GitHub Actions 构建出的公开 GitHub Release 包不包含国内镜像配置，说明 GitHub 仓库 secret 当前未配置或为空；如果要让 GitHub Release 包也内置国内镜像，需要先配置 GitHub Secret 后重新发布。
  - 若要只在国内镜像下载包内携带国内镜像地址，应使用本机带环境变量构建出的 zip 上传到国内镜像 Release。
