# PiCode 1.6 需求收集记录（requirements intake，grilling 定稿）

Status: ready-for-spec

2026-09-14 需求收集会话产出。操作者报 **13 条痛点**（实拍 13 帧开局），全部经 main 源码逐项核因 + Pi SDK 文档核对 + 会话库只读取证定稿；/grill-with-docs **两轮十二问（Q1–Q12）**定稿——Round 1 十问（Q1–Q10）+ Round 2 两问（Q11–Q12，Q7 否决与两处操作者补充展开的新前沿）。本文件是 /to-spec 的唯一输入；术语遵循 `CONTEXT.md`；红线沿用（不碰 Pi/ZCode 内部、ZCode 数据只读、UI 文案全英文）。工单编号 **68 起全局连续**（67 已被 1.5 批降级并入 64 消耗）。

## 批次上下文

- v1.5.0 收官实查（2026-09-14）：main @ `05a97c4` = tag v1.5.0；54–66 共 13/13 resolved（67 无独立文件，降级并入 64）；手册归档 `.scratch/archive/session-prompts-v1.5.md`；内嵌 SDK 0.85.1 = 全局 pi 0.85.1（ADR-0005 无漂移）；无 worktree 残留。
- 本批 = **picode-1-6**，spec/工单目录 `.scratch/picode-1-6/`。

## 取证链

**实拍十三帧**（2026-09-14，操作者桌面，已归档 `.scratch/compare/`，`pi16-` 前缀）：

| 帧 | 内容 |
|---|---|
| pi16-context-ring | ZCode 模型钮左侧上下文小圆环（R5） |
| pi16-context-ring-hover | ZCode 圆环 hover 弹卡：4.1万/50万（8.2%）+ 分类占比（消息 46.5%/系统工具 40.3%/技能 5.5%/系统提示词 4.8%/MCP 工具 2.5%/其他 0.4%）+ 平均缓存命中率 89.2%（R5） |
| pi16-skill-raw-text | PiCode 选中技能后 composer 留裸文本 `/skill:grill-with-docs`（R1） |
| pi16-slash-no-match-persist | 手打 `/skill:grill-with-docs` 时菜单显 "No matching commands"（R1 匹配缺陷 + R2 常驻病源） |
| pi16-zcode-skill-card | ZCode 选中技能渲染成卡（紫图标 + "grill-me"）（R1 对齐锚点） |
| pi16-slash-menu-multiline | 以 `/` 开头的多行文本输入时菜单常驻 + Shift+Enter 被拦截直发的现场（R2/R3） |
| pi16-menu-no-scroll | 斜杠菜单键盘导航：灰底选中行压在列表底缘、下一项被裁切、列表不滚（R3） |
| pi16-settings-providers | 设置窗 Models 节 provider 字母序直出，已配置的 bella（绿点）沉底（R8） |
| pi16-model-menu-providers | composer 模型二级下拉 provider 同为字母序（R8） |
| pi16-zcode-turn-filebar | ZCode 回合级「9 个文件已更改 +507 -1」折叠条 + README.md 文档卡（R10 对齐锚点） |
| pi16-zcode-turn-filebar-expanded | 展开态：每行 = 图标+文件名+路径+±计数+审查+打开（R10） |
| pi16-at-no-match | 输入 `@ts` 显 "No matching files"（R12：候选集 cap 病 + 零匹配常驻） |
| pi16-zcode-at-menu | ZCode @ 弹层：插件（4 条）/文件分组 + 「输入内容以搜索插件、文件或对话」（R12 对照——插件/会话类 Pi 无消费面不做） |

**main 源码核因（file:line）**：

- R1：`shared/composer/commands.ts:37` `pickCommand` 对 skill 走 `{kind:'insert', text:'/skill:name '}`——纯文本插入无卡结构；`:22` `filterCommands` 的 fuzzy 用查询 `skill:xxx` 匹配裸名 `xxx` 必零匹配（pi16-slash-no-match-persist 实锤）。
- R2/R3：`Composer.tsx handleChange`——`next.startsWith('/')` 即开菜单（**整段文本**不看光标行位）；`handleMenuKey` 的 Enter 分支**不查 `event.shiftKey`**，零匹配时直接 `dispatch()` 发送（pi16-slash-menu-multiline 现场实锤）；零匹配态菜单不自动关。
- R3（滚动）：`composer/menus.tsx` `MenuRow` 全链无 `scrollIntoView`；`Composer.tsx handleMenuKey` ArrowDown 无界 `i+1`，与 `menus.tsx flatMenuKey`（取模版）两套键盘处理并存，实际生效的是无界版（事件先被 textarea onKeyDown 拦截）。
- R4：`menus.tsx ComposerPopover` 挂 document 级 `mousedown` 外点关闭——点 chip 本体：mousedown 先关 → 重渲染 → click 落到 `menu===null` 的 toggle（`menu === x ? null : x`）又弹开。Access/Model/Thinking 三 chip 全中。
- R5：PiCode 无此供面。数据可得性：usage 四元组（input/output/cacheRead/cacheWrite）在会话文件（`usage/types.ts` UsageTokens；ADR-0002 ✓）；**contextWindow 不在契约**（`models_available` 载荷 `ProviderModels[]` 无此字段）；ZCode 分类分解（消息/系统工具/技能/系统提示词/MCP 工具）为 ZCode 内部记账，**Pi 会话文件无数据支撑同口径**。
- R6：`EmptyState.tsx:337-341` 只覆写 `onSetModel`/`onSetThinkingLevel`（票 41 pick 链），**`onSetAccessMode` 漏覆写**——透传 `App.handleSetAccessMode` → `sendFocused`（App.tsx:514）→ New Task 无 host（`focusedIdRef.current === null`）命令**静默丢弃**。契约侧 `SessionDefaults = {providerId?, modelId?, thinkingLevel?}`（preferences.ts:19）**无 accessMode**。
- R7：`shared/scroll-stay.ts` `shouldAutoScroll = selfSent || (nearBottom && grew)`，`nearBottom` = 距底 <160px（`STICK_THRESHOLD_PX`）；`ChatView.tsx:130-133` 每个流式 delta 跑一次 effect，带内即 `scrollTop=scrollHeight` 强拽——轻微上滑仍在带内，与滚轮逐帧互搏=抖动。
- R8：`host/auth-probe.ts:454` `collectAuthStatuses` 按 `models.getProviders()` 注册表序直出（零排序；小写 bella 按 ASCII 沉底）；composer `composer-list.ts groupModelsByProvider` 注释自述 "first-seen provider order kept"。全链无「已配置置顶」概念。
- R9：`App.tsx handleOpenSession`（:855）——`summary.id === focusedId` 与 `inAppIds.has(summary.id)` 两分支只切注册表焦点，**不清 `newTaskOpen`**；主区渲染条件 `newTaskOpen || !showTranscript ? <EmptyState>`（:1333）——焦点在后台换了，主区还是 New Task。
- R10：PiCode 现状 = 逐工具卡（`ToolCard.tsx` FILE_PATH_TOOLS read/write/edit/ls）+ Review tab（git 全仓 diff，`ReviewTab.tsx`+`DiffView.tsx` 已有渲染器）；无回合聚合。**数据实锤**（会话库只读查询 `--Users-liaokechen--/2026-09-08T07-19-49-051Z_*.jsonl`）：edit 工具结果带 `details.diff`（+/- 行级 diff 文本）；write 结果只有字节数文本（"Successfully wrote 5623 bytes to …"）；转录投影 `shared/sessions/parse.ts:263` 只留 `{output, isError}` **丢 details**。
- R11：机制底座已有——契约 `navigate_tree`（contract.ts:101 "move the leaf to an earlier entry, same file"）+ TreePanel（`TreePanel.tsx`，点击行移 leaf）+ 票 66 fork。Pi 原生语义：SDK docs sessions.md:108 "Lets you edit and resubmit, creating a new branch"；:131-135 分支摘要可选、"1. no summary"——**navigate_tree 同文件移叶天然 No summary**。缺「编辑重发」入口。
- R12：Pi 原生支持 @——SDK docs extensions.md:2688 "built-in slash-command **and path provider**"（@ 路径补全=插入路径文本；PiCode 现语义与之对齐）；ZCode 的插件/会话类为 ZCode 自有消费面（pi16-zcode-at-menu），Pi 无。候选集病：`host/files.ts` `listRelativeFiles` cap 1500 条/深度 8/目录字母序 DFS——家目录等大目录在字母序靠前目录耗尽 cap，`@ts` 必空（pi16-at-no-match 实锤）；零匹配常驻同 R2。
- R13：`Composer.tsx` `value` 为组件局部 useState；ADR-0006 后台不渲染+切回重挂载——会话切换即丢草稿；New Task（EmptyState）卸载同丢。全应用无任何草稿持久。

**SDK 文档核对**（node_modules/@earendil-works/pi-coding-agent/docs/，0.85.1）：sessions.md /tree 三节（branching/edit-resubmit/summary 选项）；extensions.md:2688 内置 path provider；models.md:207 `contextWindow` 为 pi-ai Model 字段（host 可读）。

## R1–R13 决议（每条：痛点 / 归类 / 定稿）

### R1 技能/模板卡 —— 全新需求（对齐 ZCode）+ 菜单匹配小缺陷并入（Q1=a + Q12）
- **痛点**：slash 菜单选中技能后 composer 留裸文本 `/skill:name`（pi16-skill-raw-text）；ZCode 渲染成卡（pi16-zcode-skill-card）。手打 `/skill:xxx` 菜单反而零匹配（自家的插入形态搜不到自己的行）。
- **定稿**：composer 输入值升级为「卡 + 文本」结构——选中技能或 prompt 模板后渲染**结构化卡**（icon + 名称 + × 移除），参数文本跟卡后，发送时重组 `/skill:name args` / `/name args`（发送语义与今天逐字节一致，纯渲染层）。**单槽 + 替换**：同时最多一张卡（Pi 语义一条消息一个行首命令），再选 = 替换；卡在场时输入 `/` 仍开菜单，选中即替换卡；× 清卡。菜单匹配修复：`skill:` 前缀可剥匹配（手打 `/skill:gri` 能搜到行）。prompt 模板同待遇。卡形态对齐 pi16-zcode-skill-card（icon + 名，无 tooltip——Tooltip 词汇只管控件）。

### R2 斜杠菜单触发面修订（含 Shift+Enter 修复）—— 缺陷（Q2 + 操作者补充「空格也关」）
- **痛点**：以 `/` 开头的多行文本（如真实报告）让菜单常驻（pi16-slash-menu-multiline）；零匹配也常驻（pi16-slash-no-match-persist）；菜单开着时 Shift+Enter 被拦截、零匹配态直接发送。
- **定稿**：触发面收紧 = **光标位于首行行首 `/` token 内**（value 以 `/` 开头且光标前无换行、无空格）才开菜单；**换行即关**（Enter/Shift+Enter 产生换行）；**空格即关**（token 终止——操作者补充）；光标移出 token 即关；**零匹配不渲染菜单**（"No matching commands" 常驻框消失，Enter 落回发送路径）；`handleMenuKey` Enter 分支加 shiftKey 守卫——**Shift+Enter 在任何菜单态永远换行**。@ 文件菜单同规则（R12 共用实现）。

### R3 菜单滚动跟随 + 键盘统一 —— 缺陷
- **痛点**：键盘导航把灰底选中行移出可视区，列表不滚（pi16-menu-no-scroll）。
- **定稿**：MenuRow 选中变化 `scrollIntoView(block:'nearest')`；`Composer.handleMenuKey` 与 `menus.tsx flatMenuKey` 两套键盘处理**统一为一处**（clamp/取模一处管，ArrowDown 无界修复）；hover 同步 index 维持既有 onHover。四类菜单（slash/file/access/model/thinking 全部经 cmp-menu-list 的）同修。

### R4 chip 弹层开关竞态 —— 缺陷
- **痛点**：权限/模型/思考三 chip 点开后再点本体不收起。
- **定稿**：ComposerPopover 的 mousedown 外点关闭**忽略 owning chip**（mousedown 目标落在打开该弹层的 chip 内则不关，由 chip 自身 click toggle 收起）；实现形态（ref 回传/事件标记/stopPropagation）由票裁量；验收口径 = 再点必关、真外点仍关、点弹层内行不误关。三 chip（Access/Model/Thinking）全修。

### R5 上下文圆环 —— 全新需求（Q3 全按推荐）
- **痛点**：ZCode 模型钮左侧有上下文小圆环，hover 显容量+分类+缓存命中率（pi16-context-ring / pi16-context-ring-hover）；PiCode 无。
- **定稿**：① 位置 = composer 模型 chip 左侧圆环；**仅 ChatView**（FollowView / New Task 不做——回底钮先例）。② 口径 = 最近一条 assistant message usage 计入上下文占用（**input + cacheRead + cacheWrite + output 全计入**）/ 模型 contextWindow；**实施期与 Pi TUI 同场景校准**（同会话同刻对照）。③ hover = 数据弹层（非 Tooltip 组件）：百分比 + used/limit tokens + IN/OUT/cacheRead/cacheWrite 四元组 + 缓存命中率（cacheRead/(input+cacheRead)）；**ZCode 分类分解不做**（会话文件无此记账——数据源如实原则）。④ 降级 = 无 assistant 消息/无 usage 显灰环、无 hover；compaction 后派生自最新 usage 自然正确（纯投影）。**additive 契约增量**：`ModelRef` 增 `contextWindow?: number`（`models_available` 载荷，host 从 pi-ai Model 读——实施时报备入账）。

### R6 New Task 权限链补全 —— 缺陷（票 41 补链漏项）（Q4 按推荐）
- **痛点**：New Task 空态权限菜单能点开、选择无反应（chip 不变、不知是否生效）。
- **定稿**：补成票 41 同型 pick 链——EmptyState 增 `accessPick` 本地态（AccessMenu onPick 覆写为本地 set，chip 即时反映所选），`startTask` 并入创建参数生效；**跨重启不持久**（与 model/thinking pick 同型）；未选 = Pi fallback + "default" 小标（`modelIsDefault` 先例）。**additive 契约增量**：`SessionDefaults` 增 `accessMode?: AccessMode`（`create_session` 载荷；旧载荷缺字段照常校验通过——实施时报备入账）。

### R7 吸底方向感知 —— 缺陷（票 45 阈值带副作用）（Q5 按推荐 a）
- **痛点**：流式输出时轻微上滑与自动吸底逐帧互搏，文字剧烈抖动。
- **定稿**：**方向感知解除**——滚轮/触控板**向上**滚动任意量立即解除吸底 pin；滚回底部（isNearBottom）或自己发送/回底钮才恢复；**160px 阈值只保留给回底钮显隐**。「内容增长不拽人」是票 45 立法本意，带内强吸违背之——本修让滚轮永远赢。`shouldAutoScroll` 纯模型扩展（Seam-1 表驱动，新增 reader-held-away 输入）；**仅 ChatView**（票 45 同界）。

### R8 provider/模型排序 —— 全新需求（Q6 按推荐）
- **痛点**：设置窗 Models 节与 composer 模型下拉均注册表字母序直出，已配置的 bella 沉底（pi16-settings-providers / pi16-model-menu-providers）。
- **定稿**：两处同规则——**已配置（有凭据）在前、未配置在后，组内各按字母序**；composer 维持打开时定位+高亮当前 provider，模型列内不重排（高亮即可）；**零新契约**——renderer 用 App 已持有的 `settings.auth`（auth-probe 报告）join 排序。

### R9 New Task 切换修复 —— 缺陷（回归级可用性）（修复本体免问）
- **痛点**：点新建会话后点侧栏其他会话零反应，主区仍是 New Task。
- **定稿**：`handleOpenSession` 的 `focusedId===summary.id` 与 `inAppIds.has(summary.id)` 两分支补 `setNewTaskOpen(false)`——从 New Task 态点会话行**必然**离开 New Task 主区（跟随/resume 分支已有该清理）。验收含「New Task 态点活会话行 → 直接切到该会话视图」。

### R10 回合文件条 —— 已豁免项转正（1.1 findings 记「文件更改条+撤销 超范围仅记录」，操作者提报转正）（Q8 全按推荐）
- **痛点**：ZCode 每回合在正文下方聚合「N 个文件已更改 +X −1」（对话粒度），展开见 per-file 列表、审查开 diff、打开开文件（pi16-zcode-turn-filebar / -expanded）；PiCode 只有逐工具卡与 git 全仓 Review。
- **定稿**：① 粒度 = 每回合（groupTurns 边界）一条，渲染于**常显段末尾**（正文下方，对齐 ZCode 构图）；live 随工具落定增长。② 折叠态「N files changed +X −Y」+ 展开 per-file 行（图标+文件名+路径+±计数+**Review**+**Open**）；数据 = 回合内 edit/write 工具聚合——edit 的 ± 从 `details.diff` 解析、write 显 "+new" 不计行数、**同文件多次 edit 合一行**（diff 依序拼接）、read/ls 不入条。③ Review = 侧板开**回合 diff 标签**（复用 DiffView 渲染 details.diff——是回合 diff 非 git diff，与 Review tab 并存）；Open = 既有预览深链。④ **撤销钮不做**（1.1 纪律维持，操作者确认）；文档文件不重复渲染独立卡（既有 ToolCard 已在）。**additive 投影增量**：转录条目/事件带 `details.diff`（`parse.ts:263` 现丢弃——实施时报备入账）。

### R11 编辑重发 —— 全新需求（机制底座已有）（Q9 + 操作者补充「主动停止后必须复现」）
- **痛点**：想编辑任何已发消息 = Pi 的 /tree 回退上一步重发（No summary 模式）；PiCode 无此供面。
- **定稿**：① 入口 = 用户消息行 hover 尾部「**Edit**」钮（全英文）。② 语义 = `navigate_tree` 到该 user entry 的**父 entry**（同文件无损移叶 = 天然 No summary——Pi sessions.md 分支摘要选项不涉及）+ composer **预填原文**聚焦 + 发送 → SDK 原位分叉新分支（sessions.md:108 原生语义）；**无确认框**（分支无损，旧分支全保留、树面板可达）；发送后轻 toast（票 66 fork-toast 先例）。③ agentRunning 时编辑钮隐藏；**用户点 Stop 后 agent_end 落地即复现**（链路已验证：abort_turn → host 中止 → `agent_end` → `chat-reducer.ts:532/261` agentRunning=false——验收项写死，不得停留隐藏态）；可编辑对象 = **全部落定 user 消息**（含 steer/follow-up 注入的）。④ composer 已有未发送草稿时点 Edit = 直接替换原文（草稿保护由 R13 承担）。

### R12 @ 口径与候选集 —— 缺陷 + 范围裁决（Q10 全按推荐）
- **痛点**：@ 弹层与斜杠同病（零匹配常驻/不滚动）；`@ts` 在大目录下必然 "No matching files"（pi16-at-no-match）；操作者问：Pi 不支持 @ 就去掉。
- **定稿**：① **@ 保留**，语义锁定 = Pi 原生 **path completion**（extensions.md:2688 内置 path provider——插入路径文本，现实现语义正确）；**插件/会话分类不做**（ZCode 自有消费面，Pi 无——MCP 出局同款纪律「供面与 Pi 消费面严格一致」）。② UX 与斜杠菜单同规则（R2 触发面/关闭 + R3 滚动 + Shift+Enter 永远换行）。③ 候选集修复 = **repo 内 `git ls-files`**（全量、快、准），非 repo 维持 walk+cap+列表尾 "**truncated**" 提示行。

### R13 composer 草稿保留 —— 全新需求（Q7 被否决产生 → Q11 定界）
- **痛点**：New Task 打了字切走（或切会话）再回来，已打未发的字全丢（含图片）。
- **定稿**：草稿 = **文本 + 已贴图片**；生命周期 = **内存级**（应用运行期保留——切走切回/再开 New Task 都在；**重启不保留**，操作者拍板不需跨重启）；**每会话草稿槽**（会话视图注册表存 per-session 草稿——修复 ADR-0006 视图重挂载丢草稿的对侧）+ **New Task 单槽**（App 层级）；空草稿不占槽；发送后自然清空。

## Grilling 记录

- **Round 1（Q1–Q10）**：Q1 技能卡形态 **= a**（结构化卡；prompt 模板同待遇）/ Q2 触发面修订**按推荐 + 操作者补充「空格也关触发面」**/ Q3 圆环口径全按推荐 / Q4 New Task 权限链按推荐 / Q5 吸底退出 **= a 方向感知** / Q6 排序按推荐 / Q7 草稿取舍**被否决——「草稿需要保留」**（升级出 R13，展开 Round 2）/ Q8 回合文件条按推荐（撤销不做确认）/ Q9 编辑重发按推荐 + **操作者补充「主动终止 agentRunning（点 Stop）后编辑钮必须复现」**（现场验证 agent_end 链路成立，落为验收项）/ Q10 @ 范围裁决按推荐。
- **Round 2（Q11–Q12）**：Q11 草稿定界 **= ①文本+图片 ②内存级（重启不保留）③一并做 per-session 槽**（会话切换丢草稿的对称扩展，操作者拍板一并做）/ Q12 卡单槽规则**按推荐**（单槽+替换）。
- 至此前沿树空：13 条痛点 × 全部边界（异常态/空态/并发/失败恢复）均有裁决。

## 归类记录

- 缺陷 6：R2（触发面+Shift+Enter）、R3（滚动）、R4（竞态）、R6（票 41 补链漏项）、R7（票 45 副作用）、R9（切换失效，回归级）。
- 全新需求 5：R1（技能/模板卡）、R5（上下文圆环）、R8（排序）、R11（编辑重发）、R13（草稿保留）。
- 已豁免项转正 1：R10（回合文件条——1.1「范围外仅记录」）。
- 缺陷 + 范围裁决 1：R12（@ UX 缺陷；范围裁决 = 保留 path-only、不做插件/会话类）。
- 调查存档不立票 0。

## 术语（随票入 CONTEXT.md；本会话只写 .scratch/ 不碰根目录文件）

- **技能卡（Skill Card）**：composer 内选中技能或 prompt 模板后渲染的结构化卡（icon+名称+×），单槽、再选替换、参数文本跟卡后；发送时重组 `/skill:name args`，发送语义不变。_Avoid_: 芯片（Access mode chip 是审批档位控件）；命令文本（裸文本是修复前的形态）。
- **上下文圆环（Context Ring）**：composer 模型 chip 左侧的圆环，最近一条 assistant usage 对当前模型 contextWindow 的占用投影；hover 数据弹层显百分比+四元组+缓存命中率；无数据灰环；仅 ChatView。_Avoid_: 进度条（不表达生成进度）；用量（Usage 是跨会话统计口径，圆环是当前会话瞬时投影）。
- **回合文件条（Turn File Changes）**：回合常显段末尾的文件更改聚合行：「N files changed +X −Y」折叠、per-file 列表展开（±计数+Review+Open）；数据 = 回合内 edit/write 工具的会话记录派生（details.diff），非 git 状态。_Avoid_: 文件卡（ToolCard 逐工具卡是另一物）；Git 更改（Review tab 是全仓 git diff）。
- **编辑重发（Edit & Resend）**：用户消息行 hover Edit 钮发起的原位分支编辑：移叶到该消息父 entry + 预填原文 + 发送分叉新分支（No summary）；旧分支无损保留。_Avoid_: 重发（无编辑语义）；fork（开新会话文件，不是原位分支）。
- **草稿（Composer Draft）**：切换视图仍保留的 composer 未发送内容（文本+图片）；per-session 槽 + New Task 单槽，内存级、重启即失。_Avoid_: 队列（Queue 是已提交待注入的消息）。

## 依赖与波次提示（/to-tickets 用）

- **同文件群 A（composer 菜单/卡系）**：R2、R3、R4、R12、R1 全落 `Composer.tsx` + `composer/menus.tsx` + `composer/list-menus.tsx` + `shared/composer/*`——**强串行**（建议 R2 触发面 → R3 滚动 → R4 竞态 → R12 @ 候选集 → R1 卡结构最后、体量最大）或合并验证区段。
- **同文件群 B（视图切换/草稿）**：R9 + R13 同触 `App.tsx` + `EmptyState.tsx`（+R13 的注册表视图状态）——**串行（R9 先、R13 后）**或同票。
- **三个 additive 契约增量**（实施时报备入 host-contract smoke）：R5 `ModelRef.contextWindow?`；R6 `SessionDefaults.accessMode?`；R10 转录条目/事件带 `details.diff`。R11/R12/R13 零契约（R11 走既有 navigate_tree；R8 零契约 renderer join）。
- 独立可并行：R7（scroll-stay+ChatView）、R8（设置窗+ModelMenu 排序）、R11（用户消息行+树面板语义复用）。
- R10 与 R11 都触转录行渲染（常显段/用户消息行）——弱邻接，/to-tickets 裁量波次。
- R1、R6、R10、R13 触 EmptyState/Composer 共组件——New Task 与会话内两处同规则验收。

## 操作者待办

1. ~~证据帧归档~~ ✅ 本会话已复制 13 帧入 `.scratch/compare/`（pi16-* 前缀）；Desktop 原件可清。
2. 合并前把 `picode-1-6` 加进 `scripts/merge-ticket.sh:50` ls-files（1-2/1-3/1-4/1-5 四批同款惯例）。
3. 实施期跑 dev app / smoke 遵守 AGENTS.md dev-app serialization（新票验收项内嵌 ps 自查——照 1.5 口径）。
