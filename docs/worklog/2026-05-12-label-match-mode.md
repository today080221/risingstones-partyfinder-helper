# 标签筛选匹配模式

## Goal

- 将“招募筛选条件 / 标签/类型”的默认匹配从任一命中改为全部命中。
- 增加显式开关：勾选后使用“任一标签命中即可”。
- 保持旧存档兼容：没有新字段的用户默认走全部匹配。

## Baseline

- 起始分支：`main`
- 工作分支：`codex/label-match-mode`
- 起始同步：已执行 `git status --short --branch` 和 `git fetch origin`，`main...origin/main` 干净。
- 当前实现：`matchesLabelFilter` 将所有已选标签 alias 合并后用 `some` 判断，因此多标签是 OR。

## Risks

- 默认语义从 OR 改为 AND，会减少多标签筛选结果数量；需要通过 UI 文案让用户知道可以勾选“任一标签命中即可”恢复旧行为。
- 旧 localStorage 没有匹配模式字段，需要迁移默认值避免异常。
- 官方标签、NGA parser tags、派生标签和 recruitKind 标签仍需共用同一套标签匹配。

## Expected Validation

- `npm test`
- `npm run build`
- `npm run validate:nga-parser`

## Implementation

- `LocalFilterState` 新增 `labelMatchMode: "all" | "any"`，默认值和旧存档迁移都落到 `"all"`。
- `matchesLabelFilter` 改为按已选标签逐组匹配：默认 `every`，勾选“任一标签命中即可”后使用 `some`。
- `招募筛选条件 / 标签/类型` 标题行新增 `mini-toggle` 小开关，默认未点亮即全部命中，点亮“任一命中”后恢复旧的任一命中体验。
- 单测覆盖默认全部命中、显式任一命中和本地存储迁移；e2e 覆盖新增小开关默认未点亮。

## Validation

- `npm test`：通过，7 个 test files / 169 tests。
- `npm run build`：通过。
- `npm run validate:nga-parser`：通过 curated gate，233/233；本机样本池数量与历史 baseline 不一致为既有提示，命令退出码 0。
- `npm run test:e2e`：通过，10 tests。

## Final Status

- 分支：`codex/label-match-mode`
- 交付前同步：已再次执行 `git fetch origin`，当前工作分支基于本地变更等待提交。
- 未改 NGA 读取、石之家请求、cache、parser 或发布流程。
