# PiCode 1.4 需求收集记录（requirements intake，grilling 定稿）

Status: ready-for-spec

2026-09-08/09 需求收集会话产出。操作者报 5 条痛点（真实使用判定，五帧实拍），全部经 main 源码逐项核因 + 会话库只读取证 + ZCode bundle 只读行为取证定稿；/grill-with-docs 两轮十三问（Q1–Q13）定稿，操作者确认共识（Round 2 全答，前沿清空）。本文件是 /to-spec 的唯一输入；术语遵循 `CONTEXT.md`；红线沿用（不碰 Pi/ZCode 内部、ZCode 数据只读、UI 文案全英文）。

## 批次上下文

- v1.3.0 收官（38–47 共 11/11 resolved，main @ 8b7bb8b，tag v1.3.0，vitest 1030/1030）。本批 = **picode-1-4**，工单编号 **48 起全局连续**。
- 已知遗留（操作者待办）：`scripts/merge-ticket.sh:50` 的 Status 门槛 ls-files 只含 `picode-1-3/1-1/1-0` —— **合并前把 picode-1-4 加进去**（1-2/1-3 两批同款惯例，勿再绕）。
- **版本事实（2026-09-09 实查）**：TUI 全局 pi **0.85.1**（操作者已升级，bin/全局 node_modules/npm registry 三处一致）/ 内嵌 SDK **0.84.3**（ADR-0005 锁定）——漂移两版。Q13 拍板：本批带 **SDK 对齐升级票**（详见 R0 与 Q13），**目标版本 = 0.85.1**（写入票面；实施时若 npm 再有新版，重走操作者检查点）。
- 「调用轨迹」等既有词条无缺口；本批新术语草案见文末（随票入 CONTEXT.md，本会话只写 .scratch/ 不碰根目录文件）。

## 取证链

**实拍 5 帧**（2026-09-08，已归档 `.scratch/compare/`，`pi14-` 前缀）：

| 帧 | 内容 |
|---|---|
| pi14-empty-slash-menu | New Task 空态敲 `/` → "No matching commands" 空菜单（R1） |
| pi14-composer-longtext | 空态 composer 粘贴长 prompt：固定 ~74px 高内部滚动，无展开供面（R2） |
| pi14-fork-double-toast | 点 Fork 同时弹黑色 "Forked to a new session." + 红色 "Invalid entry ID for forking"（R3） |
| pi14-narration-in-answer | "请继续"长任务回合正文 = 一整墙工具间过程叙述，最终答案被淹没（R4） |
| pi14-untagged-codeblocks | 会话 01a057f5 四个代码卡左上角无语言标签（R5） |

**会话库只读取证**（`~/.pi/agent/sessions/`，操作者授权只读）：

- **R3 fork 时序实证**：`--Users-liaokechen-work-reco_rank_model-...-content_model_v2--/` 下 dafasdf 会话（01a0810e，20:46:52 建）两条 live 回合；**20:48:16 截图时点无任何新文件** → 该次 fork 整体失败；**20:49:02 出现子会话** 01a08110（`parentSession` 指向 01a0810e，全量克隆 root→真实 entry `50e8b0c6`）→ 第二次 fork 走真实 id 路径成功。同证据链：SDK `dist/core/agent-session-runtime.js:184/191` 为 "Invalid entry ID for forking" 唯一抛点（`getEntry(entryId)` 落空；position 'at' 不限角色，只要 entry 存在）。
- **R4 会话结构实证**：01a0801b（--Users-liaokechen--/2026-09-08T08-20-53-675Z）"请继续"回合中，截图正文段落（"三个问题，逐一修复…"、"有进展，但 strategy→feature…"）全部是**夹在 `TOOL:bash` 之间的 assistant TEXT part**——mid-task 叙述。
- **R5 围栏实证**：01a057f5（2026-08-31）entry#239 四个围栏块语言 tag 全空（```` ``` ```` 裸围栏）；同会话另有 `json`/`bash` 带标签块正常显示。

**ZCode bundle 只读行为取证**（操作者授权沿用 1.3 先例：只读 app.asar 提取行为参数，用后即弃未复制任何资产；提取现场已清理）：

- **Composer（YPe/tMe 编辑器）**：`min-h-10 max-h-40 overflow-y-auto`（40px→160px 随内容自动增高封顶，超出内部滚动；scrollHeight 钳制式 resize）；**i18n 全表无"展开输入"入口——ZCode 没有展开钮**；composer 有 `appSlashCommands` 形参（应用级命令清单独立于会话传入——R1 空态修法先例）。
- **回合分段算法（`Ant`/`Tnt`）**：每段可见正文 = `latestAssistantTextRow`（回退：已结算段的最后一个非尾行仅当它是文本行）；可见正文**之前**的所有行（thinking/工具/更早文本）→ `assistantHistoryRows` → 折叠进 "已工作 {duration}" 容器（`chat.history.workedFor`）；可见正文**之后**的行 → 常显在正文下方；容器运行中自动展开（`assistantHistoryDefaultOpen` 含 `isLastTurn && running`）、结算后收起。汇总行渲染在用户气泡之后、history 块之前。
- **代码卡头部（`yN`）**：`language?.trim() || 'text'` —— **语言缺失回退显示 text，标签永远在**（文件图标 + 小写语言名；右侧 wrap + copy）。
- **fork 失败文案**：`chat.message.fork.failed` = "分叉会话失败：{error}" —— ZCode 的 fork 失败有专门错误提示（对照 PiCode 现状的无条件成功 toast）。

**main 源码核因（file:line 级）**：

- R1：EmptyState.tsx:110 `idleChat = initialChatState()`（slashCommands: []）+ :138-147 展开不补命令；`slash_commands` 事件仅活 host announce 时发送（host/index.ts:300）；菜单构成 = `/compact` + prompt 模板 + 技能（host/composer-list.ts `buildSlashCommands`，票 38 后六条内建已退役）；EmptyState.tsx:29 四个快捷 chips 为硬编码装饰。**auth-probe 现状**：`runAuthProbe()` 只起 `ModelRuntime.create()`（无 resourceLoader、无 cwd 参数）。
- R2：app.css:1124 `.composer-input { min-height: 74px; resize: none }` 固定高；Composer.tsx 无任何 scrollHeight/自增高逻辑；EmptyState 与 ChatView 共用同一 Composer 组件。
- R3：chat-reducer.ts:164 `entryId(index) = m{index}` 合成 id（live 流式路径 user/assistant 条目全用）；:458 `message_end` 只置 streaming:false **不回填真实 id**；AnswerBlock.tsx:35 `forkAnchor = turn.answer[最后 part].entryId`；App.tsx:994-996 `handleFork` **无条件**先弹成功 toast；host/index.ts:565 `runtime.fork(entryId, { position: 'at' })`；resume 重放路径（history_loaded ← parse.ts `extractTranscriptItems` 用 `entry.id`）带真实 id → fork 正常——1.1 票 16 验收走种子会话 resume，live 新会话首次 fork 必炸（潜伏缺陷，从未工作过）。
- R4：turn-collapse.ts:120-137（票 23 设计即"所有 assistant 文本 part 无条件进 answer，仅 thinking/工具/审批进 work"；注释明言 "always rendered outside the container"）；groupTurns 为 ChatView/FollowView 三面共享纯模型。
- R5：Markdown.tsx:118 `{language !== null && <span className="md-code-lang">…}` 条件渲染；markdown-blocks.ts `codeLanguage` 无 tag 返回 null。

## R1–R5 决议（每条：痛点 / 归类 / 根因 / 定稿）

### R0 SDK 对齐升级票 —— 流程性前置票（Q13）
- **事实**：TUI 0.84.4 / npm 最新 0.85.1 / 内嵌 SDK 0.84.3，漂移两版。
- **定稿**：一张票三段式——① 侦察（diff 0.84.3→**0.85.1** changelog 与 API 面：host/renderer 用到的接口、SessionManager/entry 语义、会话格式兼容性，产出改动清单）；② **操作者检查点**（侦察清单给操作者过目拍板后才动代码——操作者明言"具体有什么改动需要和我讨论"）；③ 实施：package.json 升锁 0.85.1 + 适配 + 互通冒烟（TUI↔PiCode 同会话打开）+ 全门禁。排期先行（W1）。

### R1 空态 `/` 菜单通供 —— 缺陷（1.3 R2 空态断供同族）
- **痛点**：New Task 空态敲 `/` → "No matching commands"；会话内菜单正常（compact+模板+技能）。
- **定稿（Q1a/Q2a/Q3a）**：空态菜单列**模板 + 技能，不含 /compact**（会话域命令，无会话无意义；六条退役命令维持退役）；数据源 = **扩展 auth-probe**：probe 增 resourceLoader 枚举（additive 契约增量，实施时报备），probe 带 cwd 参数，New Task 切换目录时防抖重探；空态点选命令 = **插入 `/name ` 文本进 composer**（与 in-session 交互一致，首条消息送达时由 SDK 解析）。ZCode `appSlashCommands` 同型先例。

### R2 Composer 自动增高 + 展开钮 —— 全新需求
- **痛点**：长 prompt 在两处 composer 都是固定 ~74px 盒内滚动；无展开供面。
- **定稿（Q4b + Q12）**：① **自动增高** 74px（现状）→ **160px**（ZCode 校准封顶），超出内部滚动；② **展开钮**（操作者指定偏离——ZCode 无此钮）：**常驻**、位于**输入卡右上角**（Q12 操作者拍板，推翻 footer 推荐）；点击原位展开至约主区一半高（钳制 ~280–560px，下推转录，非浮层）；再点 / Esc 收回；**发送后自动收回**；**无快捷键**（Tooltip 纪律：纯图标钮无快捷键只显短描述 "Expand input"）。两处 composer 共组件自动同享。

### R3 fork live 路径修复 + toast ack 制 —— 缺陷（潜伏缺陷双叠加）
- **痛点**：新会话点回复 Fork → 成功+报错双 toast，fork 实际失败。
- **定稿（Q5 按推荐）**：**双修**——① **真实 entry id 回填**：host 事件（user_message / message_end）携带真实会话条目 id（additive 契约增量，实施时报备），chat-reducer 用真实 id 替换合成 id，live 路径 fork 从此可用；② **toast ack 制**：成功 toast 仅在 host 确认（fork 后 re-announce/session_created）后弹，失败弹 `session_command_error` 错误 toast（ZCode 有 fork.failed 文案先例），废除 App.tsx:995 无条件乐观 toast。**边界维持**：运行中点 Fork 现状静默忽略（requireSettledSession），不给提示（回合中 fork 语义危险，范围外）。

### R4 回合正文分割（ZCode 同型）—— 全新需求（修订票 23 显示规则）
- **痛点**：长任务回合正文 = 过程叙述墙，最终答案被淹没（pi14-narration-in-answer）。
- **定稿（Q6 参照 ZCode + Q10 同步 + Q11a）**：采纳 ZCode 分段规则——**每回合只有最后一个文本块是正文**（位置规则，非语义判定）；它之前的 thinking / 工具 / **更早叙述文本**全部收进 Worked 容器（运行中容器照旧自动展开可见、结算后收起——票 23 既有行为不变）；它**之后**的工具行**常显在正文下方**（转写顺序，ZCode 对齐）。**ChatView 与 FollowView 同规则**（Q10a：groupTurns 为共享纯模型，豁免反而要加开关制造双规则）。fork anchor 语义不变（最后文本 part 所在 entry = 最后文本承载 entry）。**作用面含 Live Follow（只读跟随）**——操作者经解释后拍板同步。

### R5 代码卡语言标签回退 —— 缺陷（对齐项，小）
- **痛点**：裸围栏代码卡无语言标签（pi14-untagged-codeblocks 四框）。
- **定稿（Q8a）**：`language?.trim() || 'text'` 回退——裸围栏显示 **text** 标签（ZCode 同型）；卡片其余 chrome 不动；**不加文件图标**（最小对齐）。

## Grilling 记录

- **Round 1**（Q1–Q9）：Q1 空态菜单内容 a（模板+技能，无 compact）/ Q2 数据源 a（扩展 auth-probe + cwd 重探）/ Q3 空态点选 a（插入文本）/ Q4 形态 **b（自动增高 + 展开钮，操作者指定偏离 ZCode）**/ Q5 按推荐（双修 + 运行中静默维持）/ Q6 参照 ZCode（最后文本块=正文）/ Q7 操作者问「FollowView 是什么？」→ 现场解释（只读跟随视图，与 ChatView 共享 groupTurns）后进入 Round 2 / Q8 a（text 回退，无图标）/ Q9 **升级对齐**：先升级全局 Pi Agent，PiCode 带 SDK 升级票，具体改动须与操作者讨论。
- **Round 2**（Q10–Q13）：Q10 同步（FollowView 同规则）/ Q11 a（答案后工具行常显下方）/ Q12 六子项——常驻 ✓、**位置=输入卡右上角（操作者改判，推翻 footer 推荐）**、尺寸/收回/无快捷键/74→160 封顶按推荐 / Q13 同意（三段式升级票 + 先行排期）。

## 归类记录

- 缺陷 3：R1（空态断供）、R3（live fork 潜伏缺陷 + toast 语义）、R5（标签回退）。
- 全新需求 2：R2（自动增高+展开钮）、R4（回合正文分割，修订票 23）。
- 流程性前置 1：R0（SDK 对齐升级，非痛点驱动）。

## 术语（随票入 CONTEXT.md；本会话只写 .scratch/ 不碰根目录文件）

- **回合正文（Turn Answer）**：一个回合中常显于 Worked 容器之外的 assistant 文本块，有且仅有一个 = 该回合**最后一个文本块**（位置规则，非语义判定）；更早文本块为过程叙述归容器；正文之后若仍有工具行则常显于正文下方。ChatView 与 FollowView 同规则。_Avoid_: 最终答案（暗示内容语义判定）；中间输出（含义过宽）。
- **过程叙述（Interim Narration）**：回合内、最后一个文本块之前的 assistant 文本块——模型夹在工具调用间的工作叙述；归 Worked 容器（折叠隐藏，容器展开时可见），不进正文。_Avoid_: 中间结果；思考（thinking 是另一类 work item）。
- **输入展开（Composer Expand）**：Composer 输入卡右上角常驻展开钮：原位展开至约主区一半高（钳制 ~280–560px，下推转录非浮层），再点/Esc 收回，发送后自动收回；无快捷键（悬停提示只显短描述）。配套**自动增高**：输入区高度随内容 74px→160px（ZCode 校准封顶）增长，超出内部滚动；New Task 与会话内两处同规则。_Avoid_: 全屏编辑（形态不符）；弹窗（非浮层）。

## 依赖与波次提示（/to-tickets 用）

- **W1 先行：R0（SDK 对齐升级票）**——R1（probe 踩 resourceLoader，SDK 版本可能改其 API）与 R3（host 事件面）**须在其合入后开**；R2（Composer+app.css，纯 renderer）、R5（Markdown.tsx，纯 renderer）可与 W1 并行；R4（turn-collapse 共享模型，不踩 SDK 契约）技术上也并行，建议 R0 合入后开以吃准事件语义。
- **同文件双写者预警**：R1 触 auth-probe.ts/auth-status.ts + main/index.ts + EmptyState 接线；R3 触 contract.ts + host/index.ts + chat-reducer.ts + App.tsx —— 两票都动契约（各自 additive），**contract.ts 与 host/index.ts 邻接**，/to-tickets 裁量串行或验证区段不相交。R4 触 turn-collapse.ts + TurnContainer/AnswerBlock/FollowView；R2 触 Composer.tsx + app.css（右上角展开钮可能触 Composer 卡片结构）——与 R4 不同文件，无碰撞。
- 验收延续四缝：Seam-1 表驱动（R1 目录投影 probe 报告→空态菜单行；R2 高度投影纯函数 + 展开状态机；R3 chat-reducer 真实 id 回填用例；R4 groupTurns 分割决策表——最后文本块/过程叙述/后续工具/流式尾/错误回合；R5 语言回退投影）、host-contract smoke（R1/R3 各自 additive 增量报备）、electron smoke（R1 空态菜单列真命令+点选插入；R2 增高/展开/发送收回；R3 新会话 fork 成功且仅一成功 toast；R4 长回合正文仅尾块；R5 裸围栏现 text 标签）、visual harness（R2 展开态帧；R4 长回合帧；R5 裸围栏帧）。
- 性能红线：R2 自动增高用 scrollHeight 钳制（ZCode 同型），禁逐帧 setState 风暴（票 30/46 memo 先例）；R4 纯模型改动不得引转录重渲染风暴。

## 操作者待办

1. ~~升级全局 Pi Agent~~ **已完成（2026-09-09 实查：0.85.1，npm latest 同版）** → R0 目标版本已落定。
2. 合并前把 `picode-1-4` 加进 `scripts/merge-ticket.sh:50` ls-files（勿再绕）。
