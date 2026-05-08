# FF14 副本招募筛选工具

一个面向 FF14 中国大陆服务器石之家副本招募页面的本地筛选工具。它会在你选定副本后，按官方筛选条件顺序拉取完整分页，再在本地按进度、攻略、时间、空缺职业和队伍位置筛选。

本项目不是官方项目，不保存账号信息，也不会自动代替你响应招募。

## 适合谁

- 想一次性看完某个副本的全部招募，而不是在官方前端里反复滚动。
- 想筛掉“保次”“代打”等不想看的关键词。
- 想按自己的职业、无重复职业规则、MT/ST/H1/H2/D1-D4 空位快速找队。
- 想保留官方登录和响应流程，不把账号 Cookie 或 Token 交给本地工具。
- 想在便携包里检查官方源码库或国内镜像发布源，确认是否有新版本。

## 普通用户：开箱即用

推荐从 GitHub Releases 下载 Tauri 桌面便携包：

```text
risingstones-partyfinder-helper-v0.1.8-desktop-win-x64-portable.zip
```

解压后双击：

```text
RisingStones-PartyFinder-Desktop.exe
```

这个版本直接打开桌面窗口，不需要安装 Node.js，也不会启动本地浏览器或本地 Express 服务。

备用的本地服务便携包仍可使用：

```text
risingstones-partyfinder-helper-v0.1.8-win-x64.zip
```

解压后双击：

```text
RisingStones-PartyFinder.exe
```

浏览器会打开：

```text
http://127.0.0.1:8797
```

这个便携包包含：

- 一键启动的 `RisingStones-PartyFinder.exe`。
- 已构建好的网页前端。
- 已打包好的本地代理服务。
- Windows x64 Node.js 运行时。
- Tampermonkey 响应助手脚本。
- 中文使用说明和许可文件。

普通用户不需要运行 `npm install`，也不需要安装 Node.js。
如果 EXE 被安全软件拦截，可以临时改用 `start-windows.bat` 备用入口。

## 源码开发

开发者从源码运行时需要 Node.js 20 或更高版本：

```powershell
npm ci
npm run dev
```

- Web 开发服务默认从 `http://127.0.0.1:5173` 启动。
- 本地 API 默认从 `http://127.0.0.1:8797` 启动。
- 如果 `5173` 被占用，Vite 会自动顺延端口。

## Tauri 桌面原型

仓库已加入 Tauri 桌面客户端。它复用现有 React 前端，但在 Tauri 运行时通过 Rust 命令直接请求石之家公开接口，不需要启动本地 Express 服务。

```powershell
npm ci
npm run desktop:dev
```

桌面便携包构建需要 Rust/Cargo 和 Windows C++ 构建环境：

```powershell
cargo --version
npm run package:desktop:portable
```

产物会生成在：

```text
release/risingstones-partyfinder-helper-v0.1.8-desktop-win-x64-portable.zip
```

安装包构建可继续使用 `npm run desktop:build`，但首次下载 NSIS 工具包时可能受网络影响。详情见 `docs/release/desktop-tauri.md`。

## 功能概览

- 官方条件：
  - 副本类型
  - 副本名称
  - 招募大区
  - 官方标签
  - 队伍构成
  - 位置
  - 24 人团队 A/B/C
- 本地筛选：
  - 进度关键词，支持包含和 `-排除`
  - 攻略关键词，支持包含和 `-排除`
  - 全局不包含关键词
  - 原文时间关键词
  - 常见时间段解析，例如 `晚8-11`、`20-23`、`周末`
  - 我的职业可进
  - 默认开启的无重复职业
  - 指定空缺位置
- 结果卡片：
  - 副本、进度、攻略、时间
  - 当前队伍构成
  - 需求职业
  - 空位位置
  - 大区/服务器
  - 响应数和剩余时间
  - 官方详情链接
  - 按需展开队伍详情、招募要求、攻略说明
- 更新检查：
  - 支持 GitHub Releases
  - 支持可由本机发布配置注入的国内镜像 Releases
  - 加载时根据 GeoIP 推荐下载节点：中国大陆或检测失败默认国内镜像，未配置国内镜像时回退 GitHub
  - 支持启动时检查
  - 在结果状态下方展示绿/黄/红更新状态灯
  - 发现新版本时展示适合当前客户端的更新包
  - 支持用户确认后“一键更新”：下载 zip、退出当前程序、覆盖当前解压目录并重启

## 响应招募

本地工具不会读取官方站点的 HttpOnly Cookie，也不会保存账号、Cookie、Token 或联系信息。

你可以用两种安全方式响应招募：

- 在结果卡片中点击“官方详情”，跳回石之家官方页面，用你的正常登录态响应。
- 安装 `userscripts/risingstones-response-helper.user.js` 到 Tampermonkey，在官方页面内手动点击响应按钮。

Tampermonkey 脚本只运行在石之家官方域名下，且必须由用户手动确认，不做自动提交。

## 打包发布

生成 Windows 便携包：

```powershell
npm ci
npm run build:portable
```

产物会生成在：

```text
release/risingstones-partyfinder-helper-v0.1.8-win-x64.zip
```

发布包构成和注意事项见：

- `docs/release/portable-package.md`

## 验证命令

```powershell
npm test
npm run build
npm run build:portable
```

## 项目结构

```text
server/                 本地 Express 代理
src/                    React 前端和本地筛选逻辑
src-tauri/              Tauri 桌面客户端原型
scripts/                发布打包脚本
userscripts/            官方页面 Tampermonkey 辅助脚本
docs/                   中文项目文档链
.github/workflows/      GitHub CI 和发布工作流
```

## 文档入口

- `docs/README.md`：项目文档链入口
- `docs/features/partyfinder-helper.md`：功能、接口和验收标准
- `docs/release/portable-package.md`：便携包发布说明
- `docs/release/desktop-tauri.md`：Tauri 桌面客户端原型说明
- `docs/release/code-signing.md`：Windows 代码签名准备说明
- `docs/userscripts/tampermonkey.md`：响应助手脚本说明
- `docs/collaboration/harness-engineering.md`：Harness 工程协作规则
- `docs/worklog/2026-05-07-ff14-partyfinder-helper.md`：本轮工作记录
- `docs/worklog/2026-05-08-tauri-desktop-prototype.md`：Tauri 原型工作记录
- `docs/worklog/2026-05-08-v0.1.2-release.md`：v0.1.2 发布工作记录
- `docs/worklog/2026-05-08-tauri-build-run.md`：Tauri 便携版实机构建记录

## 贡献

欢迎提交 Issue 和 Pull Request。请先阅读：

- `CONTRIBUTING.md`
- `SECURITY.md`
- `ROADMAP.md`

## 许可

本项目代码以 MIT License 发布，详见 `LICENSE`。

本项目使用的第三方依赖和发布包运行时说明见 `THIRD_PARTY_NOTICES.md`。

## 免责声明

本项目为社区工具，与石之家、盛趣游戏、Square Enix 或 FINAL FANTASY XIV 官方无隶属、授权或背书关系。相关商标、服务名称和游戏内容归各自权利人所有。
