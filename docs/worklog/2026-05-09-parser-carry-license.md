# 2026-05-09 Parser 装甲车极性与许可归属

## Scope

- 修正用户确认 case：`装甲车过本看不到我` 表示婉拒装甲车/带老板过本记录，不应标为 `代打/工作室/带老板风险`。
- 保留同帖明确 `TTS/科技` 时的 `第三方工具/插件风险`，只修正装甲车语义极性。
- MIT 许可归属改为 `菜菜的橙子 and risingstones-partyfinder-helper contributors`。
- 同步 `package.json`、`package-lock.json` 和 `src-tauri/Cargo.toml` 的作者元信息。

## Implementation Notes

- `ANTI_CARRY_RE` 扩展了 `看不到/看不见/别来/绕道/慎重` 这类反向语义。
- 新增 `isAntiCarryRiskContext`，在别名 `装甲车 -> 代打/工作室/带老板风险` 触发前过滤反向上下文，避免同一句同时出现风险和拒绝标签。
- `src/lib/nga.test.ts` 增加单测覆盖：`队内使用TTS及科技。装甲车过本看不到我。` 需要同时输出 `第三方工具/插件风险` 和 `拒绝装甲车/代打记录`，但不能输出 `代打/工作室/带老板风险`。
- `scripts/validate-nga-parser.ts` 增加 curated fixture，防止后续回归。

## Verification

- `npm test`: 101/101 passed.
- `npm run validate:nga-parser`: 213/213 curated assertions passed; local sample pool 396/396 with body, high-confidence effective rows 225.
