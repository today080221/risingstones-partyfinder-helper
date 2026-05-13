# 2026-05-13 Duplicate Filter Root Cause

## Goal

- Diagnose why the current Tauri frontend instance at `K:\FFXIV Tools\石之家招募筛选` shows many identical `妖星乱舞绝境战` recruitment cards under the user's screenshot filters.
- Focus on root cause analysis first; do not change product behavior until the cause is confirmed.

## Baseline

- `git fetch origin` completed.
- Branch state after fetch: `main...origin/main`, clean worktree before this worklog edit.
- User screenshots show:
  - Source: 石之家 and NGA.
  - View: 队伍招募.
  - NGA region: 国服.
  - Duty: 绝境战 / 妖星乱舞绝境战.
  - Tags/type: 队伍招募 selected with 任一命中.
  - Time fields: cannot start earlier than `20`, cannot end later than `23`, minimum daily hours empty.
  - Weekdays all selected.
  - `保留时间不明确的招募` enabled.
  - Slot: H1.
  - Job: 白魔法师.

## Risks And Questions

- The running portable app may use persisted cache/state outside the repo, so the investigation must distinguish stored data duplication from render/filter logic.
- NGA data handling must avoid cookies, tokens, localStorage, sessionStorage, and other session material.
- The visible duplicates could come from source merge, parser identity normalization, cache persistence, or React list rendering/key behavior.

## Expected Validation

- Trace the filter pipeline from persisted/source records through normalized recruitment rows to rendered cards.
- Inspect only non-sensitive local app/cache artifacts if needed.
- Record the confirmed or most likely root cause, affected files, and proposed fix direction before implementation.

## Findings

- Read-only inspection only; no product behavior changed in this phase.
- NGA saved sample store `nga-samples.json` had 688 samples and no duplicate keys by `topicId || url || title:author`; WebView profile/localStorage/session data was not inspected.
- Direct official API read for `绝境战 / 妖星乱舞绝境战 / 满编小队` returned 192 rows with 192 unique recruit `id` values, so the official pagination result itself was not an all-duplicate data set.
- The same official data contained duplicate `uuid` values across distinct recruit `id` values. Example:
  - `uuid=10006962`, `id=50273`, progress `国服打欧洲时差首月队 7=1`, time `中欧时差20：30—0:30`, target `国际服`.
  - `uuid=10006962`, `id=49903`, progress `欧洲时差首月队7=1 H1`, time `英国时间晚7点半—11点半`, target `陆行鸟`.
- With the user's non-time filter口径 and empty time range, the filter pipeline produced 34 distinct official rows, but one duplicate render-key group: `uuid=10006962` for `id=50273` and `id=49903`.
- With `不能早于=20` and `不能晚于=23`, the same row `id=50273` is filtered out because `中欧时差20：30—0:30` parses to `20:30-次日00:30`; with blank time range it correctly passes.

## Root Cause

- `src/App.tsx` passes `computeItemKey={(_, row) => getRecruitRenderKey(row)}` to `Virtuoso`.
- `getRecruitRenderKey` currently returns `row.uuid` before falling back to `official-${row.id}` for official rows.
- For 石之家 official rows, `uuid` appears to identify the poster/account rather than the recruit record. The official recruit `id` is the unique row identity.
- Therefore, two or more different official recruit rows from the same poster can share the same React/Virtuoso key. This can corrupt virtual-list row identity and make the UI show repeated card content even though the filtered data contains distinct rows.

## Proposed Fix Direction

- Change the official render key to prefer recruit `id`, for example `official-${row.id}`, and only use `uuid` as a last fallback when `id` is missing.
- Keep NGA keys based on the existing `nga-${sampleKey}`/topic identity because those are generated from the NGA sample key rather than the official poster uuid.
- Add a focused regression test or small UI-level assertion for two official rows with the same `uuid` and different `id` values.

## Validation

- `rg --version`: ripgrep available.
- `git fetch origin`: completed.
- Branch state after fetch: `main...origin/main`.
- Direct official API spot check: 192 fetched rows, 192 unique `id` values, 3 duplicate official `uuid` groups.
- Filter reproduction:
  - Empty time range: 34 distinct filtered official rows, duplicate render key group `10006962` for `50273/49903`.
  - `不能晚于=23`: `中欧时差20：30—0:30` parses as ending next-day `00:30` and does not pass.

## Remaining Risks

- The currently open Tauri instance may also have an official localStorage cache entry, but localStorage/session data was intentionally not inspected per project safety rules.
- A rendered-browser verification after the key fix is still needed before shipping.

## Follow-Up: Fast Scroll Blank Area

### Goal

- Investigate the user's report that very fast free-spin mouse-wheel scrolling in a long result list can leave a large blank area where recruitment cards should be.
- Determine whether this is the same class of issue as duplicate cards, or a separate virtualization/measurement issue.

### Initial Hypothesis

- This is likely related but not identical: duplicate official `uuid` keys can corrupt row identity, while large blank gaps during fast scroll more strongly point at virtual-list measurement falling behind or measuring rows as effectively skipped/zero-height.
- Current rendered list uses `react-virtuoso` with `useWindowScroll`, dynamic card heights, and `.recruit-card { content-visibility: auto; }`. `content-visibility: auto` can delay off-screen layout/paint, which is risky inside a virtualization library that depends on measuring real item heights during aggressive scrolling.

### Findings

- `src/App.tsx` uses `Virtuoso` with `useWindowScroll`, `increaseViewportBy={{ top: 600, bottom: 900 }}`, and `computeItemKey`.
- `src/styles.css` sets `.recruit-card { content-visibility: auto; }`.
- The installed `react-virtuoso` type docs explicitly describe `minOverscanItemCount` as useful for dynamic or very tall content where pixel-based `increaseViewportBy` may not be enough to prevent empty areas during rapid resizing or scrolling.
- React Virtuoso's README also calls out that complex item content while scrolling can cause jank, and that list measurement depends on `ResizeObserver`/content sizing.
- Browser plugin verification was attempted against a local dev server, but the in-app browser runtime timed out twice before a useful interaction could be performed. The dev server processes were stopped afterward. This phase therefore remains code/root-cause analysis, not rendered reproduction.

### Likely Root Cause

- This is the same subsystem as the duplicate-card bug: virtualized list row identity and measurement.
- It is probably not the exact same single cause. Duplicate official `uuid` keys can absolutely make Virtuoso reuse or mismatch rows, but "large blank space while fast scrolling" is more directly explained by the combination of:
  - duplicate official row keys, which can corrupt virtualized item identity;
  - `content-visibility: auto` on each card, which can interfere with off-screen dynamic measurement/paint timing;
  - no item-count overscan or scroll-seek placeholder configured for very fast wheel input.

### Proposed Fix Direction

- First fix official render keys to prefer `official-${row.id}`.
- Remove `content-visibility: auto` from `.recruit-card`, or at minimum avoid using it on Virtuoso-measured item content.
- Add `minOverscanItemCount`, for example separate top/bottom counts, so a fast wheel fling always has several real item components mounted beyond the visible viewport.
- If performance suffers after removing `content-visibility`, consider `scrollSeekConfiguration` with a lightweight placeholder during high-velocity scrolling rather than letting the visible viewport become blank.

## Implementation

- Created branch `codex/fix-virtuoso-list-rendering`.
- Moved result-row key generation into `src/lib/recruit-render-key.ts`.
- Changed official render keys to prefer `official-${row.id}` so distinct 石之家 recruit rows from the same poster no longer share a virtual-list key.
- Kept NGA render keys based on the existing NGA row/sample identity.
- Added `src/lib/recruit-render-key.test.ts` covering duplicate official `uuid` values with different recruit ids.
- Added `minOverscanItemCount={{ top: 8, bottom: 12 }}` to the result `Virtuoso` list.
- Removed `.recruit-card { content-visibility: auto; }` to avoid delayed layout/paint interfering with Virtuoso item measurement during very fast scrolling.

## Final Validation

- `git fetch origin`: completed on 2026-05-14; branch created from synchronized `main...origin/main` with only this investigation's local docs edits present.
- `npm test -- --run src/lib/recruit-render-key.test.ts`: passed, 2 tests.
- `npm run build`: passed.
- `npm test`: passed, 8 files / 171 tests.
- `npm run validate:nga-parser`: passed curated parser gate, 233/233 curated checks. Local sample count differs from the historical baseline as expected for the current saved NGA cache, and the command reports this as non-gating.

## PR QA Pass

- Branch state before PR prep on 2026-05-14: `codex/fix-virtuoso-list-rendering`; `git fetch origin` completed; branch remained ahead only by this local fix set.
- Browser plugin path: attempted against `http://127.0.0.1:5188/`, but the in-app browser runtime timed out before page interaction. Fell back to regular Playwright against the same local URL.
- Playwright flow under test: app loads -> saved UI state selects 石之家 / 绝境战 / 妖星乱舞绝境战 -> click `聚合检索` -> long official result list renders -> fast wheel scrolling keeps cards visible.
- Playwright QA results:
  - Page identity: title `阿谢姆水晶 (Azem's Crystal)`, URL `http://127.0.0.1:5188/`.
  - Initial long list: 21 rendered cards, 35,294 px document height, no visible error notices.
  - Fast-scroll middle sample: scrollY 29,400, 34 rendered cards, 5 visible cards, duplicate rendered row ids 0, blank-risk flag false.
  - Fast-scroll bottom sample: scrollY 35,651, 17 rendered cards, 5 visible cards, duplicate rendered row ids 0, blank-risk flag false.
  - Console health: no relevant error or warning logs.
  - Screenshot evidence saved under `%TEMP%\risingstones-qa\qa-top.png`, `qa-mid-fast-scroll.png`, and `qa-bottom-fast-scroll.png`.
- Re-run validation before PR prep:
  - `npm test`: passed, 8 files / 171 tests.
  - `npm run build`: passed.
  - `npm run validate:nga-parser`: passed curated parser gate, 233/233 curated checks.
  - `git diff --check`: passed with only expected Windows LF-to-CRLF warnings for existing text files.
- No Tauri config, icon, bundle resource, or Rust command code changed, so `cargo fmt --manifest-path src-tauri/Cargo.toml --check` and `npm run desktop:build:portable` were not required for this phase.

## Remaining Follow-Up

- Rendered Tauri-window reproduction was not performed in this phase. Browser plugin automation timed out, while Playwright web QA against the same frontend passed. If the issue reappears only in the native WebView, test the packaged Tauri window next.
- If users still report blank areas after this fix, next step is adding `scrollSeekConfiguration` placeholders for high-velocity scroll rather than increasing rendered card work further.

## Ready PR QA Pass

- `git fetch origin`: completed on 2026-05-14 before marking PR ready. Branch state remained `codex/fix-virtuoso-list-rendering...origin/codex/fix-virtuoso-list-rendering`, with PR #4 open, draft, mergeable, and GitHub CI `Test and build` already successful.
- Browser plugin path: retried against `http://127.0.0.1:5188/`, but the in-app browser connection/navigation timed out before page verification. Per frontend QA rules, fell back to regular Playwright and recorded the Browser-path blocker.
- Playwright UI flow under test: app loads -> UI clicks set 石之家 only / 绝境战 / 妖星乱舞绝境战 / 队伍招募 / H1 / 白魔法师, with `不能早于` and `不能晚于` both blank -> click `聚合检索` -> fast wheel scroll through the long official result list.
- Playwright QA results:
  - Page identity: title `阿谢姆水晶 (Azem's Crystal)`, URL `http://127.0.0.1:5188/`.
  - Filter snapshot: 石之家 `aria-pressed=true`, NGA `aria-pressed=false`, `fbType=绝境战`, `fbName=妖星乱舞绝境战`, `timeStart=""`, `timeEnd=""`, and 队伍招募 / H1 / 白魔法师 all active.
  - Initial list: 22 rendered cards, 5 visible cards, duplicate rendered row ids 0, blank-risk flag false.
  - Fast-scroll sample: scrollY 5,826, 17 rendered cards, 6 visible cards, duplicate rendered row ids 0, blank-risk flag false.
  - Bottom sample: scrollY 5,826, 17 rendered cards, 6 visible cards, duplicate rendered row ids 0, blank-risk flag false.
  - Console health: no relevant app errors or warnings. One unrelated startup update-check request returned `503` for `/api/update/check?provider=gitee`; it was recorded and excluded because it does not touch filtering, official rows, render keys, or virtual scrolling.
  - Screenshot evidence saved under `%TEMP%\risingstones-ready-qa\ready-ui-mid-fast-scroll.png` and `%TEMP%\risingstones-ready-qa\ready-ui-bottom-fast-scroll.png`.
- Final command QA before ready-for-review:
  - `npm test`: passed, 8 files / 171 tests.
  - `npm run build`: passed.
  - `npm run validate:nga-parser`: passed curated parser gate, 233/233 curated checks. Local sample count differs from the historical baseline as expected and remains non-gating.
  - `git diff --check`: passed.
- No Tauri config, icon, bundle resource, or Rust command code changed, so `cargo fmt --manifest-path src-tauri/Cargo.toml --check` and `npm run desktop:build:portable` were not required for this ready-PR pass.
