# 2026-05-07 FF14 Party Finder Helper Worklog

## Start

- 目标：实现 FF14 国服石之家副本招募本地筛选工具。
- 仓库状态：空仓库，仅有 `.gitattributes` 和 `.git`。
- 已确认：无远端仓库；`git status --short --branch` 显示在 `main` 且无未提交业务文件。
- 环境：Windows PowerShell，Node `v24.15.0`，npm `8.1.2`。

## Requirement Alignment

- 工具采用本地网页 + 本地代理。
- 只在选定副本后全量拉取官方分页。
- 本地筛选覆盖进度、攻略、时间、我的职业和空缺位置。
- 账号响应采用安全双路径：本地工具打开官方详情；官方域名 Tampermonkey 脚本手动响应。
- 不保存账号、Cookie、Token 或用户联系信息。
- 用户补充要求：按全套 Harness 工程思路推进；开始、需求对齐、结束时更新对应文档。

## Implementation Log

- 已创建项目级 docs chain：`docs/README.md`、`docs/collaboration/harness-engineering.md`、`docs/features/partyfinder-helper.md`。
- 已创建根目录 `README.md` 和本工作记录。
- 已初始化 React/Vite/TypeScript + Express 的基础项目文件。
- 端口校准：本机 `5173` 和 `8787` 已被其他服务占用；本项目 API 默认改为 `8797`，Vite 会在 `5173` 占用时自动顺延。
- 已实现 Express 代理：`/api/meta`、`/api/recruits`、`/api/health`。
- 已实现 React 工具界面：官方拉取条件、本地筛选条件、全量刷新/取消、结果卡片和官方详情链接。
- 已实现本地筛选核心：关键词 include/exclude、常见时间解析、职业/职能映射、MT/ST/H1/H2/D1-D4 和团队 A/B/C 空位判断。
- 已实现 Tampermonkey 脚本：官方域名下手动响应招募，不自动提交、不保存联系信息。

## End

- 验证命令：
  - `npm test`：通过，1 个测试文件，9 条测试。
  - `npm run build`：通过，TypeScript 与 Vite production build 成功。
- 真实接口抽样：
  - `GET http://127.0.0.1:8797/api/meta` 返回 `fbConfigs=84`、`labels=12`、`areas=4`、`jobs=29`。
  - `GET /api/recruits?fb_name=巴哈姆特绝境战&fb_type=绝境战` 返回 `count=12`、`fetched=12`、`warnings=0`。
- 本地运行状态：
  - API：`http://127.0.0.1:8797`。
  - Web：`http://127.0.0.1:5174`，因为 `5173` 被其他项目占用。
- 遗留风险：
  - 官方接口字段若后续改名，需要更新 `src/types.ts` 和代理适配。
  - 时间字段是自由文本，解析只能覆盖常见写法；关键词匹配仍作为兜底。
  - Tampermonkey 脚本未在已登录账号下真实提交响应，本轮只实现并保留手动确认边界。

## Follow-up: Job Picker UX

- 开始：用户反馈“我的职业可进”原生多选框太难点中目标职业，信息只露出几行，难以看清。
- 需求对齐：保持筛选语义不变，仅优化本地职业选择交互；优先改为可搜索、按职能分组、按钮式点选、已选职业清晰展示。
- 实现：将原生 `multiple select` 替换为职业选择器，包含已选职业胶囊、搜索输入、职能分类说明、两列职业按钮；侧栏宽度从 `380px` 调整为 `440px` 提高可读性。
- 验证：
  - `npm test`：通过，1 个测试文件，9 条测试。
  - `npm run build`：通过，TypeScript 与 Vite production build 成功。

## Follow-up: Global Exclude Keywords

- 开始：用户希望增加“不包含关键词”筛选，例如排除包含“保次”的招募。
- 需求对齐：新增一个独立的全局排除关键词输入；关键词命中副本名、进度、攻略、时间、标签或自定义标签任一字段时排除该招募；保留原有进度/攻略字段内 `-排除词` 的兼容能力。
- 实现：新增 `excludeText` 本地筛选状态；UI 在本地二次筛选区增加“不包含关键词”输入；筛选逻辑将副本名、类型、进度、攻略、时间、队伍构成、标签和自定义标签合并后做全局排除。
- 验证：
  - `npm test`：通过，1 个测试文件，10 条测试。
  - `npm run build`：通过，TypeScript 与 Vite production build 成功。

## Follow-up: No Duplicate Job Matching

- 开始：用户询问职业筛选是否基于无重复职业，并希望加一个默认勾选的“无重复职业”选项；高难通常不接受重复职业，因为会影响团队资源和 LB 获取。
- 需求对齐：新增本地筛选选项，默认开启；开启时，具体职业若已出现在当前队伍/团队构成中，则“我的职业可进”不命中。选择职能分类时，只要该分类下仍存在一个未重复且被招募接受的具体职业，就继续命中。
- 实现：新增 `noDuplicateJobs` 本地筛选状态，默认 `true`；职业匹配从单纯交集升级为“用户可选职业集合 ∩ 招募接受职业集合 ∩ 未占用职业集合”非空；占用职业来自 MT/ST/H1/H2/D1-D4、T/H 以及 24 人团队 `team_position`。
- 验证：
  - `npm test`：通过，1 个测试文件，12 条测试。
  - `npm run build`：通过，TypeScript 与 Vite production build 成功。

## Follow-up: Expandable Recruit Details

- 开始：用户希望在队伍标签卡中增加小按钮，快速展开显示队伍详情、招募要求、攻略说明。
- 需求对齐：结果卡片默认保持紧凑；点击“详情”后懒加载单条官方详情接口，展开当前卡片；不批量请求所有详情，避免增加官方接口压力。
- 实现：新增 `/api/recruit-detail` 本地代理和 `fetchRecruitDetail` 前端 API；结果卡片新增“详情/收起”按钮；展开区域显示队伍位置矩阵、招募要求、攻略说明，并保留加载和错误状态。
- 验证：
  - `npm test`：通过，1 个测试文件，12 条测试。
  - `npm run build`：通过，TypeScript 与 Vite production build 成功。
  - 本地接口抽样：`/api/recruit-detail?id=49896` 返回 `id=49896`、`fb_name=巴哈姆特绝境战`。

## Follow-up: Official Team Detail Text

- 开始：用户指出“队伍详情”被错误替换成当前队伍构成；官方二级界面中的“队伍详情”应为文本说明，当前队伍构成应放在另外合理区域。
- 需求对齐：使用官方详情接口字段 `team_detail_mask` 作为“队伍详情”；当前队伍构成保留为独立“当前队伍构成”模块，与文本详情分离排版。
- 实现：`RecruitDetail` 类型补充 `team_detail` / `team_detail_mask`；展开面板改为左侧/上方“当前队伍构成”位置矩阵，右侧/下方堆叠“队伍详情 / 招募要求 / 攻略说明”文本。
- 验证：
  - `npm test`：通过，1 个测试文件，12 条测试。
  - `npm run build`：通过，TypeScript 与 Vite production build 成功。
  - 本地接口抽样：`/api/recruit-detail?id=49314` 返回非空 `team_detail_mask`。

## Follow-up: Docked Collapsible Sidebar

- 开始：用户希望左侧筛选器固定在页面左边，滚动招募结果时不跟随页面滚走；并希望右上角有折叠按钮，筛选完成后可折叠以扩大结果显示区域。
- 需求对齐：左侧栏固定为视口高度并独立滚动；新增折叠/展开按钮；折叠状态不清空筛选参数，并持久化到本地 UI 状态。
- 实现：`App` 增加 `sidebarCollapsed` 状态、折叠按钮和本地持久化；桌面端侧栏改为 `position: sticky`、`height: 100vh`、独立滚动，折叠后网格从 `440px` 缩为 `68px`；窄屏下恢复单列普通文档流。
- 验证：
  - `npm test`：通过，1 个测试文件，12 条测试。
  - `npm run build`：通过，TypeScript 与 Vite production build 成功。
  - 本地运行探针：`/api/health` 返回 `ok=true`，`http://127.0.0.1:5174` 返回本工具页面标题。
- 结束：本轮完成左侧筛选器 dock、折叠/展开、状态持久化和响应式收口；相关需求、实现、验证已同步记录到功能文档和工作日志。

## Follow-up: Open Source Release Packaging

- 开始：用户希望项目能以开箱即用方式打包，普通使用者不用安装一堆依赖；同时准备推到 GitHub 成为开源库，需要补齐许可和全量中文文档。
- 需求对齐：
  - 源码仓库保持标准 React/Vite/TypeScript + Express 项目，方便开发者审计和贡献。
  - 面向普通用户提供 Windows 便携 zip：包含已构建前端、已打包后端、Node 运行时和启动脚本，解压后双击即可运行。
  - 补齐开源仓库基础材料：MIT 许可、中文 README、贡献指南、安全策略、变更日志、发布打包说明、第三方许可说明和 GitHub CI/Release 工作流。
  - 继续保持账号安全边界：发布文档必须明确不保存 Cookie、Token，不自动代替用户响应招募。
- 后续需求记录：用户希望后续支持从 GitHub/Gitee 等发布源自动拉取更新；先作为下一轮需求排入文档，当前轮继续完成发布包和开源材料收尾。
- 实现：
  - `package.json` 补充 MIT 许可、项目描述、关键词、Node 版本要求和发布脚本：`build:server`、`build:portable`、`release:check`。
  - `server/index.ts` 增加 production/portable 静态文件服务，发布包中由同一个 Express 服务提供前端和 `/api`。
  - `scripts/build-portable.mjs` 生成 Windows x64 便携包，包含 `app/dist`、`app/server.cjs`、`runtime/node.exe`、Node.js 许可、启动脚本、中文说明、项目文档和用户脚本。
  - 补齐开源材料：`LICENSE`、`NOTICE.md`、`THIRD_PARTY_NOTICES.md`、`CONTRIBUTING.md`、`SECURITY.md`、`CHANGELOG.md`、`ROADMAP.md`。
  - 补齐中文文档：架构说明、便携包发布说明、Tampermonkey 脚本说明，并更新文档入口和功能文档。
  - 增加 GitHub CI、Release workflow、Issue 模板和 PR 模板。
- 验证：
  - `npm run release:check`：通过，包含 `npm test`、`npm run build`、`build:server`、`build:portable`。
  - 便携包产物：`release/risingstones-partyfinder-helper-v0.1.0-win-x64.zip` 成功生成。
  - 便携包内容抽查：包含 `runtime/node.exe`、`runtime/LICENSE-Node.js.txt`、`app/server.cjs`、`app/dist`、文档和用户脚本。
  - 便携包运行探针：使用包内 `runtime/node.exe` 启动 `app/server.cjs`，`/api/health` 返回 `ok=true`，根路径返回本工具页面标题。
- 结束：当前轮完成开箱即用 Windows 便携包、开源许可和中文文档体系；随后继续实现 GitHub/Gitee 更新检查第一版。

## Follow-up: GitHub/Gitee Update Checking

- 开始：用户追加需求，希望工具后续可以接 GitHub/Gitee 等地方自动拉取更新；用户说明可以等当前发布包工作完成后再做。
- 需求对齐：
  - 做第一版安全更新检查：支持 GitHub/Gitee Release 查询，展示最新版本、发布页和附件下载入口。
  - 支持“启动时检查更新”，但不静默替换本地文件，不自动执行下载包。
  - 初版曾允许用户填写通用仓库路径，后续已收敛为固定官方源码库和本机注入的国内镜像节点。
- 实现：
  - 新增 `/api/version`，返回当前版本、构建时间、运行形态和平台。
  - 新增 `/api/update/check`，读取 GitHub/国内镜像最新 Release。
  - 前端侧栏新增“更新检查”面板，支持更新源、启动时检查、检查结果和下载/发布页链接。
  - 本地 UI 状态持久化新增 `updateProvider`、`autoCheckUpdates`。
  - `ROADMAP.md` 调整为第一版已完成，后续保留 release manifest、校验文件、签名和半自动替换评估。
- 验证：
  - `npm run build`：通过，TypeScript 与 Vite production build 成功。
  - `npm run release:check`：通过，包含单测、前端构建、后端打包和便携包生成。
  - 本地接口探针：`/api/version` 返回 `version=0.1.0`、`platform=win32-x64`。
  - 本地接口探针：GitHub `vitejs/vite` 与 Gitee `openharmony/docs` 最新 Release 查询均返回版本信息。
  - 便携包探针：使用包内 `runtime/node.exe` 启动后，`/api/version` 返回 `portable=true`，Gitee 更新检查接口可返回最新版本信息。

## Follow-up: Release Status Lights And Dual Remotes

- 开始：用户已建立远端仓库，要求更新源使用本项目 GitHub 主仓库 `today080221/risingstones-partyfinder-helper`，国内镜像使用本机配置的 Gitee remote；每次推送同时推两个 remote；前端刷新时自动检查 Release 状态并在状态区下方显示绿/黄/红灯。
- 需求对齐：
  - GitHub 作为主发布源，国内镜像作为国内下载节点。
  - 加载前端时做一次 GeoIP 检测：中国大陆用户或检测失败默认国内镜像，海外用户推荐 GitHub。
  - 绿灯表示当前版本与远端 Release 对齐；黄灯表示有更新但没有跨重大版本；红灯表示跨重大版本落后，建议直接更新。
  - 更新检查仍然只展示发布页和下载入口，不静默覆盖本地文件。
  - Harness 维护规则记录为：提交和版本标签同时推送 `origin` 与 `gitee`。
- 实现：
  - 新增 `src/config.ts` 固定 GitHub 官方源码库、下载节点显示名和默认国内镜像下载节点。
  - 新增 `/api/geoip`，通过公开 GeoIP 服务检测当前出口地区，失败时回退国内镜像。
  - 前端更新面板改为“下载节点”选择器，支持 IP 自动推荐；刷新页面时自动检查当前节点 Release。
  - 结果状态区下方新增更新状态灯，并按版本差异显示绿/黄/红状态。
  - 更新检查在远端 Release 尚未创建时，会回退读取最新 Git tag 作为版本对齐依据；GitHub Release 创建后优先展示 Release 附件。
  - 更新 `docs/collaboration/harness-engineering.md` 记录双 remote 推送和 Release 维护规则。
- 验证：
  - `npm run release:check`：通过，包含单测、前端构建、后端打包和便携包生成。
  - 便携包探针：使用包内 `runtime/node.exe` 启动后，`/api/health`、`/api/version`、`/api/geoip` 与页面标题检查通过；当前 GeoIP 推荐节点为国内镜像。
- 发布验证：
  - 已推送 `main` 到 GitHub `origin` 与 Gitee `gitee`。
  - 已推送 `v0.1.0` 标签到 GitHub `origin` 与 Gitee `gitee`。
  - GitHub Release workflow 成功完成，并上传 `risingstones-partyfinder-helper-v0.1.0-win-x64.zip`。
  - 本地更新检查探针：GitHub 主仓库与当时本机配置的国内镜像均返回 `latest=v0.1.0`、`isNewer=false`。

## Follow-up: Private Mirror Configuration

- 开始：用户确认 Gitee 也应打 Release，并要求隐藏国内仓库地址，因为地址包含个人信息；公开资料只保留 GitHub 官方源码库。同时要求进入前端时自动刷新更新状态，第一次不需要手动点击。
- 需求对齐：
  - 公开源码、README 和 docs 不写入国内镜像真实 URL 或 owner/repo。
  - GitHub 官方源码库仍保留为公开参考。
  - 国内镜像仓库地址和 Gitee token 作为发布机本地敏感配置管理，通过环境变量或未提交配置文件注入。
  - 前端在 GeoIP 判断完成后自动执行一次更新检查，避免首次进入还要手动点击。
  - Gitee Release 需要单独创建并上传同一个 Windows 便携包；如果缺少 token，先提供本地脚本和配置说明，等待用户在开发机配置。
- 实现：
  - `src/config.ts` 只保留 GitHub 官方源码库和下载节点显示名称，不再硬编码国内镜像仓库。
  - `/api/update/check` 不再接收或返回仓库路径；国内镜像 repo 从 `RISINGSTONES_UPDATE_GITEE_REPO`、便携包 `release-manifest.json` 或本地未提交配置读取。
  - `scripts/build-portable.mjs` 支持读取 `config/release.local.json` 或环境变量，把私有镜像配置注入便携包 manifest。
  - 新增 `scripts/publish-gitee-release.mjs` 与 `npm run release:gitee`，从本机 `GITEE_ACCESS_TOKEN` 和 `RISINGSTONES_UPDATE_GITEE_REPO` 创建/复用 Gitee Release 并上传 zip。
  - `.gitignore` 忽略 `config/release.local.json`，仓库只提交 `config/release.local.example.json` 占位模板。
  - 前端自动检查逻辑改为等待 GeoIP 完成后再触发，避免首次进入时节点尚未推荐完成。
  - GitHub Release workflow 支持通过仓库 Secret `RISINGSTONES_UPDATE_GITEE_REPO` 向便携包 manifest 注入国内镜像节点。
  - GeoIP 推荐逻辑在未配置国内镜像时自动回退 GitHub，避免公开包首次进入就显示国内镜像未配置错误。
- 安全记录：用户在聊天中误贴 Gitee 个人令牌；本轮不使用该令牌、不写入命令或文件，要求用户撤销并重新生成，只通过本机环境变量或本地密钥管理器配置新令牌。
- 验证：
  - `npm run release:check`：通过，包含单测、前端构建、后端打包和便携包生成。
  - 公开便携包探针：未配置国内镜像时，`/api/geoip` 回退 GitHub，GitHub 更新检查返回 `v0.1.0`，国内镜像节点返回未配置。
  - 镜像注入探针：使用临时公开测试仓库验证 `RISINGSTONES_UPDATE_GITEE_REPO` 可写入 manifest，并且国内镜像更新检查可读取 Release。
  - 已重新生成干净公开包，`release-manifest.json` 只包含 GitHub 官方源码库。
- 版本处理：为了让公开下载包不再携带旧国内镜像地址，本轮将发布 `v0.1.1`；旧 `v0.1.0` 是否删除 Release 或重写 Git 历史，需用户确认后单独执行。
- `v0.1.1` 验证：
  - `npm run release:check`：通过，生成 `risingstones-partyfinder-helper-v0.1.1-win-x64.zip`。
  - 便携包探针：`/api/version` 返回 `0.1.1`；公开包 manifest 不包含国内镜像配置；未发布 `v0.1.1` 前 GitHub 最新仍为 `v0.1.0`。
