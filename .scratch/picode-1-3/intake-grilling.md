# PiCode 1.3 需求收集记录（requirements intake，grilling 定稿）

Status: ready-for-spec

2026-09-03 需求收集会话产出。操作者报 11 条痛点（真实使用判定），全部经 main 源码核因 + 实机截图取证，/grill-with-docs 两轮十三问（Q1–Q13）定稿，操作者确认共识一致（"一致"）。本文件是 /to-spec 的唯一输入；术语遵循 `CONTEXT.md`；红线沿用（不碰 Pi/ZCode 内部、ZCode 数据只读、UI 文案全英文）。

## 批次上下文

- v1.2.0 收官（27–37 共 11/11 resolved，main @ d09bc28，vitest 886/886）。本批 = **picode-1-3**，工单编号 **38 起全局连续**。
- 已知遗留：`scripts/merge-ticket.sh:50` 的 Status 门槛只查 `picode-1-0/1-1` 目录（1-2 曾绕过，1-3 同样）——**操作者待办：合并前把 picode-1-3 加进 ls-files**。
- 「调用轨迹（Call Trace）」词条仍缺，但本批无票涉及——词条挂起不补。
- 版本事实：TUI 全局 pi 0.84.2 / 内嵌 SDK 0.84.3（ADR-0005 锁定）不变。

## 取证链

**实拍 14 帧**（2026-09-03，已归档 `.scratch/compare/`，`pi13-`=PiCode / `z13-`=ZCode / `pitui13-`=Pi TUI）：

| 帧 | 内容 |
|---|---|
| pi13-newtask-empty-composer | New Task 空态：模型/思考档灰占位 "Select Model ⌄ / Thinking ⌄"（R2） |
| pi13-newtask-model-menu-empty | 点开 Select Model = 空白下拉条（R2） |
| pi13-newtask-after-first-msg | 发完首条消息 chip 才出现 bella/GLM-5.3-flash + Max（R2） |
| pi13-history-dropdown | History 下拉：`(model_change)` 等噪音与正文混排、无类型标签（R3） |
| pitui13-tree | Pi TUI `/tree`：类型标签 + 树形导轨 + `[bash: …]` 行 + (411/413)（R3 对标物） |
| pi13-worktree-session-groups | 侧栏 wt-33/35/36/37 等死 cwd 组（R4） |
| pi13-dead-cwd-host-exit | 点击后 "The agent host stopped running (exit code 1)" 横幅（R4） |
| pi13-access-menu-spacing | 访问菜单三行粗体/浅字粘连（"Full AccessRun every tool…"）（R6） |
| z13-navigator-rail | ZCode 转录左缘 tick 束（R9 对标物） |
| z13-navigator-hover | tick hover 气泡：用户输入 + 助手回复预览（R9） |
| z13-jump-to-latest | 滚离底部后 composer 上方圆形 ↓ 钮（R9） |
| pi13-usage-trend | PiCode Daily Token Trend：无 hover；紫色平线过冲破底（R11） |
| z13-usage-trend-hover | ZCode 趋势 hover 白卡（日期 + 各模型 tokens）（R11 对标物） |
| z13-usage-donut-hover | ZCode 圆环 hover 白卡（模型/tokens/占比）（R11 对标物） |

**ZCode 实机行为取证**（操作者授权"看看 ZCode 怎么做的"；只读其 app bundle 提取行为参数，未复制任何资产；用后即弃）：

- 侧栏开合 = `width+opacity` 并动、**200ms ease-out**；关闭态 `opacity-0 pointer-events-none`（width→0）；**拖拽中降级为仅 opacity 过渡**（`data-workspace-sidebar-resizing` 时 width 过渡关闭——拖拽 1:1 不播动画）；双 CSS 变量模式：`--workspace-sidebar-panel-width`（开合用，关=0px）与 `--workspace-sidebar-width`（内容真实宽度，动画期间内容裁切不重排）。
- 底部终端面板 = 尺寸/flex-grow 过渡 + opacity 过渡，同 **200ms ease-out**；展开用 rAF 双段（先 mount 后 expand）+ 240ms 兜底超时。
- Turn navigator（R9 对标实现，行为参数）：
  - 轨容器 = 转录左缘 absolute 触区宽 48px，tick 列宽 36px、**垂直居中**、`max-h: 100%-6rem`、可独立滚动（overflow-y-auto，滚轮滚 tick 列不滚转录）；
  - tick = 每用户输入一根，占位 36×10px，**基条等宽 12px、高 2px、origin-left 圆角**，视觉长短/焦点衰减用 `scaleX` 表达；着色 focus=前景色 / muted=次级色；当前视口锚定 query opacity .9；运行中 ≥.72；
  - hover 气泡（右侧弹出，offset 8，宽 320px）：**用户输入 line-clamp-2 + 助手回复 line-clamp-3** 两段；openDelay ~120ms / closeDelay ~80ms；
  - 点击 = smooth 平滑定位（DOM `querySelector([data-row-id])` 直查优先，虚拟化兜底 scrollToIndex + 最多 ~12 帧 rAF 等挂载）；
  - tick < 2 整轨不渲染；窗口宽 <864px 整轨不显示；轨显隐有 150ms opacity/位移过渡；
  - 回底钮 = 圆形（rounded-full、card 底、outline 变体）浮于转录区下方中央。
- 截图证据补充判定：多根 tick 同屏长短不一（z13-navigator-rail）→ 长短差是**常驻视觉**（scaleX 按消息/焦点衰减），hover 只加粗当前根——PiCode 采用同型（等宽基条 + scaleX），非按消息长度改基宽。

## R1–R11 决议（每条：痛点 / 归类 / 根因 / 定稿）

### R1 面板开合动画 —— 全新需求
- **痛点**：⌘B/⌥⌘B/⌘J/⌥⌘J 或按钮开合各栏"凭空出现/消失"。
- **根因**：`.sidebar{width:var(--sidebar-w)}` 等 0px↔Npx 瞬跳，无任何 transition（app.css 实证）；面板常驻挂载只切宽度。
- **定稿**：三面板（左侧栏/右侧面板/底部 dock）开合动画，方向 = 从各自停靠边拉出/收回；参数对齐 ZCode **200ms ease-out、width(高度)+opacity 并动**；关闭态 opacity-0 + pointer-events-none；内容固定宽度裁切不重排（双变量模式，xterm 免逐帧 reflow）；**拖拽中禁用尺寸动画**（对齐票 30 rAF 直写）；`prefers-reduced-motion` 直切（PiCode 增补）。启动首帧不播动画。

### R2 New Task 空态模型/思考档 —— 缺陷修复
- **痛点**：空态 chip 灰占位 + 点开空下拉；发完首条消息才出现真实值。
- **根因**：空态 `chat = initialChatState()`（App.tsx:122），`models` 仅由活 host `models_available` 填充——New Task 无 host 即无目录。
- **定稿（Q2 方案 a）**：模型菜单接 **auth probe 模型目录**（`AuthProbeReport.models`，`--auth-probe` 短命 host 无会话即产；数据已在，未接线）；chip 显示链式默认（偏好 `defaultModel`/`defaultThinkingLevel` → Pi 兜底默认标注 default）；完全无模型配置时才落**底纹提示语**。空下拉消失，空态即可选。

### R3 History 面板重塑 —— 全新需求
- **痛点**：History 下拉丑（17.58.14）：`(model_change)` 噪音与正文混排、无类型标签、无树形感。
- **根因**：`nodePreview` 原文直出（parse.ts:325——other 类条目 `(${entry.type})`）；树含全部 jsonl 条目；assistant preview 只拼 text parts，工具调用不进树。
- **定稿**：显示形态对齐 Pi TUI `/tree`（pitui13-tree）：类型标签着色（`user:` / `assistant:`）、**工具调用入树**（`[bash: …]` 等宽行，扩展 preview 取 assistant 消息 toolCall 块）、树形缩进导轨、噪音条目（model_change/thinking_level_change 等 other 类）**默认隐藏**（Q3）；保留点行跳转 / 行上 fork / current 标记。**TUI 键盘功能一律不搬**——搜索/label/copy/filters 不做（Q8 拍板）。风格适配桌面配色，视觉帧对照 pitui13-tree。

### R4 失效 cwd 会话过滤 + 标题推导修正 —— 缺陷修复
- **痛点**：侧栏一堆 wt-* 组，点击报 "The agent host stopped running (exit code 1)"（18.00.11/18.01.13）。
- **根因**：`~/.pi/agent/sessions/` 存有 27 个 `.worktrees-wt-*` cwd 组（1.1/1.2 实现会话遗留）；worktree 合并后目录已删（`ls .worktrees/*` 为空）；点击 → `resume_session(cwd=已删路径)` → SDK 对不存在 cwd 抛错 → host `process.exit(1)` → 崩溃横幅。索引扫描无 cwd 存在性检查。
- **定稿（Q4 方案 a）**：**索引扫描期过滤**——cwd 在磁盘不存在的会话不进索引（侧栏、⌘K 均不可达）；in-app 活 host 会话不受影响；不建降级打开路径（dev 会话无保留价值；会话文件零改动）。顺手修**标题推导**：跳过 `<skill>` 标签原文（现标题显示 `<skill name="implement" locat...`——Pi 技能文本注入被 firstUserText 直取）。

### R5 分组折叠 + Show more 分页 —— 交互缺陷
- **痛点**：组行点击=全展开、Show more=全展开，功能重复；无折叠语义。
- **根因**：`toggleExpanded` 二值切换（全部↔`slice(0,5)`），Show more/less 同 handler（Sidebar.tsx:473/670/770）。
- **定稿**：组行点击 = **整组折叠/展开**（非归档）；展开恢复折叠前形状（若折叠前 Show more 过 N 次则恢复该样子）；Show more 每次 **+5**，全展开后变 "Show less"；**Show less 一次回初始 5 条**；**删除组行 caret 箭头**（功能重复）；形状记忆**内存级**（重启回默认 5 条，Q5）；折叠组头**不**加计数（Q9）。

### R6 访问模式打磨 —— CSS 级（语义零改动）
- **痛点**：粗体与浅字粘连；三档盾牌同色；操作者问三档是否完备。
- **根因**：`.cmp-access-row-text` **无任何 CSS 规则**（menus.tsx:154 内联 span 相邻，flex gap 8px 只作用于图标|文本块|勾选之间）；盾牌图标无分色。
- **定稿**：间距修复（粗体与浅字拉开，~8px）；盾牌配色 **Full Access=橙 / Standard=灰 / Read Only=绿**（Q6；橙对齐 ZCode 完全访问警示语义）。**完备性已核**：`decideGate` 对所有工具全覆盖（READ_ONLY_TOOLS 放行 / full=allow / standard=ask+记忆规则 / read-only=deny），三档构成完备策略空间——**无遗漏无多余，语义不动**。

### R7 删 Help 幽灵按钮 —— 缺陷
- **根因**：TitleBar `Help` 钮（HelpCircleIcon + Tooltip）**无 onClick handler**（TitleBar.tsx:57-63）。
- **定稿**：删除。

### R8 用户消息常驻复制 —— 全新需求（小）
- **痛点**：用户输入无复制（`msg-user` 纯 div，ChatView.tsx:157；助手有 Copy/Fork/时间操作行）。
- **定稿（Q10 拍板常驻）**：用户气泡下方**常驻** Copy 钮，形态对齐助手操作行；**不带 Fork**；复制原始文本。

### R9 转录导航轨 + 回底钮 + 滚离保持 —— 全新需求（大）
- **痛点**：无快速跳转历史用户输入的供面；ZCode 有左缘 tick 束 + hover 预览 + 回底钮（z13 三帧）。
- **根因**：ChatView 仅吸底逻辑（`nearBottom<160` 则置底）；无 marker、无回底钮。
- **定稿**（Q7 + ZCode 实证，参数见取证节）：
  - **导航轨**：转录左缘，每用户输入一根 tick；等宽基条 + scaleX 表达长短/焦点；hover 气泡 = 用户输入（clamp 2 行）+ 助手回复摘要（clamp 3 行）；点击 **smooth 平滑定位**到该用户消息；tick <2 不渲染；窗口过窄不显示；轨在 ChatView（**FollowView 不做**，Q7④）；上下移动气泡跟随丝滑（淡入淡出+微位移）。
  - **回底钮**：滚离底部（>160px 阈值）浮现圆形 ↓（composer 上方中央），点击平滑回底并恢复吸底；显隐淡入淡出。
  - **滚离保持（Q12 行为变更）**：废除现 `grew` 强制拽底——流式期间滚离**保持原地**；自己发送消息仍跳底。

### R10 退役六条重复 slash + 手敲守门 —— 全新需求（小）
- **痛点**：/new /tree /name /copy /model /thinking 在 PiCode 有更好入口，不该出现在 `/` 菜单（Pi Agent TUI 保留其命令不受影响）。
- **根因**：`EXECUTABLE_BUILTIN_NAMES`（composer-list.ts:19）= PiCode 自映射表。
- **定稿**：六条移出 `/` 菜单；**手敲拦截 + toast 指路**（Q11：如 "/model — use the Select Model picker"；不拦则原文发给模型产生垃圾回合——发送路径无 slash 拦截已实证）；`/compact` 保留。

### R11 用量图表悬停 + 曲线过冲修复 —— 缺陷 + 全新需求
- **痛点**：趋势图无 hover；曲线破底；ZCode 两图皆有 hover（z13-usage-*）。
- **根因**：`smoothPath` Catmull-Rom 控制点 `c2y = p2.y − (p3.y − p1.y)/6`——p2 在基线（v=0）且 p3.y < p1.y 时控制点越界基线下方，曲线过冲出图（charts.ts:222）；TrendChart 仅 onClick（drill）。
- **定稿（Q13）**：控制点钳制 [top, baseline]（保形最小修）；趋势图 hover = 竖导线 + 各线交点圆点 + 白卡 tooltip（日期 · 各模型 tokens · 合计，最近日吸附）；圆环 hover = tooltip（模型名 · tokens · 占比）；**点击 drilldown 行为不变**。

## Grilling 记录

- **Round 1**：Q1 动画（答：查 ZCode，查不清按推荐→已实证 200ms ease-out）/ Q2 空态方案 a ✓ / Q3 树重塑三子项 ✓ / Q4 过滤 a + 标题修正 ✓ / Q5 内存形状记忆 + 分页 + 删 caret ✓ / Q6 橙/灰/绿 + gap ✓ / Q7 导航轨细节（②③⑤⑥ ✓；①按证据定 scaleX 型；④只做 ChatView）。
- **Round 2**：Q8 不搬 TUI 键盘功能 ✓ / Q9 折叠组头**不**加计数 / Q10 用户复制**常驻** / Q11 拦截 + toast ✓ / Q12 滚离保持 ✓ / Q13 图表悬停形态 ✓。

## 归类记录

- 缺陷/回归修复 5：R2（空态断供）、R4（死 cwd 崩溃）、R6（CSS 打磨，语义零改动）、R7（幽灵按钮）、R11（过冲半 + hover 半）。
- 交互缺陷 1：R5（功能重复）。
- 全新需求 5：R1（动画）、R3（树重塑）、R8（常驻复制）、R9（导航轨）、R10（slash 退役）。

## 术语（随票入 CONTEXT.md；本会话只写 .scratch/ 不碰根目录文件）

- **导航轨（Turn Navigator）**：主转录左缘的垂直 tick 束——每个用户输入一根；hover 预览气泡、点击平滑定位；仅 ChatView；tick<2 或窗口过窄不显示。_Avoid_: 黑条（颜色绑定）、minimap（语义不同）。
- **回底钮（Jump to Latest）**：滚离转录底部时浮现于 Composer 上方中央的圆形 ↓ 钮；点击平滑回底并恢复吸底；吸底态隐藏。
- **分组折叠（Group Fold）**：项目组行点击的整组折叠/展开；Show more 每次展开 5 条、全展开转 Show less、Show less 一次回初始 5 条；形状记忆仅会话期。
- 「调用轨迹（Call Trace）」词条缺口继续挂起（本批无票涉及）。

## 依赖与波次提示（/to-tickets 用）

- **R8/R9 同在 ChatView.tsx——必须序列化**（同文件双写者禁令）。
- R5 是 Sidebar.tsx 唯一写者（与既有票模式同）；R1 动 app.css/App shell（三面板）+ TerminalDock 注意 xterm reflow 禁忌；R3 需 parse.ts 扩展（toolCall preview）+ TreePanel 重写；R2 跨 renderer（Composer/EmptyState）+ main（目录缓存）+ 既有 auth-probe 链；R10 触 composer-list.ts + Composer 发送守门；R11 触 shared/usage/charts.ts + TrendChart/DonutChart。
- R6/R7/R10 均小票，可考虑并票（/to-tickets 裁量）。
- 验收延续四缝：Seam-1 表驱动（R2 目录投影、R3 树显示模型、R5 折叠/分页纯模型、R10 守门纯函数、R11 钳制函数）、host-contract smoke（R2 若动契约）、electron smoke、visual harness（R1 动画帧、R3 对照 pitui13-tree、R9 对照 z13 三帧、R11 对照 z13-usage 两帧）。
- 性能红线：R9 导航轨 hover/点击不得引重渲染风暴（memo 基建票 30 先例）；R1 动画期间禁 xterm 逐帧 reflow。

## 附录：调用轨迹词条草案（1.2 漏落，待有根目录写权的会话落进 CONTEXT.md）

> **调用轨迹（Call Trace）**：
> 侧边面板中按会话文件成 tab 的只读检查器：entry = 一次模型调用——输入节（自上一 assistant 消息以来的 user / 工具结果块）+ 输出节（思考 / 助手文本 / 工具调用块，带工具名 chip 与调用 id）；usage 列（IN/OUT tokens、时长、时间戳）按 ADR-0002 从每条 assistant 消息 usage 推导，缺席优雅降级为只显时间戳。默认全展开；头部 = 统计行（调用数 · 总 token · 模型）+ 搜索（计数 + ↑↓ 导航）/ 块型开关（六类）/ 全部展开↔收起 / 打开所在目录 / 刷新 / 关闭；活跟随运行中会话（文件增长即重推导推送）。数据源如实原则：显什么 = Pi 会话文件实际记录了什么（SDK 内部 system prompt 不落盘，故「系统提示词」块通常缺席）。
> _Avoid_: 调用日志（含义过宽）、执行历史（与 Branch history 混淆）、trace 面板（中英混用）

依 1.2 票 36/37 已交付行为撰写（右键 View call trace 入口、tab 身份 = 会话文件、follow 通道语义）。
