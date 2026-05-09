# NGA 提取器侧栏与分区入口修复

## Start

- 分支：`codex/nga-login-aggregation`。
- 需求：不要继续只拓宽整体侧边栏；当前被挡住的区域集中在“数据来源”里的 NGA 提取器面板。
- 需求：NGA 数据源新增欧区、大洋洲区和美区招募板入口。

## Changes

- NGA 提取器面板中的长路径、URL、状态提示和新增分区按钮在面板内换行，避免被侧栏滚动条遮挡，同时保持满宽控件与侧栏其它控件右边界对齐。
- 前端 NGA 招募板快捷入口扩展为国服、日服、欧区、大洋洲区和美区。
- Tauri 当前页采集白名单同步允许欧区、大洋洲区和美区招募板 `stid`，仍只允许已确认招募板列表页和 `read.php?tid=...` 帖子详情页。
- Playwright e2e 增加新分区按钮可见性与点击切换 URL 的覆盖。

## Verification

- 视觉检查：在 `http://127.0.0.1:5188/` 以 2048x1120 视口检查 NGA 面板；`结果来源`、`浏览视图`、NGA 状态行、NGA 地址、预设行、双列参数、动作按钮、进度卡和提示卡右边界一致。
- `npm test`：94/94 通过。
- `npm run build`：通过。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `npm run test:e2e`：3/3 通过，覆盖首屏 NGA 面板、本机网页会话确认和新增分区预设切换。
- `npm run validate:nga-parser`：本地样本池 396/396 条含正文；curated fixture 29 个、结构化断言 208/208 通过；高置信有效行 225 条。
