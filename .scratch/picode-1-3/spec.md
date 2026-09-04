# PiCode 1.3 — 日用手感批次：面板开合动画 × Composer 空态 × History 树重塑 × 死目录会话 × 分组折叠 × 转录导航轨 × slash 退役 × 用量图表悬停

Status: ready-for-agent

本 spec 覆盖工单 38 起（同目录 `issues/`，编号全局连续）。取证 = 操作者 2026-09-03 真实使用报痛 11 条 + 实拍十四帧（已归档 `.scratch/compare/`：`pi13-*` PiCode 六帧 / `z13-*` ZCode 五帧 / `pitui13-tree` Pi TUI 对标帧）+ main 源码逐项核因 + ZCode bundle 只读行为取证（参数校准用后即弃，未复制任何资产）；全部取舍经 /grill-with-docs 两轮十三问定稿（Q1–Q13，见 Comments 与 `intake-grilling.md`）。术语遵循 `CONTEXT.md`。

## Problem Statement

1.2 验收后一段时间的真实使用判定：**功能面已齐，日用手感与完整性仍欠**——

- **没有动效语言**：⌘B/⌥⌘B/⌘J/⌥⌘J 或按钮开合三面板"凭空出现、凭空消失"（宽度 0↔Npx 瞬跳，零过渡）。
- **New Task 空态断供**：模型/思考档是灰占位，点开模型菜单是空白条；发完第一条消息真实值才出现——发送前无法选模型。
- **History 面板是终端垃圾**：`(model_change)` 噪音与正文混排、无类型标签、无树形感、工具调用整段缺席——对照 Pi TUI `/tree` 相形见绌。
- **死目录会话点开即崩**：27 个合并后 worktree 的会话仍在侧栏，点击报 "The agent host stopped running (exit code 1)"；标题还是 `<skill name="implement" locat...` 原文。
- **分组交互重复**：组行点击 = 全展开、Show more = 全展开，一个动作两种写法且没有真正的"折叠"。
- **访问菜单粗糙**：粗体与浅字完全粘连（"Full AccessRun every tool…"），三档盾牌同色无警示差。
- **幽灵按钮**：右上 ？ Help 钮无任何行为。
- **用户输入不可复制**：自己的提问没有 Copy 供面（助手回复有）。
- **长会话无导航**：没有快速跳回某次提问的供面，没有回底钮，流式期间上翻还会被新内容拽回底部。
- **slash 命令重复**：/new /tree /name /copy /model /thinking 六条在 PiCode 有更好入口却仍占 `/` 菜单。
- **用量图表哑且破**：趋势图/圆环无悬停信息（ZCode 皆有）；趋势曲线过冲突破底线。

## Solution

11 项需求，全部对齐实证参照（ZCode 实机行为参数 / Pi TUI /tree 形态）：

1. **面板开合动画（R1）**：三面板从各自停靠边 200ms ease-out 拉出/收回，宽（高）度+透明度并动，内容裁切不重排，拖拽时禁动画。
2. **Composer 空态通供（R2）**：模型菜单接 auth probe 目录（无会话可用），chip 显链式默认，无配置才落占位提示语。
3. **History 树重塑（R3）**：显示形态对齐 Pi /tree——类型标签着色、工具行入树、噪音隐藏、树形导轨；不做 TUI 键盘功能。
4. **死目录会话过滤（R4）**：cwd 不存在的会话不进索引；标题推导跳过 `<skill>` 标签。
5. **分组折叠 + 分页（R5）**：组行点击 = 折叠/展开（恢复折叠前形状）；Show more 每次 +5；Show less 一次回初始；删 caret。
6. **访问菜单打磨（R6）**：间距修复 + 盾牌三色（橙/灰/绿）；审批语义零改动。
7. **删 Help 幽灵按钮（R7）**。
8. **用户消息常驻复制（R8）**：气泡下常驻 Copy，形态对齐助手操作行。
9. **转录导航轨 + 回底钮 + 滚离保持（R9）**：左缘 tick 束（ZCode turn navigator 同型）、hover 预览气泡、点击平滑定位；滚离底部现圆 ↓；流式期间滚离保持原地。
10. **slash 退役 + 守门（R10）**：六条移出菜单；手敲拦截 toast 指路，不产生垃圾回合。
11. **用量图表悬停 + 过冲修复（R11）**：曲线钳制不破底；趋势/圆环 hover 白卡 tooltip；点击 drilldown 不变。

## User Stories

1. As a keyboard-first user, I want the left sidebar to slide out from the left edge when opened, so that panes feel physical instead of popping in and out.
2. As a keyboard-first user, I want the right side panel to slide from the right edge and the bottom dock from the bottom edge, so that every pane animates from where it lives.
3. As an impatient user, I want the open/close animation to be fast (~200ms ease-out), so that toggling never makes me wait.
4. As a polish-minded user, I want closing to animate as the exact reverse of opening, so that the motion grammar is symmetric.
5. As a smoothness-minded user, I want pane content to clip rather than squish during the animation, so that transcript text and the terminal never reflow mid-motion.
6. As a drag-oriented user, I want pane resizing to stay 1:1 with my pointer (no animation), so that drags keep the ticket-30 direct-write feel.
7. As an accessibility-minded user, I want prefers-reduced-motion to cut animations to instant, so that motion is optional.
8. As a first-launch user, I want no animation on the boot frame, so that the app does not wiggle while loading.
9. As a new-task starter, I want the model chip to show the actual default model before any session exists, so that I know what will run.
10. As a new-task starter, I want the model picker to list real providers and models in the empty state, so that choosing a model before the first message works.
11. As a new-task starter, I want the thinking chip to show the effective default level instead of a dead placeholder, so that the pre-send state is truthful.
12. As a first-time user with no model configured, I want a styled hint in the picker instead of a blank panel, so that emptiness explains itself.
13. As a prepared starter, I want a model/thinking choice made in new-task to ride into the created session, so that pre-send decisions stick.
14. As an auditor of past sessions, I want each history row labeled user: / assistant: with distinct color, so that entry types read at a glance.
15. As an auditor, I want tool calls as [bash: …]-style monospace rows inside the tree, so that the agent's work steps are visible where they happened.
16. As a reader, I want noise entries like (model_change) hidden from the tree, so that internal bookkeeping never pollutes the history.
17. As a branch user, I want tree indent guides, so that fork structure is visible at a glance.
18. As a branch user, I want click-to-navigate, per-row fork and the current marker preserved, so that existing flows survive the restyle.
19. As a desktop user, I want the tree restyled to the app's own palette and typography, so that it reads native instead of terminal-dump.
20. As a mouse-first user, I want the desktop tree to skip the TUI's keyboard features (search/label/copy/filters), so that scope stays display-focused.
21. As a worktree merger, I want sessions whose working folder vanished to stay out of the sidebar, so that dead entries can never crash the app.
22. As a cautious user, I want those filtered sessions' files untouched on disk, so that hiding destroys nothing.
23. As a multitasker, I want a live in-app session to stay listed even if its cwd disappears mid-run, so that running work is never yanked from the registry.
24. As a tidiness-minded user, I want worktree session titles derived from real message text (skipping raw skill tags), so that titles are readable.
25. As an organizer, I want clicking a project group header to collapse the whole group, so that long lists fold in one click.
26. As an organizer, I want clicking again to expand back to the pre-collapse shape (including how far I had pressed Show more), so that my expansion work survives folds.
27. As a browser, I want Show more to reveal five more sessions per click, so that expansion is gradual instead of all-at-once.
28. As a browser, I want Show less to reset the group to the initial five, so that there is a one-click way back to calm.
29. As a calm user, I want the redundant caret arrow removed from group headers, so that one control does one job.
30. As a permission-conscious user, I want breathing room between the mode name and its description in the access menu, so that rows read cleanly.
31. As a visual scanner, I want each access mode's shield color-coded (Full Access orange / Standard gray / Read Only green), so that the danger level is glanceable.
32. As a stability-minded user, I want the three access tiers' approval semantics unchanged, so that gate behavior stays exactly as trusted.
33. As a minimal-chrome user, I want the dead Help button removed from the titlebar, so that no visible control is a lie.
34. As a quote-collector, I want a persistent Copy button on my own messages, so that lifting my prompts is one click without hover hunting.
35. As a consistent user, I want the user-copy affordance styled like the assistant's actions row, so that copying feels identical everywhere.
36. As a precise user, I want Copy on my messages to carry the raw text, so that what I copy is exactly what I sent.
37. As a long-session reader, I want a rail of ticks on the transcript's left edge—one per user input—so that every question I asked is a jump target.
38. As a targeting reader, I want clicking a tick to smooth-scroll to that user message, so that I keep my bearings on arrival.
39. As a scanning reader, I want hovering a tick to preview the user input and the assistant's reply, so that I can identify the right turn without jumping.
40. As a calm reader, I want rail hover and focus changes to animate smoothly (scale/fade), so that moving along the rail feels silky.
41. As a narrow-window user, I want the rail hidden when the window is too narrow, so that it never crowds the transcript.
42. As a minimal user, I want the rail absent when a session has fewer than two user inputs, so that trivial chats stay clean.
43. As a returning reader, I want a floating ↓ button when I am scrolled away from the bottom, so that returning to the latest output is one click.
44. As an undisturbed reader, I want streaming growth to never yank me to the bottom while I am scrolled up, so that reading during a run is possible.
45. As a sender, I want my own sends to jump to the bottom, so that I always see my message and the response begin.
46. As a follow-mode user, I want FollowView left unchanged, so that the rail ships where it belongs first.
47. As a menu-hygiene user, I want the six duplicated builtins out of the / menu, so that every capability has exactly one entry point.
48. As a typist, I want typing a retired command to show a hint toast instead of sending text to the model, so that no junk turns are spent.
49. As a compaction user, I want /compact to remain in the menu, so that the one Pi-native session action stays reachable.
50. As a TUI user, I want Pi Agent's own slash commands untouched in the terminal, so that the CLI is unaffected by app-side retirement.
51. As a usage watcher, I want hovering the trend chart to show a day tooltip with per-model token totals, so that spikes are explainable.
52. As a precise watcher, I want a guide line with per-series dots on hover, so that which-day is unambiguous.
53. As a chart purist, I want curves clamped inside the chart bounds, so that no line escapes below the baseline.
54. As a share watcher, I want hovering a donut slice to show model, tokens and share, so that slices are queryable without legend hunting.
55. As a driller, I want clicks on chart and donut to keep opening drilldowns, so that hover never breaks existing flow.

## Implementation Decisions

- **面板开合动画**：三面板（左侧栏 / 右侧面板 / 底部 dock）统一 **200ms ease-out**；开合动画动画**尺寸（侧栏/面板=宽度，dock=高度）+ 透明度**；关闭终态 = 尺寸 0 + `opacity:0` + `pointer-events:none`；**双变量模式**——开合变量（关=0px）与内容真实宽度变量分离，动画期间内容**裁切不重排**（终端 xterm 免逐帧 reflow，dock 拉出时终端不闪）；**拖拽中尺寸动画禁用**（对齐票 30 的 rAF 直写手感，拖拽 1:1）；`prefers-reduced-motion` 直切；应用启动首帧不播动画。参数为 ZCode 实机校准值（见 Further Notes），非拍脑袋。
- **New Task 空态**：模型菜单消费 **auth probe 的模型目录**（复用既有 `--auth-probe` 短命 host 机制与其 IPC 通道——零新契约；main 层缓存结果，settings 扫描既有钩子）；chip 显示 = 链式默认决议（偏好 defaultModel/defaultThinkingLevel → Pi 兜底默认并标注 default → 全无配置落**底纹提示语**）；空态所选项进 pending 链，create_session 一并送达。思考档为 Pi 固定七档常量，不依赖 host。
- **History 树**：`SessionTreePayload` → 显示行序列的**纯函数**推导——类型标签（user: / assistant: 着色）、工具调用自 assistant 消息 toolCall 块推导 `[名称: 参数摘要]` 等宽行（树数据源补工具行，现状缺席）、other 类噪音条目默认隐藏、缩进导轨、叶路径高亮、行尾 fork / current 标记与点行跳转保留。**TUI 键盘功能（搜索/label/copy/filters）明确不做**（Q8）。
- **死 cwd 过滤**：会话索引扫描管线加 **cwd 存活性**维度（纯谓词、stat 结果注入表驱动）；被滤会话不进侧栏两视图也不进 ⌘K（结构上不可达——这些会话在当前语义下本就无法打开，与「隐藏永不使会话不可达」不变式不冲突：不变式守护的是本地偏好隐藏，不是物理失效）；in-app 活 host 会话不受过滤影响；会话文件零改动。**标题推导**跳过行首 `<skill>` 标签原文取后续有效文本，缺失回退技能名。
- **分组折叠**：组行点击 = 整组折叠/展开；组内列表三态——初始（5 条 + Show more）/ 步进展开（每次 +5）/ 全展开（+ Show less）；**Show less 一次回初始**；折叠/展开恢复折叠前形状（展开到第几步记住）；形状**内存级**（不进偏好，重启回默认，Q5）；折叠组头**不加**计数（Q9）；caret 删除。
- **访问菜单**：行内粗体与描述间距（现状两 span 相邻零间隙的 CSS 缺失补齐）；盾牌配色 = Full Access 橙 / Standard 灰 / Read Only 绿（复用既有色 token）；**decideGate 审批语义零改动**（三档完备性已核实：READ_ONLY 放行 / full=allow / standard=ask+记忆规则 / read-only=deny）。
- **Help 幽灵按钮**：直接删除（无行为、无替代——不留占位）。
- **用户常驻复制**：用户气泡下**常驻**操作行 Copy（Q10 拍板常驻；**不带 Fork**——fork 语义锚在 assistant entry）；样式与助手操作行同族；复制原始文本。
- **导航轨**：转录左缘触区（ZCode 校准：轨区 ~48px、tick 列 ~36px、垂直居中、tick 列可独立滚动）；**每个真实用户消息一根 tick**（含 steer/follow-up）；等宽基条 + **scaleX** 表达焦点/活跃衰减（ZCode 同型——截图证据：多根 tick 同屏长短不一），着色 focus=前景 / muted=次级，视口锚定 query 加亮、运行中不低于 0.72 透明度；hover 气泡 = 用户输入（clamp 2 行）+ 助手回复摘要（clamp 3 行），右弹、短延迟开合；点击 **smooth 平滑定位**（DOM 直查目标元素优先，虚拟/未挂载 rAF 兜底等挂载）；tick < 2 整轨不渲染；窗口宽低于阈值（ZCode 校准 864px）不显示；轨显隐带 opacity/位移过渡。**仅 ChatView；FollowView 不做**（Q7④）。
- **吸底决策**：`shouldAutoScroll(滚动状态, 内容增长, 是否自己发送)` 纯函数——仅 nearBottom（~160px 阈值沿用）或自己发送时自动置底；**废除现状"内容增长即强制拽底"**（Q12 行为变更）；回底钮 = 滚离超阈值（同一 160px 阈值）时 composer 上方中央圆形 ↓，点击平滑回底并恢复吸底，显隐淡入淡出。
- **slash 退役 + 守门**：`EXECUTABLE_BUILTIN_NAMES` 移除 new/tree/name/copy/model/thinking 六条（compact 保留）；composer 发送路径加**守门纯函数**——裸命令与带参形式均拦截，toast 指路（如 "/model — use the Select Model picker"），会话零发送；Pi TUI 侧不受影响（其命令表属于 Agent 本体）。
- **用量图表**：`smoothPath` 控制点钳制进 [top, baseline]（Catmull-Rom 过冲根因，保形最小修）；趋势 hover = 既有点击的坐标映射同函数 → 日期索引 → 竖导线 + 各线交点圆点 + 白卡 tooltip（日期 · 各模型 tokens · 合计）；圆环 hover = 白卡 tooltip（模型名 · tokens · 占比）；**点击 drilldown 行为不变**。
- **术语**：导航轨（Turn Navigator）/ 回底钮（Jump to Latest）/ 分组折叠（Group Fold）随各自实施票入 CONTEXT.md（词条措辞见 intake-grilling.md）；调用轨迹词条为 1.2 漏落补账，草案在本目录 intake-grilling.md 附录——**本批第一张实施票顺手落进 CONTEXT.md**。
- UI 文案全英文（词汇表约束不变）。

## Testing Decisions

- 延续仓库原则：**好测试只测外部行为**——给定输入快照/契约事件/坐标，断言状态与可见输出；不测内部调用序列、不测 CSS 字节。
- **零新缝、零新契约**，全落 1.1 以来四缝：
  - **Seam-1 表驱动 vitest**（本批 8 个纯模块族）：面板双变量投影（open/width → 开合变量+内容变量）、模型目录投影（probe 报告 → 菜单形 + 链式默认决议）、树显示模型（fixture jsonl → 显示行序列：标签/工具行/噪音滤除/叶路径）、cwd 存活过滤 + 标题推导（stat 注入 + skill 标签跳过）、折叠形状机（初始/+5/showLess 重置/collapse 记形状/expand 复原）、导航轨模型（锚点分数位、shouldAutoScroll 决策表、tick 显隐规则）、slash 守门（六条裸/带参 → {hint} | null）、曲线钳制 + hover 数据推导。先例：chat-reducer / sessions-group / sessions-trace / panel-model / keymap / usage-charts 套件。
  - **host-contract smoke**：本批零契约增量（R2 复用既有 auth scan IPC）——若实施发现必须加，按纯增量惯例到时报备。
  - **electron smoke**：四键开合后终态尺寸 + 过渡属性在位（R1）、New Task 菜单列真实模型（R2）、隔离 userData 种死 cwd 会话不可见 + 活会话存活（R4）、折叠/分页点击序（R5）、用户 Copy 进剪贴板（R8）、滚离→↓钮现/点 tick 平滑定位/流式增长不拽人（R9）、敲 `/model` → toast 且会话零新消息（R10）、hover 出 tooltip DOM（R11）。
  - **visual harness**（对照实拍帧）：树帧对照 `pitui13-tree`（R3）、访问菜单帧（间距+三色，R6）、轨/hover 气泡/回底钮三帧对照 `z13-*`（R9）、趋势/圆环 tooltip 帧对照 `z13-usage-*`（R11）、面板动画终态帧 + 拖拽中动画禁用断言（R1）。
- 性能红线入验收：R9 hover/点击不得引重渲染风暴（票 30 memo 基建先例）；R1 动画期间终端零逐帧 reflow。

## Out of Scope

- TUI /tree 的键盘功能（搜索、label、copy、filters、翻页）——桌面版一律不搬（Q8 拍板）。
- FollowView 的导航轨/回底钮（Q7④）；窄窗口下的其他布局适配（仅按阈值隐藏轨）。
- 死 cwd 会话的恢复、换目录打开、删除等任何处置路径（文件原样留盘；被滤即静默）。
- 转录虚拟化/窗口化（导航轨以 DOM 直查为主，现规模不需要）；分页常量（5）可配置化。
- 图表时间范围切换等 ZCode 对齐项之外的功能扩展；深色主题（持续范围外）。
- Pi TUI 侧任何命令面改动（R10 仅 PiCode 应用侧）。
- 调用轨迹词条补账独立于本批工单验收（附录草案，实施票顺手带过）。

## Further Notes

- **取证链**：十四帧实拍 + main 源码核因记录见同目录 `intake-grilling.md`（R1–R11 每条含根因与代码级证据）。ZCode bundle 只读取证所得校准参数：侧栏 `width+opacity 200ms ease-out`、关闭态 opacity-0/pointer-events-none、拖拽降级仅 opacity、双变量内容裁切；终端面板尺寸+opacity 同 200ms；turn navigator 轨 48px 触区 / tick 列 36px 垂直居中可滚 / tick 等宽 scaleX / hover 气泡 clamp2+clamp3 / smooth 定位 + rAF 兜底 / <2 tick 不渲染 / 864px 显隐阈值 / 圆形回底钮。参数即参照，未复制任何代码资产。
- **工单依赖提示（/to-tickets 用）**：R8/R9 同在 ChatView——**必须序列化**；R5 是侧栏唯一写者；R1 触三面板壳层 + TerminalDock（xterm reflow 禁忌）；R3 = 树数据源扩展 + 面板重写两段；R2 跨渲染层/主层但复用 auth-probe 零契约；R6/R7/R10 均小票可并票（/to-tickets 裁量）。
- **操作者待办**：`merge-ticket.sh` 的 Status 门槛 ls-files 需补 `picode-1-3`（1-2 批已绕过一次，勿再绕）。
- **ADR 检查**：无新 ADR——动画参数是校准常量而非架构决策；导航轨/折叠形状机为既有渲染层的增量纯模块；无 hard-to-reverse / surprising / real-trade-off 三条全中的决策。
- 版本事实：TUI 全局 pi 0.84.2 / 内嵌 SDK 0.84.3（ADR-0005 锁定）不变；互通冒烟须持续通过。

## Comments

- 2026-09-03 (requirements intake): 十一项需求全部经 /grill-with-docs 两轮十三问定稿——Q1 动画参数（操作者指令查 ZCode 实证 → 200ms ease-out 落定）/ Q2 空态方案 a / Q3 树重塑三子项（噪音隐藏/工具行入树/类型标签）/ Q4 扫描期过滤 + 标题修正 / Q5 内存形状记忆 + 分页 + 删 caret / Q6 盾牌橙灰绿 / Q7 导航轨六子项（scaleX 证据判定、仅 ChatView、160px 阈值）/ Q8 不搬 TUI 键盘功能 / Q9 折叠组头不加计数 / Q10 用户复制**常驻**（推翻 hover 推荐）/ Q11 手敲拦截 + toast / Q12 流式滚离保持（行为变更拍板）/ Q13 图表悬停形态。全记录：`intake-grilling.md`。
- 2026-09-03 (缝确认)：零新缝零新契约，全落既有四缝（Seam-1 表驱动 / host-contract smoke / electron smoke / visual harness），已向操作者报备，复触发 /to-spec 视为无异议。
- 2026-09-03 (分类记录)：缺陷/回归 5（R2 空态断供、R4 死 cwd 崩溃、R6 CSS 打磨、R7 幽灵按钮、R11 过冲半）、交互缺陷 1（R5 功能重复）、全新需求 5（R1 动画、R3 树重塑、R8 常驻复制、R9 导航轨、R10 slash 退役）。
