# PiCode 1.8 — History 定位 × 导航轨锚定 × 菜单统一 × composer 滚动族 × 死组沉底 × 用量修缮 × queue 重构 × fork 命名 × 泡文本可选 × spawn 启动修复

Status: ready-for-agent

本 spec 覆盖工单 116 起（同目录 `issues/`，编号全局连续；115 已被 1.7 批消耗，113 号空缺不复用）。取证 = 操作者 2026-09-21/22 真实使用报痛 **28 条**（六轮报入 + Q1–Q9 裁决全记录见 `intake-grilling.md`；Round 6 = 自治批次空跑实证的基础设施缺陷）+ main 源码逐项核因（file:line 全录）+ 会话文件只读实测（SDK SessionManager / buildSessionTree / displayRows 对真实会话副本全链路实跑——History 链路数据层实证无恙）+ ZCode 实拍帧（provider 卡 / 思考卡 / 队列卡构图）。术语遵循 `CONTEXT.md`。

## Problem Statement

v1.7.0 验收后的真实使用判定——**十四处缺陷、六处交付行为修订、两处清理、三处全新供面**（含票 100 队列形态被 ZCode 参照推翻的重构、票 105 修复的回归）：

- **Branch history 失明**：长会话发送→终止后 History 恒 0 rows（后续发送不恢复）；fork 会话 History 无信息（可复现路径）。数据层全链路实测通过（841 节点树、835 显示行），缺陷在运行时管道——复现定位票。
- **导航轨两题**：live 回合运转中锚定显示在倒数第二轮（探针几何缺陷）；单回合不显示为票 46 规则——操作者确认维持（现状确认项）。
- **composer 六连**：①New Task 与会话内 provider 列表不同（全目录 vs 仅可用）；②provider/model 两列高度联动振荡；③菜单弹出位置右对齐整卡（ZCode = 左对齐触发钮）+ 思考图标非大脑；④技能选中清空整框文本；⑤展开态输入/删除立即缩矮（typing 路径不看 expanded）；⑥IME 中文输入滚动跳动 ×3 场景 + queue Edit prefill 视口停开头（同根：光标行硬换行计数）。
- **⌘J 终端聚焦回归**：新开会话 + ⌘J 焦点不进终端（票 105 已修问题的复发——新会话入口无回归测试）。
- **侧栏与设置**：死 cwd 文件夹组不沉底；设置入口右上+左下双份；跳设置往返 thinking 行折叠状态丢失。
- **用量页三题**：零用量模型照显（图例+圆环）；weekly 语义（周聚合 5 格）不符预期——裁决改「本周 7 天」；DrillDown 行内 Open task 冗余。
- **queue 面板**：行与 Clear 按钮不等高；票 100 形态被 ZCode 参照推翻——重构成拖动排序 + Edit + 垃圾桶（删全局 Clear、无「立即」钮）。
- **杂项**：MCP 状态条与卡片边框重叠；空闲输入（agent 停止态）移动转录视图；fork 会话不自动命名；发送文字无法拖拽选中（用户泡文本未放开 user-select——助手文本早已放开的不对称遗漏）；**Finder/Dock 启动的应用内会话无法 spawn subagent**（launchd 启动不继承 shell PATH——自治批次空跑实证，workaround = 终端带 nvm PATH 启动）。

## Solution

二十一项需求（R1–R21）全部对齐实证参照（ZCode 实拍帧 / 会话文件实测 / main 源码 file:line）：

1. **History 复现定位（R1）**：fork 路径为第一复现场景，dev app 插桩（request_tree 到达 / session_tree 发出 / 树载荷节点数）→ 定位修复。
2. **导航轨 live 锚定（R2）**：吸底时锚定 = 最新回合（含 live）；上翻维持探针规则。纯模型决策表扩展。
3. **provider 列表统一（R3）**：New Task 收紧为仅已配置 provider（复用票 76 configuredIds）。
4. **cascade 列高解耦（R4）**：hover 期间弹层几何稳定，model 列内部滚动。
5. **菜单锚点 + 大脑图标（R5）**：弹出左对齐触发钮（ZCode 构图）+ 自绘大脑 SVG。
6. **⌘J 聚焦回归（R6）**：复现定位 + 全 ⌘J 入口 electron smoke（会话内/新会话/boot 空态/桥接切回）。
7. **技能保留文本（R7）**：选中只剥离触发 token，余文为卡后参数。
8. **死 cwd 组沉底（R8）**：活性桶优先于一切排序含 Manual。
9. **零用量过滤（R9）**：0 token 模型从曲线图例/圆环/图例剔除（Q3=A 严格口径）。
10. **Token Activity weekly=B（R10）**：本周 7 天视图 + 零用量空色格 + hover tooltip + 焦点圈裁剪修复。
11. **展开态高度稳定（R11）**：typing-commit 按 expandState 分流，展开态重投影展开高度。
12. **composer 滚动族（R12）**：视觉行定位修 revealComposerCaret + IME 舞步插桩消除 + prefill 视口跟随光标。
13. **thinking 展开记忆（R13）**：per-session 视图注册表，跨一切重挂载保留（会话期内存级）。
14. **设置入口去重（R14）**：删 TitleBar 齿轮，留 Sidebar 齿轮，⌘, 不动。
15. **Open task 删除（R15）**：DrillDown 行内按钮退役，行纯展示（与 R9 并票）。
16. **MCP 边框分离（R16）**：状态条与卡片间距，纯 CSS。
17. **queue ZCode 重构（R17）**：拖动柄段内重排 + Edit + 垃圾桶；删全局 Clear；无「立即」钮；行高对齐；additive op `reorder_queue_entry` 报备。
18. **空闲输入不动转录（R18）**：非运行态 composer 操作绝不移动转录；Copy/Fork 行计入底部目标查证。
19. **fork 自动命名（R19）**：`Fork of <名>`（无名源跟侧栏标题投影），session_info 既有机制。
20. **用户泡文本可选（R20）**：文本段 `user-select: text`（与助手文本同规则）；技能角标/缩略图不放开；FollowView 同规。
21. **spawn 启动修复（R21）**：主进程启动时合成子进程 PATH（登录 shell 快照 + 常见 node 安装点探测）——Finder/Dock 启动也能 spawn；LSEnvironment 否决。

## User Stories

### R1 History 复现定位
1. As an operator who forks a session, I want its Branch history to show the inherited tree, so that fork inspection works.
2. As an operator who stops a turn in a long session, I want History to keep working, so that one abort never blinds the panel for the session's life.
3. As an implementer, I want instrumented evidence (command arrival / event emission / payload node count), so that the fix targets the broken hop, not a guess.

### R2 导航轨 live 锚定
4. As an operator watching a live turn pinned at the bottom, I want the rail's focus tick on the newest turn, so that the rail tells the truth about where the newest work is.
5. As an operator reading scrolled-up history while a turn runs, I want the anchor to follow my reading position, so that the rail stays a navigation aid.

### R3 provider 列表统一
6. As an operator in a new task, I want the same provider list as in-session (configured only), so that both surfaces speak one truth.

### R4 cascade 列高解耦
7. As an operator hovering providers with different model counts, I want the popover geometry stable, so that rows never slide under my cursor.

### R5 菜单锚点 + 大脑图标
8. As an operator opening the model or thinking menu, I want it anchored above its own chip (ZCode composition), so that the popover points at what opened it.
9. As an operator, I want a brain icon for thinking levels, so that the composer reads like ZCode.

### R6 ⌘J 聚焦回归
10. As an operator creating a session then pressing ⌘J, I want the terminal focused immediately, so that the ticket-105 promise holds on every entry path.
11. As an operator, I want a regression smoke covering every ⌘J entry path, so that fixed focus bugs stay fixed.

### R7 技能保留文本
12. As an operator who typed a message and then picks a skill from the start of the line, I want my text kept as the card's args, so that picking a skill never eats my draft.

### R8 死 cwd 组沉底
13. As an operator with deleted project folders, I want those groups always at the bottom, so that living projects stay on top under any sort.

### R9 零用量过滤
14. As an operator viewing a time range, I want models with zero tokens excluded from trend and donut, so that unused models stop polluting the charts.

### R10 weekly 本周 7 天
15. As an operator on the weekly heatmap, I want the current week's seven days with empty-color cells for zero days, so that a week reads as seven days.
16. As an operator hovering a cell, I want that day's usage tooltip like the trend/donut, so that all charts explain themselves.

### R11 展开态高度稳定
17. As an operator typing in the expanded input, I want the height to stay expanded, so that typing (or deleting) never collapses my writing surface.

### R12 composer 滚动族
18. As an operator typing Chinese in a long draft, I want the caret's line to stay put, so that IME input never jumps the view.
19. As an operator editing a queued message, I want the composer scrolled to the message's end with the caret there, so that editing continues from the end.

### R13 thinking 展开记忆
20. As an operator who expanded a thinking row, I want it still open after a settings round-trip or session switch, so that my reading state survives remounts.

### R14 设置入口去重
21. As an operator, I want one settings entry (sidebar, bottom-left), so that chrome stays minimal.

### R15 Open task 删除
22. As an operator reading usage drill-down rows, I want pure rows, so that redundant buttons stop cluttering.

### R16 MCP 边框分离
23. As an operator viewing the MCP section, I want the status note and the cards visually separated, so that borders never overlap.

### R17 queue ZCode 重构
24. As an operator with queued messages, I want ZCode-style rows with drag handles, so that reordering is direct and the earliest send sits on top.
25. As an operator, I want per-row edit and trash, so that one message can be revised or discarded without a global Clear.

### R18 空闲输入不动转录
26. As an operator typing while the agent is idle, I want the transcript perfectly still, so that reading and typing never fight.

### R19 fork 自动命名
27. As an operator who forks, I want the new session named "Fork of …", so that forks are identifiable at a glance.

### R20 用户泡文本可选
28. As an operator reading my sent message, I want to drag-select part of the text, so that I can copy exactly what I need.

### R21 spawn 启动修复
29. As an operator launching PiCode from Finder or the Dock, I want in-app sessions to spawn subagents, so that autonomous batch runs work without a terminal launch workaround.
30. As an operator, I want the PATH composition to fail safe (login-shell snapshot, well-known node locations, graceful degradation), so that a broken shell never breaks the app.

## Implementation Decisions

- **R1 复现定位**：第一复现场景 = fork 会话（操作者可稳定复现）；插桩点 = host request_tree 处理、session_tree 发送、supervisor 打标、registry 落账；定位即修、修复后 electron smoke 固化（fork 会话 History 行数断言）。「0 rows」空态文案不动（诚实原则）。
- **R2 锚定规则**：`shared/navigator-rail.ts` 锚定决策表扩展——吸底（isAtBottom 口径，复用 scroll-stay 常量）→ anchored = 最后一个 anchor（live 含内）；非吸底 → `anchoredTurnId` 探针现行为。表驱动 vitest；ChatView/FollowView 同规。
- **R3**：`App.tsx` newTaskProviders 从 `sortProvidersConfiguredFirst`（配置优先）收紧为 `configuredOnly` 过滤；空列表降级 = 既有 modelMenuHint 诚实文案（「No models configured — …」）；会话内路径零改动。
- **R4**：`.cmp-cascade` 列高解耦——弹层高度在 hover 变 provider 时不变（model 列内部滚动，几何票内裁量：固定高 / 左列自然高两者取稳）；menu-surface 纯模型无涉（纯视图）。
- **R5**：锚点计算 = 触发 chip 的 viewport 左缘 → 弹层 left 对齐（边界钳制防出窗）；`BrainIcon` 自绘几何路径（icons.tsx，无字体无资产复制）；GaugeIcon 退役（thinking chip + 菜单）。
- **R6**：dev app 复现（新会话 create → ⌘J）→ 定位（嫌疑：create 后重挂载 composer 聚焦与 focusSeq 双 rAF 的时序竞争）→ 修复；electron smoke 参数化覆盖四入口（会话内 / 新会话 / boot 空态 / 桥接切回）——**回归防线 = 第一验收项**。
- **R7**：`pickTextMenuRow` card 分支改为「剥离触发 token、保留余文」：`updateValue(remainingText)`（caret 落原位）；`composeCommandText` 不变（卡 + 余文重组）；menu-surface 不改（菜单照常开）；技能卡词条修订随票。
- **R8**：`shared/sessions/group.ts` 组排序管线加活性桶（cwd-liveness 复用）：`dead-group` 恒排最后（Updated/Created/Manual 三种排序一致）；Manual 手动序对死组不生效（拖拽 UI 对死组组行禁用 grip 或忽略落位——票内裁量）；组内行排序不动；表驱动 vitest。
- **R9**：usage 投影层过滤（`shared/usage/` 纯函数：`excludeZeroTokenModels`）——TrendChart 图例序列 + DonutChart 扇区与图例共用同一过滤；范围切换重投影；DrillDown 会话行不动（会话粒度如实）。
- **R10**：`HeatmapView` weekly 模式重实现——本周 7 格（周起始票内依 ZCode 校准裁量）、零用量日空色格、hover tooltip（与 Trend/Donut 同族组件）；焦点圈裁剪 = 容器 padding/overflow 修正；Daily/Cumulative 不动；表驱动（周格生成/空格/tooltip 数据）。
- **R11**：`expand.ts` 增 typing-commit 投影决策表（expanded → composerExpandHeight 重投影；collapsed → composerAutoGrowHeight）；`Composer.tsx` layout effect 按 expandState 分流；输入与删除同路径；缩矮唯一触发 = toggle/Esc/⌘E/sent（expand 状态机不变）。
- **R12**：①`revealComposerCaret` 视觉行定位——dev app 插桩实测 IME 场景后定实现（候选：selection range 测量 / caret 客户端几何）；②IME 舞步抖动消除（compositionupdate 期间的原生滚动竞争实测后修）；③PREFILL_EVENT prefill 后视口滚到光标行（queue Edit 与 edit-resend 共用）；④P13/14/15 三场景（底部输入/倒数第二行/中部输入 × 中英文）为验收矩阵。
- **R13**：thinking 行展开态存 per-session 视图注册表（`session-registry.ts` 视图状态扩展——expandedTurns 同层新增 `expandedThinking: Set<entryId>`）；`ThinkingRow` 受控化；会话期内存级（重启回默认——草稿同口径）；Worked 容器 `expandedTurns` 语义不动。
- **R14**：TitleBar 齿轮按钮删除（票 63 UI 面退役）；⌘, keymap 不动；Sidebar 齿轮照旧。
- **R15**：`DrillDownPanel` 行内 Open task 按钮与 onOpenTask 布线删除；行纯展示。
- **R16**：`.settings-mcp-status-line` 与卡片间距/层级修正（纯 CSS 票内裁量，visual 帧验证）。
- **R17**：`QueuePanel` 重构为 ZCode 构图——行 = 拖动柄（段内 dnd，越上越先）+ 角标 + 文本 + Edit + 垃圾桶；全局 Clear 删除；「立即」钮不做（Q6）；行高对齐随重构落地。**host 侧**：镜像舞步扩展——`reorder_queue_entry` op（clearQueue → 重排 → 按序重投喂、图片从镜像取、保序；票 100 edit/remove 同机制）；**additive 契约增量报备入 host-contract smoke**；SDK 毫秒级投递竞态诚实记录（票 100 口径）。拖拽动画/放置指示对齐 R11（票 84）既有语言。
- **R18**：dev app 复现定位（agent 停止态输入 → 转录上移；触发源静态未定位——嫌疑：composer 高度变化引发的滚动裁定点/重钉）→ 修复 = 非运行态门（agentRunning gate：空闲态任何 composer 驱动的视口变化不触发转录重钉/滚动补偿）；Copy/Fork 行计入底部目标查证；运行态语义零回退（票 93 闩 / 票 94 锚定 / 票 75 滚轮赢全不破）。
- **R19**：`handleFork` fork 落地后 `setSessionName("Fork of " + sourceName ?? sidebarTitleProjection)`；源名取 fork 前 manager.getSessionName()；无名源投影 = 首条用户消息（与索引扫描器同源——`shared/sessions/parse.ts` 既有投影复用）；session_renamed + 索引刷新照旧；用户可再改名。
- **R20**：`.user-bubble-text`（或等价文本段选择器）增 `user-select: text`——与 `.msg-assistant` 同规则（app.css:4341）；技能角标段/缩略图/动作行不放开；FollowView 同规；选择起点在文本段、不破坏缩略图钮与 Edit 行交互；Copy 语义不变（整条拷用户原话）。
- **R21**：主进程启动早期合成子进程 spawn 环境——①`$SHELL -lc 'echo $PATH'` 登录 shell 快照（缓存一次、超时与失败降级）②静态探测常见 node 安装点（`~/.nvm/versions/node/*/bin` 当前版本、`/usr/local/bin`、`/opt/homebrew/bin`、`~/.pi/agent/bin`）③注入所有需要 PATH 的子 spawn（subagent 子进程；会话 host 如涉及同注入）。**LSEnvironment 否决**（PATH 机器相关，不入通用 bundle）；探测不阻塞窗口就绪（异步初始化，票内裁量）。**精确断点（哪个 spawn 缺哪个可执行）= 第一验收项插桩定位**（不臆测纪律）；修复对新启动实例生效（运行中实例不热更——v1.8 自治批次运行本身依赖操作者启动 workaround，本票修复后续所有正常启动）。
- 术语随票入 CONTEXT.md：新增「队列卡（Queue Panel）」；修订「导航轨」（锚定规则）、「Manual 排序」（死组沉底）、「技能卡」（既有文本共存）——草案见 `intake-grilling.md`。UI 文案全英文（词汇表约束不变）。

## Testing Decisions

- 延续仓库原则：**好测试只测外部行为**；不测内部调用序列、不测 CSS 字节。
- **零新缝**，全落既有四缝：
  - **Seam-1 表驱动 vitest**：R2 锚定决策表（吸底/上翻 × live/落定）；R8 活性桶（三排序 × 死活组 × Manual 拖不动）；R9 零用量过滤（0/非零极小/混合 × 范围切换）；R10 周格生成（7 天/空格/tooltip 数据/周起始）；R11 typing-commit 分流表（expanded × 输入/删除）；R13 展开态存取（跳转/切换/折叠往返）；R7 余文剥离（文本+图+caret 位）；R19 命名投影（有名/无名）；R21 PATH 合成（登录 shell 快照/静态探测点/去重顺序/失败降级/良好 PATH 不劣化）。
  - **host-contract smoke**：R17 `reorder_queue_entry` additive op 报备入账 + 旧载荷兼容；R1 修复后的 request_tree/session_tree 链路断言。
  - **electron smoke**：R6 四入口 ⌘J 聚焦；R1 fork 会话 History 行数断言；R7 技能选中后文本保留 + 发送重组逐字节一致；R11 展开态输入/删除高度不变；R12 prefill 视口在光标行；R17 拖动重排保序 + 垃圾桶单条废弃 + 无 Clear；R18 空闲输入转录静止；R3 New Task 列表 = 会话内列表；R15 按钮不存在；R14 入口唯一；R20 泡文本段可拖拽选择 + 非文本段不选中。
  - **visual harness**：R5 弹出锚点帧（对照 z 图6/图7）+ 大脑图标帧；R4 cascade 两帧（不同 provider hover 几何不变）；R17 queue 单条/多条帧（对照 z 图6/图7）；R10 weekly 七格帧；R16 边框分离帧；R2 吸底/上翻两态帧。
- 性能红线：R2 零轮询（纯模型派生）；R17 拖拽零全列表重挂载；R12 不增 IME 路径渲染次数；R18 空闲路径零新增监听（决策收敛纯函数）。

## Out of Scope

- 「↑ 立即」注入钮（Q6 否决）。
- Worked 容器展开跨会话切换记忆（1.6 旧裁决维持——R13 仅 thinking 行）。
- 草稿跨重启持久化（1.6 Q11 裁决维持）；Composer 拖拽 resize 手柄 / 展开态跨重启持久化（1.4 范围外维持）。
- 导航轨 `RAIL_MIN_TICKS = 2` 变更（Q1 现状确认维持）；TUI /tree 键盘功能（1.3 豁免延续）。
- Deep-cwd 会话降级只读打开 / 横幅动作钮 / 技能新建（1.5 候选转正项本批未提报，维持候选）。
- Daily/Cumulative 热力图模式变更（R10 仅 weekly）；DrillDown 会话行跳转替代方案（删除即删，不做行点击跳转）。
- 其余既有豁免清单全部延续（1.5/1.6/1.7 所列；见 `intake-grilling.md` 批次上下文）。

## Further Notes

- **取证链**：四轮记录、Q1–Q9 裁决、file:line 根因、History 链路只读实测（SDK/buildSessionTree/displayRows 对 wrap-up 会话副本全通）、P26 触发源静态未定位（复现定位票）——全录 `intake-grilling.md`。ZCode bundle/实拍帧只读参照（构图校准，资产不入库）。
- **R→票映射纪律**：本 spec 每条 R 必须映射到至少一张票（1.3 R11 掉票教训，1.5–1.7 已执行）。
- **缝确认**：零新缝——全落既有四缝。**additive 契约/投影增量一项**（R17 `reorder_queue_entry`）实施时报备入 host-contract smoke（1.6/1.7 惯例）。
- **ADR 检查**：无新 ADR——R13 视图注册表扩展在 ADR-0006 框架内；R19 会话命名写 fork 自身文件 = 既有 rename 机制（ADR-0002 会话文件纪律不破——SDK 既有写入面）；R17 host 舞步 = 票 100 同机制（ADR-0003 host 架构内）。
- **依赖与波次提示（/to-tickets 用）**：同文件群 A（composer 群）R11→R12→R7 强串行（116→117→118），R18（119）弱邻接随后；同区段 B（菜单群）R3→R4+R5 串行（121→122）；独立可并行 R2/R8/R9+R15/R10/R16/R14/R13/R19/R1/R6/R20；R17 独立大票；**R21（134）本批最后实现**（116–133 全合并后，验证带全部修复启动 app）。
- **操作者待办**：①`ELECTRON_MIRROR=… npm install`（node_modules 0.85.1 → pin 0.86.1——实施前必须）；②实拍图原件复制入 `.scratch/compare/`（pi18-*）；③dev app serialization 口径；④merge-ticket.sh ls-files 补 picode-1-8（默认操作者执行）。

## Comments

- 2026-09-22 (requirements intake → /to-spec): 28 痛点六轮定稿（R1–R21 + P3 现状确认）；Q1–Q9 裁决全记录见 `intake-grilling.md`。工单编号 116 起全局连续，134 为自治空跑发现的 Round 6 增补。
- 2026-09-22 (自治空跑复原重发)：首跑主 Agent 会话因 Finder/Dock 启动 PATH 缺失无法 spawn（P28→R21/票 134 立票）；空跑全部改动已复原（tag/worktrees/分支/run-log/main 两提交均已撤销），批次文档按 19 票重发。
- 2026-09-22 (缝确认)：零新缝——全落既有四缝，已随 spec 发布向操作者报备（1.5/1.6/1.7 先例）。additive 增量一项（R17 reorder_queue_entry）实施时报备入账。
