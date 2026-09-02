# PiCode 1.2 — 侧栏与面板成熟度：选中语义与未读 × 布局自由度 × 交互性能 × 预览多标签 × 键位重映射 × 调用轨迹

Status: ready-for-agent

本 spec 覆盖工单 27 起（同目录 `issues/`，编号全局连续）。取证 = 操作者 2026-09-01/02 实拍九帧（已归档 `.scratch/compare/`：`z-tab-dropdown / z-filter-menu / z-context-menu / z-session-hover-archive / z-trace-{header,search,block-toggles,expanded,collapsed}.png`）+ main 源码逐项核因；全部取舍经 /grill-with-docs 两轮十问定稿（Q1–Q10，见 Comments）。术语遵循 `CONTEXT.md`。

## Problem Statement

1.1 通过"敢日常真用"验收后，一段时间的真实使用判定：**侧栏与侧面板的交互成熟度仍不及 ZCode**，且多活动会话（票 20）落地后暴露了新的观察与审计缺口：

- **选中语义断裂**：点击只读会话进入 Follow，主区跳转了，侧栏高亮却留在前一个会话上，read-only 行几乎无视觉反馈（`bg-inset` 与侧栏底色不可分辨）。
- **侧栏宽度焊死**：固定 320px 不可拖拽，长标题永远截断；右侧栏却能拖。
- **拖拽与滚动卡顿**：右侧栏拖宽、打开的文件滚动时明显卡顿，ZCode 同场景丝滑。根因已核：拖拽在每次 pointermove 上 dispatch 触发 App 级重渲染，markdown 组件未 memo 化导致整文件重解析。
- **预览 tab 管理原始**：tab 条 ⌄ 是"收起面板"；ZCode 是标签页管理下拉（搜索 + 打开的标签页 + 最近关闭），且文件各自成 tab 并存——PiCode 的 Preview 一次只显示一个文件。
- **键位错位**：⌘B 是 Bridge，肌肉记忆里 ⌘B = 切换侧边栏（ZCode 命令面板实拍佐证）。
- **预览没有块级供面**：渲染态 markdown 的代码格/表格无复制/换行/预览/展开按钮（票 16 当时把预览排除在 chrome 外）。
- **置顶行悬停跳动**：悬停时时间瞬断、pin 显隐，突兀。
- **筛选形态错误**：PiCode 是文本输入框；ZCode 是视图（按项目/时间线）+ 排序（更新/创建时间）下拉。
- **Show more 对齐错误**：与状态点对齐而非会话行文本。
- **会话管理缺维度**：无右键菜单、无归档、无未读、无调用轨迹——ZCode 皆有且为日常依赖。

## Solution

十张工单六条主题，全部对齐 ZCode 实机形态（PiCode 架构内落地）：

1. **选中语义与未读（1/11）**：侧栏高亮跟随视图；状态点体系加入未读（自动 + 手动），后台完成的回合不再无感。
2. **布局自由度（2/7/9）**：侧栏拖宽 + 持久化；置顶行零位移悬停；Show more 对齐文本网格。
3. **交互性能（3）**：拖拽 rAF 直写 DOM + markdown memo 化；滚动卡顿先实测取证再收工。
4. **面板成熟度（4/6/12）**：Preview 升级多文件 tab + 标签页管理下拉 + 最近关闭；预览块级供面转正；**调用轨迹 tab**（活跟随的会话条目检查器）。
5. **键位重映射（5）**：⌘B 左侧栏 / ⌥⌘B 右侧栏 / ⌘J 终端 / ⌥⌘J Bridge。
6. **会话管理（8/10）**：筛选下拉（视图/排序）+ createdAt；会话行右键菜单九项 + 归档。

## User Stories

1. As a 双端用户, I want the sidebar highlight to follow the view I am actually looking at, so that the selected row always matches the main zone.
2. As a 双端用户, I want a followed read-only row to carry the same selected styling, so that clicking a live session gives visible feedback.
3. As a multitasking developer, I want a session I left behind to keep its animated dot while running, so that selection and running state never blur.
4. As a 双端用户, I want clicking the focused row again to exit Follow mode, so that returning stays one click.
5. As a multitasking developer, I want a background session that finished a turn while I was elsewhere to show an unread dot, so that completed work never goes unnoticed.
6. As a 双端用户, I want a TUI session that grew while I was not watching to show an unread dot once quiet, so that other-end activity is discoverable.
7. As a cautious user, I want unread dots suppressed while awaiting-approval / running / TUI-live states apply, so that the dot slot stays unambiguous.
8. As a reader, I want opening a session to clear its unread state, so that reading is the only way to make it read.
9. As an organizer, I want a Mark as Unread action in the context menu, so that I can flag sessions for later review.
10. As an organizer, I want manual unread to persist across restarts, so that my flags survive.
11. As a tidy user, I want unread state stored as a local preference only, so that session files remain untouched.
12. As a wide-monitor user, I want to drag the sidebar's right edge to resize it, so that long titles fit.
13. As a persistent user, I want my sidebar width remembered across launches, so that my layout survives restarts.
14. As a cautious user, I want double-click on the resize handle to reset width to default, so that experiments are instantly undoable.
15. As a layout-conscious user, I want the sidebar width clamped (240–520px, default 320), so that the app never collapses or floods.
16. As a consistent user, I want the side panel's width persisted too, so that both draggable panes behave alike.
17. As an impatient user, I want dragging the side panel to stay smooth over large files, so that resizing never stutters.
18. As an impatient user, I want the bottom dock's height drag to be equally smooth, so that both drags feel native.
19. As a skeptic, I want scroll smoothness of large previews verified with real before/after measurements, so that "fixed" means measured.
20. As a code browser, I want every file I open in the side panel to get its own tab, so that I can move between files without reopening.
21. As a multitasking reader, I want the tab strip chevron to open a tab-management dropdown, so that any tab is one glance away.
22. As a fast navigator, I want to search tabs by name in that dropdown, so that many tabs stay navigable.
23. As a forgetful user, I want recently closed tabs listed with relative times, so that a mis-dismissed file is one click from recovery.
24. As a persistent user, I want recently closed tabs to survive restarts, so that the history is real.
25. As a tidy user, I want each tab closable without killing the others, so that tab management is precise.
26. As a code browser, I want deep links (review → file, browser → file) to open a new tab (or focus the existing one), so that my current tabs stay put.
27. As a markdown reader, I want copy/wrap buttons on code blocks in the preview reader, so that lifting code works anywhere.
28. As a table reader, I want copy/preview/expand actions on preview tables, so that tabular data is liftable outside the transcript too.
29. As a consistent user, I want preview block cards to look and behave exactly like transcript ones, so that there is one grammar of blocks.
30. As a keyboard user, I want ⌘B to toggle the left sidebar, so that my muscle memory matches ZCode.
31. As a keyboard user, I want ⌥⌘B to toggle the right side panel, so that both panes are reachable without the mouse.
32. As a keyboard user, I want ⌥⌘J to toggle the Bridge dock, so that bridge watching stays keyboard-first.
33. As a keyboard user, I want ⌘J to keep toggling the terminal, so that the terminal shortcut is unchanged.
34. As a discoverability-minded user, I want titlebar toggles to show keycap-only tooltips (⌘B / ⌥⌘B / ⌘J / ⌥⌘J), so that shortcuts advertise themselves.
35. As an organizer, I want pinned rows to read title → time → orange pin with the pin at the far right, so that the pin never jumps on hover.
36. As a calm user, I want hover on a pinned row to hide only the time text (slot width reserved), so that nothing shifts.
37. As a polish-minded user, I want hover transitions faded instead of instant, so that the sidebar feels quiet.
38. As an organizer, I want the filter icon to open a view/sort dropdown (By project / Timeline; Updated / Created), so that organizing matches my ZCode muscle memory.
39. As a time-traveler, I want a Timeline view that flattens all sessions with the pinned section kept on top, so that recent work across projects is one list.
40. As an archivist, I want to sort by creation time, so that the true age of a task is visible.
41. As a clean-minded user, I want the old text-filter row retired (⌘K covers search), so that there is one way to search.
42. As a keyboard user, I want the dead Expand-all button removed, so that only working controls remain.
43. As a visually picky user, I want Show more/less aligned with session-row text, so that the sidebar reads on a single grid.
44. As a power user, I want a right-click context menu on session rows, so that session management lives where I look for it.
45. As an organizer, I want Archive to hide a session from all sidebar lists without deleting anything, so that decluttering is safe.
46. As a recovering organizer, I want an archived-list view behind the trash button with one-click restore, so that archiving is reversible.
47. As a searcher, I want archived sessions still reachable via ⌘K, so that hiding never means losing.
48. As a finder-native user, I want "Reveal in Finder" for the session file, so that the raw jsonl is reachable.
49. As a scripter, I want Copy task path / Copy session file path / Copy session ID actions, so that cross-referencing is trivial.
50. As a tidy user, I want archiving a pinned session to also unpin it, so that pinned and archived never conflict.
51. As a layout-sensitive user, I want the row-hover archive button to temporarily take the dot slot (no overlap, no shift), so that hover actions never break the row grid.
52. As a debugging developer, I want a call-trace tab listing every model call with IN/OUT tokens, duration and timestamp, so that I can audit what the agent actually did.
53. As a curious auditor, I want each call's input blocks (user messages, prior tool results) and output blocks (thinking, assistant text, tool calls) expandable inline, so that full detail is one click away.
54. As an impatient auditor, I want the trace open fully expanded by default with a collapse-all toggle, so that nothing hides behind clicks but noise is one click away.
55. As a focused reader, I want block-type toggles (system prompt / user / thinking / assistant / tool call / tool result), so that I can strip noise from the view.
56. As a searcher, I want in-trace search with match count and prev/next navigation, so that finding one call among 75 is fast.
57. As a live supervisor, I want the trace to live-follow a running session, so that watching background work never requires reopening.
58. As a finder-native user, I want "Open in Finder" from the trace header, so that the raw file is adjacent.
59. As a skeptic, I want a refresh action in the trace header, so that I can force a re-read at any time.
60. As a tidy user, I want the trace tab to live in the multi-tab framework (closable, recently-closed tracked), so that trace tabs behave like file tabs.
61. As a token-watcher, I want a header stats line (calls · total tokens · model), so that a session's cost shape is visible at a glance.
62. As a 双端用户, I want manual rename and pin available from the same context menu, so that all row actions share one surface.

## Implementation Decisions

- **选中跟随视图**：侧栏行视觉状态改为"当前视图"单一派生——Follow 激活时 followed 行持选中样式、focused 行还原普通底色；运行中信息仍由状态点承担（纯投影，表驱动）。
- **未读**：本地偏好记录每会话已读水位（mtime 水位 + 手动未读覆盖位），会话文件零改动。自动置位 = 非聚焦/非跟随期间文件增长（回合粒度）；聚焦自动清除（含手动标记）；右键菜单手动切换。状态点优先级 = 橙（待审批）> 蓝动画（本应用运行）> 绿（TUI 在写）> **靛蓝实心（未读）** > 空槽——更高优先级暂时遮蔽未读，会话安静后露出；归档会话不显示未读。ZCode 的未读同样是本地态（其 `session` 表无未读字段，已只读取证）。
- **侧栏拖宽**：右缘 resizer 复用侧面板拖拽交互模式；宽度进偏好持久化（clamp 240–520px，默认 320，双击手柄重置）；**侧面板宽度一并持久化**（两个可拖面板行为一致）。
- **性能**：拖拽 = pointermove 期间 rAF 合帧直写 DOM 宽度、pointerup 才 commit 状态（拖拽路径零 React 重渲染）；markdown 渲染组件 memo 化；底部 dock 拖高同模式。滚动卡顿静态证据弱于拖拽——**验收第一步 = Performance 面板实测大 markdown 文件前后 flamegraph 并归档**，若另有根因（DOM 重量/CSS 效应）本票内继续追。
- **预览多文件 tab**：面板 tab 身份从二元枚举扩展为 `review | file(cwd, path) | trace(sessionFile)`；tab 框架纯 reducer 扩展（open/close/activate + 最近关闭栈）。最近关闭 = 偏好持久化、容量 10、条目含相对时间；下拉 = 搜索框（匹配计数 + 上下导航）+ 打开的标签页 + 最近关闭。深链 openPreview 语义从"替换目标"变"开新 tab / 聚焦既有"。tab 条 ⌄ 改为下拉后，"收起面板"由标题栏切换钮 + ⌥⌘B 承担。
- **预览块级供面转正**：File Preview rendered 态消费与转录相同的块级卡片组件（chrome 开启）；source 态（窗口化文本）不变。推翻票 16 的"预览保持裸排版"范围裁定（操作者 2026-09-02 转正）。
- **键位重映射**：⌘B → 左侧栏 / ⌥⌘B → 右侧面板 / ⌘J → 终端（不变）/ ⌥⌘J → Bridge。全局键判定改用物理键位（`event.code`——macOS Option 组合字符问题）；dock 开合动作复用既有动作，"互切"语义自然延续。标题栏四钮 tooltip 按 R1 规则转键帽态。
- **置顶行**：行序 = `[点槽][标题][时间][pin]`；时间为**定宽槽**，悬停只隐文字（visibility/opacity 过渡 ~150ms），pin 固定行尾零位移；非置顶行悬停 pin 出现在同一位置。
- **筛选下拉**：FilterIcon 打开 ZCode 式下拉（视图：By project / Timeline；排序：Updated / Created）。Timeline = 全会话平铺、置顶区保留顶部；排序为纯函数进入分组流水线，作用于两种视图。`createdAt` 由 host 会话索引从文件 birthtime 补进 SessionSummary——**契约纯增量**。文本筛选行退役（⌘K 覆盖搜索）；Expand-all 死钮删除。
- **右键菜单（九项）**：Pin task / Rename task / Archive task / Mark as Unread(↔Read) / ─ / Reveal in Finder / Copy task path / Copy session file path / Copy session ID / ─ / View call trace——分组与顺序对照 ZCode 实拍；无 Pi 语义的 ZCode 项（标记未读除外：本批已定义其语义）不做。
- **归档**：会话级本地偏好；行悬停归档钮**临时替换点槽**（零重叠零位移）；Trash 死钮接成归档列表视图（侧栏换装，文件浏览器模式先例）+ 一键恢复；置顶可归档（隐含取消置顶）；归档过滤只作用于侧栏列表投影——⌘K 仍可达（延续"隐藏永不使会话不可达"不变式）；会话文件零改动。
- **调用轨迹 tab**：entry = **一次模型调用**——输入节（自上一 assistant 消息以来的 user / 工具结果块）+ 输出节（思考 / 助手文本 / 工具调用块，工具调用行带工具名 chip 与调用 id）；块类型六种。host 侧从会话 jsonl 条目流纯函数推导载荷；usage 列（IN/OUT tokens、时长）按 ADR-0002 从每条 assistant 消息 usage 推导——**契约纯增量**（trace 请求/数据/增长推送；usage 缺席优雅降级为只显时间戳）。**活跟随**：复用 follow 通道语义，文件增长即重推导推送。头部六钮：搜索（计数 + ↑↓× 导航）/ 块型开关（六项）/ 全部展开↔全部收起（**默认全展开**）/ 打开所在目录（会话 jsonl）/ 刷新 / 关闭；长块就地截断 + 展开钮。头部统计行 = 调用数 · 总 token · 模型（可推导时）。数据源如实原则：轨迹显什么 = Pi 会话文件实际记录了什么（无 ZCode 式标题生成后台调用；SDK 内部 system prompt 不落盘，"系统提示词"块通常缺席）。
- **性能预算**：默认全展开是重 DOM——轨迹渲染必须复用 memo 基建；实测超预算时对块内容做窗口化/懒展开，实施会话给实测数字。
- **术语**：未读（Unread）/ 调用轨迹（Call Trace）/ 归档（Archive）/ 最近关闭的标签页（Recently Closed Tabs）随票入 CONTEXT.md。
- UI 文案全英文（词汇表约束不变）。

## Testing Decisions

- 延续仓库原则：**好测试只测外部行为**——给定契约事件流 / 字节流 / 输入快照，断言状态与可见输出；不测内部调用序列。
- **零新缝**，全落在 1.1 已验收的四缝：
  - **Seam-1 表驱动 vitest**：侧栏行选中投影（focus/follow/idle 三态）、状态点未读态扩展（既有 `sidebarDotState` 套件加优先级用例）、未读推导（水位/手动覆盖/回合粒度/归档排除）、归档过滤（"隐藏永不使会话不可达"不变式，`filterHiddenGroups` 先例）、排序/视图纯函数（sessions-group 套件扩展）、面板 tab 框架（多身份 open/close/activate/最近关闭栈，panel-model 先例）、键位解析（`event.code` 表驱动）、trace 载荷构建器（fixture jsonl → 期望 per-call 载荷，含 usage 缺席降级）、trace 渲染状态（块型开关/展开收起/搜索计数）。
  - **host-contract smoke**：`createdAt` 字段、trace 请求/数据/增长推送往返、纯增量断言（既有消息不改名不删除）。
  - **Electron smoke**：Follow 选中高亮、侧栏拖宽 + 持久化、四键位、预览多 tab 开关 + 最近关闭、右键菜单动作（Finder reveal 断言 IPC 触发）、未读自动置位/聚焦清除、trace 打开→条目断言→活跟随增长。
  - **Visual harness**（人工关卡）：置顶行悬停几何探针（pin x 不变）、筛选下拉、右键菜单、轨迹三态（全展开/全收起/搜索）、预览多 tab、预览块卡片。
- 先例：chat-reducer / sessions-group / session-registry / dock-model / panel-model / turn-collapse / file-browser 套件；`visual:multi` / `visual:transcript` / `visual:approval` 关卡；票 15 的 DOM 几何测量 dump（密度探针）为置顶行几何探针先例。
- 人工关卡沿用 1.0/1.1 惯例：每票验收 = "敢日常真用"；性能票以实测 flamegraph 前后对比为准；样式对照 ZCode 实拍（证据链见 Further Notes）。

## Out of Scope

- ZCode 右键菜单中的分屏打开、前往配置、反馈问题（无 Pi 语义）；ZCode 式标题生成等后台调用（Pi 会话文件不含此类数据，轨迹如实呈现）。
- 会话删除（归档 ≠ 删除；删除维持范围外）；归档的批量操作（逐条恢复即可）。
- 轨迹的编辑 / 重放 / 导出（只读检查器）；轨迹的跨会话聚合视图。
- ⌘K 命令面板升级（操作/文件搜索——findings 观察项，本批不做）。
- 双向接管他端会话、同一会话两端并发写仲裁（维持范围外）；深色主题、Browser 标签页、MCP 管理面板（维持 1.0 范围外）。

## Further Notes

- **工单依赖提示（/to-tickets 切票时用）**：多文件 tab 框架是 Trace tab 的前置件（tab 身份模型先扩）；性能票的 memo 基建是 Trace 默认全展开的性能前置；createdAt 契约先行于消费它的排序视图。键位重映射、置顶行、Show more 对齐、预览 chrome 均可独立先行。
- 取证链：`.scratch/compare/` 新增九帧 ZCode 实拍（z-tab-dropdown / z-filter-menu / z-context-menu / z-session-hover-archive / z-trace-header / z-trace-search / z-trace-block-toggles / z-trace-expanded / z-trace-collapsed）；ZCode 会话库只读结论：未读为本地态（session 表无未读字段）。
- 版本事实：TUI 全局 pi 0.84.2 / 内嵌 SDK 0.84.3（ADR-0005 锁定）不变；互通冒烟须持续通过。
- ADR 检查：本批无 hard-to-reverse / surprising / real-trade-off 三条全中的决策（多文件 tab 是既有 panel-model 的增量扩展；未读/归档是既有本地偏好模式复用）——不落新 ADR。

## Comments

- 2026-09-02 (requirements intake): 十二项需求全部经 /grill-with-docs 两轮十问定稿——Q1 选中跟随视图 / Q2 侧栏 240–520 持久化 + panel 一并 / Q3 实测守门口径 / Q4 多文件 tab 完全 parity / Q5 pin 行尾定宽槽 / Q6 归档落位与语义 / Q7 右键九项 + 未读进状态点 + 调用轨迹转正（操作者纠正"调用轨迹无语义"误判，实拍为证）/ Q8 筛选下拉四项 / Q9 未读行为规则 / Q10 轨迹活跟随 + 头部六钮（搜索/块型开关/展开收起默认全展开/所在目录/刷新/关闭）。
- 2026-09-02 (分类记录)：既有交互缺陷 2（#1 选中、#9 对齐）；性能缺陷 1（#3）；已豁免项转正 1（#6 预览 chrome）；全新需求 8（#2 拖宽、#4 多 tab、#5 键位、#7 置顶行、#8 筛选、#10 菜单+归档、#11 未读、#12 轨迹）。
- 2026-09-02 (缝确认)：零新缝，沿用 1.1 四缝（Seam-1 / host-contract smoke / electron smoke / visual harness），已向操作者报备无异议。
