# 2026-05-09 聚合检索与 NGA 面板精简

## Scope

- 将右上角主操作从石之家“拉取全量”改为统一“聚合检索”，按左侧结果来源多选执行。
- 将结果来源状态从单选迁移为 `sourceFilters: RecruitSource[]`，旧存储 `all` 自动迁移为石之家 + NGA。
- 保留当前侧栏对齐修复和五个 NGA 地区入口，不回滚旧 thread 改动。
- NGA 普通面板改为 compact：默认只显示地区选择、桌面可用摘要、已保存招募数、进度和清除本机网页状态；高级设置和开发诊断默认折叠。
- NGA 地区默认仅国服且为单选；用户打开“多区读取”后可同时选择国服、日服、欧区、大洋洲区、美区。
- NGA 默认读取参数改为 1 秒间隔、500 条总预算、正文补齐开启；高级设置里允许最短 0.5 秒，Rust 命令层同步最小间隔 clamp 到 500ms。
- 新增 `risingstones_nga_navigate_session(startUrl)`，只允许已确认 NGA 招募板或帖子详情 URL，并在同一个可见网页窗口中切换页面。
- NGA 卡片标题统一使用 Parser 副本名；原帖标题、作者和队伍概要展示路径会清洗 NGA 作者等级、威望、注册日期等元信息。

## Notes

- 石之家聚合仍沿用现有官方分页逻辑；若勾选石之家但未选择副本，当前实现只提示“石之家已跳过”，不会阻断 NGA。
- 浏览器开发模式不会打开 NGA 本机网页窗口，只合并当前已有招募并提示需使用桌面版。
- 开发诊断在 Vite dev 或本地 `risingstones:debug=1` 开关下出现，且默认折叠；生产普通用户默认看不到路径和样本报告。
- 百度贴吧只保留来源模型扩展点，本轮未实现读取。

## 2026-05-09 UX Follow-up

- 侧栏顺序改为“数据来源 -> 数据范围 -> 招募筛选条件”，让来源、视图和副本范围在首屏优先出现。
- 结果来源和 NGA 地区从原生 checkbox 改为无勾选框 toggle group，普通模式只保留地区、已保存招募数、进度和停止入口。
- 石之家默认不带标签参数，`标签/类型` 改为本地通用筛选；该筛选同时匹配石之家标签、NGA Parser tag 和 requirements。
- 石之家 `labelInfo` 或标签文本包含“求职”的行会归入“玩家求职”视图，和 NGA 的 `recruitKind=seeking` 保持同一浏览入口。
- NGA 聚合在打开或切换招募板后先检查可见页面状态；遇到 `misc/adpage_insert_2.html?...` 继续浏览页时提示用户在窗口内继续，并自动重试，不再直接报不支持页面。
- NGA 详情正文提取改为“首楼 + 楼主有效补充”，过滤顶帖、纯占位和短噪音楼层；仍只保存必要字段。
- 普通用户可见文案统一为“读取 / 已保存招募 / 本机网页窗口”，避免暴露实现细节。
- 修正 `thread.php?stid=...&rand=...` 白名单判断，避免 `thread.php` 被宽松后缀误判为详情页。
- NGA 地区就绪等待改为普通加载约 15 秒上限；仅在继续浏览页保留约 45 秒等待，并会首次主动切回目标板块，避免清空本地数据后重新读取时空等 90 秒。
- 招募板链接统一规范化为 `thread.php?stid=...`，前端设置和 Rust 打开/切换路径都会丢弃 `rand` 等无关参数，五个地区统一处理。
- 就绪判断从“任意支持页面”改为“当前目标页面”：地区读取必须匹配目标 `stid`，帖子正文补齐必须匹配目标 `tid`；普通加载只短等，只有继续浏览页才展示长等待提示。
- NGA 招募板读取不再只读当前页；会识别 `title="加载下一页"` 或 `page=N` 的下一页链接，在同一个 NGA 窗口中按页继续读取，直到达到“本次最多读取”、无下一页或用户停止。
- NGA 地区默认单选，普通点击地区即切换目标板块；用户打开“多区读取”后才允许同时选择多个地区。
- 高级设置中的翻页间隔允许最短 0.5 秒；Rust 命令层同步 clamp 到 500ms，但仍必须等待目标页面就绪后才读取。
- 保留 `装甲车过本看不到我` 的用户确认极性和 MIT 许可归属，不回滚旧 thread 改动。

## Verification

- `npm test`: 106/106 passed.
- `npm run build`: passed.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 5/5 passed.
- `npm run test:e2e`: 7/7 passed.
- `npm run validate:nga-parser`: curated assertions 213/213 passed; command exit is currently blocked by the local saved NGA data differing from the old 396-row baseline. Current local pool is 499 rows, 451 with body, 275 high-confidence effective rows.
