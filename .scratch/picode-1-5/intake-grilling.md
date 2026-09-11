# PiCode 1.5 需求收集记录（requirements intake，grilling 定稿）

Status: ready-for-spec

2026-09-10 需求收集会话产出。操作者报 10 条痛点（三条实拍开局 + 六帧追加），全部经 main 源码逐项核因 + 会话库只读取证 + ZCode bundle 只读行为取证定稿；/grill-with-docs 两轮十四问（Q1–Q14）定稿，Q12 曾因取证插入两度重发后拍板。本文件是 /to-spec 的唯一输入；术语遵循 `CONTEXT.md`；红线沿用（不碰 Pi/ZCode 内部、ZCode 数据只读、UI 文案全英文）。

## 批次上下文

- v1.4.0 收官（48–53 共 6/6 resolved，main @ afd9fbd，tag v1.4.0，vitest 1106/1106；票 52 有 harness 稳健性返工后史——重合入 03c3ab7，全链六阶段 ALL GREEN）。本批 = **picode-1-5**，工单编号 **54 起全局连续**。
- 已知遗留（操作者待办）：`scripts/merge-ticket.sh:50` ls-files 需补 `picode-1-5`（1-2/1-3/1-4 三批同款惯例）。
- 挂起项转正：幽灵 cwd 预警横幅（上批讨论的 B 选项，本批 R1）、Composer 展开钮快捷键（R2）、mermaid 等高级代码块（R4）一并入池；New Task chips 接真实数据操作者未提报，维持挂起。
- 「调用轨迹」等既有词条无缺口；本批新术语草案见文末（随票入 CONTEXT.md，本会话只写 .scratch/）。

## 取证链

**实拍九帧**（2026-09-10，已归档 `.scratch/compare/`，`pi15-` 前缀）：

| 帧 | 内容 |
|---|---|
| pi15-composer-icon-covers-text | composer 首行文本与光标被右上角展开钮遮盖（R3） |
| pi15-empty-worked-container | 零工作项回合：live 空壳 "Working·1s"、落定后容器整体消失（R5） |
| pi15-rail-over-context-menu | 导航轨 tick 束盖住侧栏右键菜单（R6） |
| pi15-thinking-timer-7s / pi15-thinking-timer-reset | Thinking·7s 折叠重开后变 Thinking·3s 重计（R7） |
| pi15-thinking-chevron-up | Thought 展开态箭头朝上，与 Worked 惯例相反（R7） |
| pi15-approval-above-answer / pi15-tool-below-answer | 审批卡悬停在正文上方、批准执行后工具卡跳到正文下方（R8） |
| pi15-post-answer-thinking-misplaced | 工具结果后的思考块爬回容器内、渲染在正文上方（R8） |

**会话库只读取证**（`~/.pi/agent/sessions/`，操作者授权只读；01a0810d = 1.4 intake 会话，操作者在 PiCode 中续用）：

- **R5 零工作项回合实证**：全会话 16 回合中 2 个零工作项（turn 5 = "Q1: a"；turn 13 = entry 272→273 幽灵 cwd 问）。entry 273 = assistant 单 TEXT part（2645ch），零 thinking 零工具——live 空壳 + 落定消失的完整生命周期与 `ChatView.tsx:252` 的 `(turn.hasWork || turn.live)` 条件吻合；FollowView（仅 hasWork）无此病。
- **思维链缺失调查存档（无票，非缺陷）**：操作者质疑 "hello" 回合（entry 292→293）无思维链是 PiCode 未捕捉。三层彻查：① PiCode 接线完整（composer → set_thinking_level → `agentSession.setThinkingLevel`）；② SDK 请求体正确（bella = anthropic-messages 协议，GLM-5.3-flash `reasoning:true`、非 forceAdaptiveThinking → 请求带 `thinking:{type:"enabled",budget_tokens}`）；③ **token 计量反推**——无思考回合 output tokens 与可见内容精确吻合（273：2645ch→1591tok=1.66ch/tok 中文典型比率；293：1074ch→272tok=3.95ch/tok 英文典型比率），有思考回合合计吻合（291：2486ch 文+5760ch 思考→3233tok），且 usage 无 reasoning 字段（SDK 会记录供应商上报的 thinking_tokens，缺席 = 供应商报零）——**模型根本没生成思考 token，不是生成后被丢弃**。同会话同模型同 max 档位 30+ 条消息混杂有无思考（291/275/289 有、273/293/230 无）→ **GLM-5.3-flash 自适应思考：max 是预算上限不是强制开关**。TUI 与 PiCode 共读同一存储，显示逐字节一致。Pi 不可改（红线），供应商不可改，无票可立。
- **R8 回合时间序实证**（entry 298→301）：`user → assistant[THINKING 4918ch, TEXT "好问题…", CALL bash] → 审批挂起 → toolResult → assistant[THINKING 4812ch, TEXT "数据落定…"]`。审批态渲染于正文上方（splitTurn 把 approval 无条件归 work），批准后工具卡落正文下方（tool 在 lastText 后走 afterAnswer）——同一次工具调用两态跳位；工具后的第二个 thinking 被归 work 爬回容器（仅 tool 参与 afterAnswer 判定，票 53 Q11a 裁剪），时间序倒挂实锤。

**ZCode bundle 只读行为取证**（操作者授权沿用 1.3/1.4 先例；两次提取至 /tmp，均用后即弃，未复制任何资产）：

- **mermaid 图卡**（streamdown 管线，`data-streamdown:"mermaid-block"`）：fence=mermaid → 渲染图卡（lazy Suspense 按图型分片全家桶：flow/sequence/gantt/class/er/pie/gitGraph/journey/quadrant/sankey/c4…）；头部小写 mono `mermaid` 标签；右上 sticky 操作钮 = download（SVG/PNG/MMD 下拉）/ copy / fullscreen（浮层 `fixed inset-0` Esc 退）；渲染体带 panZoom 控件。能力位默认全开（`!== false` 即真），应用层仅显式关表格 fullscreen（`pF={table:{fullscreen:!1}}`）。
- **代码卡**：行号默认开（`noLineNumbers` 元参数可关）、`startLine=N` 元参数、download 钮 + copy 钮。
- **表格**：copyTable 家族 = copy / copy as Markdown / copy as CSV / copy as TSV（fullscreen 已关）。
- **零工作项回合**：回合组装处 `u = assistantHistoryRows.length > 0; … u ? <已工作容器> : null`——**ZCode 对零工作回合不渲染容器（连时长行都不渲染）**，正文直接跟用户消息。PiCode R5 的常驻化 = 操作者拍板的 ZCode 偏离。
- **正文后行**：ZCode 把可见正文**之后的所有行**（assistantFollowingRows，不分类型）常显正文下方——R8 的对齐锚点（票 53 Q11a 仅裁剪了 tool，属实现收窄）。

**main 源码核因（模块级）**：

- R1：票 42 基建在位——index-service 每轮 2s 扫描 stat 全部去重 cwd 且 cwdAlive 入 index-changed 签名（目录消失/复现即使零文件变化也触发刷新）；`filterDeadCwd` + supervisor `liveSessionIds` 豁免。缺口 = 活会话 cwd 死亡无任何供面（索引只在重启后过滤）+ 死 cwd 会话从侧栏/⌘K 完全不可见（副作用）。
- R2：`keymap.ts` 全局表仅 ⌘N/⌘K/⌘J/⌥⌘J/⌘B/⌥⌘B（物理 code、meta-only）——**KeyE 空闲**；composer 展开状态机（shared/composer/expand，票 49 Seam-1）有 click/Esc/send 事件，无键位事件。
- R3：`.composer-input` 右 padding 18px；`.composer-expand` 绝对定位 right:8px 26×26 不透明卡色底（注释自述 "text flowing beneath stays masked"）——首行文本与光标穿行钮下。
- R5：`ChatView.tsx:252` `(turn.hasWork || turn.live)`；`groupTurns` hasWork = skillName!==null || work.length>0。
- R6：`.sidebar` z-index:1 构成层叠上下文（为压空态水印），右键菜单 `.sb-context-menu` z-index:80 被困其中；`.chat-body` 无 z-index 不构成上下文 → `.nav-rail` z-index:5 直达根上下文，5>1 盖住整个侧栏。
- R7：`ThinkingRow` 计时 = `useElapsedSeconds(part.streaming)` 组件挂载局部 interval；折叠容器 → body 卸载 → 重开重挂载 → tick 归零（streaming 中或 durationMs 未回填时）。箭头：`.thinking-row-open .row-chevron { rotate(180deg) }` 以 ChevronDown 起底 → 收起↓展开↑，与 TurnContainer（收起›展开⌄）相反。
- R8：`splitTurn` 仅 `index > lastText && kind==='tool'` 进 afterAnswer；approval/thinking 无条件 work.push。

## R1–R8 决议（每条：痛点 / 归类 / 定稿）

### R1 幽灵 cwd：预警横幅 + 灰行 —— 全新需求 + 票 42 副作用转正（Q1/Q2/Q3 均 A）
- **痛点**：活会话 cwd 被删（worktree 合并典型）：运行继续但文件工具显式失败，无任何提示；退出重启后会话从侧栏无声消失（票 42 过滤副作用），点击过的还会 host exit(1)。
- **定稿**：① 活会话 cwd 死亡 → **该会话 ChatView 顶部常驻预警横幅**：纯说明文字（运行可继续 / 文件工具会失败 / 退出后无法重开），**无关闭钮**，cwd 恢复即自动消失（存活性的派生投影）；只影响受感染会话的视图，不动状态点词汇。② 重启后死 cwd 会话从「不可见」改**灰行 + "cwd missing" 说明**：点击弹说明 toast（不 resume——resume 必死维持）；右键菜单保留无害项（Archive / Copy task path / Copy session file path / Copy session ID），无打开类动作；**⌘K 维持排除**。③ 灰行随 cwd 复现自动恢复普通行。④ 信号源零新建：复用 index-service 既有 cwd stat 周期，cwdMissing 投影为 **additive 契约增量**（实施时报备）。

### R2 展开钮快捷键 ⌘E —— 1.4 范围外转正（Q4=A）
- **定稿**：⌘E 全局 toggle（keymap 表加 KeyE，meta-only 无 alt）；作用于当前聚焦会话 composer，New Task 空态同享（共组件）；FollowView 无 composer 自然 no-op；展开状态机新增键位事件（与 click/Esc/send 并列）；再按收回，Esc/再点/发送收回路径全部不变；tooltip 按纪律自动改键帽 ⌘E。

### R3 Composer 图标遮盖修复 —— 缺陷（票 49 引入）（Q5=A）
- **定稿**：textarea 右侧 padding 18→约 44px（预留按钮区：right 8 + 宽 26 + 余量），文本与光标永不穿钮下；折叠/展开两态同规则；**保留 Q12 拍板的右上角位置**（遮盖是缺陷不是位置错误）。ZCode 无此钮（偏离项），无校准参照。

### R4 高级代码块对齐 ZCode——全家庭 —— 全新需求（Q6=C + Q7 按推荐 + Q11=A 全做）
- **定稿**：① **mermaid 图卡**：fence=mermaid **闭合后**渲染图卡（新增 mermaid npm 依赖、按图型懒加载分片不进主包）；小写 mermaid 标签头；download SVG/PNG/MMD；copy 源码；fullscreen 浮层 Esc 退；panZoom。流式未闭合按代码卡显源码；**解析失败回退源码卡**（lang=mermaid 标签），不弹错误。② **代码卡**：行号默认开（noLineNumbers 元参数可关——所有代码卡视觉密度变化，操作者明知拍板）；download 钮（按语言定扩展名存文件）；startLine=N 元参数。③ **表格**：copy as CSV/TSV（copy as Markdown/preview/expand 已有不动）；表格 fullscreen 不做（ZCode 自关）。②③ 的 ZCode 锚点全记录在案。

### R5 Worked 容器常驻化 —— 缺陷修复 + 操作者裁决的 ZCode 偏离（Q10 两度澄清后裁决 + Q12=A）
- **痛点**：零工作项回合 live 显空壳 "Working·1s"、落定后容器整体消失——一显一隐像数据丢失；且静默期（模型尚未吐字）转录区无任何反馈。
- **操作者裁决**：**每个回合必有容器**——「正文输出也算 work 阶段」，容器是回合常驻记录，不允许消失。
- **定稿**：有用户气泡的回合**必有容器**：live "Working · Ns"（首个工作项出现前也常驻），落定 "Worked · Ns"（回放回合无时长沿用票 14 规则只显 "Worked"）；零工作项回合容器体为空且**不可展开**（无 chevron、点击无响应——可展开 ⇔ 体非空）；ChatView 空壳条件删除；FollowView 同规则。**ZCode 偏离记录**：ZCode 零工作回合无容器（bundle `u ? …:null` 实证），操作者拍板常驻。HEAD 回合（无用户气泡孤儿条目）维持现状。

### R6 导航轨层叠修复 —— 缺陷（票 46 引入）（Q9=A）
- **定稿**：让 chat 主区自构成层叠上下文（isolation/等效 z-index 方案），导航轨的 z:5 困在主区子树内，侧栏整体（含 z:80 右键菜单）恢复高于轨道；轨道悬停气泡/回底钮（z:10）随主区子树整体压侧栏之下——本就不重叠，无行为变化。被拒：菜单 portal 到 body（改动更大、定位复杂度）。

### R7 ThinkingRow 计时 + 箭头双修 —— 缺陷（Q14=A；箭头无取舍随票修）
- **定稿**：① 计时基准从组件局部搬到 **entry 级开始时间戳**（折叠/重开不重置——重挂载从同一时间戳推算），落定后 host durationMs 冻结（既有契约），回放块无时长规则不变（会话文件不记录——票 14）。② 箭头对齐 Worked 惯例：**收起 ›、展开 ⌄**（旋转基准反转）。

### R8 回合时间序规则修订 —— 票 53 规则修订（Q13=A + 操作者重申降级规则）
- **定稿**：**lastText 之后的所有行（工具/thinking/审批）按转写顺序常显正文下方，live 与落定同位**（ZCode 同型，修订票 53 Q11a 的「仅工具」裁剪）。审批卡与其工具同位：挂起态即在正文下方，批准后**原位**变工具卡——跳变消除。**中途正文 = 过程叙述**：被新文本顶替的旧答案降级归 Worked 容器（票 53 既有规则，操作者重申「中途的正文不能是最后的正文」）；下一段文本流式开始时重划分、afterAnswer 相应清空——时间序永远成立。lastText 之前的 work 归容器不变；FollowView 同模型。

## Grilling 记录

- **Round 1**（Q1–Q9）：Q1 横幅落点 a（仅受影响会话视图）/ Q2 横幅动作 a（纯文字不可关、恢复即消）/ Q3 灰行 a（点击 toast + 无害菜单 + ⌘K 维持排除）/ Q4 键位 a（⌘E，全局生效）/ Q5 遮盖修法 a（padding 保位）/ Q6 mermaid 范围 **c（全家庭，反问表格 copy 现状）**/ Q7 流式与失败回退按推荐 / Q8 零工作项容器 **被否——操作者澄清是「历史都有容器 vs PiCode 发送的没有」的不一致感知**/ Q9 层叠修法 a。
- **取证插入**：会话库 16 回合构成分析（14 有工作项 / 2 零工作项）+ ZCode bundle 二次提取（`u ? …:null` 零工作无容器实证）。
- **Round 2**（Q10–Q11）：Q10 重问 **再被否——操作者裁决「每回合必有容器，正文输出也算 work」+ 质疑思维链缺失是 bug**/ Q11 修正清单 a（全做：mermaid 全套 + 行号/download/startLine + CSV/TSV；表格 copy 已有实测澄清）。
- **取证插入**：思维链三层彻查（接线/请求体/token 反推）+ hello 回合现场复验（entry 292→293 再次零思考，同会话 291 对照组 5760ch）——结论存档：自适应思考，非缺陷。
- **Round 3**（Q12–Q14）：Q12 空体交互 a（不可展开）/ 操作者追加四痛点（计时重置/箭头反向/审批跳位/工具后思考错位）→ 现场取证 R7/R8 → Q13 时间序 a（**附明确裁决：中途正文降级归容器**）/ Q14 计时口径 a。

## 归类记录

- 缺陷 5：R3（遮盖）、R5（空壳+消失）、R6（层叠）、R7（计时+箭头）、R8（时间序跳变，修订票 53）。
- 全新需求 3：R1（幽灵 cwd 供面）、R2（⌘E）、R4（代码块全家庭）。
- 调查存档不立票 1：思维链缺失 = GLM 自适应思考（模型/供应商侧，Pi 红线不可改）。

## 术语（随票入 CONTEXT.md；本会话只写 .scratch/ 不碰根目录文件）

- **工作容器（Worked Container）**：每个回合（有用户气泡）必有的一行容器：live 显 "Working · Ns" 自动展开（体非空时），落定收起为 "Worked · Ns"（回放回合无时长）；容器体收纳思考/工具/审批/过程叙述；零工作项回合体为空且不可展开；常驻不消失——落定后仍在。_Avoid_: 折叠条（强调折叠丢了常驻语义）；进度条（不表达进度）。
- **预警横幅（CWD Banner）**：会话工作目录被删后在受感染会话视图顶部常驻的说明条：运行可继续、文件工具会失败、退出后无法重开；无关闭钮，目录恢复即自动消失。_Avoid_: 错误横幅（非错误，是状态投影）；toast（非瞬态）。
- **灰行（Dimmed Row）**：侧栏中 cwd 已失效的非活会话行：置灰 + "cwd missing" 说明，点击仅解释不 resume；⌘K 不可达；目录复现自动恢复。_Avoid_: 死行（会话文件未死）；归档（归档是本地整理动作）。
- **图卡（Diagram Card）**：mermaid 围栏闭合且解析成功后渲染的图形卡：标签头 + download/copy/fullscreen/panZoom；解析失败或流式未闭合回退为代码卡。_Avoid_: 代码卡（回退态才是代码卡）；预览（是正式渲染非浮层预览）。
- **常显段（After-Answer Segment）**：回合最后一个文本块之后、按转写顺序常显于正文下方的行（工具/思考/审批），live 与落定同位。_Avoid_: 尾部（含义过宽）；附加输出（暗示次要）。

## 依赖与波次提示（/to-tickets 用）

- **同文件双写者预警**：R5 与 R8 都动 groupTurns/turn-collapse + ChatView/TurnContainer 渲染条件——**强串行建议（R5 先、R8 后）或合并验证区段**；R1 的横幅也接 ChatView——三票同文件，/to-tickets 裁量波次；R2（keymap/App/expand 状态机）与 R3（Composer padding/app.css）都触 Composer 邻接——串行或区段不相交；R4（Markdown/markdown-blocks）独立可并行；R7（ThinkingRow）独立可并行。
- **契约增量**：R1 cwdMissing 投影（additive，实施时报备入账）；R2 展开状态机事件为渲染层内部纯函数扩展（非 IPC 契约）。
- **新依赖**：R4 mermaid（npm，懒加载分片）——操作者拍板（Q6=C）。
- R1 有 main/contract 触点，其余纯 renderer；R4 需网络装依赖。

## 操作者待办

1. 合并前把 `picode-1-5` 加进 `scripts/merge-ticket.sh:50` ls-files（勿再绕）。
2. 实施期跑 dev app / smoke 遵守 AGENTS.md dev-app serialization。
