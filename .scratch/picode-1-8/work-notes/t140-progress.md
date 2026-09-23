# t140 progress ledger — usage second-round fixes

Branch: t140-usage-fixes (based on main@8e62d2d). Ticket: .scratch/picode-1-8/issues/140-usage-second-round.md
Status: claimed / in-progress

## Task (from ticket 140)
Four fixes to the model cumulative-usage UI:
1. weekly/cumulative hover: keep only the whole-week column gray ring (.heatmap-col-hover); remove the deeper cell frame on hover (button.heat:hover 1.5px outline). daily cell highlight stays; keyboard focus ring must not regress.
2. 52x7 grid always fully visible, no horizontal scroll (drop .heatmap-scroll overflow-x:auto and .heatmap width:max-content; columns shrink with container; month labels same rule). Cumulative cell values still accumulate from data start ("carried-before-window" semantics preserved + test-locked).
3. Daily Token Trend fixed to a 7-day window (today inclusive); retire the 7/30 Time Range switch row. settings-model TrendRange/trendRange/action untouched (additive-only shared; UI passes 7).
4. Model Usage donut fixed to a 7-day window (retires t124 R9 all-time donut scope); excludeZeroTokenModels filter-then-top-6 kept; data source snapshot.daily[].byModel (shared pure function with trendView). Top five stat cards keep all-time scope.

## Validation targets
- visual harness frames updated (hover frames w/o cell frame, 52-col fit, 7-day trend/donut, retired 30d/all-time frames disposition)
- electron smoke assertions updated
- vitest + typecheck green
- t139 settle-poll + setBackgroundThrottling(false) preserved

## Plan (validated against the code)
- ① app.css: add `.heatmap-col-hover button.heat:hover:not(:focus-visible) { outline: none }` — column ring stays the only hover chrome in weekly/cumulative; daily keeps `button.heat:hover`; keyboard `:focus-visible` ring protected by the `:not(:focus-visible)` guard (global ring rule app.css:95).
- ② app.css: `.heatmap-scroll` drops `overflow-x: auto` (padding stays — ring room, t139 smoke asserts ≥3px left); `.heatmap` + `.heatmap-months` width:100%; `.heatmap-col`/`.heatmap-month` flex:1 min-width:0; `.heat` width:100% + aspect-ratio:1 (square look, no min floor). Cumulative carry semantics: already test-locked in charts.test.ts:214 (期初 carry) — keep untouched.
- ③ UsagePage: drop `trendRange` prop + range-row JSX; `trendView(snapshot, 7)` fixed. SettingsWindow stops passing `trendRange={ui.trendRange}`. settings-model.ts NOT touched (TrendRange/trendRange/set-trend-range stay).
- ④ aggregate.ts: extract the window walk shared with trendView into a private `usageWindow()`; add exported `modelWindowTotals(snapshot, rangeDays)` folding `snapshot.daily[].byModel` (ModelUsageSlice[]; share vs window total; cost zeroed — DayUsage carries no per-model cost, donut renders tokens/share only). UsagePage donut = excludeZeroTokenModels(modelWindowTotals(snapshot,7)).slice(0,6). Top five stat cards untouched (all-time).
- Tests: views.test.ts — new modelWindowTotals describe (window-only totals, share denominator, zero model kept for caller filter, order). Harness/smoke: visual-usage.ts (fit probe scrollWidth≤clientWidth on u1/u2/u2c; daily hover keeps outline; weekly/cumulative hover outline equality hovered vs sibling; u3 re-pointed to fixed 7d + range-row absence; u7/u8 retired with ticket-comment disposition; drop scrollLeft prep + trendRangeActive); smoke.ts ticket-65 stage (retire range-switch legs; assert no .range-row/'Trend time range' seg; fixed .trend-x-label===3; zero-filter legend invariants under the fixed window).
- t139 settle-poll + setBackgroundThrottling(false) must survive (verified present in visual-usage.ts capture()).

## Log
- [ts] Read ticket + context + reference frames (z19 heatmap set) + code; created this ledger; plan written. Starting implementation.
- [10:40] Implemented ①②③④ + tests + harness/smoke updates. vitest full suite green (124 files / 2185 tests, env -u prefix), typecheck green, eslint on touched files green. Next: ps check → electron smoke (usage stages) → visual:usage frames → frame-by-frame read-back.
- [10:41] t139 settle-poll + setBackgroundThrottling(false) verified intact in visual-usage.ts capture() and window setup.
- [10:52] First visual:usage run FAILED at u2b — root cause: my initial CSS used `outline: none` on the hovered box, which stripped the column ring from the hovered box itself (ZCode reference: the hovered box KEEPS the same 1px column ring as siblings; the defect was only the deeper 1.5px hover frame). Fixed: ring-parity rule `.heatmap-col-hover .heat, .heatmap-col-hover button.heat:hover:not(:focus-visible) { outline: 1px solid var(--border-strong); outline-offset: 1px }` (merged with the pre-existing column-ring rule). Rebuilt + reran: all 11 frames green, u7/u8 retired as planned.
- [10:58] Frame-by-frame read-back: u1 52-col full-fit no scroll + month labels aligned; u1b daily hover keeps deeper outline + card above box; u2b/u2d hovered box outline identical to column siblings (zoom crops confirm); u3 fixed 7-day trend (Sep 17→23, 3 ticks, no range-row); u4 donut 7-day window (tiny model kept, shares vs window total); u5 drilldown; u6 trend hover card+guide+dots; u9 donut hover. All match the z19 composition.
- [11:00] Electron smoke: t132 boot-empty ⌘J focus FAIL aborts the run (pre-existing flake — stash-baseline A/B: identical FAIL with t140 changes reverted; evidence work-notes/t140-smoke-evidence.md). A second pre-existing t105 echo-race FAIL also blocks. Per the t44 precedent: temporary log-and-continue on those two fails → full run → BOTH usage stages green (usage_hover + usage_heat, every assertion incl. new usage_range_row_retired_ok) → temporary edits RESTORED (git diff verified clean). Post-stages t89 OAuth fail is also known-flaky, out of scope.
- [11:10] Final: typecheck + vitest 2185 green; ticket Status → ready-for-human with Comments; committing on t140-usage-fixes (no self-merge; operator runs scripts/merge-ticket.sh 140).
