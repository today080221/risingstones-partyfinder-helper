# NGA Parser Handoff

## Current State

- Branch: `codex/nga-login-aggregation`.
- The worktree intentionally contains the NGA login aggregation, local sample collection, Parser v1, unified source cards, time parser, sidebar/UI and validation harness changes from the old thread.
- Do not revert the old-thread edits. They are part of the feature branch.
- The historical NGA sample pool baseline was 396 samples with full `body` text. The local pool can now grow through additive aggregation; rely on curated parser assertions first, and record local pool counts when they differ.
- The gray wiki HTML was used only as a local extraction source for FF14/NGA recruitment parser terms. Do not paste or commit the full HTML source.

## Implemented Scope

- Tauri NGA visible-window flow defaults to public page reading; persistent local web session is off by default and remains an advanced fallback.
- The app only reads the rendered recruitment content needed by the parser and does not export webpage session data.
- Visible and cancelable NGA recruitment collection with request interval and max sample count.
- NGA recruit board presets include CN, JP, EU, Oceania, and US board entrypoints.
- Right-side primary action is now “聚合检索”: it follows the left-side source multi-select, skips Stone Home with a warning when no official dungeon is selected, and still allows NGA-only aggregation.
- NGA source settings are compact by default: region multi-select, desktop availability summary, saved recruit count, and progress stay visible; advanced collection parameters and developer diagnostics are folded.
- NGA defaults are now 1 second page interval, 500 total items per NGA aggregate run, and detail/body collection enabled.
- NGA aggregate now defaults to a metadata fast-scan of the active window. `maxItems` is the active-window size, default 500; cache hits update board-seen metadata without refreshing the detail-review timestamp.
- NGA cache-first refresh is now part of the desktop flow: saved rows render immediately after frontend reload, and topics older than the default 12-hour review interval, missing body, or uncertain state are queued for background review.
- Aggregate reading opens the NGA reading window minimized by default, scans board metadata first, opens details for cache-miss or changed topics, then reviews old cached topics that are missing body or due for review. Manual “打开 NGA” still opens a normal visible window.
- Board metadata scanning keeps the previously verified main-page topic-link selectors. If a rendered board page yields zero topics, it retries the same page briefly, reports candidate and next-link counts, then stops instead of following deep pages with zero extracted topics.
- Sidebar order is now data sources, data range, then universal recruitment filters. Stone Home label selection is local-only; Stone Home rows tagged as seeking are included in the player-seeking view.
- Universal filters now put tag/type and practical time constraints first. Legacy text keyword filters remain available under folded advanced filters.
- Data range only exposes dungeon type/name in normal mode. Stone Home area and position request filters were removed from normal fetch; area preference and 24-player A/B/C team preference are advanced local filters.
- NGA aggregate waits for the visible page to land on a supported board/post. `misc/adpage_insert_2.html?...` continuation pages are retryable; the tool first attempts the page continue button and only asks the user when that fails.
- NGA detail body extraction uses first floor plus useful original-author follow-ups, filtering bump/placeholder replies; full-thread pagination is intentionally out of scope.
- NGA card titles use the parsed dungeon name; subtitles and author/team display are cleaned to remove NGA level, prestige, registration date, and similar author metadata.
- Local additive sample cache stores parser fields plus review metadata (`lastCheckedAt`, `lastSeenAt`, `detailFetchedAt`, `contentHash`, `closedAt`, `sourceBoardUrl`, `lastBoardSeenAt`, `lastBoardRank`, `lastFullWindowScanAt`, `archivedAt`, `archiveReason`) for cache-aware refresh and lifecycle cleanup.
- Result rendering now uses a virtualized window-scroll list with stable row IDs, per-card update highlight, and scroll-anchor compensation.
- Filter sidebar keeps tag/type filters to a four-row preview with selected tags prioritized; the data-source panel can collapse to a compact source/view/NGA cache summary.
- Cache review status separates NGA saved rows from current Stone Home rows. Pending refresh excludes already confirmed closed or archived cached samples; archived samples are hidden from normal result rows.
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

- `npm test`: 127 tests passed.
- `npm run build`: passed.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 10 tests passed.
- `npm run test:e2e`: 9 tests passed.
- `npm run validate:nga-parser`: 30 curated fixtures, 213 structured assertions, 213 passed.
- The parser harness curated checks passed. The local saved sample pool is currently 507 total samples, 507 with body, and 264 high-confidence effective rows; the command exits non-zero only because the old local sample baseline expected 396 rows.
- Curated parser accuracy is 100.0% on the current hand-labeled edge cases, Wilson 95% confidence interval 98.2%-100.0%.

## 2026-05-09 Active Scan And Filter Follow-up

- NGA visible-window board reading now tracks scanned topics separately from kept samples. `maxItems` is the active-window metadata scan size, so a run can scan up to 500 topics while only opening detail pages for cache-miss, metadata-changed, body-missing, or review-due topics.
- `updatedAt` is parsed from board rows and detail pages by taking the latest visible absolute timestamp from that rendered row/page. If no timestamp can be parsed, the topic is kept eligible to avoid dropping ambiguous rows.
- Metadata-only cache hits refresh `lastBoardSeenAt`, `lastBoardRank`, `updatedAt`, and `lastSeenAt`; they do not refresh `lastCheckedAt` or `detailFetchedAt`.
- List metadata only opens detail when title and active time both change, or when the cached topic is missing body or due for review. Body hash is only meaningful after detail body has already been read.
- Detail body extraction reads the first floor plus original-author follow-ups; same-topic later pages are followed with a small cap to collect useful original-author additions.
- A full active-window scan can archive samples that have not appeared in the active window beyond the advanced archive-day setting, default 14 days and disabled with 0. Archived samples are hidden from normal UI, and 30-day-old archived/inactive samples can be cleaned from cache.
- Cards now derive visible tags through one shared tag vocabulary for Stone Home and NGA. Stone Home rows can get lightweight tags from official labels and text such as progress, time, strategy, and team name.
- Stone Home rows in the seeking view use “可用职业/可用位置” labels just like NGA seeking rows.
- Current pass adds metadata fast-scan, cache lifecycle archive/cleanup, active-window wording, zero-topic board scan protection, and updated docs/tests. Do not revert these when continuing.
- Result-page top status now carries aggregate read progress; the sidebar keeps only compact counts and controls.

## Next Thread Starting Point

- Start by reading this file, `docs/features/nga-login-aggregation.md`, and `docs/worklog/2026-05-08-nga-login-aggregation.md`.
- Then inspect `src/lib/nga.ts`, `src/lib/nga.test.ts`, `src/lib/time.ts`, `scripts/validate-nga-parser.ts`, and the UI surfaces in `src/App.tsx`.
- Keep adding user-confirmed parser edge cases to both `src/lib/nga.test.ts` and `scripts/validate-nga-parser.ts`.
- Prefer high-confidence extraction over forcing every slang term into a core field. Unknown or risky terms should stay as tags, warnings, or original-reference text until confirmed.
