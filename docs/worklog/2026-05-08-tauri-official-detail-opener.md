# Tauri 官方详情外链打开修复记录

## Start

- 开始：用户反馈 GitHub `0.1.10` Tauri 桌面端点击“官方详情”后没有打开本地浏览器跳转。
- 初步检查：结果卡片使用普通 `<a target="_blank">` 打开官方招募详情；Tauri 端没有安装或注册 opener 插件，`src-tauri/capabilities/default.json` 也只有 `core:default` 权限。
- 判断：问题真实存在，桌面 WebView 缺少可靠的系统浏览器外链通道。

## Requirement Alignment

- 桌面端点击“官方详情”应调用系统默认浏览器打开 `https://ff14risingstones.web.sdo.com/pc/index.html#/recruit/party?id=<招募ID>`。
- 浏览器/Node 便携网页版仍使用普通新标签页行为，不改变现有网页使用方式。
- 本修复不读取、不保存官方账号、Cookie 或 Token，也不在本地工具内代替用户响应招募。
- 需要同步更新 Tauri 插件、权限、版本、发布文档和验收记录。

## Implementation

- 新增 `src/lib/external-links.ts`：
  - 普通浏览器环境继续使用 `window.open(..., "_blank")`。
  - Tauri 运行环境动态加载 `@tauri-apps/plugin-opener` 并调用 `openUrl()`。
- 结果卡片“官方详情”保留 `href`、`target="_blank"` 和 `rel="noreferrer"`；只有在 Tauri 环境下拦截点击并交给系统 opener。
- Tauri Rust 侧注册 `tauri_plugin_opener::init()`，默认 capability 增加 `opener:default`。
- 版本升级为 `0.1.11`，并将 `src-tauri/Cargo.toml` 的 `rust-version` 对齐到 opener 插件要求的 `1.77.2`。

## Verification

- `npm test`：通过，2 个测试文件、19 个测试通过。
- `npm run build`：通过，TypeScript 与 Vite production build 完成。
- `npm run package:desktop:portable`：通过，生成 `release/risingstones-partyfinder-helper-v0.1.11-desktop-win-x64-portable.zip`。
- `npm run build:portable`：通过，生成 `release/risingstones-partyfinder-helper-v0.1.11-win-x64.zip`。
- zip manifest 检查：桌面便携包和 Node 便携包版本均为 `0.1.11`，更新源 key 均为 `github,gitee`。
- Browser 插件回归尝试：浏览器插件初始化超时，未作为通过证据；本次以代码路径、TypeScript 构建和 Tauri release 编译作为主要验证。
- GitHub Actions：
  - `Release / v0.1.11`：通过，已发布桌面便携包、Node 便携包和对应 `.sha256`。
  - `CI / main`：通过。
- GitHub Release 资产检查：
  - Release 已创建且不是草稿/预发布。
  - 资产包含 `risingstones-partyfinder-helper-v0.1.11-desktop-win-x64-portable.zip`、`risingstones-partyfinder-helper-v0.1.11-win-x64.zip` 和两份 `.sha256`。
- SHA256：
  - Tauri 桌面便携包：`4462605C87719A610E488B19FAD92E681290802E3AA949B6726F77228111F127`
  - Node 便携包：`D4E3D8CAC340686C147783A41EE86F98368CCDFA2E68177E70BA59A18369835D`

## End

- 完成：`0.1.11` 已修复 Tauri 桌面端“官方详情”无法打开系统默认浏览器的问题，并完成本地测试、构建、双源 manifest 验证、双远端推送和 GitHub Release 发布。
- 注意：国内镜像 Release 资产仍需发布机使用本地 Gitee 令牌执行 `npm run release:gitee` 上传。
