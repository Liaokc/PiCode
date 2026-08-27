# PiCode 1.0 — ZCode 之壳 × Pi 之脑

Status: ready-for-agent

## Problem Statement

用户日常用两个 coding agent：Pi（TUI，逻辑最合心意）和 ZCode（桌面端，交互体验最好）。二者割裂：想要 Pi 的 agent 行为就必须忍受终端交互；想要 ZCode 的产品级桌面体验就必须接受它内部的 agent 逻辑。此外两边的会话、统计互不相通。

## Solution

构建 PiCode：一款 macOS 桌面应用。界面布局、控件形态、交互方式复刻 ZCode（以用户提供的截图集为像素基准），UI 文案全英文；内部 agent 行为完全由 Pi SDK 提供，不做任何偏离。会话存储与 Pi TUI 天然共享——任一侧创建的 Session 在另一侧可见、可 resume；正在 TUI 中运行的 Session 可被 PiCode 只读跟随（Live Follow）。用量统计从 Pi Session 记录推导，覆盖 TUI 与 PiCode 的全部历史。

红线：不修改 Pi 安装目录与 ZCode 应用内部的任何代码和数据；所有改动只发生在本仓库内。

## User Stories

### 窗口与骨架

1. As a user, I want the app to open into a ZCode-like three-zone layout (nav sidebar / main area / optional side panel), so that my muscle memory transfers instantly.
2. As a macOS user, I want hiddenInset traffic lights embedded in the sidebar and a centered window title, so that it feels like a native Mac product rather than a web wrapper.
3. As a returning user, I want an empty state with a large greeting, a centered composer, and quick-start chips, so that starting work feels welcoming.
4. As a visually picky user, I want light-theme styling calibrated against real ZCode screenshots, so that the product feels first-class (acceptance red line: visual quality).

### Agent Host 与会话生命周期

5. As a user, I want to pick a working directory and get a running Session backed by the real Pi SDK in an isolated host process, so that agent crashes never take down the app shell.
6. As a user, I want clean shutdown with no orphaned agent processes, so that my machine stays tidy.
7. As a user, I want clear error banners when the host fails to start or dies unexpectedly, so that failures are understandable and recoverable.

### 聊天主线程

8. As a user, I want assistant replies streamed token-by-token, so that the app feels alive.
9. As a power user, I want thinking shown as a collapsible row with elapsed time, so that deep reasoning doesn't flood the transcript.
10. As a user, I want every tool call rendered as a card with name, arguments, live status, expand/collapse, so that I can audit agent actions at a glance.
11. As a user, I want tool results to reach clear final states (done/error), so that I trust what happened on disk.
12. As a reader, I want markdown with code highlighting, so that technical answers are readable.
13. As a reviewer, I want per-message actions (copy etc.) with timestamps, so that I can reuse output elsewhere.
14. As a user, I want a "Working · Ns" progress line while the agent runs, so that state is always legible.
15. As a cautious user, I want approvals presented inline in the conversation (approve / deny-with-reason), so that I stay in control without modal shocks.
16. As a hands-on user, I want a stop control that aborts the current turn and its tools, so that I can bail out instantly.

### Composer

17. As a user, I want Enter to send and Shift+Enter for newline, ZCode-style, so that composing is frictionless.
18. As a context-builder, I want @-mention autocomplete over files and directories, so that I attach precise context fast.
19. As a command user, I want a `/` menu listing Pi prompt templates, skills, and built-in commands with fuzzy filtering and keyboard navigation, so that power features are discoverable.
20. As a visual worker, I want to paste images into the composer, so that I can show the agent what I mean.
21. As a streaming multitasker, I want to explicitly choose Steer (inject now) or Follow-up (queue) while the agent runs, plus a visible queue I can clear, so that mid-flight input never disappears silently.
22. As a model shopper, I want a cascading provider→model picker fed by Pi's available models, so that switching models takes two clicks.
23. As a cost-conscious user, I want a Thinking Level dropdown wired directly to Pi's thinking levels, so that depth follows my intent per message.
24. As a security-minded user, I want an Access Mode chip whose presets map onto the approval gate's remember-rules, so that trust posture is visible and switchable per session.

### Sidebar 与会话体系

25. As a keyboard-first user, I want ⌘N to start a new Task (a new Session), so that creation is instant.
26. As a multi-project developer, I want Tasks grouped by project directory with relative timestamps and pinning, so that my sidebar mirrors how I actually work.
27. As a cross-tool user, I want Sessions created in Pi TUI to appear here (and vice versa), so that Handoff between tools just works.
28. As a continuing user, I want to resume any Session (full in-place tree navigation: follow branches, jump entries), so that no conversational path is ever lost.
29. As a fork-lover, I want to branch a Session from any entry, so that I can explore alternatives safely.
30. As an observer, I want Live Follow: a Session currently running in the TUI shows as active and streams read-only in PiCode, so that the desktop becomes my dashboard.
31. As an organizer, I want to set a friendly label on a Task (stored as the Pi session label), so that lists stay human-readable.

### 右侧面板（Side Panel）

32. As a layout user, I want a resizable right panel hosting multiple tabs, so that auxiliary views don't fight the transcript for space.
33. As a terminal-native user, I want a full interactive PTY terminal tab where I run my own commands, so that I stop switching to iTerm for small jobs.
34. As a curious supervisor, I want Bridge: bash commands the agent executes projected live into the terminal tab (output-only), so that I can watch work happen.
35. As a code owner, I want a Review tab showing workspace-vs-HEAD diff (unified default, split toggle, per-file diffstat), so that reviewing agent work matches GitHub habits.
36. As a reader, I want a File Preview tab rendering markdown and highlighted source with breadcrumb navigation, so that agent-modified files are one click away.
37. As a lazy clicker, I want file-change cards in the transcript to deep-link into preview/review views, so that navigation follows curiosity.

### 用量统计（Usage）

38. As a metrics-minded user, I want a Usage page reachable from settings under Data & Statistics, mirroring ZCode's page structure, so that familiarity carries over.
39. As a big-picture user, I want headline stat cards (total tokens, peak day, longest chat day length, current & longest streaks), so that scale registers at a glance.
40. As a streaky user, I want a GitHub-style activity heatmap with daily/weekly/cumulative toggles, so that consistency is visible.
41. As an analyst, I want a time-range switch (last 7 days / last 30 days) driving a per-model multi-line daily trend chart, so that trends resolve per model.
42. As a share-watcher, I want a donut chart of model share with legend percentages, so that burn distribution is obvious.
43. As an auditor, I want Estimated Cost figures explicitly labeled as estimates everywhere they appear, so that precision is never faked.
44. As a TUI loyalist, I want stats computed from all Pi Session records (TUI included), so that nothing I do goes unmeasured.
45. As a digger, I want to drill down from any data point into the underlying Sessions detail, so that anomalies are explainable.

### 设置与全局

46. As an admin-averse user, I want a read-only auth status view per provider, so that credential health is glanceable (login itself stays in the TUI).
47. As a defaults-setter, I want default model / thinking level / startup preferences in settings, so that new Sessions start the way I like.
48. As an appearance purist, I want theme variables structured so a future dark mode needs no refactor, even though only light ships now.
49. As a searcher, I want ⌘K to filter Tasks only, so that finding a Session is one chord away.
50. As an English-thinking user, I want all UI copy in English, so that the interface reads natively to me.

## Implementation Decisions

Baseline and constraints:

- 全新代码库重建；旧 MVP 仅存在于 git 历史，不引用（ADR-0001）。
- 技术栈 Electron + React + TypeScript + electron-vite；渲染层永不直接 import Pi SDK，一切经 IPC 契约（ADR-0003）。
- Pi 逻辑运行于独立 agent host 子进程；单窗口单活动 Session（α），全部接口按每 Session 独立实例（β 形状）设计（ADR-0003）。
- `@earendil-works/pi-coding-agent` 以锁定版本 npm 依赖嵌入；发布前跑 TUI↔SDK 兼容性冒烟（ADR-0005）。
- Terminal 采用 xterm.js + node-pty 完整 PTY；Bridge 为单向输出投屏，不回注输入（ADR-0004）。
- Usage 数据唯一源自 Pi Session jsonl 的 per-message usage 字段，写入自有聚合缓存后供查询（ADR-0002）。
- 审批闸门（per-execution 工具运行前 allow/deny + remember 规则）独立于 Pi 的项目 trust 展示；Access Mode 芯片是闸门的预设档位而非 trust 本身。
- UI 文案全英文；布局基线 = 用户提供截图集（9 张），设计 token 以截图取色 + ZCode 渲染层提取值双重校准。
- 双主题：浅色实现为唯一交付，颜色等量入 CSS 变量为暗色留位。

Modules（形状描述，不含路径）：shared contract（ParentToHost/HostToParent 消息类型）、chat reducer（契约事件流 → 可渲染状态的纯函数）、agent host 进程服务、session index（跨项目 Session 枚举与树）、approval gate、usage aggregator + 缓存、panel tabs 容器（Terminal/Review/File Preview）、composer 服务（补全源、队列语义）。

## Testing Decisions

三条测试缝（已与所有者确认）：

1. **Host 契约缝（主缝）**：`契约事件流 → reducer → 状态` 为纯函数链。组件与逻辑测试注入事件序列即可回归流式、审批、队列、会话切换；headless 冒烟脚本另拉真 host 连真 SDK 验证契约出口。渲染器绕过契约直接 import SDK 属于违规，测试即护栏。
2. **Usage 聚合器缝**：fixture jsonl（含增量追加、compaction 条目、断行边界样本）表驱动纯函数测试；UI 图表只消费聚合结果类型。
3. **PTY 抽象缝**：终端与 Bridge 依赖最小伪终端接口；fake pty 回放字节流验证投屏、resize、退出。真 PTY 仅出现在一个冒烟脚本中。

好测试只测外部行为：给定输入事件/字节流，断言状态与可见输出，不测内部调用序列。仓库为全新起点，无既有测试先例；旧项目验证过的"smoke 脚本 + vitest"组合风格沿用。视觉还原不入自动化，由每里程碑人工对照截图把关。

## Out of Scope

- Browser 标签页、自动化、插件市场、电脑控制、记忆系统、子智能体（ASK/init 芯片整体隐藏）
- MCP 配置管理 UI、todo 面板、checkpoints、命令输入历史 UI
- 双向接管他端运行中 Session；同一 Session 两端并发写入的仲裁
- OAuth 登录与 provider/API key 写操作的 GUI 化（引导至 TUI 执行）
- 暗色主题的实现、Beta 公开的剩余 backlog 项（内置浏览器桥接等）
- 代码签名与公证的分发流水线（提供本地 dev 运行与基础打包脚本即可）
- MCP servers 面板、Git 提交/推送操作按钮（Review 只读呈现 diffstat 与差异）

## Further Notes

- 里程碑映射 M1–M7 见工单目录；每个里程碑的人工验收标准是"敢日常真用"，其中视觉对照截图是硬关卡。
- 截图基准存放于 `~/Downloads/ZCode截屏/`（复制入库至 `.scratch/reference/screenshots/` 后以库内副本为准）。
