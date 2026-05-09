# NGA Parser Handoff

## Current State

- Branch: `codex/nga-login-aggregation`.
- The worktree intentionally contains the NGA login aggregation, local sample collection, Parser v1, unified source cards, time parser, sidebar/UI and validation harness changes from the old thread.
- Do not revert the old-thread edits. They are part of the feature branch.
- Local NGA sample pool is expected to contain 396 samples and all 396 samples should have `body` text.
- The gray wiki HTML was used only as a local extraction source for FF14/NGA recruitment parser terms. Do not paste or commit the full HTML source.

## Implemented Scope

- Tauri NGA visible-window flow defaults to public page reading; persistent local web session is off by default and remains an advanced fallback.
- The app only reads the rendered recruitment content needed by the parser and does not export webpage session data.
- Visible and cancelable NGA recruitment collection with request interval and max sample count.
- NGA recruit board presets include CN, JP, EU, Oceania, and US board entrypoints.
- Right-side primary action is now “聚合检索”: it follows the left-side source multi-select, skips Stone Home with a warning when no official dungeon is selected, and still allows NGA-only aggregation.
- NGA source settings are compact by default: region multi-select, desktop availability summary, saved recruit count, and progress stay visible; advanced collection parameters and developer diagnostics are folded.
- NGA defaults are now 1 second page interval, 500 total items per NGA aggregate run, and detail/body collection enabled.
- Sidebar order is now data sources, data range, then universal recruitment filters. Stone Home label selection is local-only; Stone Home rows tagged as seeking are included in the player-seeking view.
- NGA aggregate waits for the visible page to land on a supported board/post. `misc/adpage_insert_2.html?...` continuation pages are treated as retryable waiting states.
- NGA detail body extraction uses first floor plus useful original-author follow-ups, filtering bump/placeholder replies; full-thread pagination is intentionally out of scope.
- NGA card titles use the parsed dungeon name; subtitles and author/team display are cleaned to remove NGA level, prestige, registration date, and similar author metadata.
- Local additive sample cache with whitelist fields only.
- Parser v1 with rules, dictionaries, and heuristics for:
  - team recruitment
  - player seeking team
  - substitute or temporary recruitment
  - static or long-term teams
  - closed or filled posts
  - low-confidence or noise fallback
- Parser output includes structured fields, confidence, evidence snippets, warnings, and tags.
- NGA and Stone Home cards share the same readable display model where practical: current roster/player availability, team details, recruitment requirements, contact details, strategy notes, and original reference.

## Parser Notes

- Strong vacancy signals such as `7=1 D4`, `6=2 H2 D1`, `5=3 h1 h2 d4`, `4=4 (MT ST D3 D4)`, and `现招募：近战` override weaker loose mentions.
- `D1/D2`, `MT/ST`, and `H1/H2` can represent one flexible slot when the text says one person can cover either position.
- Explicitly separate openings such as `h1 h2 d4` stay separate and must not be merged into `H1/H2`.
- `已有`, `现有阵容`, `队内配置`, `职业构成`, and similar markers describe occupied roster slots unless a later demand marker overrides the local window.
- `+` in roster position lists, such as `2T+H1+D1+D2+D3+D4(...)`, is a list connector, not a flexible-position separator.
- `禁止/谢绝/婉拒` and similar negative prompts invert plugin and substitute-risk labels. They should not mark the team as using third-party tools.
- `装甲车过本看不到我` is user-confirmed anti-carry wording: keep `拒绝装甲车/代打记录`, do not add `代打/工作室/带老板风险`.
- Bare `ACT`, `logs`, or `时间轴` is neutral or low-risk unless connected to explicit tool usage such as TTS, trigger, drawing, wheelchairs, or broadcast helpers.
- Contact details are parsed into a dedicated contact block. Do not spread full contact strings into unrelated fields.

## Latest Validation

- `npm test`: 106 tests passed.
- `npm run build`: passed.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- `npm run test:e2e`: 7 tests passed.
- `npm run validate:nga-parser`: 30 curated fixtures, 213 structured assertions, 213 passed.
- The parser harness curated checks passed. The local saved sample pool is currently 499 total samples, 451 with body, and 275 high-confidence effective rows; the command exits non-zero only because the old local sample baseline expected 396 rows.
- Curated parser accuracy is 100.0% on the current hand-labeled edge cases, Wilson 95% confidence interval 98.2%-100.0%.

## Next Thread Starting Point

- Start by reading this file, `docs/features/nga-login-aggregation.md`, and `docs/worklog/2026-05-08-nga-login-aggregation.md`.
- Then inspect `src/lib/nga.ts`, `src/lib/nga.test.ts`, `src/lib/time.ts`, `scripts/validate-nga-parser.ts`, and the UI surfaces in `src/App.tsx`.
- Keep adding user-confirmed parser edge cases to both `src/lib/nga.test.ts` and `scripts/validate-nga-parser.ts`.
- Prefer high-confidence extraction over forcing every slang term into a core field. Unknown or risky terms should stay as tags, warnings, or original-reference text until confirmed.
