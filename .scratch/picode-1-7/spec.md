# PiCode 1.7 — 子智能体供面 × MCP 管理 × 回合时间序 × 拖拽重排 × 作曲家修缮 × 技能泡 × 应用图标 × 双态预览 × 队列修缮 × 一键折叠 × 七缺陷

Status: ready-for-agent

本 spec 覆盖工单 81 起（同目录 `issues/`，编号全局连续；80 已被 1.6 批消耗）。取证 = 操作者 2026-09-17 真实使用报痛 17 条（含两条改判、一条加码）+ 会话内实拍帧 + main 源码逐项核因（file:line 全录于 `intake-grilling.md`）+ Pi 包只读取证（pi-mcp-adapter 2.34.0 / pi-subagents 0.68.0 的 README/docs）+ ZCode bundle 只读 i18n 提取（子智能体卡全键表）+ MCP 配置文件全机实查；全部取舍经 /grill-with-docs **四轮二十问（Q1–Q20）**定稿（全记录见 `intake-grilling.md`）。术语遵循 `CONTEXT.md`。

## Problem Statement

v1.6.0 验收后的真实使用判定——**七处缺陷、四处交付行为修订、一处清理、六处全新供面**（含一项 1.5 出局裁决的前提变化重开）：

- **回合信息面失真**：回合文件条在回合进行中就出现（应落定才出）；live 流式期间「最新文本块」被提升为临时正文、下一文本块开始又被降级灰化——轮换式重排违背时间顺序直觉；已发送消息看不到附带过的图片；Edit 重发不还原刚发消息的图片（live 路径缺陷）。
- **子智能体不可见**：装了 pi-subagents 后 PiCode 无任何子代理可见性与控制（TUI 有 FleetView + fleet 检查器；ZCode 有目录卡 + 侧栏对话）；运行中的后台子代理在 GUI 里完全不设防。
- **MCP 无管理面**：装了 pi-mcp-adapter 后无 GUI（TUI 有 /mcp 全管理）；1.5「MCP 管理出局」的依据（Pi 不支持 MCP）经实查为「不内建、官方包路径」——前提已变，操作者确认重开。
- **Composer 体验簇**：输入内容多时新行被附件图片遮盖；展开钮遮住输入框滚动条；图片无法放大确认；展开/收起无动画；点击按钮后焦点滞留（橙色圈 + Enter 被按钮吃掉、不发送）。
- **侧栏与导航**：工作容器折叠/展开时锚定行为不定（观感怪）；发送消息不落底（排队注入路径完全不滚）；侧栏 ⋮⋮ 是幽灵图标而 ZCode 同位是真拖拽句柄；titlebar ‹ › 是写死 disabled 的死钮；History 下拉点开后再点不收（票 70 同构竞态）。
- **表格压缩**：markdown 表格压在 360px 内内滚才能看全（ZCode 参照实为完整展示）。
- **技能调用显示**：只发技能时用户泡是空灰盒；技能使用行在容器体内、落定折叠即被吞——调用了什么技能在最终布局里不可见。
- **应用图标缺失**：全仓无任何自定义图标（无 icns/icon 资产、打包脚本无 icon 选项）——Dock 里是 Electron 默认图标。
- **侧栏预览缺渲染**：SVG/HTML 文件标签只有源码无渲染；图片二进制直接拒显——markdown 是唯一有渲染/源码双态的类型。
- **侧栏空壳**：所有 tab 关闭后面板残留一个空壳选择页，要手动折叠。
- **queue 面板**：排队行边框与 composer 卡边框重合（截图实证）；排队消息无 Edit，带图的改不了字只能全清重打。
- **侧栏折叠聚合**：多个项目组时只能逐组点击折叠（票 39），无一键收起。
- **working 状态弱**：live 时只有容器 header 左侧一个小转环，展开态底部无指示、两处都不够显眼。
- **运行中重命名被拒**：agent 运行时重命名会话报错 toast；TUI 的 /name 运行中可用。
- **终端不聚焦**：⌘J/终端钮打开终端后焦点不进去，要再点一下。
- **新会话卡片慢**：新文件夹建会话，侧栏分组与卡片出现非常慢；ZCode 秒出。
- **Working 计时切换清零**：置顶会话 A 运行中切到 B 再切回，Working 计时从 1s 重数（所有切换路径通病）。
- **Worked 无时长**：回合结束后不显示工作了多久（重放回合恒无；本视图流式回合切回后也丢）——时长可从条目时间戳派生而不显。
- **双端包安装互通**：要求任一侧（TUI/PiCode）安装 pi packages 两侧都直接能用；实测缺口 = TUI 安装后 PiCode Packages 列表缓存不自动反映。

## Solution

三十一项需求（R1–R25）加六条 Round 10–13 增补（R26–R31），全部对齐实证参照（ZCode 实拍帧/bundle 键表 / Pi 包文档 / 会话记录形态）：

0. **回合信息面三修**：文件条 settled-only（R1）；live 回合纯时间序单流、落定态维持「最终正文+折叠容器」的 ZCode 构图（R15）；发送消息气泡渲染图片缩略图（R17，与 R14 同增量）。
1. **子智能体供面（R5）**：侧板「Subagents 目录 tab」（Running/Ended 两段、状态徽标、Show 20 more；父会话记录重放为主源 + async 工件 live 增补；嵌套只显顶层）→ 点击行开「子代理对话 tab」（一子代理一 tab：运行中可 steer、已结束只读）；停止钮带确认框；侧板开合钮运行计数徽标。host 经 pi-subagents 的 in-process RPC 桥接（additive 增量）。
2. **MCP 管理（R3+R4，拆两票）**：设置窗 MCP 节——全局/项目双卡（Skills 同款）、来源徽标、有效配置合并视图、启停（adapter 同语义写 `.pi/mcp.json` disabled 标志）、增改删 server（写 `/mcp setup` 的两个正规目标）、**OAuth 授权流**（浏览器回调自动完成 + 手动粘贴兜底；凭据零触碰）；状态投影按聚焦会话的 adapter 快照（additive 增量），懒启动不因查看而连接。
3. **Composer 簇**：图片永不遮盖新行（R7，复现定位先行）；展开钮让位滚动条（R8）；图片放大预览浮层（R9，退出=空格/❌/Esc/遮罩）；展开收起动画（R10）；按钮焦点纪律——激活后 blur 归还 composer、focus 圈仅 Tab 键盘可见（R16）。
4. **侧栏与导航**：容器折叠锚定规则（R6：离底=栏头不动、吸底=底不动）；发送落底——sendPin 改闩、四路发送全覆盖（R13）；侧栏拖拽重排（R11：组内会话序+组间序、Manual 第三排序项、组行 grip 转正句柄、Timeline/置顶不拖、跨项目移动=红线不做）；删 titlebar ‹ ›（R12）。
5. **表格与杂项**：表格完整展示（R2：去 cap、删 preview 浮层、工具栏留复制/CSV/TSV）；Edit 图片 live 还原（R14：user_message echo 增图片部件，additive）；History 点不收修复（R18：票 70 同款豁免）。
6. **技能泡重构（R19）**：用户泡成为组合块——技能渲染（有技能时）+ 用户文本（有时）+ 图片缩略图（R17）；skill-only 空灰盒消失；容器体内技能 marker 行退役——技能故事由泡承载（容器外，live/落定常驻）。
7. **应用图标（R20）**：V2 定稿——黑 squircle + 白几何斜体 π + 品牌橙终端光标块（家族形 + 区分记号）；SVG master 归档 + icns/png 全尺寸 + 接入打包链与 dev Dock。
8. **双态预览（R21）**：SVG（img 静态渲染，脚本不执行）与 HTML（sandboxed iframe，带脚本、帧隔离、无 Node）像 markdown 一样渲染/源码双态；常见图片（png/jpg/gif/webp）从拒显改直显；切换 UI 复用 markdown 的 Rendered/Source segmented control。
9. **零标签自动折叠（R22）**：右侧栏所有 tab 关闭后面板自动折叠；重开时零 tab 显既有 tab 选择页；深链自动展开不回归。
10. **队列修缮（R23）**：queue 行与卡边分离（纯 CSS）；steer/follow-up 行内 **Edit 钮**（移除该条 + composer 预填原文+原图）与每行 × 删除；host 侧镜像 + clear/requeue 舞步实现（additive op）；全局 Clear 保留。
11. **一键折叠（R24）**：Projects 分区行常驻 Collapse all / Expand all 双钮；各组形状记忆语义不破；Timeline 隐藏、置顶区不受影响。
12. **转环增强（R25）**：live 展开态容器体底部新增同款转环（与顶 header 镜像）；折叠态维持 header 单环；两处增强可见性（更大/强调色——visual 校准）；仅 live，FollowView 同规。
13. **运行中重命名（R26）**：移除 handleRename 的 settled 守卫（TUI parity）——运行中可改名，session_renamed + 索引刷新照旧。
14. **终端即聚焦（R27）**：⌘J/终端钮打开后焦点立即进 userTerm；桥接同框切回终端同样聚焦。
15. **新卡片秒出（R28）**：create 时乐观注入占位会话卡/分组（registry 合并），session_created 对账替换；失败移除 + toast 如实。
16. **计时跨切换不丢（R29）**：Working 计时从回合锚点时间戳派生（票 61 口径迁移），重挂载/四种切换组合不归零；落定冻结与重放降级照旧。
17. **Worked 时长显示（R30）**：落定回合统一在 chevron 右侧显时长（首末条目时间戳派生——含重放回合；票 14 无时长规则修订）；live 的 Working · Ns 内联位置不变。
18. **双端包安装互通（R31）**：Packages 节挂载/设置窗打开时 force 刷新（消 TUI 安装后的缓存盲区）+ 双端验证矩阵（PiCode 装→TUI 用、TUI 装→PiCode 用；真实包现成测试对象）+ 安装成功文案注明「新会话生效」。

## User Stories

### R1 文件条 settled-only

1. As an operator reading a live turn, I want the file-changes bar hidden while the turn runs, so that the always-visible segment stays calm while tools stream.
2. As an operator, I want the bar to appear at its final position the moment the turn settles, so that file changes are visible without reflow during the run.
3. As an operator who stops the agent mid-turn, I want the bar for files already changed, so that partial work stays honest.
4. As an operator viewing a failed turn, I want the bar for changes made before the failure, so that outcomes never hide edits.
5. As an operator in FollowView, I want the same settled-only rule, so that both views behave identically.

### R2 表格完整展示

6. As an operator reading a long table, I want it rendered at natural height, so that I never scroll inside a compressed box.
7. As an operator with a wide table, I want horizontal scrolling preserved, so that columns stay readable.
8. As an operator, I want the now-redundant preview overlay and its eye/expand buttons removed, so that the toolbar stays honest (copy / CSV / TSV).
9. As an operator scrolling a long transcript, I want tables flowing inline, so that the page scroll reads naturally.

### R3 MCP 节——配置管理

10. As an operator with globally configured MCP servers, I want a settings section listing them with source badges, so that I can see what Pi will load without the TUI.
11. As an operator with project-level MCP config, I want a separate project card, so that global and project layers stay distinct.
12. As an operator, I want each server's effective config merged across layers with its winning source visible, so that precedence is not a mystery.
13. As an operator, I want to enable/disable a server, so that I can switch a server off without deleting its definition.
14. As an operator, I want to add a server through a form, so that I don't hand-edit JSON.
15. As an operator, I want to edit and remove server entries, so that config stays maintainable.
16. As an operator adding or editing, I want writes to land in the correct config layer (project-local or user-global), so that the adapter's own semantics are respected.
17. As an operator with an OAuth server, I want an Authenticate action that opens the system browser and completes via the local callback, so that auth flows like the TUI.
18. As an operator behind a gateway where the local callback cannot complete, I want a manual callback-URL paste fallback, so that authorization still finishes.
19. As an operator, I want OAuth credentials to stay inside the adapter and the system keychain, so that PiCode never touches secrets.
20. As an operator, I want an open-config-file entry per layer, so that I can inspect the raw JSON when needed.
21. As an operator with configs originally from other host tools, I want PiCode to never write those external files, so that other tools stay untouched.
22. As an operator, I want config edits persisted exactly where the adapter reads them, so that new sessions pick changes up without divergence.

### R4 MCP 状态投影

23. As an operator, I want each server's connection status (connected / failed / needs-auth / not-connected / disabled) shown, so that I can diagnose without the TUI.
24. As an operator with a focused session, I want status from that session's adapter snapshot, so that what I see reflects a real runtime.
25. As an operator with no active session, I want the status area to honestly show no data, so that nothing invents state.
26. As an operator, I want lazy servers to stay disconnected when I merely view the page, so that viewing has no side effects.
27. As an operator, I want per-server tool counts, so that I know what each server contributes.

### R5 子智能体供面

28. As an operator whose session spawns subagents, I want a directory tab listing running and ended subagents, so that delegation is visible at a glance.
29. As an operator, I want Running and Ended sections with an honest empty state, so that active work stands out.
30. As an operator, I want a status badge per subagent, so that health is readable without opening it.
31. As an operator with many ended subagents, I want "Show 20 more" paging, so that the list stays bounded.
32. As an operator reopening a session, I want the directory rebuilt from the session file, so that history survives restarts.
33. As an operator with live background runs, I want the directory reflecting live state from run artifacts, so that running work is current.
34. As an operator with nested fanout, I want top-level entries with a folded nested count, so that the list stays flat and readable.
35. As an operator clicking a directory row, I want a conversation tab named by the subagent's task, so that I can read its transcript in context.
36. As an operator juggling several subagents, I want independent tabs with close buttons, so that inspection is parallel.
37. As an operator watching a running subagent, I want its transcript updating live, so that progress is followable.
38. As an operator wanting to redirect a running subagent, I want to send a message from the tab composer (steer), so that guidance reaches the child without stopping it.
39. As an operator whose steer fails to deliver, I want an honest failure receipt, so that I know the message did not land.
40. As an operator viewing an ended subagent, I want a read-only transcript, so that finished work is inspectable without risk.
41. As an operator with a runaway subagent, I want a stop button requiring confirmation, so that I never halt work by accident.
42. As an operator working with the side panel closed, I want a running-count badge on the panel toggle, so that active delegation is still visible at a glance.
43. As an operator, I want foreground subagent runs to keep their existing tool cards in the main chat, so that nothing regresses.

### R6 容器折叠锚定

44. As an operator toggling a container mid-transcript, I want the clicked header to stay visually fixed, so that the row never jumps.
45. As an operator toggling while pinned at the bottom, I want the view to stay glued to the bottom, so that live reading is undisturbed.
46. As an operator in FollowView, I want the same anchoring rule, so that behavior is uniform.

### R7 composer 图片遮盖修复

47. As an operator typing multi-line text with images attached, I want new lines never covered by the attachment strip, so that I can always read what I type.
48. As an operator at the input height cap, I want internal scrolling with a visible caret, so that typing stays predictable.

### R8 展开钮与滚动条共存

49. As an operator scrolling a full input, I want the scrollbar fully visible and draggable, so that the expand button never blocks it.

### R9 图片放大预览

50. As an operator with attached images, I want to click a thumbnail to see it enlarged, so that I can verify what I am sending.
51. As an operator in the preview, I want to exit via Space, the ✕ button, Esc, or clicking the backdrop, so that closing is always at hand.

### R10 展开/收起动画

52. As an operator toggling composer expand, I want a smooth transition, so that the motion matches the sidebars' polish.

### R11 侧栏拖拽重排

53. As an operator organizing a project's sessions, I want to drag sessions into a preferred order, so that my workflow order sticks.
54. As an operator with several projects, I want to drag project groups to reorder them, so that important projects sit on top.
55. As an operator who drags once, I want the sort to switch to Manual (visible in the filter dropdown), so that the mode change is explicit.
56. As an operator switching back to Updated/Created, I want automatic sorting to apply again, so that time order is always one click away.
57. As an operator who restarts the app, I want manual orders persisted, so that curation survives.
58. As an operator in Timeline view, I want no dragging, so that chronological order stays meaningful.
59. As an operator with pinned sessions, I want the pinned block excluded from dragging, so that pin semantics stay separate.
60. As an operator with dead-cwd gray rows, I want them draggable within their group, so that ordering is uniform.
61. As an operator, I want reordering to never touch session files, so that the red line holds.

### R12 删除幽灵箭头

62. As an operator, I want the dead back/forward buttons removed from the titlebar, so that no ghost chrome remains.

### R13 发送落底

63. As an operator sending from a scrolled-up position, I want the view to land at the bottom, so that the new turn's Working container sits right above the composer.
64. As an operator sending while the agent runs, I want the same bottom behavior when the queued message injects, so that all send paths behave identically.
65. As an operator scrolling upward during the auto-travel, I want my gesture to win immediately, so that the wheel-overrides rule is preserved.

### R14 Edit 图片 live 还原

66. As an operator stopping a run and editing my just-sent message, I want the original images restored in the composer, so that edit-resend never loses attachments.
67. As an operator editing a steer/follow-up message, I want its images restored too, so that every sent-message type behaves the same.

### R15 live 回合纯时间序

68. As an operator watching a live turn, I want text blocks inline in chronological order between tool calls, so that the stream reads top-down truthfully.
69. As an operator, I want no mid-turn answer promotion or demotion carousel, so that content never jumps around.
70. As an operator after the turn settles, I want the final answer below the collapsed container, so that the settled ZCode layout is preserved.
71. As an operator with a pending approval mid-turn, I want it inline where its tool would appear, so that approval context stays chronological.
72. As an operator in FollowView, I want the same live chronology, so that both views agree.

### R16 按钮焦点纪律

73. As an operator clicking any button, I want focus returned to the composer, so that Enter always sends.
74. As an operator picking from menus by keyboard, I want focus back in the input afterwards, so that the next Enter never re-triggers the chip.
75. As an operator navigating by Tab, I want the focus ring visible only then, so that mouse flows show no rings.

### R17 发送气泡图片缩略图

76. As an operator who sent images, I want thumbnails in my sent bubble, so that attachments are visible in the transcript.
77. As an operator reviewing old sessions, I want thumbnails in replayed messages, so that history shows attachments.
78. As an operator clicking a sent-bubble thumbnail, I want the same preview overlay, so that enlarging works uniformly.

### R18 History toggle 修复

79. As an operator with the History dropdown open, I want clicking History again to close it, so that toggle semantics hold.
80. As an operator, I want outside clicks and Esc to close it as before, so that dismissal paths are unchanged.

### R19 技能泡重构

81. As an operator who sends only a skill, I want the bubble to render the skill invocation inside it, so that no empty box appears.
82. As an operator who sends a skill with a message, I want the bubble to show both the skill rendering and my text, so that the invocation and my words read together.
83. As an operator reading a settled turn, I want the skill invocation visible outside the collapsed container, so that what was invoked is never hidden.
84. As an operator, I want the skill marker absent from the container body, so that the invocation is not shown twice.
85. As an operator copying a skill message, I want Copy to carry my own words as before, so that copy semantics stay unchanged.

### R20 应用图标

86. As an operator, I want PiCode to have its own app icon, so that the dock and task switcher no longer show the Electron default.
87. As an operator with ZCode in the same dock, I want an icon in the same minimal family form yet distinct at a glance, so that the two companion tools read as a family without confusion.

### R21 SVG/HTML/图片双态预览

88. As an operator opening an SVG from a tool call, I want it rendered by default with a source toggle, so that I see the image without leaving the app.
89. As an operator inspecting SVG markup, I want the source view with highlighting, so that I can read and check the code.
90. As an operator opening an HTML report, I want it rendered with its styles and inline scripts inside a sandboxed frame, so that generated reports display fully and safely.
91. As an operator inspecting HTML markup, I want the source view, so that I can read the code.
92. As an operator opening a png/jpg screenshot, I want it displayed as an image, so that binary files are not dead ends.
93. As an operator, I want the Rendered/Source switch in the same place as markdown's, so that preview behavior is uniform across file types.

### R22 侧栏零标签自动折叠

94. As an operator who closes the last side-panel tab, I want the panel to collapse automatically, so that no empty shell lingers in the layout.
95. As an operator reopening the panel, I want the tab picker when no tabs are open, so that restarting is one click away.
96. As an operator deep-linking a file or trace, I want the panel to open as before, so that the new behavior never blocks deep links.

### R23 queue 布局修复 + 排队消息 Edit

97. As an operator with queued steer messages, I want the queue rows visually separated from the composer card edges, so that no borders overlap.
98. As an operator with queued follow-up messages, I want the same clean layout, so that both queue kinds read well.
99. As an operator who queued a message with images, I want an Edit button on the queue row, so that I can revise it before injection.
100. As an operator editing a queued message, I want text and images prefilled into the composer and the entry removed from the queue, so that resending never duplicates.
101. As an operator who queued the wrong message, I want a per-row remove button, so that I can drop one entry without clearing all.
102. As an operator, I want the global Clear to keep working, so that bulk dismissal stays one click.

### R24 一键折叠所有分组

103. As an operator with many project groups, I want a Collapse-all button, so that the sidebar calms in one click.
104. As an operator, I want an Expand-all companion, so that restoring is equally quick.
105. As an operator, I want group shape memory respected by the bulk actions, so that Show more positions survive the round trip.
106. As an operator in Timeline view, I want the bulk actions hidden, so that the controls never appear where they do nothing.

### R25 working 转环增强

107. As an operator watching a live turn with the container expanded, I want a spinner at the bottom of the container body too, so that "still working" reads wherever I look.
108. As an operator with the container collapsed, I want the header spinner kept in place but clearly visible, so that the working state reads at a glance.
109. As an operator, I want both spinners more prominent (larger, accent-colored), so that the working state never blends into the transcript.

### R26 运行中重命名

110. As an operator renaming a session while the agent runs, I want the rename to succeed like the TUI's /name, so that I don't hit an error toast.

### R27 终端即聚焦

111. As an operator opening the terminal with ⌘J or the titlebar button, I want the input focus in the terminal immediately, so that I can type without an extra click.

### R28 新会话卡片秒出

112. As an operator creating a session in a new folder, I want the group and card to appear instantly, so that the sidebar keeps up with ZCode.
113. As an operator whose session boot fails, I want the placeholder card removed with an honest toast, so that no ghost entry lingers.

### R29 Working 计时跨切换不丢

114. As an operator switching between running sessions, I want each session's Working timer to keep counting from where it was, so that elapsed time never resets.
115. As an operator, I want the same continuity across pinned and unpinned combinations, so that all switch paths behave identically.

### R30 Worked 时长显示

116. As an operator reading a finished turn, I want the worked duration shown right of the container chevron, so that I know how long the turn took.
117. As an operator reopening old sessions, I want replayed turns to show their derived duration too, so that history is not duration-blind.

### R31 双端包安装互通

118. As an operator installing a pi package from PiCode, I want the TUI to pick it up on its next start, so that both faces share one package truth.
119. As an operator installing a package via the TUI, I want PiCode's Packages section to reflect it immediately, so that I never see a stale list.
120. As an operator who just installed a package, I want an honest note that new sessions load it, so that running sessions' behavior is not a mystery.

## Implementation Decisions

- **R1 文件条 settled 门**：回合分组的文件条聚合仅在**落定回合**产出（live 回合不再携带），渲染门随分组模型走——live 全程无条、agent_end 落地即原位出现；Stop/中断/出错回合照出（更改是事实投影）；FollowView 同规则。零契约。
- **R2 表格完整展示**：删除表体高度 cap 与 preview 浮层路径；工具栏收敛为 复制/CSV/TSV；宽表横向滚动保留。「表格 fullscreen 维持不做」豁免同步维持。
- **R3 MCP 配置管理**：设置窗新 MCP 节（Skills/Packages 同级）——全局卡/项目卡（Skills 双卡同款）；配置读模型按 adapter 的多层优先级解析（user-global shared → Pi 全局覆盖 → 项目 .mcp.json → Pi 项目覆盖）并给出「有效配置 + 胜出来源」合并视图；启停 = 写项目本地 Pi 覆盖层的 disabled 标志（adapter `/mcp enable|disable` 同语义）；增改删的写入目标 = adapter `/mcp setup` 的两个正规目标（项目 `.mcp.json` / 用户全局共享配置）；**OAuth 流** = 经会话 host 桥接触发 adapter 授权 → 系统浏览器打开 → localhost 回调自动完成 → **手动粘贴回调 URL 兜底输入**（网关场景）；凭据全程只存在于 adapter/系统钥匙串，PiCode 零凭据读写；外部 host 工具配置 = 只读兼容发现、绝不写（adapter 同纪律）；每层提供打开配置文件入口。
- **R4 MCP 状态投影**：host inline extension 订阅 adapter 的版本化状态快照事件（进程内事件总线），转发为**聚焦会话作用域**的契约事件；无活跃会话如实显无数据；查看状态绝不触发懒启动 server 连接（数据源如实）。**additive 契约增量：host→renderer MCP 状态事件**（实施时报备入 host-contract smoke）。与 R3 拆两票（Q4 拍板）。
- **R5 子智能体供面**：host inline extension 桥接 pi-subagents 的 in-process RPC（status / steer / stop + fleet DTO）与 async 生命周期事件（started/complete/child-status）；目录投影 = **纯模型**——父会话文件中 subagent 工具调用记录重放为主源（ADR-0002 精神：会话记录唯一事实源、重启可重建）+ async 工件 status.json 作 live 增补（tmpdir 工件会清理、不作历史源）；状态徽标七态词汇（Running/Waiting/Blocked/Completed/Failed/Cancelled/Lost）由运行态投影映射（映射表票内定）；Show 20 more 步进；嵌套只显顶层折叠计数。侧板新目录 tab + 每子代理一对话 tab（以任务命名；转录复用主转录组件族；底部 composer）：运行中发送 = steer（acknowledged 回执如实上屏）、已结束只读；停止钮 = 运行行方形钮 + **确认框** → RPC stop；前台子代理停止 = abort/dispose 语义。侧板开合钮运行计数徽标（纯派生）。**additive 契约增量：子代理桥接事件与控制命令**（实施时报备入账）。范围外：agent 定义管理、resume 复活、嵌套展开、跨会话 fleet。
- **R6 容器锚定**：确定性规则——视口离底：栏头视觉锚定（切换前后按栏头位置差校正 scrollTop）；吸底态：保持贴底。收敛进既有滚动纯模型族（scroll-stay 同目录），ChatView/FollowView 同规。
- **R7 图片遮盖**：composer 输入高度投影 × 附件条的布局修正——任何换行不被附件遮盖；**dev app 复现定位 = 票内第一验收项**。
- **R8 滚动条共存**：滚动条完整可见可用（scrollbar-gutter / 动态让位等形态票内裁量）；展开钮位置（票 58 批准位）不动。
- **R9 图片预览**：全屏遮罩预览（继承被删表格预览的遮罩模式）；退出 = 空格 / 右上角 ❌ / Esc / 遮罩点击，四种并存。
- **R10 展开动画**：composer 展开/收起高度过渡对齐侧栏/侧板动画；prefers-reduced-motion 直切（既有惯例）。
- **R11 拖拽重排**：分组纯模型扩展——组内行序 + 组序的手动顺序（持久化偏好，会话文件零改动）；排序词汇增 **Manual**：首次拖拽自动切入，Updated/Created 可切回（手动顺序保留不生效）；组行 ⋮⋮ 转正为拖拽句柄、Projects 分区行 grip 删除、会话行本体拖拽（句柄形态票内裁量）；Timeline 视图与置顶区不参与；灰行可拖；拖拽动画/放置指示对齐 ZCode 构图；空组 drop zone 不做；**跨项目移动会话不做**（会话项目身份 = 文件头 cwd——改它 = 写 Pi 会话文件 = 红线）。
- **R12**：删除 titlebar 两枚 disabled 占位钮；视图导航历史不做（若日后要做单独立项）。
- **R13 发送落底**：自发送闩改造——sendPin 从单次消费改为**到达底部才清**的闩；覆盖 idle 发送 / steer / follow-up / **排队注入**四路；闩生效期间用户上滑立即接管（票 75 方向感知语义不回退）。
- **R14 Edit live 图片**：host `user_message` echo 增图片部件（steer/follow-up echo 同修）→ reducer 落账 live 条目 → Edit 预填即时带图。**additive 契约增量：user_message 事件 images 字段（缺席 = 无图消息照常）**——与 R17 共用。
- **R15 live 纯时间序**：回合分组模型修订——live 回合渲染为单一时间序流（全部文本块内联于工具间、随容器流式；无「最新文本块 = 临时正文」提升、无常显段）；落定态维持现状（最终正文提至容器下方 + 容器折叠——ZCode 构图）；审批卡内联于其工具将现之位；ChatView/FollowView 同规；「回合正文/常显段/过程叙述」词条随票修订（live 语义移除、落定语义不变）。
- **R16 焦点纪律**：鼠标激活与菜单键盘选择完成后按钮立即 blur、焦点归还 composer 输入框；focus 圈仅 :focus-visible（纯键盘 Tab）呈现；全局清扫交互控件。Tab 圈保留（Q19 确认）。
- **R17 气泡缩略图**：用户气泡渲染已附图片缩略图条（回放数据已在投影中；live 靠 R14 增量）；点缩略图开 R9 预览浮层。
- **R18 History toggle**：外点关闭豁免 owning 钮（票 70 同款）或等价实现；展开态再点必收、真外点照关、Esc 照关。
- **R19 技能泡重构**：用户泡升级为组合块——技能部分（魔杖 icon + Skill + 名字，复用既有 marker 视觉）+ 用户文本部分 + 图片缩略图（R17），三部分按存在性组合；skill-only 泡内只渲染技能（空灰盒消失）；技能+文字泡内两者都渲染；**容器体内技能 marker 行退役**（不再双显——技能故事由泡承载，泡在容器外 live/落定常驻，折叠不再吞）；Copy 语义不变（拷用户原话）；Edit 动作行随泡块不变；与 R15 无冲突（泡是回合头静态块不进流）。**操作者批准的 ZCode 偏离**：ZCode 把技能渲染为容器内 work item（bundle `chat.toolCall.skill.*`），本设计由泡承载。
- **R20 应用图标**：V2 定稿（黑 squircle 微渐变 #262626→#0f0f0f + 白几何斜体 π + 品牌橙 #ec7931 终端光标块；设计资产与四案画廊在 `.scratch/picode-1-7/icon-proposals/`）——SVG master 正式化进仓库资产目录；生成 icns/png 全尺寸；接入打包链（打包脚本的 icon 选项）与 dev 窗口 Dock 图标。字形为自绘几何路径（无字体依赖）；ZCode 图标仅作形制校准参照、资产不入库（红线）。
- **R21 双态预览**：预览分类扩展——新增 svg / html / image 三类（按扩展名 + 既有文本嗅探）；渲染态实现 = SVG 用 img data-URL（img 中的 SVG 脚本不执行——静态渲染安全）、HTML 用 sandboxed iframe（allow-scripts、无 allow-same-origin、无 Node 访问，相对资源以文件所在目录为 base）、图片用 img 直显；双态 UI 复用 markdown 的 Rendered/Source segmented control；默认渲染、超限大文件回退源码（markdown 的 size 上限语义沿用）；wrap 行开关沿用「source 态才显示」规则。
- **R22 零标签自动折叠**：侧栏 openTabs 清空时面板自动折叠（开合状态在 shell 布局模型、标签在面板模型——跨模型联动的落点票内裁量）；重开 = ⌥⌘B/标题栏钮，零 tab 显既有 tab 选择页；深链 open-tab 伴随的面板自动展开不回归。
- **R23 queue 修缮**：布局 = 行与卡边分离（水平内距 + 与 textarea/footer 间距，纯 CSS 票内裁量）；行级动作 = **Edit（移除该条 + 预填原文+原图）**与每行 × 删除（同机制不预填），全局 Clear 保留；实现 = **host 侧队列镜像**（出队时记 text+images）+ clearQueue/requeue 舞步（clearQueue → 剔除目标条 → 按序重投喂剩余条、图片从镜像取、保序——SDK 0.85.1 无单条移除 API 且 queue_update 只有文本）；**additive 契约增量：host op `edit_queue_entry` / `remove_queue_entry`**（实施时报备入账）；SDK 投递与舞步间的毫秒级竞态诚实记录、smoke 验证。
- **R24 一键折叠**：Projects 分区行右侧常驻 Collapse all / Expand all 双钮（ZCode 同款动作对；筛选下拉不加）；折叠模型增聚合动作——collapse-all 全部置折叠（各组保留折叠前形状记忆）、expand-all 全部展开（恢复各自记忆形状）；仅 Projects 视图显示（Timeline 隐藏）；置顶区不受影响；无分组 no-op；形状记忆仍会话期内存级（票 39 口径不变）。
- **R25 转环增强**：live 展开态容器体底部新增同款转环（左对齐体底缘、与顶 header 镜像）；折叠态维持 header 单环位置不变；两处增强可见性（更大直径 + 强调色/不透明——参数 visual harness 校准、票内裁量）；仅 live（落定无环）；FollowView 同规。纯视觉层零契约。
- **R26 运行中重命名**：移除 handleRename 的 requireSettledSession 守卫（TUI `/name` 运行中可用 = SDK 支持运行中改名）；改名成功 session_renamed + 索引刷新照旧；smoke 加运行中改名回归。
- **R27 终端即聚焦**：dock 变可见时立即聚焦 userTerm（挂载时序 rAF/effect 票内裁量）；桥接同框切回终端同样聚焦；桥接面板可见时不抢焦点。
- **R28 新卡片秒出**：create 派发时 renderer 以已知 cwd 乐观注入占位会话（registry 合并——现有分组/排序语义生效），session_created 到达后真实 summary 对账替换；boot 失败 = 移除占位 + toast 如实；占位卡不显未知量（token/时间等），不伪装成已确认会话；索引轮询不动。
- **R29 计时不丢**：Working 计时从回合锚点时间戳派生（`now - startedAt`，票 61 的 useElapsedClock 口径迁移到容器 header——锚点 = 用户消息/首工作项条目时间戳）；重挂载/切换/折叠全路径不归零；FollowView 同规。
- **R30 Worked 时长显示**：落定回合时长 = 回合首条目 ts → 末条目 ts 派生（**票 14「回放回合无时长」口径修订**——原前提「文件不记录时长」不成立，条目时间戳必在）；落定回合统一显于 **chevron 右侧**（含重放回合；流式过的落定回合同位置）；live 的 Working · Ns 内联不变。与 R29 同派生核、同组件——**并入票 108**（票题升级「计时与时长显示」）。
- **R31 双端包安装互通**：安装路径已互通（Packages 节 `installAndPersist` = `pi install` 同代码路径、同一 settings.json packages 数组）；本票补 ①**节挂载/设置窗打开 force 刷新**（消 TUI 侧安装后的 per-dir 缓存盲区——`packages-service` 缓存无 TTL，force 现仅自家 op 触发）②**双端验证矩阵**（electron smoke：PiCode 装→settings.json 断言；TUI 装→列表反映+新会话可用；真实包 pi-mcp-adapter/pi-subagents 为现成对象）③安装成功文案注明「新会话生效」（运行中会话不热加载，两侧同语义——如实）。
- 术语随票入 CONTEXT.md：「子智能体目录（Subagent Directory）」「子代理对话（Subagent Transcript）」「Manual 排序（Manual Sort）」「图片预览（Image Preview）」「MCP 节（MCP Section）」+「回合正文/常显段/过程叙述」live 语义修订——草案见 `intake-grilling.md`。UI 文案全英文（词汇表约束不变）。

## Testing Decisions

- 延续仓库原则：**好测试只测外部行为**——给定会话快照/契约事件/DOM 坐标，断言状态与可见输出；不测内部调用序列、不测 CSS 字节。
- **零新缝**，全落既有四缝：
  - **Seam-1 表驱动 vitest**（纯模型/投影族）：R1 文件条 settled 聚合门；R19 泡组合块模型（技能/文字/图片三段按存在性组合）；R21 预览分类纯函数（svg/html/image 识别、超限回退）；R22 零标签→折叠联动；R23 队列镜像模型（edit/remove 舞步保序、图片还原）；R24 折叠聚合（collapse/expand-all × 形状记忆）；R3 MCP 配置层合并与写入目标解析；R4 状态快照投影（含无会话降级）；R5 目录投影（会话记录重放 + 工件合并 + 状态映射表 + Show 20 more + 嵌套折叠）；R6 锚定位置差数学；R11 手动顺序模型（drag 进 Manual/切回/持久化形状/Timeline 排除）；R13 闩式决策表（四路发送 × 到底 × 上滑接管）；R14/R17 live 条目图片落账（echo 缺席兼容）；R15 live 时间序分组（无提升/落定同构）；R18 toggle 状态机（若收敛纯模型）。
  - **host-contract smoke**：四个 additive 增量到时报备入账并验证旧载荷兼容（既有惯例）——R4 MCP 状态事件、R5 子代理桥接事件与 steer/stop 命令、R14 user_message images 字段、R23 edit/remove_queue_entry ops；R3 OAuth 触发链（host 侧）。
  - **electron smoke**：R1 落定出条/live 无条；R19 skill-only 泡渲染技能、技能+文字泡双段、容器内无 marker；R21 SVG 渲染态上屏 + 源码切换、HTML iframe 渲染（内联脚本探针 + 沙箱断言）、png 直显、markdown 不回归；R22 关到零自动折叠 + 重开显选择页；R23 queue 行无重合边 + Edit 预填（含图）+ 行删除；R24 collapse/expand-all 全组状态与形状记忆；R25 live 展开态底环存在 + 落定无环；R26 运行中改名成功；R27 开终端焦点即在；R28 新卡秒出 + 失败移除；R29 切回不归零；R30 落定时长含重放回合；R31 双端互通 + 挂载 force 刷新；R2 表格全高无内滚 + 浮层已删；R5 目录开合/对话 tab/steer 发送/确认停止/徽标；R6 锚定两态；R7 带图多行输入现场（**复现脚本 = 第一验收项**）；R9 预览四退出；R13 四路发送落底 + 上滑接管；R14 Stop→Edit 带图还原（live 场景——正是本次缺陷现场）；R15 live 流时间序 + 落定构图；R16 点击后 Enter 仍发送 + Tab 圈；R17 气泡缩略图 + 预览；R18 History 再点必收。
  - **visual harness**：R2 表格帧；R5 目录/对话 tab 帧（对照 z17-subagent-dir / z17-subagent-chat）；R9 预览帧；R11 拖拽指示帧；R15 live/落定两态帧（对照 pi17-container-*）；R20 图标各尺寸帧；R21 SVG/HTML 渲染帧。
- 性能红线：R5 目录 live 刷新零轮询（事件驱动）；R11 拖拽零全列表重挂载（局部移动）；R15 不增流式路径渲染次数；R16 blur 不破坏既有菜单键盘导航（票 68/69 基座）。

## Out of Scope

- 子代理：agent 定义管理（ZCode settings.subagents 对应物——builtin agents + TUI/文件自配已够）、resume 复活继续聊、嵌套子代理展开、跨会话 fleet 聚合。
- MCP：外部 host 工具配置的写入（只读兼容发现而已）；凭据查看/导出（钥匙串红线）；MCP prompts/resources 管理面（仅状态计数投影）。
- 侧栏：跨项目移动会话（会话文件头 cwd 红线）；空组 drop zone；Timeline/置顶区拖拽。
- 回合信息面：文件条撤销钮（1.1 纪律延续）；落定态布局变更（正文+折叠容器维持）。
- 表格 fullscreen（ZCode 自关，维持不做）；深色主题（持续范围外）。
- 视图导航历史（‹ › 删除后若日后要做单独立项）。
- 其余既有豁免清单全部延续（1.5/1.6 所列；见 `intake-grilling.md` 关键前提节）。

## Further Notes

- **取证链**：四轮二十问全记录、file:line 根因、两处改判（Q5 OAuth 要做、Q8③ 停止需确认框）、一处加码（Q12 拖拽重排）见同目录 `intake-grilling.md`；ZCode bundle 只读 i18n 提取（子智能体卡全键表，用后即弃）；pi-mcp-adapter / pi-subagents 包文档只读；操作者会话内贴图待操作者复制入 `.scratch/compare/`（pi17-* 前缀）。
- **R→票映射纪律**（/to-tickets 时执行）：本 spec **每条 R（R1–R18）必须映射到至少一张票**——1.3 R11 掉票教训，1.5/1.6 已在 tracker 注明并执行。
- **缝确认**（2026-09-17，随本 spec 发布报备）：零新缝——全落既有四缝（1.5/1.6 先例：复触发视为无异议）。四个 additive 契约/投影增量（R4 MCP 状态事件、R5 子代理桥接、R14/R17 user_message images、R23 edit/remove_queue_entry ops）实施时报备入账。
- **ADR 检查**：无新 ADR——R5/R4 桥接走 ADR-0003 host 架构内的 inline extension + ADR-0006 注册表框架（子代理宿主于会话 host 进程，不改进程拓扑）；R3 配置写入与 Packages 节同类（Pi 配置文件，非会话文件——ADR-0002 纪律不破）；R11/R13/R15/R16 均为既有显示/交互模型的可逆修订。
- **依赖与波次提示（/to-tickets 用）**：同文件群 A（composer 群 R7→R8→R9→R10→R16）强串行；同文件群 B（转录/回合群 R15→R1→R6→R19→R25→R29→R30）串行、R18 独立；同文件群 C（侧栏 R11 独占、R12 独立、R24 同区段）；R5 大项建议拆 2–3 票（桥接+目录 / 对话+steer / 停止+徽标）；R3/R4 拆两票（Q4 拍板）；R14+R17+R19 同渲染区段（用户条目/泡）可同票或紧邻；R9 为 R17 预览的前置；R21 独立（preview 群）；R20 独立（打包链）；R22 独立（layout/panel 模型）；R23 独立（composer+host 队列镜像——与 R14 同 host 文件弱邻接）。
- **操作者待办**：贴图原件复制入 `.scratch/compare/`（pi17-*）；实施期 dev app / smoke 遵守 dev-app serialization（每票验收项内嵌 ps 自查——1.5 起口径）；merge-ticket.sh 已含 picode-1-7（无需再补）。

## Comments

- 2026-09-17 (requirements intake → /to-spec): 17 痛点四轮二十问定稿（Q1–Q8 / Q9–Q14 / Q15–Q17 / Q18–Q20）；两处改判（Q5 OAuth、Q8③ 确认框）与一处加码（Q12 拖拽）已入册。全记录：`intake-grilling.md`。工单编号 81 起全局连续。
- 2026-09-17 (缝确认)：零新缝——全落既有四缝，已随 spec 发布向操作者报备（1.5/1.6 先例）。
- 2026-09-17 (R19 增补，Round 5)：skill-only 空泡 + 技能行被折叠吞（第 18 条痛点）；操作者细化改判 = **重构消息泡**（泡 = 技能渲染 + 用户文本组合块，容器内 marker 退役），非原推荐「删泡」。定稿见 R19；记录见 `intake-grilling.md` Round 5。
- 2026-09-17 (R20/R21 增补，Round 6)：Q22 图标选型 = **V2**（π + 橙终端光标；四案画廊 `.scratch/picode-1-7/icon-proposals/`）；Q23 SVG/HTML/图片双态预览全按推荐（HTML = 带脚本沙箱 iframe）。定稿见 R20/R21；记录见 `intake-grilling.md` Round 6。
- 2026-09-17 (R22 增补，Round 7)：侧栏零标签自动折叠（免问定稿——空壳选择页现状实锤，规则唯一）。定稿见 R22；记录见 `intake-grilling.md` Round 7。
- 2026-09-17 (R23/R24 增补，Round 8)：Q24 queue 三件套（布局修复 / 行内 Edit 带图还原 / 行删除 + additive op）；Q25 一键折叠双钮。定稿见 R23/R24；记录见 `intake-grilling.md` Round 8。**additive 增量总数更新为四项**（R23 edit/remove_queue_entry 加入）。
- 2026-09-17 (R25 增补，Round 9)：working 转环增强（免问定稿——规格操作者直给）。定稿见 R25；记录见 `intake-grilling.md` Round 9。
- 2026-09-17 (R29 增补，Round 11)：Working 计时跨切换清零（根因 = tick 计数器无锚点、重挂载归零；修法 = 票 61 锚点派生口径迁移）。定稿见 R29；记录见 `intake-grilling.md` Round 11。
- 2026-09-17 (R31 增补，Round 13)：双端包安装互通（Packages 挂载 force 刷新消缓存盲区 + 双端验证矩阵 + 新会话生效提示）——免问定稿。定稿见 R31；记录见 `intake-grilling.md` Round 13。
- 2026-09-17 (R30 增补，Round 12)：Worked 时长显示（chevron 右侧、含重放回合；票 14 口径修订）——并入票 108。定稿见 R30；记录见 `intake-grilling.md` Round 12。
- 2026-09-17 (R26/R27/R28 增补，Round 10)：运行中重命名守卫移除（TUI parity）/ 终端开启即聚焦 / 新会话乐观卡片（秒出）——均免问定稿（规格直给/机制唯一）。定稿见 R26–R28；记录见 `intake-grilling.md` Round 10。
- 2026-09-17 (R23/R24 增补，Round 8)：Q24 queue 三件套（布局修复 / 行内 Edit 带图还原 / 行删除 + additive op）；Q25 一键折叠双钮。定稿见 R23/R24；记录见 `intake-grilling.md` Round 8。**additive 增量总数更新为四项**（R23 edit/remove_queue_entry 加入）。
