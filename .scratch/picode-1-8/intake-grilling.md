# PiCode 1.8 需求收集记录（requirements intake，v1.7.0 后批次）

Status: ready-for-spec

2026-09-21/22 需求收集会话产出。操作者报 **30 条痛点**（Round 1–7 同前 + Round 8 终验反馈两条：v1.8.0 开发完成后的 npm run dev 终验发现两处交付物未达 ZCode 参照），全部经 main 源码逐项核因（file:line 全录于本文件）+ 会话文件只读实测（SDK SessionManager.open / buildSessionTree / sessionTreeDisplayRows 对真实会话副本全链路实跑）定稿。术语遵循 `CONTEXT.md`；红线沿用（不碰 Pi/ZCode 内部、ZCode 数据只读、UI 文案全英文、会话文件改动仅限 SDK 既有写入面）。工单编号 **116 起全局连续**（1.7 批已消耗 81–115，113 号空缺不复用）。

## 批次上下文

- v1.7.0 收官实查（2026-09-21，本会话开场）：main @ `342f296` = tag v1.7.0；34 票（33 实现 + 109 wontfix）在册；手册已归档 `.scratch/archive/session-prompts-v1.7.md`；**pi-subagents 0.70.1 = npm 最新、pi-mcp-adapter 2.35.0 = npm 最新、SDK pin 0.86.1 = npm 最新 = TUI lastChangelogVersion**（ADR-0005 零漂移，无对齐检查点票）；**node_modules 实装仍 0.85.1（收官后未跑 npm install）——已提醒操作者 `ELECTRON_MIRROR=… npm install`，属环境同步非代码需求**；merge-gate `scripts/merge-ticket.sh:50` 现列 picode-1-0…1-7，**开目时需补 picode-1-8**（默认留给操作者，授权后 intake 可代补——2026-09-16 起先例）。
- 本批 = **picode-1-8**，spec/工单目录 `.scratch/picode-1-8/`（开场已创建）。

## 取证链

**操作者实拍帧**：2026-09-21/22 会话内贴图 20+ 张（图1–图15 + 第二批图1–图7 + 裁决消息两图）。若有 Desktop 原件请操作者复制入 `.scratch/compare/`（`pi18-*` 前缀）——本会话无法从聊天贴图落盘。

**main 源码核因（file:line）**：

- P1/P23 History 0 rows：`host/index.ts:173` treePayload（buildSessionTree(rawEntries(manager), homedir())）；`:999` request_tree → `if (runtime) sendTree()`（无 try/catch）；`:402-421` announceCurrentSession（session_created 先发、`if (resumed) { sendHistory(); sendTree() }`）；`handleFork` `:806-820` fork 后 `announceCurrentSession(true)`（理应发树）；`main/host-supervisor.ts:183-188` 事件转发用转发时刻 `binding.sessionId` 打标（session_created 先 announce 再 emit，无打标竞态）；`:79` session_command 按 sessionId 定向；renderer `App.tsx:773` sendFocused 带 sessionId；`shared/session-registry.ts:355` session_tree 按 scope 落账。**决定性实测（只读）**：对 wrap-up 会话文件副本（`/tmp/probe-session.jsonl`）用仓库 node_modules SDK 0.85.1 实跑 `SessionManager.open().getEntries()` = 840 条、`buildSessionTree` = 841 节点无抛错、`sessionTreeDisplayRows` = 835 行——**数据层全通**；supervisor/render 链静态全通。静态排查穷尽 → 复现定位票。
- P2 导航轨映射：`shared/navigator-rail.ts:131` VIEWPORT_PROBE_FRACTION = 0.35 + `anchoredTurnId`（top ≤ probeY 的最后一条）——live 回合刚开始时用户气泡在视口下部（Working 容器 + composer 占底部 ~25%），够不着 35% 探针线 → 锚定留上轮。图2（Working · 14s）几何精确复现。
- P3 导航轨阈值：`shared/navigator-rail.ts:41` RAIL_MIN_TICKS = 2（票 46 ZCode 校准）；`railAnchors` 对 live 回合同样产出锚点（turn.user 非 null 即入）——第二回合 live 期 tick 已显示，与 ZCode 一致。
- P4 provider 列表：New Task = `App.tsx:1664-1676` `newTaskCatalog`（auth-probe 全目录，settings/auth 通道）→ 含未配置 provider；会话内 = `host/index.ts:446` `modelsAvailable()` = `modelRuntime.getAvailableSnapshot()`（仅可用）。
- P5 cascade 列高：`app.css:7016` `.cmp-cascade{display:flex;max-height:320px}`（默认 stretch 两列等高）+ `:6848` `.cmp-popover{bottom:calc(100%+8px)}` bottom 锚定——hover 换 provider → 右列内容高变 → 弹层向上长/缩 → 光标下行移位 → hover 漂移振荡。
- P6 弹出锚点/图标：`app.css:6863` `.cmp-popover-right{left:auto;right:0}`（右对齐整卡）；`Composer.tsx` ThinkingMenu/ModelMenu align='right'；思考图标 = GaugeIcon（`Composer.tsx` footer）。
- P7 ⌘J 聚焦：`TerminalDock.tsx:36-76` focusSeq 双 rAF 机制在位（票 105）；「新开会话」路径嫌疑 = create 后视图重挂载/composer 聚焦与终端聚焦时序竞争（票 106 乐观卡/98 焦点纪律为候选干扰源）；票 105 smoke 未覆盖新会话入口。
- P8 技能清空文本：`Composer.tsx` pickTextMenuRow card 分支 `setCard(decision.card); updateValue('')`（注释自辩「菜单开着时 value 必为触发 token」）；`shared/composer/menu-surface.ts:36` textMenuSurface = 首行首字符 `/`+caret 前**无空白**即开——先有文本再回开头打 `/` 时整段首行被当 query token，选中即 `updateValue('')` 全清。图片独立 state 幸存（操作者实测吻合）。
- P9 死 cwd 组排序：`shared/sessions/group.ts:84-90` bySortOrder 仅 updated/created/manual，无活性桶；`shared/sessions/cwd-liveness.ts` 现成活性判定可复用。
- P10 零用量模型：usage 图表族（TrendChart/DonutChart）不过滤零用量模型（图9：qwen38_27 0 tokens 入圆环图例）。
- P11 方块图：`usage/HeatmapView.tsx` weekly = 周聚合格（30 天 ≈ 5 格）；tooltip 现状与曲线/圆环不一致；最左格焦点圈左线被容器裁剪；零用量格不渲染。
- P12+补充 展开态缩高：`Composer.tsx` 高度 layout effect typing-commit 路径**不看 expanded**——每次 value 变更（含删除字符）跑 `composerAutoGrowHeight`（`shared/composer/expand.ts` 钳制 74–160px）；expandState 仍 'expanded'（缩小钮在）。
- P13/14/15 IME 滚动：同 layout effect 每次输入 5 步舞步（height auto → 重测 → 写入 → 恢复 scrollTop → revealComposerCaret）；`revealComposerCaret`（`Composer.tsx` 尾部）光标行 = `padTop + split('\n').length-1 × lineHeight`——**硬换行计数**，软换行段落下算出的「光标行」非视觉行；CJK 逐字换行 vs 拉丁按词换行错位幅度不同 = 中英文差异来源。IME compositionupdate 每键触发整轮舞步。
- P16 thinking 折叠：`ThinkingRow.tsx:23` `useState(false)` 组件本地态——设置跳转卸载工作区 → 重挂载全折叠；`shared/chat-reducer.ts:191` expandedTurns（Worked 容器）在 registry 反而存活（其「跨切换不记忆」注释是票 56 时代对容器的裁决）。
- P17 设置双入口：`TitleBar.tsx:121-133` 齿轮（票 63，⌘, toggle，右上）+ `Sidebar.tsx:1280` GearIcon（左下）。
- P18 Open task：`usage/DrillDownPanel.tsx:85-89` onOpenTask = 跳回该会话主界面（UsagePage → App 聚焦）。
- P19 MCP 边框：`app.css:8216` `.settings-mcp-status-line` 与 Global servers 卡间距缺失。
- P20/P22 queue：`QueuePanel.tsx`（票 100：行内 Edit + × + 全局 Clear）；`app.css:7184-7286` `.queue-item` padding 5px 10px（行高≈31px）vs `.queue-panel-clear` height 26px + `.queue-panel{align-items:flex-start}` = 高度错位。host 侧镜像 = `shared/queue-mirror.ts` + `host/index.ts:616-678` 舞步（票 100 机制，重排可复用）。
- P21 prefill 视口：queue Edit → `App.tsx:473` queue_entry_edited → PREFILL_EVENT（`Composer.tsx` prefill：caret 置尾 + focus）——但 textarea 视口不跟随：revealComposerCaret 硬换行计数误判「已可见」不滚动 → 视口停开头。
- P24 fork 命名：`handleFork` fork 后无 setSessionName；`set_session_label`（session_info 写入）= 既有机制可复用。
- P26 空闲输入移动转录：`ChatView.tsx:145-185` stick effect deps = [entries, expandedTurns, session]（不含 composer 高度）；composer auto-grow 纯 imperative 写高度（无 setState）——转录移动的精确触发源静态未定位（嫌疑：composer 高度变化引发滚动裁定点/重钉、Copy/Fork 行是否计入底部目标待查）；操作者实测：agent 停止态输入框任何操作 → 转录上移（消息尾 Copy/Fork 行被推出视口，图1→图2）。**复现定位 + 修复同票**。
- P27 用户泡文本不可选：`app.css:74` `body{user-select:none}`（全应用禁选）+ `:4341` `.msg-assistant{user-select:text}`（助手文本显式放开）——`.msg-user`/`.user-bubble-text` 无 user-select 规则，继承 body 的 none → 发送文字拖拽选不中。不对称是遗漏非设计（票 97 泡重构前后的裸泡从未放开过）。

## 关键裁决（Round 4，Q1–Q9）

- **Q1（P3）**：维持 `RAIL_MIN_TICKS = 2`——单回合不显示符合预期；ZCode 第二回合（哪怕 agent 未回复完）即显 tick，PiCode 现状已一致（live 回合计入 anchors），**无代码变更，现状确认**。
- **Q2（P2）**：确认——**吸底时锚定 = 最新回合（含 live）**；上翻阅读时维持探针规则（锚定跟随阅读位置）。
- **Q3（P10）**：按推荐 A——**严格 0 token 剔除**（非零极小用量保留，数据源如实）；剔除面 = 曲线图例 + 圆环 + 圆环图例。
- **Q4（P11）**：**B——weekly 改「本周 7 天」视图**：7 格按周内日排（周起始票内依 ZCode 校准裁量）、零用量日以空色格渲染、hover tooltip 显当日用量（与曲线/圆环一致）；Daily/Cumulative 不动；最左格焦点圈裁剪修复。
- **Q5（P16）**：**B——thinking 行展开状态跨所有重挂载记忆**（per-session 视图注册表存储）；1.6「容器展开跨切换不记忆」旧裁决仅对 Worked 容器维持，thinking 行按新裁决走。
- **Q6（P22）**：**「↑ 立即」不做**；queue 重构 = ZCode 构图：左拖动柄段内重排（越上越先发）、行内 Edit + 垃圾桶（替代 ×），**垃圾桶替代全局 Clear（删 Clear）**；保留 Steer/Follow-up 角标、两段分组、段内可拖；steer/follow-up 发送时机照旧。
- **Q7（P24）**：按推荐——源有名 → `Fork of <名>`；源无名 → `Fork of <侧栏标题投影（首条用户消息）>`。
- **Q8（P9）**：确认——死 cwd 组沉底**含 Manual**（手动拖不动死组位置，优先级大于一切排序逻辑）。
- **Q9（报备项）**：queue 重排走 host 侧镜像舞步（票 100 同机制），新增 additive op `reorder_queue_entry` **报备入 host-contract smoke**；SDK 契约只有文本数组，毫秒级投递竞态照票 100 口径诚实记录。

## R1–R23 决议（每条：痛点 / 归类 / 定稿）

### R1 History 0 rows 复现定位 —— 缺陷（P1 长会话 + P23 fork 会话同症）
- **症状**：①长会话（wrap-up：发送→终止→History 恒 0 rows，后续发送不恢复）；②fork 会话 History 无信息（可复现路径）。
- **已排除（实证）**：数据层全链路（SDK open/getEntries 840 → buildSessionTree 841 节点 → displayRows 835 行）；supervisor 打标时序；sendFocused 定向；fork resumed=true 理应发树。
- **定稿**：复现定位票——dev app 插桩（request_tree 是否到达 / session_tree 是否发出 / 树载荷节点数）→ 定位修复；fork 路径为第一复现场景；「0 rows/This session has no entries yet」空态文案与真空会话的区分不在本票（诚实文案维持）。

### R2 导航轨 live 锚定 —— 交付行为修订（P2，Q2）
- **定稿**：吸底态（isAtBottom 口径）锚定 = 最新回合（含 live）；非吸底维持探针规则（`anchoredTurnId` 现行为）。收敛 navigator-rail 纯模型（锚定决策表扩展），ChatView/FollowView 同规。

### R3 provider/model 菜单统一 —— 交付行为修订（P4）
- **定稿**：New Task 的 provider 列表按会话内口径——仅**已配置** provider（复用票 76 的 configuredIds 过滤，从「配置优先排序」收紧为「仅配置项」）；会话内不动。

### R4 cascade 列高解耦 —— 缺陷（P5）
- **定稿**：hover 换 provider 时弹层几何稳定——列高解耦（弹层高度不随 hovered provider 的 model 数变化，model 列内部滚动）；振荡源（bottom 锚定 × stretch 联动）消除。纯 CSS/组件裁量。

### R5 菜单锚点 + 大脑图标 —— 交付行为修订（P6）
- **定稿**：ModelMenu/ThinkingMenu 弹出位置改为**左对齐触发钮**（x = chip 左缘，y = 悬浮于输入区上方——ZCode 构图；窗口边界钳制票内裁量）；思考档位图标 GaugeIcon → **大脑形**（自绘 SVG，ZCode 形制参照、资产不入库）。

### R6 ⌘J 终端聚焦回归 —— 缺陷（P7，票 105 回归）
- **定稿**：dev app 复现定位（「新开会话 + ⌘J」场景；嫌疑 = create 后重挂载/composer 聚焦时序竞争）；修复后**全 ⌘J 入口 electron smoke**（会话内 / 新会话 / boot 空态 / 桥接切回）——操作者明示「已修复问题不得复发」，回归防线为本票第一验收项。

### R7 技能选中保留既有文本 —— 缺陷（P8）
- **定稿**：技能卡选中不再清空输入框——只剥离触发 token（`/query`），其余文本保留为卡后参数（与 CONTEXT.md 技能卡「参数文本跟卡后」语义对齐）；caret 落余文原位；纯渲染层零契约；技能卡词条随票修订。

### R8 死 cwd 组沉底 —— 新需求（P9，Q8）
- **定稿**：Projects 视图组排序加活性桶——**死 cwd 组恒沉底**，优先级大于 Updated/Created/**Manual** 一切排序；组内行序不受影响；Manual 手动序对死组不生效（拖不动位置）；复用 `cwd-liveness.ts`；纯模型扩展 + 表驱动。

### R9 用量零用量模型过滤 —— 缺陷（P10，Q3=A）
- **定稿**：所选 Time Range 内 **0 token 模型**从 Daily Token Trend 图例 + Model Usage 圆环 + 圆环图例剔除；非零极小用量保留（数据源如实）；范围切换动态生效。usage 纯投影层过滤 + 表驱动。

### R10 Token Activity weekly 本周 7 天 —— 交付行为修订（P11，Q4=B）
- **定稿**：weekly 模式改为**本周 7 天**——7 格按周内日排、零用量日空色格渲染、hover tooltip 显当日用量（与曲线/圆环同族）；最左格焦点圈左线裁剪修复；Daily/Cumulative 不动；周起始依 ZCode 校准票内裁量。

### R11 展开态输入高度稳定 —— 缺陷（P12 + 补充：删除字符同症）
- **定稿**：typing-commit 高度路径按 expandState 分流——展开态重投影 `composerExpandHeight`（不改 expandState、缩矮只由 toggle/Esc/⌘E/sent 触发）；收起态维持 auto-grow 74–160。输入与删除同规则。Seam-1 决策表扩展。

### R12 composer 光标跟随与 IME 滚动稳定 —— 缺陷（P13/P14/P15 + P21 prefill 视口）
- **定稿**：①`revealComposerCaret` 光标行定位从硬换行计数改为**视觉行定位**（软换行正确——复现定位后定实现：range 测量或逐行几何）；②IME composition 路径的舞步抖动消除（dev app 插桩：compositionupdate × 舞步 × 原生滚动竞争实测）；③PREFILL_EVENT（queue Edit 与 edit-resend 共用）prefill 后**视口滚动到光标行**（显示消息末尾文本）；④操作者原话边界：「拉到最下就是最下方，输入不应该改变光标位置」。中英文差异（P13/14/15 三场景）为验收矩阵。

### R13 thinking 行展开跨重挂载记忆 —— 交付行为修订（P16，Q5=B）
- **定稿**：thinking 行展开态提升到 **per-session 视图注册表**（expandedTurns 同层）——设置跳转往返、会话切换、折叠往返全保留；会话期内存级（重启回默认，与草稿同口径）；Worked 容器展开语义不变（1.6 旧裁决维持）。

### R14 设置入口去重 —— 清理（P17）
- **定稿**：TitleBar 右上齿轮删除（票 63 UI 面退役）；左下 Sidebar 齿轮保留；⌘, 快捷键不动。

### R15 用量 Open task 按钮删除 —— 清理（P18）
- **定稿**：DrillDownPanel 行内 Open task 按钮删除（功能 = 跳回会话，操作者判定冗余）；行保留纯展示。与 R9 同页同波次并票（124）。

### R16 MCP 状态条边框分离 —— 缺陷（P19）
- **定稿**：`.settings-mcp-status-line` 与 Global servers 卡边框分离（间距/层级纯 CSS，票内裁量）。

### R17 queue 面板 ZCode 重构 —— 新需求 + 缺陷（P20 + P22，Q6/Q9）
- **定稿**：仿 ZCode 构图重构——**左侧拖动柄段内重排**（越上越先发；steer/follow-up 各段内部排序，发送时机照旧）；行内 **Edit**（既有舞步）+ **垃圾桶**（行级废弃，替代 ×）；**全局 Clear 删除**（垃圾桶替代）；**无「立即」钮**（Q6 否决）；保留 Steer/Follow-up 角标两段分组；行高对齐修缮（P20）随重构落地。**additive 契约增量：host op `reorder_queue_entry`**（镜像舞步：clearQueue → 重排 → 按序重投喂，图片从镜像取、保序——票 100 同机制）；竞态诚实记录 + host-contract smoke 报备。

### R18 空闲输入不移动转录 —— 缺陷（P26）
- **定稿**：agent 非运行态（settled/idle）下 composer 任何操作（输入/删除/换行/高度变化）**绝不移动转录滚动位置**；运行态既有吸底/重钉语义不变（票 93 闩、票 94 锚定不回退）；Copy/Fork 行等尾部元素计入底部目标（操作者假设的「不算底部」一并查证）。dev app 复现定位 = 第一验收项。

### R19 fork 自动命名 —— 新需求（P24，Q7）
- **定稿**：fork 落地后即刻 `setSessionName("Fork of …")`——源有名跟其名；源无名跟侧栏标题投影（首条用户消息，与索引扫描器同源）；写 fork 自己的会话文件（session_info 既有机制）；session_renamed + 索引刷新照旧；用户可再改名（自动名不锁定）。

### R20 用户泡文本可选 —— 缺陷（P27，免问定稿）
- **痛点**：发送的文字无法用鼠标拖拽选中其中部分文字，不好复制（Copy 动作只有整条拷贝）。
- **根因**：`body{user-select:none}` 全局禁选 + `.msg-assistant{user-select:text}` 显式放开——用户泡从未放开，不对称遗漏。
- **定稿**：用户泡**文本段**放开 `user-select: text`（`.user-bubble-text`——与助手文本同规则）；技能角标段与图片缩略图不放开（渲染件非文本）；FollowView 同规；Copy 语义不变（整条拷用户原话）；选择不破坏既有交互（缩略图钮/Edit 行）。机制唯一，免问定稿。

### R21 Finder/Dock 启动可 spawn —— 基础设施缺陷（P28，Round 6）
- **痛点**：Finder/Dock 正常启动的 PiCode 里，会话内 spawn pi-subagent 失败；操作者实测解决办法 = 终端带 PATH 启动 `PATH="$HOME/.nvm/versions/node/v22.19.0/bin:$PATH" open -a PiCode`。
- **根因方向**：launchd 启动的 GUI app 不继承交互 shell 的 PATH——操作者的 node/pi 在 nvm 版本目录，spawn 链找不到可执行；终端 `open` 继承 shell 环境所以通。**精确断点 = 票内第一验收项插桩定位**。
- **定稿**：主进程启动时合成子进程 spawn 用的 PATH——①`$SHELL -lc 'echo $PATH'` 登录 shell 快照（缓存一次、超时降级）②静态探测常见 node 安装点（nvm 版本目录 / /usr/local/bin / /opt/homebrew/bin / ~/.pi/agent/bin）③注入所有需要 PATH 的子 spawn；**LSEnvironment 否决**（PATH 机器相关，不入通用 bundle）。修复对新启动实例生效（运行中实例不热更）——v1.8 自治批次运行本身仍靠操作者启动 workaround。纯文本票。

### R22 cascade 终验重修——列分离 + 贴钮锚点（P29，Round 8；票 122 交付物修订）
- **痛点**：终验 npm run dev 实测——provider/model 两列**没有真正分开**（仍是连体等高面板），且选择卡**悬浮在输入栏上**而非贴在触发按钮上。
- **定稿**：按 ZCode 截图重修——①两列分离（各自独立高度与边界，ZCode 构图：不同高、各自圆角/边界）；②选择卡（provider/model 卡与 thinking 卡）**贴在触发按钮上**（紧贴 chip 边缘），不是输入栏上方。参照帧 = 实施前提（z19-menu-*），需多模态会话。

### R23 Token Activity 终验重修——三模式日格热力图（P30，Round 8；票 125 交付物修订，Q4=B 裁决被终验改判）
- **痛点**：热力图逻辑与 ZCode 不符。
- **定稿（操作者直给全规格）**：**无论什么统计口径，每个方块 = 一天，颜色深度 = 用量**。①日统计：方块 = 当天用量；悬浮卡 = 当天用量，悬浮在方块旁。②周统计：方块 = 当周开始到当天的用量；悬浮卡 = 这周的累积用量，悬浮在**当周最上方的方块**上。③累计统计：方块 = 最开始到当天的用量；悬浮卡 = 从最开始到当周的用量（包括当周），悬浮位与周统计同型。网格构图与覆盖窗口对照 ZCode 帧校准（贡献图式：周为列、日为行——票内定）。参照帧 = 实施前提（z19-heatmap-* 六帧），需多模态会话。

### 现状确认（无代码变更）
- **P3 导航轨阈值**：`RAIL_MIN_TICKS = 2` 维持——单回合不显示符合预期（Q1）；live 第二回合计入 anchors 已与 ZCode 一致。操作者 Round 5 复核确认 P2 已入 R2（票 120）。

## Grilling 记录

- **Round 1（P1–P15 报入）**：操作者十五条三段式痛点（History 0 rows / 导航轨映射 / 1 轮不显 / provider 列表 / 列高联动 / 弹出位置+大脑图标 / ⌘J 回归 / 技能清空文本 / 死组排序 / 零用量模型 / 方块图三连 / 展开态缩高 / IME 上移三连），附 15 图。intake 逐条核因（P1/P7/P13-15 静态穷尽转复现定位）。
- **Round 2（P16–P22 + P12 补充）**：thinking 折叠 / 设置双入口 / Open task / MCP 边框 / queue 行高 / queue Edit 光标 / queue ZCode 重构 + 「删除字符也缩框」补充。
- **Round 3（P23–P24）**：fork History 空（**与 P1 同症——给出可复现路径**）+ fork 自动命名「Fork of」。
- **Round 4（Q1–Q9 + P26）**：九问裁决（Q1 维持 2 tick / Q2 确认 / Q3=A / Q4=B / Q5=B / Q6 无立即钮 / Q7 推荐 / Q8 确认 / Q9 报备）；P26 空闲输入移动转录报入（操作者附机制推测：「自动校准到会话底部、Copy/Fork 行可能不算底部」）。
- **Round 5（P27 + P2 复核）**：操作者复核 P2 是否已考虑（答：R2/票 120 在案）+ 用户泡文本不可选报入——根因实锤（body 禁选 × 助手放开的对称缺口），机制唯一免问定稿。
- **Round 6（P28，自治空跑发现）**：操作者按主 Agent prompt 首跑批次，PiCode 会话内 spawn subagent 失败（GUI 启动 PATH 缺失）； workaround 实证 = 带 nvm PATH 启动。操作者裁决：立票修复（Finder/Dock 启动也能 spawn）+ 复原空跑全部改动 + 修订批次文档与主 Agent prompt 后重跑。定稿 R21（票 134）。
- **Round 7（P28 修订，第二次空跑实证双根因子）**：PATH workaround 已生效后 spawn 仍失败——深挖出第二根因子：**app 捆绑 pi-ai 0.85.1 无 transcript 工具导出（0.86.1 才有），pi-subagents 0.70.1 的 review.js 需要它**。操作者裁决三项：①134 移至**批次最后实现**（116–133 全合并后）；②测试 = Finder/Dock 实启 + 应用内 spawn 全流程；③修复落 `~/PiCode` 源码、随 v1.8.0 上线（不碰已发版 bundle）。另：执行环境改定 = **主 Agent 在 Pi Agent 新会话运行（不在 PiCode 内）**。
- **Round 8（P29/P30，v1.8.0 终验反馈）**：19 票全部合并后操作者 npm run dev 终验，报两处交付物未达 ZCode 参照——①cascade 两列未真分离 + 弹出卡在输入栏上（票 122 交付）；②热力图逻辑与 ZCode 不符（票 125 交付；Q4=B 的「本周 7 天」口径被终验改判为 ZCode 三模式日格）。操作者直给全规格（R23）。定稿 R22/R23。**编号勘误**：主 Agent 会话同期已自管操作者直馈的追加轮票 135（队列卡上移，已合）/136（subagent 专属侧栏，已合）/137（大脑图标，已合，见 run-log §5）——本对票避让改号 **138/139**。
- **至此前沿树空**：30 条痛点 → 23 个 R 簇 + 1 项现状确认 × 全部边界均有裁决。

## 归类记录

- 缺陷 15：R1（History 0 rows——复现定位）、R4（列高联动）、R6（⌘J 回归——复现定位）、R7（技能清空）、R9（零用量照显）、R11（展开态缩高）、R12（IME 滚动 + prefill 视口）、R16（MCP 边框）、R17 布局半边（queue 行高）、R18（空闲输入移动转录）、R20（用户泡不可选）、R22（cascade 列未分离/未贴钮——票 122 交付物修订）、R23（热力图口径——票 125 交付物修订）、P21 归 R12、R10 三修中的 tooltip/焦点圈两修。
- 交付行为修订 6：R2（导航轨锚定）、R3（provider 口径）、R5（锚点+图标）、R10（weekly 语义）、R13（thinking 记忆）、R17 重构半边（ZCode 构图替代票 100 形态）。
- 清理 2：R14（入口去重）、R15（Open task 删除）。
- 新需求 3：R8（死组沉底）、R17 编辑排序半边（拖动重排+垃圾桶）、R19（fork 命名）。
- 现状确认 1：P3（导航轨阈值维持）。
- 复现定位 2：R1、R6（+R12 的 IME 细节插桩、R18 的触发源插桩为票内第一验收项）。

- **用户泡文本可选**：正文段与助手文本同规则放开选择；渲染件（技能角标/缩略图）不放开——跟随 R20。

## 术语（随票入 CONTEXT.md；本会话只写 .scratch/ 不碰根目录文件）

- **队列卡（Queue Panel）**：composer 上方的待注入消息列表面板（票 100 交付、票 128 重构定稿）：Steer 与 Follow-up 两段分组带角标，段内**拖动柄重排**（越上越先注入；steer 注入当前回合、follow-up 排队回合后的时机语义不变），行内 Edit（预填原文+原图）与垃圾桶（单条废弃）；无全局 Clear（垃圾桶替代）。ZCode 队列卡同构。_Avoid_：Clear 钮（已随票 128 退役）；消息队列（SDK agent 队列的 UI 镜像，非抽象队列）；立即注入（「↑ 立即」已裁决不做）。
- **词条修订**：「导航轨」补锚定规则（吸底时锚定 = 最新回合含 live；上翻维持探针规则）；「Manual 排序」补死 cwd 组恒沉底（优先于一切排序含 Manual）；「技能卡」补既有文本共存（选中只剥离触发 token、余文为卡后参数）。

## 依赖与波次提示（/to-tickets 用）

- **additive 契约/投影增量一项**：R17 `reorder_queue_entry` op（实施时报备入 host-contract smoke）。
- **同文件群 A（composer 群）强串行**：R11（116）→ R12（117）→ R7（118）——全落 Composer.tsx/expand.ts/menu-surface 消费端；R18（119）在 ChatView/scroll-stay（与 A 群弱邻接，117 后）；R20（133）独立微票（泡文本段 CSS + smoke）。
- **同区段 B（model 菜单群）**：R3（121，App.tsx 数据源）→ R4+R5（122，menus.tsx/app.css/icons）串行。
- **独立可并行**：R2（120，navigator-rail）、R8（123，group.ts）、R9+R15（124，usage 页）、R10（125，HeatmapView）、R16（126，MCP CSS）、R14（127，TitleBar）、R13（129，registry/ThinkingRow）、R19（130，host fork）、R1（131，复现定位）、R6（132，复现定位+smoke）。
- R17（128）独立大票（QueuePanel + host 镜像 + additive op）。

## 操作者待办

1. 实拍图原件若有 Desktop 副本，复制入 `.scratch/compare/`（`pi18-*` 前缀）。
2. `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install`（node_modules SDK 0.85.1 → pin 0.86.1；本批实施跑 dev app / smoke 前必须完成）。
3. 实施期 dev app / smoke 遵守 AGENTS.md dev-app serialization（每票验收项内嵌 ps 自查——1.5 起口径）。
4. `merge-ticket.sh` ls-files 补 `picode-1-8`（默认操作者执行；授权后 intake 可代补）。
