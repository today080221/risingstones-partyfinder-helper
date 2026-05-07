# Tauri 实机构建工作记录

## Start

- 开始：用户要求在当前开发机安装 Rust/Cargo，并实际运行 Tauri 桌面构建。
- 当前状态：
  - `v0.1.2` 已发布 EXE 便携包，但未签名 Node SEA EXE 会被 Windows/SmartScreen 阻止。
  - 项目已包含 `src-tauri` 原型，但上一轮因本机缺少 Cargo 未能执行原生构建。
- 目标：安装或发现 Rust 工具链，执行 `npm run desktop:build`，修复实际编译错误，尽可能产出 Windows 桌面安装包。

## Requirement Alignment

- Tauri 作为后续桌面主线，替代未签名 Node SEA EXE。
- 本轮不引入云端托管代理。
- 不保存账号、Cookie、Token 或官方登录态。
- 如需安装工具链，优先使用系统级标准工具，如 winget/rustup/Visual Studio Build Tools。
- 构建成功后记录产物路径；若被环境依赖阻塞，记录明确阻塞项和下一步。

## Implementation

- Rust/rustup：
  - 本机 rustup 安装器提示存在 `settings.toml`，该提示非致命问题。
  - 已显式安装并设定 `stable-x86_64-pc-windows-msvc`。
  - 已验证 `rustc 1.95.0`、`cargo 1.95.0`。
- Windows 构建环境：
  - 已通过 Visual Studio C++ x64 toolchain 执行 Tauri release 构建。
- Tauri 构建修复：
  - 新增 `src-tauri/icons/icon.ico`，补齐 Windows Resource 构建所需图标。
  - 新增 `src-tauri/Cargo.lock`，锁定 Rust 依赖。
  - `.gitignore` 忽略 `src-tauri/target/` 和 `src-tauri/gen/`。
  - 新增 `npm run desktop:build:portable`，用于 `tauri build --no-bundle`。
  - 新增 `npm run package:desktop:portable` 和 `scripts/package-tauri-portable.mjs`，生成桌面便携 zip 与 SHA256。
  - 前端版本状态新增 `runtime` 标识，Tauri 运行时显示“桌面版”。
  - GitHub Release workflow 新增 Tauri 桌面便携包构建，并上传全部 zip 与 `.sha256` 资产。
- 版本：
  - 本轮桌面便携版升级为 `0.1.3`，避免和已发布的 `0.1.2` Node 便携包混淆。

## Verification

- `npm run package:desktop:portable`：通过。
  - 内部执行 `npm run build`：通过。
  - 内部执行 `tauri build --no-bundle`：通过。
- `npm run build:portable`：通过，备用 Node 便携包仍可生成 `0.1.3`。
- `npm test`：通过，12 个单测通过。
- `git diff --check`：通过，仅有 Windows 换行提示。
- 短启动验收：通过。
  - 启动 `RisingStones-PartyFinder-Desktop.exe` 后进程存活并显示窗口标题 `FF14 副本招募筛选器`。
- 当前桌面便携产物：

```text
release/risingstones-partyfinder-helper-v0.1.3-desktop-win-x64-portable.zip
release/risingstones-partyfinder-helper-v0.1.3-desktop-win-x64-portable.zip.sha256
```

- SHA256：

```text
068F0503630EA768F12254F2E603F1F63DF1DB1DAD20342B5BC15977BCA349D4
```

## Notes

- `npm run desktop:build` 的 Rust release 编译已经通过，但最后 NSIS 安装包阶段下载 Tauri 官方 NSIS 工具包时出现 `timeout: global`。
- 该问题只影响安装包 bundling，不影响桌面 EXE 和便携 zip。
- 未签名桌面 EXE 仍可能触发 Windows SmartScreen；真正降低拦截率仍需要代码签名证书和发布信誉积累。

## End

- 结束状态：Tauri 桌面便携版构建链已经可用，本机已产出并启动验证 `0.1.3` 桌面便携包。
- 后续建议：
  - 后续发版继续同时上传桌面便携 zip、备用 Node 便携 zip 和各自 `.sha256`。
  - 单独处理 NSIS 工具缓存或安装器构建环境。
  - 代码签名证书就绪后，将签名步骤接入桌面便携包和安装包发布链。

## Release Result

- 已提交 `发布 0.1.3 Tauri 桌面便携版`，并推送 `main` 到 GitHub 主仓库和国内镜像 remote。
- 已推送 `v0.1.3` 标签到 GitHub 主仓库和国内镜像 remote。
- GitHub Release workflow：通过。
  - Run ID：`25513600285`
  - Release URL：`https://github.com/today080221/risingstones-partyfinder-helper/releases/tag/v0.1.3`
- GitHub CI：通过。
  - Run ID：`25513580466`
- GitHub Release 资产：
  - `risingstones-partyfinder-helper-v0.1.3-desktop-win-x64-portable.zip`
  - `risingstones-partyfinder-helper-v0.1.3-desktop-win-x64-portable.zip.sha256`
  - `risingstones-partyfinder-helper-v0.1.3-win-x64.zip`
  - `risingstones-partyfinder-helper-v0.1.3-win-x64.zip.sha256`
- GitHub Actions 提醒：
  - `actions/checkout@v4`、`actions/setup-node@v4`、`actions/upload-artifact@v4` 当前有 Node.js 20 deprecation notice，需要后续维护。
  - Windows runner 提示 `windows-2025` 将被重定向到 `windows-2025-vs2026`，本轮不影响构建。
