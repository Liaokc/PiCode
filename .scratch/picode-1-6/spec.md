# PiCode 1.6 — Composer 菜单群修 × 技能卡 × 上下文圆环 × 回合文件条 × 编辑重发 × 草稿保留 × New Task 切换修复

Status: ready-for-agent

本 spec 覆盖工单 68 起（同目录 `issues/`，编号全局连续）。取证 = 操作者 2026-09-14 真实使用报痛 13 条 + 实拍十三帧（已归档 `.scratch/compare/`：`pi16-*`）+ main 源码逐项核因（file:line 全录）+ Pi SDK 文档核对（sessions.md /tree 编辑重发语义、extensions.md 内置 path provider、models.md contextWindow）+ 会话库只读取证（edit 工具结果 `details.diff` 实锤）；全部取舍经 /grill-with-docs 两轮十二问（Q1–Q12）定稿（全记录见 `intake-grilling.md`）。术语遵循 `CONTEXT.md`。

## Problem Statement

1.5.0 验收后的真实使用判定——**七处缺陷与六处供面缺口**，集中在 Composer 与回合信息面：

- **Composer 菜单失控**：以 `/` 开头的多行文本让斜杠菜单常驻每一行（换行不关、零匹配不关）；菜单开着时 Shift+Enter 被拦截直接发送；键盘导航把选中行移出可视区且列表不滚；权限/模型/思考三 chip 点开后点本体关不掉。
- **技能选中无卡**：slash 菜单选中技能后 composer 只留裸文本 `/skill:name`（ZCode 渲染成卡）；手打 `/skill:` 前缀反而搜不到菜单行。
- **上下文不可见**：ZCode 模型钮左侧有上下文圆环（hover 显容量/占比/缓存命中率），PiCode 无——何时接近上下文上限全靠猜。
- **New Task 权限摆设**：空态下权限菜单能点开但选择无反应（票 41 补链漏项）。
- **流式抖动**：输出时轻微上滑与自动吸底逐帧互搏，文字剧烈抖动（票 45 的 160px 阈值带内强吸）。
- **配置沉底**：设置窗与 composer 模型下拉均注册表字母序直出，已配置的 provider 沉底。
- **New Task 死端**：点新建会话后点侧栏其他会话零反应，主区仍是 New Task（回归级可用性）。
- **回合文件足迹不可见**：ZCode 每回合聚合「N files changed +X −Y」（展开 per-file 审查/打开），PiCode 只有散落的逐工具卡。
- **无法编辑已发消息**：Pi 的 /tree 编辑重发（No summary 分支）在 PiCode 无供面。
- **@ 候选集失灵**：大目录下 `@ts` 必然 "No matching files"（walk cap 字母序耗尽）；操作者裁决：@ 若 Pi 不支持就去掉——实查 Pi 原生支持 path completion，保留。
- **草稿即丢**：New Task 与会话切换都会丢掉已打未发的文本和图片。

## Solution

十三项需求（R1–R13），全部对齐实证参照（ZCode 实拍帧 / Pi 会话记录 / SDK 文档）：

0. **技能/模板卡（R1）**：选中技能或 prompt 模板 → composer 渲染结构化卡（icon+名+×），单槽替换、参数跟卡后、发送重组 `/skill:name args` 语义不变；`skill:` 前缀可剥匹配。
1. **菜单触发面修订（R2）**：菜单只在光标位于首行行首 `/` token 内时开；换行/空格/移出即关；零匹配不渲染；Shift+Enter 任何菜单态永远换行。
2. **菜单滚动跟随（R3）**：选中行 scrollIntoView；两套键盘处理统一、ArrowDown 有界。
3. **chip 弹层竞态（R4）**：外点关闭豁免 owning chip——三 chip 再点必关。
4. **上下文圆环（R5）**：模型 chip 左侧圆环 = 最近 assistant usage / contextWindow；hover 显百分比+四元组+缓存命中率；ZCode 分类分解不做（会话文件无数据）；仅 ChatView。
5. **New Task 权限链（R6）**：票 41 同型 pick 链补全——选中即显、随 create_session 生效、跨重启不持久。
6. **吸底方向感知（R7）**：向上滚动任意量即解除 pin；回底/自发送恢复；160px 只留给回底钮。
7. **已配置置顶（R8）**：设置窗 + composer 模型菜单同规则——已配置在前、组内字母序；零新契约。
8. **New Task 切换修复（R9）**：会话行点击的两分支补清 newTaskOpen——从 New Task 态点会话必达。
9. **回合文件条（R10）**：每回合常显段末尾「N files changed +X −Y」聚合条，展开 per-file（±计数 + Review + Open）；数据 = edit `details.diff` 派生（additive 投影）；撤销不做。
10. **编辑重发（R11）**：用户消息 hover「Edit」→ 移叶父 entry + 预填原文 → 发送原位分叉（No summary）；agentRunning 隐藏、Stop 落地即复现。
11. **@ 口径与候选集（R12）**：@ 保留 = Pi 原生 path completion；插件/会话类不做；repo 内 git ls-files、非 repo 走 walk+truncated 提示。
12. **草稿保留（R13）**：文本+图片、内存级；per-session 草稿槽 + New Task 单槽。

## User Stories

### R1 技能/模板卡

1. As an operator who picks a skill from the slash menu, I want the composer to render a skill card (icon + name + remove ×), so that the pending invocation is visible at a glance instead of raw text.
2. As an operator, I want to type arguments after the card, so that I can pass parameters to the skill.
3. As an operator, I want the message to send as `/skill:name args`, so that Pi's own expansion semantics stay byte-identical.
4. As an operator who picked the wrong skill, I want × on the card to remove it, so that I can start over.
5. As an operator browsing the menu again with a card present, I want another pick to replace the existing card, so that there is always at most one leading command.
6. As an operator using prompt templates, I want the same card treatment, so that both insert-forms behave identically.
7. As an operator who types `/skill:` by hand, I want the menu to match skill rows with the prefix stripped, so that hand-typed invocations are discoverable.
8. As a keyboard-first operator, I want Enter on a highlighted menu row to insert the card, so that the flow stays keyboard-complete.

### R2 菜单触发面修订

9. As an operator writing multi-line text that starts with `/`, I want the slash menu only while my cursor sits inside the leading `/` token, so that the menu stops haunting every line.
10. As an operator, I want the menu to close when a newline is entered (Enter or Shift+Enter), so that command mode ends with the line.
11. As an operator, I want the menu to close when I type a space, so that the token boundary ends command mode.
12. As an operator, I want the menu to close when I move the cursor out of the token, so that clicking elsewhere escapes.
13. As an operator whose query matches nothing, I want no menu rendered at all, so that the "No matching commands" box never lingers.
14. As an operator pressing Enter with no menu open, I want the text sent as-is, so that unknown commands keep passing through to the SDK.
15. As an operator typing Chinese with an IME, I want Shift+Enter to always insert a newline even when a menu is open, so that composing never accidentally sends.

### R3 菜单滚动跟随

16. As a keyboard navigator, I want the selected menu row to scroll into view, so that the gray highlight never disappears past the edge.
17. As an operator, I want arrow keys to behave with one consistent end-of-list rule, so that the index and the visible selection always agree.
18. As a mouse user, I want hover to keep driving the same selection, so that keyboard and mouse share one model.

### R4 chip 弹层竞态

19. As an operator who opened the access-mode menu, I want clicking the chip again to close it, so that the chip is a true toggle.
20. As an operator, I want the same toggle on the model and thinking chips, so that all three behave identically.
21. As an operator clicking inside an open popover, I want it to stay open (except when picking a row), so that selection is never lost mid-click.
22. As an operator clicking genuinely outside, I want the popover to close, so that outside-click dismissal still works.

### R5 上下文圆环

23. As an operator mid-session, I want a context ring next to the model chip showing how full the context window is, so that I know when limits approach.
24. As an operator, I want the ring derived from the latest assistant message usage, so that it reflects reality without any new instrumentation.
25. As an operator hovering the ring, I want a popup with percentage, used/limit tokens, IN/OUT/cacheRead/cacheWrite, and cache hit rate, so that I can judge context health.
26. As an operator comparing with ZCode, I accept that the per-category breakdown is not replicated, so that we never display numbers the session file cannot support.
27. As an operator at a fresh session, I want a gray ring with no popup, so that absence of data is honest.
28. As an operator after compaction, I want the ring to reflect the newest usage, so that it visibly drops.
29. As a follow-mode user, I accept the ring being ChatView-only, so that scope matches the jump-to-latest precedent.

### R6 New Task 权限链

30. As an operator starting a new task, I want my access-mode pick applied to the created session, so that the first turn actually runs under the tier I chose.
31. As an operator, I want the New Task chip to show my pick immediately, so that the choice is visible before sending.
32. As an operator who did not pick, I want the default tier tagged "default" like model/thinking, so that Pi's fallback is distinguishable.
33. As an operator, I accept the pick not persisting across restarts, so that it stays symmetric with the model/thinking picks.

### R7 吸底方向感知

34. As a reader scrolling up during streaming, I want any upward scroll to release the stick immediately, so that streaming never fights my scroll.
35. As a reader, I want to re-pin by scrolling back to bottom, sending, or clicking jump-to-latest, so that following resumes deliberately.
36. As an operator, I want the 160px threshold to keep governing jump-button visibility only, so that the 回底钮 behavior is unchanged.

### R8 已配置置顶

37. As an operator with configured providers, I want them listed before unconfigured ones in Settings models, so that my active stack is on top.
38. As an operator, I want the same ordering in the composer model menu, so that both surfaces agree.
39. As an operator, I want alphabetical order inside each group, so that scanning stays predictable.
40. As an operator, I want the current provider auto-located and highlighted when opening the model menu, so that the existing behavior is preserved.

### R9 New Task 切换修复

41. As an operator in the New Task state, I want clicking any sidebar session to switch the main zone to it, so that New Task is never a dead end.
42. As an operator clicking the previously focused session, I want the same switch, so that no special case swallows my click.

### R10 回合文件条

43. As an operator reviewing a turn, I want a collapsed "N files changed +X −Y" bar below the answer, so that the turn's footprint is visible at a glance.
44. As an operator, I want to expand the bar into per-file rows (icon, name, path, ± counts), so that I can see what changed.
45. As an operator, I want Review on a row to open that turn's diff in the side panel, so that changes are inspectable without git.
46. As an operator, I want Open on a row to open the file in the side panel preview, so that reading continues in place.
47. As an operator, I want multiple edits to the same file merged into one row, so that the list reads per-file, not per-call.
48. As an operator, I want new-file writes marked "+new", so that creation differs from modification.
49. As an operator, I want read/ls excluded, so that only real changes count.
50. As an operator, I want the bar absent for turns with no file changes, so that text-only turns stay clean.
51. As an operator watching live, I want the bar to grow as tools settle, so that live and settled read the same.

### R11 编辑重发

52. As an operator who mistyped an earlier message, I want an Edit action on sent user messages, so that I can fix and branch.
53. As an operator editing, I want the leaf moved back before that message and the composer prefilled with the original text, so that editing is a modify-and-resend flow.
54. As an operator sending the edit, I want a new branch created in place with no summary, so that history is preserved and the transcript stays chronological.
55. As an operator, I want no confirmation dialog but a light toast on branch creation, so that the flow stays fast with feedback.
56. As an operator with the agent running, I want the Edit button hidden, so that I never branch mid-run.
57. As an operator who just pressed Stop, I want Edit to reappear as soon as the abort lands, so that stopping restores editing immediately.
58. As an operator whose steer/follow-up messages have settled, I want those editable too, so that all settled user messages behave the same.
59. As an operator with an unsent draft, I want Edit to replace the composer content with the original text and re-attach the original images, so that the edit intent is unambiguous.
60. As an operator editing a message that carried images, I want the original images restored into the composer attachments, so that the resent message keeps its full context without manual re-attaching.
61. As an archivist, I want the old branch fully retained in the tree panel, so that nothing is ever lost by editing.

### R12 @ 口径与候选集

62. As an operator using @, I want file-path completion kept with Pi's native semantics (inserted path text), so that the surface matches what Pi consumes.
63. As an operator, I want no plugin/session categories in the @ menu, so that PiCode never supplies what Pi cannot consume.
64. As an operator in a git repository, I want candidates from git ls-files, so that @ finds files even in large repos.
65. As an operator outside a repo, I want a "truncated" hint when the walk caps out, so that empty results are explainable.
66. As an operator, I want the @ menu to follow the same trigger/close rules as the slash menu, so that both text menus behave identically.

### R13 草稿保留

67. As an operator switching away from New Task, I want my draft (text + attached images) kept, so that accidental switches never lose work.
68. As an operator switching between sessions, I want each session's draft preserved per session, so that multi-session juggling never loses typing.
69. As an operator who sent the message, I want the draft cleared naturally, so that no ghost text returns.
70. As an operator, I accept drafts being lost on app restart, so that the mechanism stays memory-only and simple.

### 横切

71. As an operator, I want additive contract increments reported at implementation time, so that the contract ledger stays honest.
72. As an English-UI stickler, I want all new copy in English, so that the interface-language constraint holds.

## Implementation Decisions

- **R1 技能/模板卡**：composer 输入值升级为「卡 + 文本」内部结构（可选的行首命令槽 + 自由文本），发送时重组为 `/skill:name args` / `/name args`——**发送语义与今天逐字节一致**，纯渲染层改动。单槽 + 替换：再选替换现有卡；卡在场时输入 `/` 仍开菜单（选中即替换）；× 清卡。菜单匹配修复：查询剥 `skill:` 前缀后匹配技能名。卡视觉对齐 pi16-zcode-skill-card（icon + 名称；无 tooltip——Tooltip 词汇只管控件）。builtin 命令（/compact）走既有立即执行路径不变。
- **R2 触发面**：斜杠菜单开启条件收敛为纯函数决策——value 以 `/` 开头且光标位于首行行首 token 内（光标前无换行无空格）；换行（Enter/Shift+Enter 的换行路径）、空格、光标移出 token 三者即关；**零匹配不渲染菜单**（Enter 落回发送路径——未知命令照旧透传 SDK）；菜单键盘 Enter 分支补 shiftKey 守卫（Shift+Enter 永远换行）。@ 文件菜单共用同一触发面规则。
- **R3 滚动**：菜单行选中变化时 `scrollIntoView(block:'nearest')`；composer 文本菜单键盘处理与弹层键盘处理**统一为一处实现**（一处管 clamp/取模），消除双轨。
- **R4 竞态**：弹层的 document mousedown 外点关闭**豁免 owning chip**（mousedown 落在打开该弹层的 chip 内则不关，交给 chip 自身 click toggle 收起）；实现形态由票裁量；验收口径 = 再点必关、真外点仍关、弹层内点击不误关。
- **R5 圆环**：渲染层纯投影——最近一条 assistant message usage（input+cacheRead+cacheWrite+output 全计入）÷ 模型 contextWindow；hover 为数据弹层（非 Tooltip 组件）：百分比 + used/limit + IN/OUT/cacheRead/cacheWrite 四元组 + 缓存命中率（cacheRead/(input+cacheRead)）；无 usage 显灰环无 hover；compaction 后自然取最新 usage（零特判）。**additive 契约增量**：模型引用增 `contextWindow?: number`（模型目录载荷携带，host 从 pi-ai Model 读）；**实施期与 Pi TUI 同场景校准分子口径**。仅 ChatView。
- **R6 权限链**：EmptyState 增 accessPick 本地态（chip 即时反映），随任务创建参数下传；**additive 契约增量**：会话默认值结构增 `accessMode?: AccessMode`（旧载荷缺字段照常校验通过）；未选 = Pi fallback + "default" 小标（modelIsDefault 先例）；跨重启不持久。
- **R7 方向感知**：scroll-stay 纯模型扩展——新增 reader-held-away 输入（向上滚动手势置位，回底/自发送/跳转复位）；决策表变为 selfSent || (!heldAway && nearBottom && grew)；160px 阈值语义收窄为回底钮显隐专用。仅 ChatView。
- **R8 排序**：渲染层 join 已有的凭据探测报告（App 已持有）派生「已配置在前」排序——纯函数（组序：configured 优先、组内 provider 名字母序、模型列不动）；两处消费同一排序函数。零新契约。
- **R9 切换**：会话行打开路径的「已聚焦」「在应用内」两分支补清 New Task 态——从 New Task 态点会话行必然离开 New Task 主区。纯状态修，零契约。
- **R10 回合文件条**：回合分组投影增聚合面——回合内 edit/write 工具按文件聚合（同文件多 edit 合一行、diff 依序拼接；write 记 "+new"；read/ls 排除），± 计数从 edit 工具结果的 diff 文本解析；折叠行显文件数与行数合计，展开行 = 图标+文件名+路径+±计数+Review+Open。Review = 侧板新开**回合 diff 标签**（复用既有 diff 渲染器渲染该回合 diff 文本——回合 diff 非 git diff，与 Review tab 并存）；Open = 既有预览深链。live 随工具落定增长；无文件更改的回合不出条。**additive 投影增量**：转录条目与 live 事件携带工具结果 diff 文本（现投影丢弃——实施时报备入账）。
- **R11 编辑重发**：用户消息行 hover 尾部「Edit」钮 → 复用既有 `navigate_tree` 移叶到该消息**父 entry**（同文件无损、天然 No summary）+ composer 预填**原文 + 原图片**（图片从用户消息条目的图片部件还原为 composer 附件态——操作者拍板图片也回填；会话文件原生内联 base64 ImageContent，还原直读）+ 聚焦 → 发送走既有 prompt 路径（SDK 原位分叉新分支——Pi sessions.md 原生语义）；无确认框；发送后轻 toast（fork-toast 先例）。显隐规则：agentRunning 隐藏；agent_end 落地即复现（**验收项写死**：点 Stop 后按钮必须回来）。可编辑对象 = 全部落定 user 消息（含 steer/follow-up）。草稿在位时点 Edit 直接替换。**additive 投影增量**：用户转录条目携带图片部件（现投影只留文本——实施时报备入账；缺席 = 无图消息照常）。
- **R12 @ 候选集**：host 文件列举改造——cwd 为 git 仓库内时用 `git ls-files`（只读、复用既有 git 只读先例），否则维持目录 walk + cap；cap 截断时候选列表尾附 "**truncated**" 提示行；匹配/排名渲染层规则不变。触发面/关闭/滚动与斜杠菜单同规则（R2/R3 共用）。
- **R13 草稿**：App 层增草稿状态——per-session 草稿槽（会话视图注册表扩展）+ New Task 单槽；内容 = 文本 + 已贴图片；内存级（重启即失，操作者拍板）；空草稿不占槽；发送自然清空；composer 挂载时恢复对应槽。
- 术语随票入 CONTEXT.md：「技能卡（Skill Card）」「上下文圆环（Context Ring）」「回合文件条（Turn File Changes）」「编辑重发（Edit & Resend）」「草稿（Composer Draft）」——草案见 `intake-grilling.md`。UI 文案全英文（词汇表约束不变）。

## Testing Decisions

- 延续仓库原则：**好测试只测外部行为**——给定会话快照/契约事件/坐标，断言状态与可见输出；不测内部调用序列、不测 CSS 字节。
- **零新缝**，全落既有四缝：
  - **Seam-1 表驱动 vitest**（本批 10 个纯模型/投影族）：R1 卡+文本值结构与发送重组（含 `skill:` 前缀剥匹配——commands/fuzzy 套件扩展）；R2 触发面决策表（光标位 × 文本形态 × 键事件 → 菜单开关，含 Shift+Enter 守卫）；R3 键盘统一后的边界规则；R5 圆环投影（usage→百分比/命中率/灰环降级）；R6 会话默认值增量（accessMode 缺席兼容）；R7 scroll-stay 决策表扩展（heldAway 置位/复位 × nearBottom × selfSent）；R8 排序纯函数（configured 优先 + 字母序 + 空报告降级）；R10 文件条聚合投影（edit diff 解析/write "+new"/同文件合并/read 排除/空回合无条）；R11 用户条目图片部件还原投影（有图/无图/多图 → 附件态）；R13 草稿槽（set/clear/restore，per-session + New Task 单槽）。先例：chat-reducer、keymap、scroll-stay、cwd-liveness、expand 套件。
  - **host-contract smoke**：R5 `contextWindow` 增量、R6 `accessMode` 增量、R10 diff 投影增量、R11 用户条目图片投影增量——到时报备入账并验证旧载荷兼容（既有惯例）；R12 git ls-files 候选集（repo 内/非 repo 两态）。
  - **electron smoke**：R1 选技能出卡 → 发送重组 → 会话内 SDK 展开；R2 多行 `/` 文本不常驻 + Shift+Enter 换行 + 零匹配无菜单；R4 三 chip 再点必关；R6 New Task 选权限 → 创建 → chip 生效；R7 流式中上滚停吸、回底恢复；R9 New Task 态点会话行直达；R10 种子会话文件条渲染 + Review 开侧板 diff 标签；R11 hover Edit → 预填（含带图消息的附件还原）→ 发送 → 新分支 + toast + 树面板旧分支可达；R13 切走切回草稿还原。
  - **visual harness**：R1 卡帧；R5 圆环帧 + hover 弹卡帧（对照 pi16-context-ring-hover）；R8 排序帧（对照 pi16-settings-providers）；R10 折叠/展开帧（对照 pi16-zcode-turn-filebar / -expanded）；R3 菜单长列表帧（对照 pi16-menu-no-scroll）。
- 性能红线：R1 卡结构不得破坏输入路径的零 setState 纪律（票 49 先例——高度/值更新走 imperative 路径）；R3 scrollIntoView 仅选中变化时触发；R5 圆环纯派生零轮询（usage 事件驱动）；R7 方向感知零额外渲染（scroll 监听内现有路径扩展）。

## Out of Scope

- 上下文圆环的 ZCode 分类分解（消息/系统工具/技能/系统提示词/MCP 工具——会话文件无此记账，数据源如实）；圆环进 FollowView / New Task。
- 回合文件条的撤销（undo）钮（1.1 纪律维持——文件回滚是危险面）；文档文件重复渲染独立卡（既有工具卡已覆盖）。
- @ 的插件/会话分类（Pi 无消费面——「供面与 Pi 消费面严格一致」纪律，MCP 出局同款）；@ 跨会话搜索。
- 草稿跨重启持久化（操作者拍板内存级即可）。
- agentRunning 期间的编辑重发（先停止再编辑）。
- TUI-only 斜杠命令进菜单（票 38 退役纪律维持）；New Task 快捷 chips 接真实模板数据（1.4 范围外维持）；Composer 拖拽 resize / 展开态跨重启持久（1.4 范围外维持）。
- 深色主题（持续范围外）；GLM 自适应思考（1.5 调查存档，非缺陷）。

## Further Notes

- **取证链**：两轮十二问全记录与 file:line 根因见同目录 `intake-grilling.md`；实拍十三帧 `pi16-*` 在 `.scratch/compare/`；会话库证据（edit 工具结果 `details.diff` 与 write 字节文本）；SDK 文档核对（sessions.md /tree 编辑重发与 no-summary、extensions.md 内置 path provider、models.md contextWindow）。
- **R→票映射纪律**（/to-tickets 时执行）：本 spec **每条 R（R1–R13）必须映射到至少一张票**——1.3 R11 掉票教训，1.5 已在 tracker 注明；建议波次见下，合并/拆分由 /to-tickets 裁量但映射不得遗漏。
- **缝确认**（2026-09-14，追加链）：零新缝——全落既有四缝（Seam-1 表驱动 / host-contract smoke / electron smoke / visual harness），已向操作者报备（1.5 先例：复触发视为无异议）。四个 additive 契约/投影增量（R5 contextWindow、R6 accessMode、R10 diff 投影、R11 用户条目图片投影）实施时报备入账。
- **ADR 检查**：无新 ADR——R7 为票 45 显示行为的可逆修订；R5/R6/R10 为 additive 契约增量（ADR-0002 数据源纪律不破——圆环与文件条全部派生自 Pi 会话记录）；R11 复用既有 navigate_tree 语义（ADR-0006 注册表框架内）；R13 为注册表视图状态的内存级扩展。
- **依赖与波次提示（/to-tickets 用）**：同文件群 A（R2→R3→R4→R12→R1）强串行——全落 composer 菜单/值结构；同文件群 B（R9→R13）串行——App/EmptyState/注册表；R7、R8、R11 独立可并行；R10 与 R11 弱邻接（转录行渲染）/to-tickets 裁量；R1、R6、R10、R13 触 EmptyState/Composer 共组件——New Task 与会话内两处同规则验收。
- **操作者待办**：`scripts/merge-ticket.sh:50` ls-files 补 `picode-1-6`（勿再绕）；实施期跑 dev app / smoke 遵守 dev-app serialization（每票验收项内嵌 ps 自查——照 1.5 口径）。

## Comments

- 2026-09-14 (requirements intake → /to-spec): 十三痛点两轮十二问定稿（Q1–Q10 Round 1；Q7 否决 + Q2/Q9 操作者补充展开 Round 2 的 Q11–Q12）。全记录：`intake-grilling.md`。证据帧 pi16-* 十三帧归档 `.scratch/compare/`（Desktop 原件可清）。工单编号 68 起全局连续（67 已被 1.5 批消耗）。
- 2026-09-14 (缝确认)：零新缝——全落既有四缝，已随 spec 发布向操作者报备。
- 2026-09-14 (图片回填拍板)：R11 预填边界由「仅文本」改判「**原文 + 原图片也回填**」（操作者拍板；会话文件用户消息原生内联 base64 ImageContent，session-format.md 实证；用户条目图片投影成为第 4 个 additive 增量）。User Stories 59/60、Implementation Decisions R11、Testing Decisions、Out of Scope 同步修订。
