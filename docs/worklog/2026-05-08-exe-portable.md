# EXE 便携版工作记录

## Start

- 开始：用户希望先做一个好用的便携版开箱即用包，不要求用户安装 Node、npm、Rust 或执行命令。
- 当前问题：
  - 现有便携包入口是 `start-windows.bat` + `runtime/node.exe` + 浏览器。
  - 普通用户看到 bat、node.exe 和本地端口会觉得不像常规软件。
  - Tauri 方向适合后续正式安装包和自动更新，但当前阶段对“先好用”来说过重。
- 目标：新增 Windows EXE 便携版入口，用户解压 zip 后双击 `RisingStones-PartyFinder.exe` 即可启动工具并自动打开浏览器。

## Requirement Alignment

- 保持便携版：不安装系统服务，不写注册表，不要求管理员权限。
- 保持本地运行：不新增云端托管代理。
- 保留现有 `start-windows.bat` 作为兜底入口。
- EXE 入口仍然不保存账号、Cookie、Token 或官方登录态。
- 本轮优先实现开箱即用体验；代码签名和一键自动更新继续作为后续增强。

## Implementation

- 使用 Node.js Single Executable Applications 生成 `RisingStones-PartyFinder.exe`。
- 新增 `postject` 构建依赖，用于把 SEA blob 注入复制出的 Windows `node.exe`。
- `scripts/build-portable.mjs` 在生成便携包时：
  - 构建 `app/server.cjs` 和 `app/dist`。
  - 生成 SEA 启动入口，自动设置 `PORT`、`STATIC_DIR`、`SERVE_STATIC` 和 `AUTO_OPEN_BROWSER`。
  - 将 EXE 放在 zip 根目录，作为普通用户主入口。
  - 保留 `runtime/node.exe` 和 `start-windows.bat` 作为备用入口。
- `server/index.ts` 支持 `AUTO_OPEN_BROWSER=true` 时启动后自动打开本地页面。
- 文档更新：
  - README 改为推荐双击 `RisingStones-PartyFinder.exe`。
  - 便携包发布说明补充 EXE 入口、备用 bat、Node SEA 和代码签名后续风险。
  - 第三方依赖说明补充 `postject` 与 Node.js SEA 用途。

## Verification

- `npm run release:check`：通过，包含 12 项单测、前端构建、后端打包和 EXE 便携包生成。
- EXE 启动探针：
  - 设置 `PORT=8898`、`AUTO_OPEN_BROWSER=false` 后启动 `RisingStones-PartyFinder.exe`。
  - `/api/health` 返回 `ok=true`。
  - `/api/version` 返回 `version=0.1.1`、`portable=true`。
- 备用 bat 探针：
  - 设置 `PORT=8899`、`AUTO_OPEN_BROWSER=false` 后启动 `start-windows.bat`。
  - 本地服务返回 `version=0.1.1`、`portable=true`。
- 当前 EXE SHA256：`898609AD9B11163EB8132DB4DDE04C8DD7D64ABACAD57883361B944198A5A038`。
- 当前 zip SHA256：`63AAABB28E11FD0EADF0F59E0F93C45AA28749AB19AECC6C3B3DFE6A81B1CB60`。

## End

- 当前轮完成 EXE 便携版主入口，用户路径变为“下载 zip -> 解压 -> 双击 EXE”。
- 遗留项：
  - 仍未做代码签名，Chrome/Windows 可能继续显示未知发布者或不常见下载。
  - 一键自动更新仍未实现，后续可在 EXE 入口稳定后继续做下载、校验、替换和重启流程。
