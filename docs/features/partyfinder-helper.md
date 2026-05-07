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
  - 结果状态灯：绿灯表示当前版本与远端 Release 对齐；黄灯表示有非重大版本更新；红灯表示跨重大版本落后，建议直接更新。
  - 只展示版本、发布页和附件下载入口；默认不静默覆盖本地文件，不执行未确认的更新包。

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
  读取 GitHub/国内镜像最新 Release，返回当前版本、最新版本、发布页和附件下载入口；远端 Release 不存在时回退读取最新 Git tag。国内镜像仓库由本机敏感配置注入，不通过前端参数传入。

- `GET /api/geoip`
  通过公开 GeoIP 服务判断当前出口 IP 所在国家/地区，返回推荐下载节点；失败时优先回退国内镜像，未配置国内镜像时回退 GitHub。

生产和便携包模式下，Express 同时提供前端静态文件；开发模式下仍由 Vite 提供前端并代理 `/api`。

## Acceptance Criteria

- 选择某个副本后，工具能拉完官方返回的全部分页，`fetched` 与 `count` 一致或展示明确警告。
- 本地筛选不改写官方数据，只隐藏不符合条件的结果。
- 每条结果提供官方详情链接。
- Tampermonkey 脚本只在官方域名运行，响应前必须人工确认。
- 单测覆盖分页终止、官方参数、关键词、时间解析、职业映射、空位判断。

## Planned

- 更新机制后续增强：可在第一版检查和下载入口基础上，再评估半自动替换、校验文件和签名验证。

## Implemented Components

- `server/index.ts`：Express 本地代理，提供 `/api/meta`、`/api/recruits`、`/api/health`。
- `src/lib/*`：关键词、时间解析、职业映射、空位判断、分页收集等纯逻辑。
- `src/App.tsx`：本地工具主界面，区分官方拉取条件和本地二次筛选。
- `userscripts/risingstones-response-helper.user.js`：官方页手动响应脚本。
- 职业选择器：在本地筛选区展示已选职业、搜索框、职能分类和具体职业按钮，避免原生多选框难点中和可视区域过小。
- 无重复职业：默认开启；具体职业已在当前队伍/团队位置中出现时不命中。选择职能分类时，只要该分类下仍有未重复且被招募接受的具体职业，就继续命中。
- 展开详情：结果卡片提供小型“详情/收起”按钮，展开后按需读取 `/api/recruit-detail`；“队伍详情”展示官方文本说明，“当前队伍构成”单独展示位置矩阵。
- 可折叠固定侧栏：桌面端左侧筛选器固定在页面左边并独立滚动；折叠后结果区自动扩展，窄屏下恢复为普通顶部筛选区。
- 便携包构建：`scripts/build-portable.mjs` 组装 Windows x64 zip，包含 `app/server.cjs`、`app/dist`、`runtime/node.exe`、启动脚本、文档和许可文件。
- 更新检查：侧栏提供 GitHub/国内镜像下载节点、启动时检查开关和检查结果卡片；服务端代理发布源 API，避免前端跨域限制。
- 更新状态灯：结果状态区下方展示绿/黄/红更新状态，刷新页面时自动检查当前下载节点的 Release 状态。

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
