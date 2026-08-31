# Visual Red-Line Review — Final QA (Ticket 12)

Date: 2026-08-28 · Branch: `t12-final-qa` · Method: fresh visual-harness captures
(`.scratch/visual/*.png`, this commit) compared screen-by-screen against the nine
baselines in `.scratch/reference/screenshots/`. UI copy is English by spec, so
text differs; the review judges layout, spacing, radii, weights, colors, and
component anatomy.

## Verdict summary

All nine reference screens compared. **4 real visual defects found and fixed**,
**10 deviations recorded as spec-driven exemptions** (owner confirmation
requested — see list below), remaining screens match the baseline anatomy.

## Defects found and fixed in this pass

| # | Screen | Defect | Fix |
|---|--------|--------|-----|
| 1 | 06 composer menus, 05 pill/queue (also 07 model cascade) | **Every popover, the approval pill, and the queue panel rendered unstyled** (raw text, no popover chrome). A missing closing `}` on `.side-panel:hover::before` (ticket 05 merge, `b99217f`) nested all subsequent CSS inside that rule under CSS-nesting semantics — silently dead selectors. Committed captures had silently recorded the broken states. | Restored the brace (`src/renderer/src/styles/app.css`); brace-balance scan now 0. |
| 2 | 09 usage heatmap | First two month labels painted over each other ("ApMay"): grid opening ≤1 week before a month boundary labeled two adjacent 18px columns. | `heatmapGrid` now yields the partial first week's label when column 1 also carries one (`src/shared/usage/charts.ts`, unit-tested both modes). |
| 3 | 02 empty state | Quick-start chips were text-only; reference chips each carry a leading icon. | Added calendar/bug/monitor/clock icons to the four chips (own SVGs, no ZCode assets). |
| 4 | 06 markdown | Code blocks used an inset gray fill; reference blocks read white-on-warm-page with a hairline border. | `.md pre` background → `var(--bg-card)`. |
| 5 | terminal harness | Terminal captures showed a dead user shell ("exit code 1"): the transcript harness's fake session cwd (`/Users/dev/projects/api-server`, nonexistent) arrived after the terminal harness's session and remounted the workspace on a path that kills `fish --login` instantly. | Harness fix: in terminal runs the transcript session reuses the terminal harness's real `tmpdir()` cwd (same workspace key, no remount). |

## Screen-by-screen record

| Ref | Screen | PiCode capture(s) | Verdict |
|-----|--------|--------------------|---------|
| 01 `18.54.03` | Mid-run transcript | `1-midrun`, `5-approval-queue` | **Match** — user bubble, Working·Ns line, Thought·29s collapsible, tool card with live status, composer queue-hint placeholder, stop control. Exemptions ①③ below. |
| 02 `18.54.10` | Empty state | `0-empty-state` | **Match** (after fix #3) — greeting, centered composer, chips with icons, sidebar rows with drag handles, footer account row. Exemptions ②④⑤. |
| 03 `18.54.16` | Empty + panel placeholder | `0b-empty-panel` | **Match** — "Open a Tab" title/hint/two cards; composer re-centers in the narrowed main area. Exemption ① (third card is Browser). |
| 04 `18.54.27` | Settled + file cards + preview | `2-settled`, `4-preview-markdown` | **Match** — done tool card, markdown (bold, red-tinted inline code, lists, code blocks), actions row with timestamp, file cards with Open deep-link, breadcrumb + rendered markdown preview. Exemption ⑥. |
| 05 `18.54.34` | Settled + toast pill | `2-settled`, `s1`–`s4` (toasts) | **Match** — same surfaces; ZCode's hover tooltip pill maps to PiCode's toast stack. |
| 06 `18.56.16` | Slash menu | `4-command-menu` | **Match** (after fixes #1/#4) — popover rows (bold command + gray description), selected row highlight, keyboard-hint footer, anchored above composer. |
| 07 `18.56.36` | Model cascade | `4b-model-menu` | **Match** (after fix #1) — provider column with current-check + chevron, models column with current check, hover highlight. Exemption ⑦. |
| 08 `18.57.01` | Source preview | `5-preview-source`, `5b` | **Match** — tab bar, breadcrumb, line-number gutter, syntax highlighting, wrap/truncate toggle. Exemption ⑧. |
| 09 `18.57.19` | Usage page | `u1`–`u5` | **Match** (after fix #2) — five headline cards with dividers, "Estimated cost · estimated" labeling, heatmap + Daily/Weekly/Cumulative, Time Range 7/30, per-model smooth trend with legend, donut + legend shares, drill-down rows. Exemption ⑨. |

No-reference screens (terminal tab, settings sections, ⌘K palette, review tab):
no baseline among the nine; consistency pass against the same design tokens —
captures `terminal-1/2/3`, `s1`–`s4`, `7-review-deeplink`.

## Exemptions — owner confirmation requested

All are spec-driven divergences from the pixel baseline, not drift:

1. **Browser tab absent** from the panel picker (ref 03 shows 审查/终端/浏览器) — spec Out of Scope ("Browser 标签页…不属于本项目").
2. **ASK / init chips hidden** on the composer (visible in refs) — spec Out of Scope ("ASK/init 芯片整体隐藏").
3. **Git 工具 floating panel replaced by the Review tab**; commit/push buttons absent — spec stories 32/35; "Git 提交/推送操作按钮" out of scope.
4. **Sidebar/settings nav cropped** (no 自动化/插件市场/记忆/子智能体/MCP 服务器/索引库 etc.) — spec's deliberate crop of ZCode's nav to PiCode's scope.
5. **All UI copy in English** (refs are Chinese) — spec: UI 文案全英文.
6. **Message actions = Copy + timestamp only**; ref 04 shows extra thumbs/branch icons — spec story 13 asks for "copy etc. with timestamps"; no behavioral story exists for reactions.
7. **No 管理模型 row / 预览 badge in the model cascade** — provider login and model management stay in the Pi TUI (spec story 46, Out of Scope).
8. **No changed-lines highlight in source preview** (ref 08 shows a green block) — diff review is the Review tab's job (stories 35 vs 36).
9. **Heatmap spans ~4 months in the fixture** vs ~9 in the reference — data-dependent, not layout.
10. **Watermark is PiCode's own π mark**, not ZCode's logo — red line: ZCode assets must not be copied.

Additional note: sidebar rows in captures show this machine's real session
store (live Handoff data), so row content differs from ZCode's sample tasks by
design; layout/anatomy is what was compared.
