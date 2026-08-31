# 22: Tooltip 体系对齐 ZCode

**What to build:** 全 app 的悬停提示对齐 ZCode 形态（2026-08-31 操作者实测对比 + R5-Q1 三件全做）：
① **会话行移除长 tooltip**：现状 `Sidebar.tsx` TaskItem 用原生 `title="标题 — cwd"`，hover 出现一大行文字（操作者指认）；ZCode 会话行**无任何 tooltip**——删掉。
② **按钮 tooltip 重做**：替换全部原生 `title` 长文本，新统一 tooltip 组件两态——**有快捷键的只显快捷键**（⌘N/⌘K/⌘J…键帽样式）、**有短描述的只显短描述**（如表格钮「复制」「自动换行」）；样式对照 ZCode 实拍 `.scratch/compare/z-tooltip-style.png`（小型浮层、深字浅底、键位帽）。
③ **全 app 按钮走查**并归档清单（按钮 × tooltip 文案 × 快捷键）：侧栏工具行/会话行按钮/分组悬停钮（票 19）/composer 芯片/消息操作行（票 16）/右侧栏与底部终端/标题栏/设置。

**背景（证据）：**
- 操作者原话：「当光标悬停在按钮上时，PiCode 的会话入口会出现一大行文字，但是 ZCode 不会，ZCode 只有一些按钮的介绍和有快捷键的会显示。」
- ZCode 实拍：筛选钮 hover 仅显「⌘ K」键帽（`z-tooltip-style.png`）；表格钮 hover 显「复制」等短描述（操作者逐钮指认）。
- PiCode 现状：原生 `title` 属性散布各组件（如 `TaskItem`、`sb-icon-btn` aria-label/title 并存）。

**Blocked by:** None（终态走查宜在 16/18/19 的按钮定形后收尾，故实现顺序上宜靠后——但**组件本身先行**，作为 16/18/19 的前置件）。

**Status:** ready-for-human

- [x] 会话行无 tooltip（含 title 与 aria-label 复用清理）
- [x] 统一 tooltip 组件落地（短描述 / 快捷键两态，样式对照 `z-tooltip-style.png`）
- [x] 全 app 走查清单归档于本票 Comments（按钮 × 文案 × 快捷键），与 ZCode 逐一对齐
- [x] visual harness 抽查帧更新；typecheck / lint / test 全绿

## Comments

- 2026-08-31 (requirements intake + grilling 定稿): 建票。R5-Q1 三件全做。走查范围含 16/18/19 新增的所有按钮（复制/换行/fork/悬停三钮/⌘J 切换钮等）。
- 2026-08-31 (/to-tickets): **定位为前置件**——统一组件先落地，16/18/19 的新按钮直接消费（它们均 Blocked by 本票）；后续票的按钮在其自己的票内带上 tooltip 验收项，本票走查清单随之增补。
- 2026-08-31 (t22 implementation — walkthrough catalog, ticket item ③):

  **Component** — `src/renderer/src/components/Tooltip.tsx`: a pure marker (`<Tooltip label="Copy">` / `<Tooltip shortcut="⌘N">`) that injects a trigger class + data attributes onto its child, plus one delegated `TooltipHost` per window (document-level mouseover/mouseout/mousedown/focusin/focusout + scroll/resize/blur listeners; 400ms dwell; bubble portal to `document.body`, fixed position). Geometry lives in pure `src/shared/tooltip.ts` (`resolveTooltipContent` — shortcut wins over description, per ZCode; `splitShortcutKeys` — one keycap per token; `placeTooltip` — below by default, flips above on bottom overflow, viewport-clamped; tested table-driven at Seam-1, `tests/shared/tooltip.test.ts`, 12 cases). Styles: `.tooltip-bubble` small light bubble, dark text, subtle border/shadow; `.tooltip-key` keycaps (`.scratch/compare/z-tooltip-style.png` was an unusable blank crop — styling followed the operator's recorded description 小型浮层/深字浅底/键位帽 and is flagged for visual-QA eyeball against the live app).

  **Disposition rules**: R1 shortcut-only keycap state (ZCode: 有快捷键只显快捷键) · R2 icon-only → short description · R3 visible text label → no tooltip, redundant native title removed · R4 data reveal (truncated text, paths, data cells) keeps native `title` — not control chrome · R5 dead control (no handler) → no tooltip until wired.

  | Area | Control | Label / aria | Shortcut | Tooltip | Rule |
  |---|---|---|---|---|---|
  | Titlebar | Sidebar toggle | Hide/Show sidebar | — | same text (dynamic) | R2 |
  | Titlebar | Back / Forward | disabled | — | none | R5 |
  | Titlebar | Help | Help | — | Help | R2 |
  | Titlebar | Side panel toggle | Open/Close side panel | — | same text (dynamic) | R2 |
  | Sidebar | New Task row | text + inline kbd | ⌘N | none (self-labeled, ZCode parity) | R3 |
  | Sidebar | Search row | text + inline kbd | ⌘K | none (self-labeled) | R3 |
  | Sidebar | Clear filter × | Clear filter | — | Clear filter | R2 |
  | Sidebar | Expand-all | aria only, **no handler** | — | none — wire in ticket 19 | R5 |
  | Sidebar | Groups / Projects pills | text | — | none | R3 |
  | Sidebar | Filter toggle | Filter tasks | — | Filter tasks (ZCode's ⌘K keycap there maps to our ⌘K search, shown inline) | R2 |
  | Sidebar | Deleted tasks | aria only, **no handler** | — | none — wire in ticket 19 | R5 |
  | Sidebar | Settings gear | Settings | — | Settings | R2 |
  | Session rows | row hover | was `title="title — cwd"` | — | **removed entirely** (also footer account name) | ① |
  | Session rows | Pin | Pin task / Unpin task | — | Pin / Unpin (dynamic) | R2 |
  | Chat topbar | title span | cwd reveal | — | kept native title | R4 |
  | Chat topbar | Rename pencil | was verbose title | — | Rename | R2 |
  | Chat topbar | History | text | — | none | R3 |
  | Branch history | entry row | was "Continue from this entry" | — | **removed** (per-row noise; affordance = panel + fork) | ①-style |
  | Branch history | Fork | Fork a new session from this entry | — | Fork from here | R2 |
  | Composer | Attach + | was title | — | Attach images | R2 |
  | Composer | Access / Model / Thinking chips | text | — | none | R3 |
  | Composer | Steer / Follow-up | text; was explanatory titles | — | Inject into the current turn / Queue after the current turn | R2 |
  | Composer | Stop | Stop generating | — | Stop | R2 |
  | Composer | Send | Send message | ⏎ (contextual, not a global accelerator) | Send — not keycap state; revisit if operator wants ⏎ shown | R2 |
  | Queue panel | Steer / Follow-up items | was titles | — | **removed** (visible tags say it) | ①-style |
  | Side panel | Collapse | Collapse side panel | — | Collapse side panel | R2 |
  | Side panel | Tab close × | Close {Tab} tab | — | same (dynamic) | R2 |
  | Side panel | Add tab + | Add a tab | — | Add a tab | R2 |
  | Side panel | Picker cards | text | — | none | R3 |
  | Review | Refresh | Refresh diff | — | Refresh diff | R2 |
  | Review | diff path / branch spans | truncation reveal | — | kept native title | R4 |
  | Preview | Wrap toggle | was verbose two-state title | — | Wrap lines | R2 |
  | Preview | breadcrumb buttons | full-path reveal | — | kept native title | R4 |
  | Preview | Open chip (icon-only) | was title=label | — | label (description) | R2 |
  | Terminal | Restart | text | — | none | R3 |
  | Settings | Refresh sign-in | icon + text | — | none | R3 |
  | Usage | Heatmap cells | date + tokens reveal | — | kept native title | R4 |
  | Usage | Donut legend rows | was redundant title | — | **removed** (visible text) | R3 |
  | Usage | cost annotation / session id | spans | — | kept native title | R4 |

  **Reserved consumers (upcoming tickets, component consumed as-is)**: 16 — code-block Copy / Wrap, table Copy / Expand, message fork (all R2); 17 — project chip (R2); 18 — bottom-terminal toggle (R1 ⌘J keycap), terminal controls; 19 — group-hover Hide / View files / New task (R2) + expand-all wiring (clears R5); 20 — status dots are indicators, not buttons (none).
- 2026-08-31 (t22 implementation — verification + hand-off):
  - typecheck / eslint / vitest 全绿（50 files, 470 tests, 含新增 `tests/shared/tooltip.test.ts` 12 例）；visual harness 全帧重拍通过，新帧 `8-tooltip-filter`（气泡探针 1）。
  - code-review 两轴通过（Standards：文案英文/测试缝/术语绑定 ✓，1 处缩进当场修复；Spec：三件全做 ✓，1 项部分——`z-tooltip-style.png` 证据图实为空白裁切，样式按操作者口述「小型浮层/深字浅底/键位帽」落地并留人工 visual QA 把关）。
  - **实现 sha：`51e09c4`**（分支 `t22-tooltip-system`，未自行 merge）。⚠️ 快捷键键帽态当前无实消费按钮（现 app 仅 ⌘N/⌘K 且已内联 kbd），键帽视觉待票 18 ⌘J 首个真实消费者人工验收。
  - 操作者合并：`bash scripts/merge-ticket.sh 22`
