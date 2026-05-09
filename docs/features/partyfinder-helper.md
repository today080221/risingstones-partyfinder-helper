# FF14 副本招募筛选工具

## Goal

构建一个本地网页工具，针对石之家国服副本招募页面，按选定副本全量拉取官方筛选结果，并在本地筛选符合用户要求的进度、攻略、时间和空缺职业。

## Confirmed Requirements

- 工具形态：本地网页工具，React + Vite + TypeScript 前端，Node/Express 本地代理。
- 全量范围：必须先选定 `fb_name`，再按官方分页完整拉取该副本的招募结果。
- 官方筛选条件：保留副本类型/名称、大区、标签、队伍构成、位置、团队 A/B/C。
- 本地筛选条件：
  - 进度关键词，支持包含词和 `-排除词`。
  - 攻略关键词，支持包含词和 `-排除词`。
  - 时间关键词和时间段解析同时支持。
  - 全局不包含关键词，命中副本名、进度、攻略、时间、标签或自定义标签任一字段时排除。
  - 我的职业可进，基于 `need_job`、职业/职能映射和默认开启的“无重复职业”选项；UI 使用可搜索、按职能分组的按钮式职业选择器。
  - 指定空位位置，基于 MT/ST/H1/H2/D1-D4 和 24 人团队位置数据。
- 响应招募：
  - 本地工具只打开官方详情页。
  - Tampermonkey 脚本可在官方域名下用当前登录态手动响应。
  - 不自动提交响应，不保存登录态。
- 结果卡片：
  - 默认保持紧凑展示。
  - 支持点击“详情”按需展开官方队伍详情文本、招募要求、攻略说明，并在独立区域展示当前队伍构成。
  - 卡片支持来源徽标；官方与 NGA 来源统一使用“查看详情”，再按来源打开石之家详情页或 NGA 原帖链接。
- 页面布局：
  - 左侧副本招募筛选器在桌面端固定为视口高度并独立滚动，滚动结果列表时筛选参数不离开视野。
  - 筛选器右上角支持折叠/展开；折叠状态持久化，不清空已选副本、官方条件或本地筛选参数。
- 发布形态：
  - 源码仓库保持可审计、可测试的标准 Web 项目结构。
  - 面向普通用户提供 Windows x64 便携包，内置前端产物、后端代理和 Node.js 运行时。
- 更新机制：
  - 固定使用 GitHub 主仓库 `today080221/risingstones-partyfinder-helper` 作为官方源码库和主 Release 源。
  - 国内镜像仓库地址不写入公开源码或文档；由本机环境变量、未提交本地配置或便携包 manifest 注入。
  - 加载前端时由本地代理做 GeoIP 检测：中国大陆或检测失败默认国内镜像；如果发布包未配置国内镜像，则回退 GitHub。
  - 支持启动时自动检查更新。
  - 结果状态灯：绿灯表示当前版本与远端 Release 对齐；黄灯表示有非重大版本更新或所选镜像尚未同步当前版本；红灯表示跨重大版本落后，建议直接更新。
  - 发现新版本时优先选择适配当前客户端形态的 zip 更新包。
  - 一键更新必须由用户手动确认；确认后下载 zip、退出当前程序、覆盖当前解压目录并重启新版。
  - 更新执行只接受本项目 Release zip，并要求当前目录存在 `release-manifest.json`；开发模式不允许覆盖更新。

## Official Interfaces

- 招募列表：`https://apiff14risingstones.web.sdo.com/api/home/recruit/recruitFbList`
- 副本配置：`https://apiff14risingstones.web.sdo.com/api/home/recruit/getFbConfigList`
- 标签配置：`https://apiff14risingstones.web.sdo.com/api/home/recruit/fbLabelList`
- 职业配置：`https://apiff14risingstones.web.sdo.com/api/home/recruit/getJobConfigList`
- 大区配置：`https://apiff14risingstones.web.sdo.com/api/home/groupAndRole/getAreaAndGroupList`
- 响应招募：`https://apiff14risingstones.web.sdo.com/api/home/recruit/responseRecruitFb`

## Local Interfaces

- `GET /api/meta`
  聚合副本、标签、职业、大区配置。

- `GET /api/recruits`
  接收官方筛选参数，要求 `fb_name` 非空；服务器以 `limit=100` 顺序拉取全部分页，返回 `count`、`fetched`、`rows` 和 `query`。

- `GET /api/recruit-detail?id=<招募ID>`
  读取单条副本招募详情，用于结果卡片按需展开官方 `team_detail_mask`、`recruit_require_mask`、`strategy_desc_mask`，并补充当前队伍构成。

- `GET /api/version`
  返回当前工具版本、构建时间、运行形态和平台信息。

- `GET /api/update/check?provider=<github|gitee>`
  读取 GitHub/国内镜像最新 Release，返回当前版本、最新版本、发布页和 Release 资产列表；远端 Release 不存在时回退读取最新 Git tag。国内镜像仓库由本机敏感配置注入，不通过前端参数传入。

- `POST /api/update/install`
  Node 便携包的一键更新接口。接收更新包名称和下载地址，校验来源和包名后下载 zip，生成临时 PowerShell 覆盖脚本，响应成功后退出当前进程并重启新版。

- `GET /api/geoip`
  通过公开 GeoIP 服务判断当前出口 IP 所在国家/地区，返回推荐下载节点；失败时优先回退国内镜像，未配置国内镜像时回退 GitHub。

生产和便携包模式下，Express 同时提供前端静态文件；开发模式下仍由 Vite 提供前端并代理 `/api`。

## Tauri NGA Commands

NGA 本地聚合仅在 Tauri 桌面运行时可用，Node/浏览器开发模式会显示不可用提示，不尝试跨域读取或绕过登录限制。

- `risingstones_nga_session_status`
  返回 NGA WebView 登录窗口状态、保持登录选项、本机 WebView profile 路径和最近采集时间。

- `risingstones_nga_open_session`
  打开用户可见的 NGA WebView。用户自行登录；开启保持登录时使用本应用专属 WebView 数据目录，关闭时使用临时会话。

- `risingstones_nga_clear_session`
  关闭 NGA WebView，清理本应用 NGA WebView profile 下的浏览数据，不影响系统浏览器。

- `risingstones_nga_collect_visible_samples`
  在用户当前打开的 NGA WebView 页面中按请求间隔采集已渲染帖子样本；当前页入口限定为国服/日服招募板或 `read.php?tid=...` 帖子详情，并只返回 `title`、`body`、`url`、`author`、`publishedAt`、`forumId`、`topicId` 白名单字段。

- `risingstones_nga_cancel_collect`
  请求停止正在进行的 NGA 样本采集。

## Acceptance Criteria

- 选择某个副本后，工具能拉完官方返回的全部分页，`fetched` 与 `count` 一致或展示明确警告。
- 本地筛选不改写官方数据，只隐藏不符合条件的结果。
- 每条结果提供官方详情链接。
- NGA 样本卡片提供原帖链接、来源徽标、Parser v1 结构化字段、置信度、证据片段、tag、warning 和原文片段。
- Tampermonkey 脚本只在官方域名运行，响应前必须人工确认。
- 单测覆盖分页终止、官方参数、关键词、时间解析、职业映射、空位判断。

## Planned

- 更新机制后续增强：在当前用户确认式覆盖更新基础上，继续评估签名校验、安装器形态和正式 Tauri updater。

## Implemented Components

- `server/index.ts`：Express 本地代理，提供 `/api/meta`、`/api/recruits`、`/api/health`。
- `src/lib/*`：关键词、时间解析、职业映射、空位判断、分页收集等纯逻辑。
- `src/App.tsx`：本地工具主界面，区分官方拉取条件和本地二次筛选。
- `userscripts/risingstones-response-helper.user.js`：官方页手动响应脚本。
- 职业选择器：在本地筛选区展示已选职业、搜索框、职能分类和具体职业按钮，避免原生多选框难点中和可视区域过小。
- 无重复职业：默认开启；具体职业已在当前队伍/团队位置中出现时不命中。选择职能分类时，只要该分类下仍有未重复且被招募接受的具体职业，就继续命中。
- 展开详情：结果卡片提供小型“详情/收起”按钮，展开后按需读取 `/api/recruit-detail`；“队伍详情”展示官方文本说明，“当前队伍构成”单独展示位置矩阵。
- 可折叠固定侧栏：桌面端左侧筛选器固定在页面左边并独立滚动；折叠后结果区自动扩展，窄屏下恢复为普通顶部筛选区。
- 便携包构建：`scripts/build-portable.mjs` 组装 Windows x64 zip，包含一键启动 `RisingStones-PartyFinder.exe`、`app/server.cjs`、`app/dist`、备用 `runtime/node.exe`、启动脚本、文档和许可文件。
- 桌面客户端原型：`src-tauri` 提供 Tauri 桌面壳，前端在 Tauri 运行时通过 Rust `invoke` 命令访问公开接口，不启动本地 Express 服务。
- 更新检查：侧栏提供 GitHub/国内镜像下载节点、启动时检查开关和检查结果卡片；服务端代理发布源 API，避免前端跨域限制。
- 更新状态灯：结果状态区下方展示绿/黄/红更新状态，刷新页面时自动检查当前下载节点的 Release 状态。
- 一键更新：Node 便携包通过 `/api/update/install` 执行下载、覆盖和重启；Tauri 桌面版通过 `risingstones_install_update` 执行同等流程。
- NGA 本地聚合基础版：Tauri 桌面版提供 NGA 登录 WebView、保持登录状态风险提示、清除本机登录状态、可见可取消有限频样本采集、逐帖详情正文采集、已存样本正文补齐、1500 条本地去重样本池、样本分析报告、Parser v1，以及官方/NGA 统一来源卡片。

## Verification Snapshot

- `npm test`：12 tests passed。
- `npm run build`：TypeScript 与 Vite production build passed。
- 本地代理抽样：`巴哈姆特绝境战` 返回 `count=12`、`fetched=12`、`warnings=0`。
- 单条详情抽样：`/api/recruit-detail?id=49896` 返回 `id=49896`、`fb_name=巴哈姆特绝境战`。
- 队伍详情字段抽样：`/api/recruit-detail?id=49314` 返回非空 `team_detail_mask`。
- 固定侧栏更新：`npm test`、`npm run build` 通过；`/api/health` 和本地 Web 页面探针通过。
- 开源发布与更新检查：`npm run release:check` 通过；便携包运行探针通过；GitHub/Gitee 更新检查接口均可返回最新 Release 信息。
- 下载节点与状态灯：`npm run release:check` 通过；便携包 `/api/geoip` 探针通过，当前环境推荐国内镜像。
- 首版发布：GitHub 与国内镜像 `main` / `v0.1.0` 标签均已推送；GitHub Release `v0.1.0` 已生成 Windows 便携包附件。
- 私有镜像配置：公开源码和文档不包含国内镜像真实地址；未配置国内镜像时更新检查回退 GitHub；镜像 repo 可通过本机环境变量或未提交配置注入便携包 manifest。
- v0.1.6 桌面便携包修复：Tauri 正式包重新走 `tauri build --no-bundle`，短启动验收 URL 为 `http://tauri.localhost/`，不再访问 `127.0.0.1:5173`。
- v0.1.7 职业智能筛选：未填需求职业时会按空缺位置兜底匹配所选职业；空缺位置筛选在 UI 中前置到“我的职业可进”上方；Release 包要求内置 GitHub 与国内镜像两个更新源。
- v0.1.8 更新下载加固：一键更新下载 Release zip 使用长超时、二进制响应头和重试；GitHub 更新包优先复用系统代理，并为覆盖安装脚本写入本地日志。
- v0.1.9 更新状态修正：当前版本高于所选下载节点最新 Release 时显示黄色“节点待同步”，不再误判为 Release 对齐。
- v0.1.10 自更新脚本修正：PowerShell 覆盖脚本改为带 UTF-8 BOM 写入，避免中文路径或中文脚本内容在 Windows PowerShell 5.1 下解析失败。
- v0.1.11 官方详情外链修正：Tauri 桌面端通过系统 opener 打开默认浏览器；普通浏览器/Node 便携版继续使用新标签页。
- NGA 本地聚合 + Parser v1：`npm test`、`npm run build`、`cargo check --manifest-path src-tauri/Cargo.toml`、`npm run test:e2e`、`npm run validate:nga-parser` 通过。
- Playwright e2e：新增 `npm run test:e2e`，覆盖首屏渲染、NGA 面板默认状态和保持登录风险提示确认流程。
- NGA Parser 专项回测：本地样本池 396/396 条含正文， curated harness 29 条 fixture、208 条断言全通过；高置信有效解析 225 条，Wilson 95% 置信区间约 98.2% - 100.0%。
