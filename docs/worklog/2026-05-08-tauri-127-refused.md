# Tauri 桌面客户端 127.0.0.1 refused 修复记录

## Start

- 开始：用户反馈打开 Tauri 桌面客户端时显示 `127.0.0.1 refused to connect`。
- 初步现场：正式桌面客户端不应该依赖本地 Vite dev server；如果窗口访问 `127.0.0.1:5173`，说明构建产物仍在加载 `devUrl`。

## Requirement Alignment

- 桌面便携版必须开箱即用，不要求用户启动 Vite、Node 代理或其它开发服务。
- Tauri 正式包应加载内嵌/打包的 `frontendDist` 静态资源，并通过 Rust command 调官方接口。
- 仍需保留上轮对 Windows SDK `LIB`、`LIBPATH`、`INCLUDE` 的构建环境补齐，避免 GitHub Actions 和普通 PowerShell 下链接失败。

## Implementation

- 根因判断：上一轮为绕开普通 PowerShell 中 Windows SDK 链接环境丢失，便携版 `--no-bundle` 路径直接执行了 `cargo build --release`。
- 问题影响：裸 Cargo 构建会绕过 Tauri CLI 的发布构建上下文，正式 EXE 可能仍按 `devUrl` 打开 `http://127.0.0.1:5173`，于是用户机器没有 Vite dev server 时显示 refused。
- 修复：Windows 便携版仍在临时 `.cmd` 中加载 `VsDevCmd.bat`、补齐 `LIB` / `LIBPATH` / `INCLUDE`，但最终改为调用 `tauri build --no-bundle`。
- 兜底：移除 `--no-bundle` 的裸 `cargo build` 备用路径，确保所有便携构建都经过 Tauri CLI。

## Verification

- `npm run desktop:build:portable`：通过；日志显示执行 `tauri build --no-bundle`，并生成 `src-tauri/target/release/risingstones-partyfinder-helper.exe`。
- `npm run package:desktop:portable`：通过；重新生成 `release/risingstones-partyfinder-helper-v0.1.5-desktop-win-x64-portable.zip` 和 `.sha256`。
- WebView2 短启动验收：启动 zip 解包目录中的 `RisingStones-PartyFinder-Desktop.exe` 后，调试端口读取到页面 URL 为 `http://tauri.localhost/`，不是 `http://127.0.0.1:5173`。
- `release-manifest.json` 验收：桌面便携包内 `runtime=desktop`、`target=desktop-win-x64-portable`，更新源键包含 `github` 和国内镜像键；公开文档不写入国内镜像真实地址。
- `npm test`：12 tests passed。

## End

- 结论：`127.0.0.1 refused to connect` 是 v0.1.5 桌面便携包构建方式回退到裸 Cargo 后引入的发布上下文问题。
- 修复后正式桌面包加载 Tauri 内置静态资源，不再要求用户启动 Vite、本地 Express 或其它开发服务。
- 由于已有 v0.1.5 发布资产可能包含旧构建，后续发布应重新上传修复后的桌面便携 zip，或升级到新的补丁版本发布。
