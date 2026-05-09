# NGA Parser Handoff

## Current State

- Branch: `codex/nga-login-aggregation`.
- The worktree intentionally contains the NGA login aggregation, local sample collection, Parser v1, unified source cards, time parser, sidebar/UI and validation harness changes from the old thread.
- Do not revert the old-thread edits. They are part of the feature branch.
- Local NGA sample pool is expected to contain 396 samples and all 396 samples should have `body` text.
- The gray wiki HTML was used only as a local extraction source for FF14/NGA recruitment parser terms. Do not paste or commit the full HTML source.

## Implemented Scope

- Tauri NGA WebView login flow with manual user login only.
- Keep-login is off by default and requires an explicit risk confirmation.
- The app does not read, export, log, or display NGA cookies, localStorage, sessionStorage, tokens, passwords, or credentials.
- Visible and cancelable NGA sample collection with request interval and max sample count.
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
- Bare `ACT`, `logs`, or `时间轴` is neutral or low-risk unless connected to explicit tool usage such as TTS, trigger, drawing, wheelchairs, or broadcast helpers.
- Contact details are parsed into a dedicated contact block. Do not spread full contact strings into unrelated fields.

## Latest Validation

- `npm test`: 94 tests passed.
- `npm run build`: passed.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- `npm run test:e2e`: 2 tests passed.
- `npm run validate:nga-parser`: 29 curated fixtures, 208 structured assertions, 208 passed.
- The parser harness reported 396 total samples, 396 with body, and 225 high-confidence effective rows.
- Curated parser accuracy is 100.0% on the current hand-labeled edge cases, Wilson 95% confidence interval 98.2%-100.0%.

## Next Thread Starting Point

- Start by reading this file, `docs/features/nga-login-aggregation.md`, and `docs/worklog/2026-05-08-nga-login-aggregation.md`.
- Then inspect `src/lib/nga.ts`, `src/lib/nga.test.ts`, `src/lib/time.ts`, `scripts/validate-nga-parser.ts`, and the UI surfaces in `src/App.tsx`.
- Keep adding user-confirmed parser edge cases to both `src/lib/nga.test.ts` and `scripts/validate-nga-parser.ts`.
- Prefer high-confidence extraction over forcing every slang term into a core field. Unknown or risky terms should stay as tags, warnings, or original-reference text until confirmed.
