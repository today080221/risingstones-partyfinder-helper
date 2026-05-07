# Tauri 桌面客户端原型工作记录

## Start

- 开始：用户决定先试做全 App 方案，不继续把当前 zip 便携版作为唯一分发形态。
- 当前状态：
  - 现有工具是 React + Vite 前端，Express 本地代理提供 `/api/*`。
  - Windows 便携版依赖 zip、`node.exe` 和 `start-windows.bat`，容易被浏览器标记为不常见下载，也缺少真正的一键更新体验。
  - 本机当前未安装 Rust/Cargo，无法在本轮直接完成 `tauri build` 原生打包验证。
- 目标：新增一个 Tauri 桌面客户端原型，先让同一套 React UI 能在 Tauri 壳内调用 Rust 命令访问官方接口，为后续签名安装包和 Tauri updater 打基础。

## Requirement Alignment

- 桌面优先，移动端后续复用共享前端和筛选逻辑。
- 不新增云端托管代理，客户端直接请求石之家公开接口。
- 不保存账号、Cookie、Token 或官方登录态。
- 原型阶段允许保留现有 Express 开发/便携版路径，但新增 Tauri API transport，避免 Tauri 运行时依赖本地 Node server。
- 本轮验收以代码可构建前端、类型检查通过、文档完整为主；原生安装包构建需要 Rust 环境后补跑。

## Implementation

- 新增 Tauri 依赖：
  - `@tauri-apps/api`
  - `@tauri-apps/cli`
- 新增 npm 脚本：
  - `desktop:dev`
  - `desktop:build`
- 新增 `src-tauri`：
  - `tauri.conf.json` 配置 Vite 前端、Windows 桌面窗口和 NSIS 打包目标。
  - `Cargo.toml` 配置 Tauri、reqwest、serde_json、chrono 和 tokio。
  - Rust 命令层实现 `risingstones_version`、`risingstones_meta`、`risingstones_recruits`、`risingstones_recruit_detail`、`risingstones_geoip`、`risingstones_check_update`。
- 更新 `src/api.ts`：
  - 普通浏览器继续请求 `/api/*`。
  - Tauri 运行时自动改用 `@tauri-apps/api/core.invoke`。
- 更新文档：
  - 新增 `docs/release/desktop-tauri.md`。
  - 更新 README、架构说明、功能文档和路线图。
  - 将文档中的当前便携包示例更新为 `v0.1.1`。

## Verification

- `npm run build`：通过，TypeScript 与 Vite production build 成功。
- `npm test`：通过，12 项单测全部通过。
- `npm run release:check`：通过，便携包发布链仍可生成 `risingstones-partyfinder-helper-v0.1.1-win-x64.zip`。
- `npm run desktop:build`：未通过，原因是本机没有 `cargo`，错误为 `failed to run 'cargo metadata' ... program not found`。

## End

- 当前轮完成 Tauri 桌面客户端原型源码、双 API transport 和中文文档链更新。
- 遗留项：
  - 安装 Rust/Cargo 后执行 `npm run desktop:build`。
  - 如 Rust 编译暴露类型或依赖问题，在下一轮按编译错误修正。
  - 增加应用图标、安装器元数据、Tauri updater 和代码签名。
