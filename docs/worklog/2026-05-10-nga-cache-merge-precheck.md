# 2026-05-10 NGA Cache Merge Precheck

## Scope

- 收口 NGA metadata 快扫、cache 生命周期、虚拟列表热更新和筛选器折叠体验。
- 记录招募板 0 主题提取保护：同页短暂重试并输出候选计数，仍为空则停止继续翻页，避免一路追到深分页。
- 在 commit/push 前完成 final QA，并为后续 merge 与 release 做预检记录。

## Current Candidate

- 分支：`codex/nga-login-aggregation`。
- 远端：`git fetch origin` 已完成；当前分支未显示落后 `origin/codex/nga-login-aggregation`。
- 当前改动包括前端 UI、NGA parser/cache 逻辑、Tauri NGA 读取命令、Playwright e2e、单测和文档。
- 本记录只做 merge 前预检；实际 commit/push 需要用户确认后再执行。

## Implementation Summary

- NGA 聚合以“活跃窗口大小”快扫列表 metadata，默认 500 个主题；cache hit 只刷新列表命中时间和排名，不刷新正文复核时间。
- 正文读取队列只包含新主题、标题与活跃时间同时变化、缺正文、超过复核间隔或状态不明确的主题。
- 只有完成完整活跃窗口快扫后，才用“不在窗口内”作为归档证据；普通列表默认隐藏归档样本，长期不活跃样本可被清理。
- 招募板列表读取恢复到已验证的主页面帖子链接提取规则，并增加 0 主题保护和诊断计数。
- 数据来源面板和 NGA 子面板都支持轻量折叠；标签/类型筛选默认 4 行预览，已选标签优先显示。
- 结果列表使用虚拟列表和稳定 ID，支持单卡热更新、高亮和滚动锚点补偿。

## Final QA

- `npm test`：通过，5 个 test file，125/125 tests passed。
- `npm run build`：通过，TypeScript 与 Vite production build passed。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml`：通过，10/10 tests passed。
- `npm run test:e2e`：通过，9/9 Playwright tests passed。
- `npm run validate:nga-parser`：curated harness 通过，30 个 fixtures、213/213 structured assertions passed；命令返回非零仅因本机样本池已增量到 507 条，不等于旧 396 条固定基线。

## Parser Harness Snapshot

- 本机样本池路径：`C:\Users\12553\AppData\Roaming\com.today080221.risingstones.partyfinderhelper\nga-samples.json`。
- 当前样本池：507 total，507 with body。
- 当前分流：队伍招人 226，玩家求职 39，已关闭/已招满 218，噪音 22，未识别 2。
- 高置信有效解析：264。
- Curated Wilson 95% 置信区间：约 98.2% - 100.0%。

## Merge And Release Readiness

- 代码与文档预检：通过。
- 唯一非绿色项：`npm run validate:nga-parser` 的进程退出码仍受旧本机样本数量基线影响；curated parser 断言全过，属于 harness 数据基线差异，不是 parser 断言失败。
- 建议提交信息：`收口 NGA cache 快扫与 merge 预检`。
- merge 后如要出 release，建议发布前再跑一次发布链路验证：`npm run release:check`，以及需要桌面包时的 `npm run package:desktop:portable`。

## Deferred Follow-Ups

- 石之家职位轻量清洗：当空缺位置已经限定为 D 位时，过滤“任意职业”里明显不匹配的 T/H 职业。
- 石之家详情展开首帧读取提示可移到详情按钮附近，避免详情区域高度闪动。
- NGA 地区与高级设置的折叠交互可以继续做细节微调，但不阻断本次 merge。
