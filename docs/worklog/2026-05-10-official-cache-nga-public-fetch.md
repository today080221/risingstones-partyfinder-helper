# 石之家轻缓存与 NGA WebView 收口

## 开始

- 分支：`codex/official-cache-nga-public-fetch`。
- 基线：从已合并 PR 后的 `main` 新建，开始前 `git status --short --branch` 为干净，且 `main` 与 `origin/main` 同步。
- 目标：
  - 石之家增加 15 分钟轻缓存，刷新/重进后优先展示当前副本缓存，过期后后台全量刷新。
  - NGA 默认保持现有最小化 WebView 读取；公开页面快速读取在本轮收口中下线，旧本地保存开关会被忽略。
  - stale 自动刷新：石之家按当前查询整批刷新，NGA 默认只标记待刷新，不自动打开新窗口。
  - 统一读取锁覆盖自动刷新、聚合检索、强制刷新和 NGA WebView 读取，并在 UI 旁展示轻量进度与取消入口。
- Harness 维护：
  - 本轮开始已创建工作记录。
  - 本轮计划若发生接口、安全边界或默认行为变化，必须同步更新本文件和相关 feature 文档。
  - 本轮结束时必须补充实现摘要、验证结果、遗留风险和下一步建议。

## 当前风险

- NGA 公开页面快速读取已决定下线；收口必须清掉 UI 入口、前端 invoke 和 Tauri 命令面，避免继续触发 403 或被误解成稳定读取能力。
- NGA 默认 WebView 路径不得读取、导出或记录 Cookie、token、localStorage、sessionStorage 或账号凭据。
- 石之家缓存只用于短期体验优化，不应让用户误以为是实时数据；状态条必须显示缓存或刷新状态。

## Read-only triage / 残局盘点

- 当前分支：`codex/official-cache-nga-public-fetch`。
- 当前基线：`HEAD`、`main`、`origin/main` 均为 `a6c8ea30264733e1e73af04c1af5c922ab8bb2f5`。
- 当前工作区：已有未提交改动，并有 4 个未跟踪文件：`AGENTS.md`、本 worklog、`src/lib/official-cache.ts`、`src/lib/official-cache.test.ts`。
- diff 摘要：已跟踪文件约 `12 files changed, 2154 insertions(+), 214 deletions(-)`，主要集中在 Tauri NGA 读取、前端读取状态、石之家 cache、NGA 设置、测试和文档。
- 风险点：
  - Rust/Tauri 中存在未被主命令调用的裸 HTTP public fetch helper，容易被误解为正式后台公开抓取主路径。
  - 读取锁需要确认取消、异常和 fallback 后都能恢复 idle，避免 UI 锁死。
  - NGA stale 默认行为必须保持不自动打开 NGA 窗口，只标记待刷新或等用户手动聚合。
  - 文档中曾写入“当前验证通过”类表述；盘点时本 thread 尚未重跑完整验证链，不能代表当时工作区状态。
- KEEP：
  - 石之家 15 分钟轻缓存。
  - 强制刷新所选来源。
  - 统一读取锁骨架。
  - NGA 默认 WebView 读取路径。
  - `read.php?tid=<known board stid>` 归一化为 `thread.php?stid=<same id>`。
- DOWNGRADE：
  - 第一阶段曾建议将 NGA 公开页面快速读取降级为实验开关；第二阶段收到实机 403 反馈后改为完整下线。
  - NGA stale 自动刷新默认不自动弹出或打开 WebView。
- REVERT：
  - Rust 中未使用、且看起来像正式后台公开抓取主路径的裸 HTTP public fetch helper。
  - 对应未使用类型、测试和文档表述。
  - `risingstones_nga_collect_public_samples` 命令面、前端 API 导出、UI 开关和 fallback helper。
- NEEDS_TEST：
  - 石之家 cache fresh/stale/miss/force/prune 行为。
- NGA stale 默认不弹窗、脏 URL 归一化和伪帖子 URL 跳过；旧快速读取保存值必须被忽略。
  - 读取锁 cancel/error 后恢复 idle。
  - 实验读取失败时 WebView fallback 仍会被调用，且混合 fallback 不丢已有 samples。

## 计划变化记录

- 石之家缓存增加到点变 stale 的前端计时器：同一页面停留超过 15 分钟后也会进入后台刷新，而不只依赖查询 key 变化。
- NGA 默认路径收回到现有 WebView 读取；公开页面快速读取不再保留用户入口或后台调用路径。
- 手动聚合/强制刷新继续打开或复用 WebView 按地区读取；自动 stale 刷新保持静默，不自动弹窗口。
- 所有读取纳入前端读取锁：自动刷新期间聚合/强制刷新按钮禁用，用户可用停止按钮触发取消。
- 实测 `https://bbs.nga.cn/thread.php?stid=44366746` 公开页面读取返回 403，用户在桌面端也看到了红色错误提示；本轮改为完整取缔实验快速读取，WebView 是唯一 NGA 读取路径。
- 发现历史样本归档中曾出现 `read.php?tid=44366746` 这类把招募板 stid 当作帖子 tid 的脏 URL；前端设置归一化和 Rust URL 归一化都新增修复，统一回写为 `thread.php?stid=44366746`，单帖刷新也会跳过这类 URL。
- 应用图标接入：用户提供橙色晶体标识，希望作为左上角应用图标，并生成适配 Windows 桌面应用的平面风格 `.ico`；本轮只做品牌资源接入、Tauri 图标配置和必要验证，不改 NGA/石之家读取功能。
- 计划修正：用户明确要求不要使用 SVG 重绘版本，必须使用提供的原图作为图标来源；因此撤回 SVG 资源接入，后续只从原始位图裁切/缩放生成前端图标和 Windows `.ico`。

## 应用图标收口计划

- 当前状态：分支已有 NGA/cache 收口改动，本次新增资源改动前已执行 `git status --short --branch` 和 `git fetch origin`，不提交不推送。
- 目标：
  - 保留用户原图的橙金调色、晶体轮廓和中心圆环视觉，前端左上角直接使用原图位图。
  - Windows `.ico` 使用用户提供的专门图标源，生成适合桌面小尺寸显示的多尺寸位图条目。
  - 生成 Windows 多尺寸 `.ico`，并在 Tauri bundle 配置中显式声明。
- 风险：
  - `.ico` 小尺寸下细碎纹理会糊成噪点，因此桌面图标采用扁平色块、发光边和少量切面线，而不是复刻原图纹理。
  - Tauri 开发态窗口图标和打包态图标来源可能不同；本轮至少保证 bundle icon 显式配置，必要时后续再补窗口级原生图标验证。
- 修正后的资源策略：不再做 SVG 或重绘版；需要拿到用户提供图标的本地原始文件后，直接裁切为方形 PNG，并从同一源图导出 `.ico` 多尺寸版本。
- 用户补充原图本机路径：`J:\Pictures\阿谢姆水晶.png`；前端左上角必须直接使用这张原图，Windows `.ico` 允许从该图生成更适合桌面小尺寸的平面化版本。
- 预期验证：`npm test`、`npm run build`，若 Rust/Tauri 配置检查需要则补 `cargo check --manifest-path src-tauri/Cargo.toml`。

## 实现摘要

- 新增 `src/lib/official-cache.ts`，按石之家当前查询保存 `RecruitFetchPayload`，TTL 15 分钟，最长保留 24 小时并限制缓存条目数；刷新/重进先命中缓存，过期后后台全量刷新当前查询。
- 结果工具栏新增“强制刷新”，对石之家跳过缓存，对 NGA 传入强制复核意图。
- 计划变化：强制刷新不是筛选条件，而是聚合检索的高成本变体；入口从左侧“高级筛选”迁移到结果区右上角，放在“聚合检索”旁作为次级操作。
- NGA 公开页面快速读取下线：移除 UI 开关、前端 API 导出、前端调用和 Tauri invoke command；旧本地保存值不再进入设置模型。
- NGA stale 自动刷新默认不自动打开 WebView，也不会借助已打开窗口做快速刷新；只保留待刷新提示，用户手动聚合/强制刷新时走 WebView。
- 修正公共继续页 HTML 兜底目标提取：避免把非 NGA 绝对链接中的 `/read.php` 片段误当成 NGA 相对链接。
- 更新项目级 `AGENTS.md` 和 `docs/collaboration/harness-engineering.md`，明确工作开始、计划变化、工作结束都必须维护 harness 文档。

## 收口实施记录

- 已移除 Rust 中未被主命令调用的裸 HTTP public fetch helper，包括独立 `reqwest` HTML 抓取、HTML anchor 抽取、公开正文猜测解析和对应测试；保留 WebView 当前路径、继续浏览页处理和 URL 白名单。
- 已下线实验性 `risingstones_nga_collect_public_samples`：从 Tauri handler、前端 API、UI 设置和读取状态 helper 中移除，不再有可触发入口。
- 前端统一读取锁抽为可测状态判断：聚合、强制刷新、石之家自动刷新和 NGA 读取互斥；取消或异常收尾后应恢复 `idle`。
- NGA stale 默认行为收窄为只显示待刷新，不自动打开 NGA 窗口；启动后没有 NGA 快速读取自动动作。
- 单帖 stale 刷新会跳过 `read.php?tid=<known board stid>` 这类脏 URL，统一保留为招募板地址归一化修复。
- 运行时收口：处理 `desktop:dev` 因旧 Vite/Tauri 残留导致的 `5188` 端口占用；主窗口关闭时主动关闭 `nga-session` 和 `nga-popup*` 子窗口，避免 NGA WebView 残留。
- Parser 口径补丁：用户确认“绝神兵/神兵/兵兵”都是“究极神兵绝境战”的常见描述；NGA 解析词典和 curated parser harness 已补 `神兵`、`兵兵` 样例，避免按官方副本名筛选时漏掉这类招募。
- Parser 关闭态加固：本机缓存样本 `神兵从零7=1ST 晚8-10开打` 未包含楼主最后“人已齐”回复，仅包含主楼里的“等人齐后再确定具体开打日期”；关闭词识别已排除这类未来条件句，同时保留“人已齐，感谢大家”这类楼主补充关闭证据。
- 强制刷新口径调整：用户确认 NGA 强制刷新应复核当前副本口径下的帖子，不带职业、时间、攻略、标签等细筛；本轮将把“所选来源强刷”收窄为“当前副本 + 当前 NGA 地区板”的详情复核，同时允许复核已 `closedAt` 的缓存样本以补齐楼主最后回复。

## Validation

- `npm test`：7 个测试文件、154/154 通过。
- `npm run build`：通过，TypeScript build 与 Vite production build 完成。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：15/15 通过。
- `npm run test:e2e`：10/10 通过。
- `npm run validate:nga-parser`：curated 213/213 通过；本机样本池 507/507 条含正文，数量不同于历史 396 基线，但默认验证只以 curated parser 断言作为失败门槛。
- 主窗口关闭清理子窗口补丁后重跑：`cargo fmt --manifest-path src-tauri/Cargo.toml --check`、`cargo check --manifest-path src-tauri/Cargo.toml`、`cargo test --manifest-path src-tauri/Cargo.toml`、`npm test`、`npm run build` 通过。
- 强制刷新入口迁移到结果工具栏后重跑：`npm test`、`npm run build`、`npm run test:e2e` 通过；本地 Vite 渲染截图确认右上角显示“强制刷新 / 聚合检索”，左侧高级筛选不再包含强制刷新入口。
- “神兵/兵兵”解析口径补丁后重跑：`npm test` 155/155 通过，`npm run build` 通过，`npm run validate:nga-parser` curated 225/225 通过；本机样本池为 602/602 条含正文，默认验证仍只以 curated parser 断言作为失败门槛。
- 关闭态条件句收窄后重跑：`npm test` 157/157 通过，`npm run build` 通过，`npm run validate:nga-parser` curated 233/233 通过；本机样本池 closed 从 263 降到 242，说明此前确有“等人齐后...”类未来条件句被误关。
- 展示过滤尊重持久化 `closedAt` 后重跑：`npm test` 158/158 通过，`npm run build` 通过；本机确认 `神兵从零7=1ST 晚8-10开打` 当前 parser 不再因“等人齐后”判 closed，但因缓存已有 `closedAt`，平衡/严格视图仍不展示。
- NGA 强制刷新改为当前副本口径后重跑：`npm test` 160/160 通过，`npm run build` 通过，`cargo fmt --manifest-path src-tauri/Cargo.toml --check` 通过，`cargo check --manifest-path src-tauri/Cargo.toml` 通过，`cargo test --manifest-path src-tauri/Cargo.toml` 16/16 通过，`npm run validate:nga-parser` curated 233/233 通过，`npm run test:e2e` 10/10 通过。

## 应用图标实施记录

- 前端左上角品牌按钮改为直接引用用户提供的原图副本：`src/assets/ashem-crystal.png`，不再使用 SVG 重绘。
- Windows 桌面图标从同一原图生成：`src-tauri/icons/icon.ico` 包含 16/24/32/48/64/128/256 多尺寸 PNG entry；`src-tauri/icons/icon-256.png` 保留为平面化预览源。
- Tauri bundle 配置显式声明 `icons/icon.ico`，用于后续 Windows 打包图标。
- E2E smoke 测试补充左上角 `app-icon` 位图来源断言，防止退回内联 SVG 或错误资源。
- 图标接入后重跑：`npm test` 160/160 通过，`npm run build` 通过，`npm run test:e2e` 10/10 通过，`cargo check --manifest-path src-tauri/Cargo.toml` 通过；本地 Vite 预览确认左上角实际加载 `/src/assets/ashem-crystal.png`。
- 图标设计修正：用户反馈 Windows `.ico` 不应沿用原图的斜透视，应改为更适合桌面图标的小尺寸正面/正交视角；前端仍保留原图，桌面图标改为正面垂直平面版。
- 桌面图标二次修正：Windows `.ico` 去掉黑色底、粒子和强光影，只保留透明底上的大主体晶体轮廓、中心圆环和少量平面切面。
- 桌面图标三次修正：前一版几何化过度导致不像阿谢姆水晶；最终改为从原图提取最大主体轮廓，移除孤立粒子和黑底，在透明背景上做轻度平面化，保留原始不对称剪影、中心圆环和橙金配色。
- 图标三次修正后重跑：`npm test` 160/160 通过，`npm run build` 通过。
- 桌面图标源替换：用户提供专门的 Windows 图标源 `J:\Pictures\阿谢姆水晶-图标.png`，要求各个 Windows 场景下保持清晰；本轮改为直接从该源生成多尺寸 PNG-entry `.ico`，不再使用算法提取版。
- 图标尺寸决策：用户建议把 512/1024 也写入 `.ico`；核对 ICO 容器后决定不硬写非标准尺寸，因 ICONDIRENTRY 宽高字段最大只能可靠表达到 256（0 表示 256）。本轮保留 16-256 的多尺寸 ICO，同时把高清源图纳入项目为 `src-tauri/icons/icon-source.png`，供未来需要 512/1024 PNG 资产时使用。
- 桌面图标高清源替换：用户提供放大版 `J:\Pictures\阿谢姆水晶-放大.png`，主体占比更高；本轮用该文件替换 `src-tauri/icons/icon-source.png` 并重新生成多尺寸 `.ico`，确保任务栏、资源管理器和安装器场景优先使用清晰源图缩放结果。
- 桌面图标源再次替换：用户要求改用 `J:\Pictures\阿谢姆水晶-放大1.png`，重点避免模糊；本轮保留前端左上角原图不变，仅替换 `src-tauri/icons/icon-source.png`、`icon-256.png` 和 `icon.ico`。
- `放大1` 图标源替换后重跑：`npm test` 160/160 通过，`npm run build` 通过，`cargo check --manifest-path src-tauri/Cargo.toml` 通过，`npm run desktop:build:portable` 通过并生成 release exe。

## Final QA / PR 预检

- 开始状态：已执行 `git status --short --branch`，当前分支为 `codex/official-cache-nga-public-fetch`，仍有本轮未提交改动和新增资源/测试/文档文件；已执行 `git fetch origin`，本轮 final QA 不提交不推送。
- 预检范围：
  - `npm test`
  - `npm run build`
  - `cargo check --manifest-path src-tauri/Cargo.toml`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `npm run test:e2e`
  - `npm run validate:nga-parser`
- 风险关注：Tauri 图标配置、前端大图资源打包、NGA WebView 默认路径、公开快速读取下线、强制刷新当前副本口径、读取锁和石之家轻缓存。
- 结果：
  - `npm test`：7 个测试文件、160/160 通过。
  - `npm run build`：通过，Vite production build 正常打包 `ashem-crystal` 前端图标资源。
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --check`：通过。
  - `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
  - `cargo test --manifest-path src-tauri/Cargo.toml`：16/16 通过。
  - `npm run test:e2e`：10/10 通过。
  - `npm run validate:nga-parser`：curated 233/233 通过；本机样本池 602/602 条含正文，数量仍不同于历史 396 基线，默认验证只以 curated parser 断言作为失败门槛。
  - `npm run desktop:build:portable`：通过，生成 `src-tauri/target/release/risingstones-partyfinder-helper.exe`，Tauri 图标配置被构建链接受。
  - `git diff --check`：通过，仅输出 Windows 工作区常见 LF/CRLF 提示。
- 图标确认：
  - 前端左上角：`src/assets/ashem-crystal.png`，来自 `J:\Pictures\阿谢姆水晶.png`。
  - Windows `.ico`：`src-tauri/icons/icon.ico`，来自最终放大版 `src-tauri/icons/icon-source.png`（源文件 `J:\Pictures\阿谢姆水晶-放大1.png`）。
  - `icon-source.png` 尺寸为 1145x1145；`.ico` 包含 13 个 PNG entry：16/20/24/30/32/40/44/48/64/72/96/128/256。
- 静态扫尾：
  - `risingstones_nga_collect_public_samples`、`collectPublic` 等旧公开快速读取可调用入口未在源码中出现。
  - 文档中“公开页面快速读取”仅保留为“已下线/不是官方 API/不是稳定主路径”的说明。
  - 未提交、未推送。

## 零式上下文筛选复核

- 新增触发：用户反馈当前 NGA cache 下按零式 M4S / 当前零式第 4 层口径筛选为 0，但实际 NGA 招募中存在零式队伍。
- 开始状态：已重新执行 `git status --short --branch` 与 `git fetch origin`；当前仍是不提交、不推送的未提交工作区。
- 数据核验：
  - 本机 NGA cache：`count=602`，`savedAt=2026-05-10T01:53:56.577519600+00:00`。
  - 实时石之家零式配置最顶 4 个：`阿卡狄亚零式登天斗技场 重量级4/3/2/1`。
  - 现有筛选逻辑对 `fb_name` 做精确相等，按上述 4 个官方副本名筛选时 NGA 命中均为 0。
  - 同一 cache 中，balanced 视图可见的零式类样本为 43 条；其中存在 `M9S-M12S`、`M12S`、`零式4层`、`1-4层` 等 NGA 常用描述。
- 风险判断：
  - `阿卡狄亚`/`阿卡迪亚`字形差异、官方中文层级名和玩家 `M9S-M12S` 缩写之间没有统一映射，导致当前筛选漏召。
  - 不能把所有正文中出现 `M1-4S` 或 `零式4层` 的帖子都归入零式；例如绝本招募可能只把它写在履历/要求里。
  - 本轮只处理已解析出的主副本字段和当前零式上下文别名，不新增读取路线、不扩大 NGA 抓取能力。
- 计划：
  - 在 parser 中补 `零式1-4`、`零式4层` 这类当前零式上下文副本字段，但不覆盖已经高置信识别出的绝本/极神等主副本。
  - 在筛选层把石之家当前零式最顶 4 个与 NGA 的 `M9S-M12S`、`M12S`、`当前零式4层`、`当前零式1-4层` 做别名匹配。
  - 增加组件/单测覆盖，确认当前零式第 4 层不再误筛为 0，同时绝本中作为履历出现的零式词不反向污染主副本筛选。
- 实现：
  - Parser 新增 `当前零式N层`、`当前零式N-M层` 的中置信主副本字段，覆盖 `零式4层`、`零式1-4` 等玩家口径。
  - 筛选层新增 NGA 副本别名匹配：`阿卡迪亚登天斗技场 M9S-M12S/M12S` 可匹配石之家 `阿卡狄亚零式登天斗技场 重量级1-4`；`当前零式4层`、`当前零式1-4层` 只对石之家当前零式最顶 4 个生效。
  - 关闭词补充 `已招募齐/招募齐`，与 `已招满/招齐/人已齐` 同属已关闭流。
  - 文档补充当前零式别名匹配边界：只使用 Parser 主副本字段，不从绝本正文履历中反向筛进零式。
- 补充核验：
  - 修复前：当前最顶 4 个零式官方名筛选 NGA 均为 0。
  - 修复后：本机 balanced 可见行 309 条；`重量级4/3/2/1` 的 NGA 命中分别为 25 / 8 / 9 / 8；零式类型总命中 42。
  - 字面旧层 `轻量级4` 仍只匹配 `M1S-M4S` 旧层样本，不会被当前 `重量级4` 混入。
- 验证：
  - `npm test`：7 个测试文件、163/163 通过。
  - `npm run build`：通过，TypeScript build 与 Vite production build 完成。
  - `npm run validate:nga-parser`：curated 233/233 通过；本机样本池 602/602 条含正文，默认验证仍只以 curated parser 断言作为失败门槛。
  - `npm run test:e2e`：10/10 通过。
  - `git diff --check`：通过，仅输出 Windows 工作区常见 LF/CRLF 提示。

## PR 前功能测试与收口

- 开始状态：用户要求功能测试、收口、Harness 文档落地并准备提交 PR；已执行 `git status --short --branch`、`git log --oneline -5`、`git fetch origin`、`git branch -vv` 和 `git diff --stat`。
- 分支状态：
  - 当前分支：`codex/official-cache-nga-public-fetch`。
  - 当前 HEAD：`a6c8ea3 收口 NGA 公开招募聚合与 cache 快扫`。
  - `main` 与 `origin/main` 均在 `a6c8ea3`，当前分支基于最新 main。
  - 工作区仍为未提交收口改动；本轮不在验证前提交或推送。
- 功能测试重点：
  - 石之家 15 分钟轻缓存、强制刷新跳过 cache、统一读取锁。
  - NGA 默认 WebView 读取、公开页面快速读取下线、stale 默认不自动打开窗口。
  - NGA 强制刷新当前副本口径、楼主补充关闭态、`read.php?tid=<known board stid>` 归一化。
  - 当前零式/最近期零式别名筛选：`M9S-M12S`、`M12S`、`零式1-4`、`零式4层` 映射到石之家零式最顶 4 个副本。
  - 应用左上角图标和 Windows `.ico` 资源接入。
- 预期验证链：
  - `npm test`
  - `npm run build`
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
  - `cargo check --manifest-path src-tauri/Cargo.toml`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `npm run test:e2e`
  - `npm run validate:nga-parser`
  - `git diff --check`
- 验证结果：
  - `npm test`：7 个测试文件、163/163 通过。
  - `npm run build`：通过，Vite production build 正常打包前端图标资源。
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --check`：通过。
  - `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
  - `cargo test --manifest-path src-tauri/Cargo.toml`：16/16 通过。
  - `npm run test:e2e`：10/10 通过。
  - `npm run validate:nga-parser`：curated 233/233 通过；本机样本池 602/602 条含正文，默认验证仍只以 curated parser 断言作为失败门槛。
  - `git diff --check`：通过，仅输出 Windows 工作区常见 LF/CRLF 提示。
  - `npm run desktop:build:portable`：通过，生成 `src-tauri/target/release/risingstones-partyfinder-helper.exe`。
- 功能核验结果：
  - 本机 NGA cache：`count=602`，balanced 可见行 309 条。
  - 当前石之家零式最顶 4 个副本的 NGA 命中：`重量级4=25`、`重量级3=8`、`重量级2=9`、`重量级1=8`；零式类型总命中 42，确认此前 M4S/当前四层 0 命中问题已收口。
- Harness 文档落地：
  - `docs/README.md` 已链接本 worklog。
  - `docs/features/partyfinder-helper.md`、`docs/features/nga-public-aggregation.md`、`docs/architecture.md` 已记录石之家 cache、NGA WebView 默认路径、公开快速读取下线、当前零式别名筛选和强制刷新口径。
  - `docs/collaboration/harness-engineering.md` 与 `AGENTS.md` 已补 PR 前 final QA / Tauri 资源变更验证要求。
- PR 准备状态：
  - 本轮未提交、未推送。
  - 建议提交前再由用户确认提交标题、是否直接 push 并创建 PR。

## PR #2 follow-up: 石之家 cache 写入容错

- 触发：PR #2 review 要求 `src/lib/official-cache.ts` 中 `localStorage.setItem` 失败不能导致石之家拉取失败。
- 约束：只修石之家 cache 优化层，不修改 NGA 读取路径，不重新引入公开快速读取。
- 计划：
  - 在 `saveOfficialRecruitCacheEntries` 内捕获 `localStorage.setItem` 异常。
  - 确保 `readOfficialRecruitCache` 中 prune 后的回写失败不影响读取结果。
  - 确保 `writeOfficialRecruitCache` 在 cache 写入失败时仍返回 entry。
  - 补充单测覆盖写入失败和 read prune/save 失败场景。
- 预期验证：`npm test`、`npm run build`。
- 实现：
  - `saveOfficialRecruitCacheEntries` 捕获 `localStorage.setItem` 异常，避免 quota、隐私模式或本地存储不可用时阻断主流程。
  - `readOfficialRecruitCache` 的 prune 后回写失败不再影响 cache lookup 结果。
  - `writeOfficialRecruitCache` 在保存失败时仍返回构造出的 cache entry。
  - 新增单测覆盖写入失败和 read prune/save 失败场景。
- 验证：
  - `npm test`：7 个测试文件、165/165 通过。
  - `npm run build`：通过。

## PR #2 follow-up: 应用展示名

- 触发：用户希望应用程序命名为“阿谢姆水晶（Azem's Crystal）”。
- 开始状态：
  - 当前分支：`codex/official-cache-nga-public-fetch`。
  - `git status --short --branch`：工作区干净，当前分支与 `origin/codex/official-cache-nga-public-fetch` 对齐。
  - 已执行 `git fetch origin`，没有新的本地改动或待合并远端提交。
- 收口范围：
  - 只调整用户可见展示名、窗口标题、页面标题、README/功能文档和 E2E 断言。
  - 不修改 npm package name、仓库名、Tauri identifier、更新源路径、NGA 读取路径或 cache 行为。
  - 保留既有可执行文件命名，避免影响当前发布脚本和更新链路。
- 预期验证：
  - `npm test`
  - `npm run build`
  - `npm run test:e2e`
  - 如 Tauri 配置变更被纳入实现，再跑 `npm run desktop:build:portable` 验证桌面配置。
- 实现：
  - Tauri `productName` 改为 `阿谢姆水晶`，主窗口标题改为 `阿谢姆水晶 (Azem's Crystal)`。
  - Web `index.html` 标题、左上角主标题和副标题改为新品牌展示名。
  - E2E 首屏断言同步到新页面标题、heading 和副标题。
  - README、功能文档、文档入口和 Tauri 发布说明同步说明新展示名。
  - 未修改 npm package name、仓库名、Tauri identifier、更新源路径或现有 exe 命名。
- 验证：
  - `npm test`：7 个测试文件、165/165 通过。
  - `npm run build`：通过。
  - `npm run test:e2e`：10/10 通过。
  - `npm run desktop:build:portable`：通过，生成 `src-tauri/target/release/risingstones-partyfinder-helper.exe`，确认中文 productName/window title 配置可被 Tauri 构建链接受。

## 遗留风险

- NGA WebView DOM 或页面继续浏览逻辑如果变化，默认读取路径仍可能需要调整；当前策略是遇到站点限制或异常页面时标记 unsupported/blocked，并回到用户可见处理路径。
- 石之家缓存 TTL 固定 15 分钟，后续如果用户希望不同保鲜度，可再把 TTL 做成高级设置。

## 下一步建议

- 实机复核 Tauri 桌面端 NGA WebView 在五个地区的读取、取消和异常恢复表现。
- 若 WebView 正文噪音明显，再补 WebView DOM 楼层结构提取器，减少正文 page chrome。
