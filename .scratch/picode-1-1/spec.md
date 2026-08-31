# PiCode 1.1 — 日常可用性迭代：会话打开闭环 × 密度 × 转录供面 × 开台芯片 × 底部终端 × 多活动会话

Status: ready-for-agent

本 spec 覆盖工单 14–22（同目录 `issues/`）。取证与方法记录见 `findings-ui-comparison.md`（对 ZCode 三轮实机比对，截图归档 `.scratch/compare/`）。术语遵循 `CONTEXT.md`；工单 14–22 的取舍均经 /grill-with-docs 五轮定稿。

## Problem Statement

1.0 通过了"敢日常真用"的验收，但一段时间真实使用后判定：**尚不足以替代 ZCode 成为日常主力**。差距不在功能缺失，而在交互成熟度：

- **打开旧会话等于丢内容**：resume 后思考与工具调用全部消失，agent 密集的会话打开后近乎空白；Live Follow 只能看纯文本、TUI 停下后没有接管入口。
- **落定的转录不可读**：思维链与工具过程逐行平铺，一个回合的工作淹没了真正的回答。
- **排版密度只有 ZCode 的一半**：列表与段落间距约为基准两倍，同屏信息量骤减。
- **正文不可摘**：代码块与表格没有块级复制，只能整条消息复制。
- **开一台任务绕远路**：⌘N 弹系统选目录，没有"指着某个项目直接开"。
- **终端位置错误**：做在右侧栏与转录抢宽度，而肌肉记忆里它该像 VS Code 一样在下方。
- **侧栏会吵**：悬停会话行弹出一大行 tooltip 文本。
- **最根本的**：切换会话会**杀死正在运行的任务**——多任务并行在 1.0 里不可能。

## Solution

对齐 ZCode 的交互成熟度，九张工单六条主题：

1. **会话打开闭环（14）**：回放携带完整结构；每个回合收进「Working · Ns」折叠行；Live Follow 渲染 markdown 并提供接管入口。
2. **排版密度（15）**：字号/行高/间距 token 对 ZCode 实机全面校准。
3. **转录供面（16）**：代码格与表格卡片化（复制/换行/预览/展开），消息操作行增加 fork。
4. **开台芯片（17）**：⌘N 打开新任务空态，项目芯片继承/切换，系统选目录降级为下拉底部项。
5. **底部终端（18）**：终端迁为 VS Code 式底栏，⌘J + 右上切换，Bridge 随迁。
6. **分组悬停（19）**：项目分组行悬停三按钮（隐藏/查看文件/新建任务），查看文件 = 侧栏文件浏览器。
7. **多活动会话（20）**：切换不杀进程，后台继续跑；审批挂起 + 角标 + 通知；侧栏状态点固定槽位分层。
8. **分支只读展示（21）**：显示活动会话工作区的分支名（只读）。
9. **Tooltip 体系（22）**：会话行去长提示；按钮 tooltip = 快捷键或短描述。

## User Stories

1. As a 双端用户, I want a resumed session to show its thinking rows and tool cards (collapsed), so that the replayed transcript is as complete as the live one.
2. As a 双端用户, I want each finished turn to collapse into a single "Working · Ns" row, so that the settled transcript shows only my messages and the agent's answers.
3. As a curious reviewer, I want to expand a collapsed working row, so that I can audit that turn's thinking and tool sequence.
4. As a cautious user, I want a turn that ended in an error to stay expanded, so that I always see what went wrong without digging.
5. As a switching user, I want expansion states to reset when I re-enter a session, so that re-entry always starts calm and collapsed.
6. As a skill user, I want a "Skill X" marker row inside the working row when a turn was driven by a skill, so that I can see which skill produced the work.
7. As an observer, I want the Live Follow view to render markdown, so that watched answers are as readable as native ones.
8. As an observer, I want an "Open" action in the Live Follow view once the TUI session goes quiet, so that I can take over the conversation without hunting through the sidebar.
9. As an observer, I want a take-over click to be rejected with a toast when the session is actively written again, so that I never race with the TUI.
10. As a visually picky user, I want transcript font size, line height and spacing calibrated against ZCode, so that long sessions read at reference density.
11. As a code reader, I want fenced code blocks rendered as cards with a language label, so that code is spottable at a glance.
12. As a code reader, I want a copy button on every code block card, so that I can lift exact code without text selection.
13. As a code reader, I want a wrap toggle on code block cards, so that long lines read without horizontal scrolling.
14. As a table reader, I want tables containerized with copy / preview / expand-scroll actions, so that tabular answers are liftable and inspectable.
15. As a message auditor, I want a fork action on any settled assistant message, so that I can branch the conversation from exactly that point.
16. As an impatient user, I want the fork click to drop me directly into the branched session, so that exploring an alternative costs one click.
17. As a streaming reader, I want block buttons to stay stable while an answer streams, so that the UI never flickers mid-generation.
18. As a multi-project developer, I want ⌘N to open a new-task state with a project chip instead of a system folder dialog, so that starting work has zero detours.
19. As a multi-project developer, I want the project chip to default to my current session's project, so that consecutive tasks in one repo cost zero clicks.
20. As a multi-project developer, I want the chip dropdown to offer searchable recent workspaces, so that switching projects is one selection away.
21. As a user with a brand-new folder, I want an "Open folder…" entry at the bottom of that dropdown, so that the system picker remains reachable for anything unlisted.
22. As a keyboard user, I want the legacy "ask every time" setting retired in favor of the chip, so that there is one obvious way to choose a project.
23. As a terminal-native user, I want the terminal docked full-width at the bottom like VS Code, so that it stops competing with the transcript for width.
24. As a keyboard user, I want ⌘J and a top-right toggle to show/hide the bottom terminal, so that it appears and vanishes instantly.
25. As a curious supervisor, I want the Bridge projection to live inside the bottom terminal, so that watching agent commands survives the new layout.
26. As a focused user, I want the bottom terminal hidden on launch, so that the first screen stays about the conversation.
27. As a multi-project developer, I want hover actions on a project group (hide / view files / new task), so that group management matches my ZCode muscle memory.
28. As an organizer, I want "remove" to hide a group locally with a settings-level recovery path, so that I can declutter without ever destroying sessions.
29. As a code browser, I want "view files" to turn the sidebar into that project's file tree, so that I can navigate the workspace without leaving the app.
30. As a code browser, I want a "back to tasks" button in the file browser, so that returning to the task list is instant.
31. As a multi-project developer, I want "new task" on a group to preselect that project's chip, so that a task in a specific repo starts with one click.
32. As a multitasking developer, I want a running session to keep running when I switch away, so that long tasks survive my attention changes.
33. As a multitasking developer, I want to return to a background session and find it caught up and live again, so that no output is ever lost while I was away.
34. As a multitasking developer, I want several sessions running at once, so that I can parallelize across repos.
35. As a cautious user, I want an approval request in a background session to raise an orange badge and a system notification, so that I never miss a gate.
36. As a cautious user, I want background approvals to wait for me rather than auto-approve, so that I stay in control of every execution.
37. As a tidy user, I want quitting the app to terminate every running host with no orphans, so that my machine stays clean.
38. As a TUI loyalist, I want sidebar status dots to distinguish running-here / awaiting-approval / running-in-TUI / idle, so that I always know where work is happening.
39. As a visually picky user, I want status dots in a fixed slot before the title with all title edges aligned, so that the sidebar reads cleanly regardless of state.
40. As a git-aware user, I want the active session's workspace branch shown read-only, so that I know where the agent is working without opening a terminal.
41. As a calm user, I want no giant tooltip when hovering a session row, so that the sidebar stays quiet.
42. As a keyboard user, I want button tooltips to reveal their shortcuts (⌘N, ⌘K, ⌘J), so that accelerators are discoverable by hovering.
43. As a new user, I want short description tooltips on icon-only buttons (copy, wrap, fork…), so that every control is self-explanatory.

## Implementation Decisions

- **会话视图注册表**：chat 状态从单实例改为「会话注册表」纯模块（sessionId → 该会话的视图状态 + 焦点路由）；既有 chat reducer 原样复用、按会话各折叠一份。注册表是本批唯一的新状态模块。
- **回合折叠**：回合边界 = 用户消息；「Working · Ns」行是该回合思考/工具的折叠容器。落定自动收起；`turn_error` 保持展开；展开态不跨切换记忆；live 流式期间展开实时滚动。折叠行内含技能标记行：嗅探触发回合用户消息中的 `<skill name="…">` 注入文本，渲染「技能 X」标记行，不做更多解析（Pi 无结构化技能事件）。
- **历史回放**：契约的 history 载荷从纯文本升级为结构化条目（思考/工具/技能标记），回放与 live 同构渲染，默认全收起。契约变更全部纯增量。
- **Live Follow**：活跃判定沿用 120s 写入启发式；「Open」仅在非活跃时出现，点击瞬间重查活跃态（仍活跃则 toast 拒绝）；Follow 视图升级为消费结构化条目 + markdown 渲染，严格零写入。
- **转录供面**：markdown 渲染器以组件覆写注入代码格卡片与表格容器；复制/换行等按钮状态须容忍流式重挂载（状态上提或稳定 key）；预览与展开滚动区的实际形态以 ZCode 实机为对照；fork 走既有 fork 契约并自动切换 + toast。
- **Tooltip 组件**：统一组件两态（短描述 / 快捷键键帽），替换全部原生 title；会话行无 tooltip。
- **开台芯片**：⌘N / New Task → 新任务空态；默认项目解析器（活动会话项目 → 上次使用 → 最近项目首位）为纯函数；芯片下拉 = 搜索工作区 + 最近列表 + 底部「打开文件夹…」；`ask` 偏好退役，设置页改为「新任务默认项目」选择器；首条消息（文本+图片）经 pending 链路在建会话后送达。
- **底部终端**：PTY 服务、字节通道与桥接投影全部零改动；布局模型扩展底部 dock（开合 / 拖高 / ⌘J 与右上切换钮）；右侧栏 picker 收缩为审查单卡；启动默认收起。
- **分组悬停**：移除 = 本地隐藏偏好（可恢复；被隐藏分组的会话仍可被 ⌘K 搜索与 Groups 全部视图命中）；查看文件 = 侧栏文件浏览器模式（树数据按目录懒加载，复用既有目录读取通道；搜索后置）；新建任务 = 芯片预选的新任务态。
- **多活动会话**：supervisor 从"替换语义"改为"注册表语义"（并存不互杀）；后台会话不渲染但事件持续收集，切回追平；审批挂起 = 药丸滞留 + 橙角标 + 系统通知，绝不自动批准；退出 = 全部 host 终止（无孤儿承诺不变）；两端并发写继续不做仲裁。
- **侧栏状态点**：固定槽位恒占位（动画点 / 橙点 / 绿点 / 空槽），标题左缘全线对齐。
- **分支只读**：host 侧只读 git 查询命令（非 git 目录优雅降级），契约纯增量；展示位置实施时定。
- **UI 文案全英文**（词汇表约束不变）。

## Testing Decisions

- 延续仓库原则：**好测试只测外部行为**——给定契约事件流 / 字节流，断言状态与可见输出；不测内部调用序列。
- **零新缝**，全落在 1.0 的三条缝与两个既有通道：
  - **Seam-1 主缝**（表驱动 vitest，先例：chat-reducer / sessions-group）：history 结构回放、回合折叠状态机、Follow→Open 切换、会话注册表、默认项目解析器、隐藏分组过滤器、技能标记嗅探。
  - **Seam-3 PTY 缝**（fake-pty 字节回放）：底部停靠下 terminal-session controller 回归 + 新布局模型（开合/拖高）单测。
  - **Electron smoke** 扩展场景：resume 结构 DOM 断言、空态芯片建会话、**多会话并存（≥3）**、后台审批角标、退出无孤儿、`get_branch`。
  - **Visual harness**（不入自动化，人工关卡）：密度样本对照 ZCode 实机、代码格/表格卡片、底部终端形态、tooltip 样式。
- Visual QA 沿用 1.0 惯例：每票人工验收 = "敢日常真用"，密度票以同一样本在 PiCode 与 ZCode 实机并排为准。

## Out of Scope

- 表格「下载」导出、代码格「终端钮」、消息 👍👎⚓（无 Pi 语义支撑）。
- 分支切换 / checkout（Git 写操作维持范围外）；远程连接；"不在项目中工作"模式。
- 双向接管他端会话、同一会话两端并发写仲裁（维持 1.0 范围外）。
- 文件浏览器内的文件搜索（后置 1.1）与任何文件编辑/删除操作；会话删除（本批只有分组隐藏）。
- 深色主题、Browser 标签页、MCP 管理面板（维持 1.0 范围外）。

## Further Notes

- **工单映射**：14 会话打开闭环 / 15 密度+字号 / 16 转录供面 / 17 开台芯片 / 18 底部终端 / 19 分组悬停 / 20 多活动会话 / 21 分支只读 / 22 Tooltip（同目录 `issues/`）。
- **ADR-0006（前置件）**：票 20 推翻 ADR-0003 的 α 交付形态，实施会话须先落 ADR 再动工。
- **实施顺序建议**：14 → 15 → 16 → 17 → 19 → 18 → 22 → 20 → 21（20 建议在 14 之后；22 的全 app 走查放新按钮定形之后）。
- 取证链：`findings-ui-comparison.md`（三轮实机比对）+ `.scratch/compare/` 截图；ZCode 行为争议一律以实机为准（操作者授权打开 ZCode 取证）。
- 验收关卡沿用 1.0 惯例：视觉对照人工把关，冒烟套件单命令全绿。
