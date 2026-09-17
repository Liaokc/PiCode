# PiCode 1.7 需求收集记录（requirements intake，v1.6.0 后批次）

Status: ready-for-spec

2026-09-17 需求收集会话产出。操作者报 **17 条痛点**（4 条开局 + Round 2 补充 9 条 + Round 3 补 History/拖拽加码 + Round 4 补充 3 条），全部经 main 源码逐项核因 + Pi 包只读取证（pi-mcp-adapter 2.34.0 / pi-subagents 0.68.0 的 README/docs/源码结构）+ ZCode bundle 只读 i18n 提取 + 会话库/配置文件只读核查定稿；/grill-with-docs **四轮二十问（Q1–Q20）**定稿。本文件是 /to-spec 的唯一输入；术语遵循 `CONTEXT.md`；红线沿用（不碰 Pi/ZCode 内部、ZCode 数据只读、UI 文案全英文、会话文件零改动）。工单编号 **81 起全局连续**（80 已被 1.6 批消耗）。

## 批次上下文

- v1.6.0 收官实查（2026-09-16，本会话开场）：main @ `fa96acf` = tag v1.6.0；68–80 共 **13/13 已合 main**；4 个 additive 增量（77 contextWindow / 80 accessMode / 78 工具 diff 投影 / 79 用户条目图片投影）报备在各票 Comments；SDK **0.85.1** = TUI lastChangelogVersion **0.85.1**（ADR-0005 无漂移）；无 worktree 残留。
- 本会话办结的 1.6 收官遗留：手册归档 `.scratch/archive/session-prompts-v1.6.md`（`a538f66`）；merge-gate ls-files 补 `picode-1-7` + **补回缺失的 `picode-1-2`**（`52a31dc`——票 35 查找此前必失败，功能自测后修复）；**pi16-* 十三帧 track 入 main**（`4b65ac0`——1.6 intake 复制帧未提交的缺口，操作者授权补）。
- 本批 = **picode-1-7**，spec/工单目录 `.scratch/picode-1-7/`。

## 关键前提变化（相对已知裁决/豁免清单）

- **MCP 管理重开（1.5 Q1 出局裁决反转，Q3 操作者确认）**：当初依据「Pi 明文不支持 MCP usage.md:309」——实查 0.85.1 usage.md Design Principles 原文为「intentionally does not include **built-in** MCP, sub-agents … You can build or install those workflows as **extensions or packages**」= **不内建、官方安装路径**，并非不支持。操作者已 `pi install npm:pi-mcp-adapter`（2.34.0，`~/.pi/agent/settings.json` packages 在册，Pi 会话自身加载），TUI 供面 = `/mcp` 面板 + `/mcp setup` + `/mcp enable|disable` + `/mcp-auth` 全管理。「供面与 Pi 消费面严格一致」纪律现在**支持**管理面存在。子智能体（pi-subagents 0.68.0）同款前提，无既往裁决冲突。
- 维持不变的豁免：agent 定义管理（ZCode settings.subagents 对应物——操作者拍板范围外记录）、跨项目移动会话（红线，Q15）、草稿跨重启、圆环 ZCode 分解/进 FollowView、@ 插件/会话类、文件条撤销钮、表格 fullscreen、深色主题等全部延续。

## 取证链

**操作者实拍帧**（2026-09-17 会话内贴图；若有 Desktop 原件请操作者复制入 `.scratch/compare/`（`pi17-*` 前缀）——本会话无法从聊天贴图落盘）：

| 帧 | 内容 | 对应 |
|---|---|---|
| z17-subagent-card | ZCode 右上卡「智能体」行折叠态（✓ 已结束 · 3 ›）+ 文件条含撤销钮 | R5 构图 |
| z17-subagent-dir | ZCode sidePane「子智能体目录」tab：正在运行 · 0（空态文案）/ 已结束 · 3（三卡：✓+标题+已完成+20天+结果预览一行） | R5 构图 |
| z17-subagent-chat | 点卡片后同侧板新开以任务命名的对话 tab（转录 + 回底钮 ↓，tab 条 ×/+） | R5 构图 |
| pi17-composer-img-cover | PiCode composer 4 图压文字现场 | R7 |
| pi17-expand-scrollbar | PiCode 展开钮遮滚动条现场 | R8 |
| pi17-sidebar-grips | PiCode 侧栏 ⋮⋮ grips（Projects 分区行 + PiCode 组行） | R11 |
| pi17-titlebar-arrows | PiCode titlebar ‹ › disabled 占位 | R12 |
| pi17-container-collapsed / -expanded | 工作容器收缩态（正文提升在最上）/ 展开态（时间序、灰体过程叙述） | R15 |
| pi17-focus-rings ×3 | 橙色 focus 圈：+ 钮 / 模型 chip / History 钮 | R16 |
| pi17-bubble-noimg | 发送气泡 5 图只见文本 | R17 |

**main 源码核因（file:line）**：

- R1：`turn-collapse.ts:114`（live turn 携带 fileChanges）+ `ChatView.tsx:354`（`fileChanges.length>0` 即渲染，无 settled 门）；FollowView 同投影。
- R2：`app.css:5104` `.md-table-scroll{max-height:360px}` + `md-table-preview` 浮层（`Markdown.tsx:404/438`）；ZCode 参照帧 `z-table-hover`：表体完整展示、宽表横向滚。
- R3/R4：配置 6 层优先级（`~/.config/mcp/mcp.json` → `~/.agents/*` → `~/.pi/agent/mcp.json` → `.mcp.json` → `.pi/mcp.json`；操作者机器当前**全空**）；状态 = adapter `MCP_STATUS_EVENT` 快照（每 server name/status/toolCount/disabled + totalTools/connectedCount，机器可读）；OAuth 凭据在系统钥匙串（adapter 管理，URL 绑定）；adapter 写目标语义：enable/disable 只写 `.pi/mcp.json` 的 disabled 标志、setup 写项目 `.mcp.json` 或全局 `~/.config/mcp/mcp.json`；外部 host 配置（Cursor/Claude 等）= 兼容只读输入、绝不写。
- R5：控制面 = in-process RPC `subagents:rpc:v1:*`（ping/status/steer/interrupt/stop/resume + fleetStatus DTO + asyncSnapshot；pi-subagents docs/extension-api.md:96）；工件 = `<tmpdir>/pi-subagents-<scope>/async-subagent-runs/<id>/`（status.json：runId/sessionId/state/sessionFile/totalTokens/workflowGraph…；events.jsonl；output-N.log）；子代理 = 真 Pi session 文件（fork 先例）；前台子代理跑在父进程内、后台在 detached runner；PiCode host 自带 inline extension（`gate-extension.ts`）可订阅 pi.events 总线（`subagent:async-started/complete`、`subagent:child-status`）；停止 = RPC stop（顶层 async run；前台子代理 abort/dispose）。ZCode 形态键表：`subagentDirectory.title/running/runningEmpty/ended/showMore("Show 20 more")` + 状态七态 `Running/Waiting/Blocked/Completed/Failed/Cancelled/Lost`；`sidePane.subagent`。
- R6：TurnContainer 无锚定逻辑（`TurnContainer.tsx` 仅 onToggle）——浏览器默认 scroll-anchor 行为不定 → 观感「怪」。
- R7：composer 布局群——textarea height 投影 clamp 74→160px（`Composer.tsx:265-267`）× attachments 条（`app.css:6472`）× 160px cap 内滚；具体复现机制待 dev app 定位。
- R8：`.composer-expand` absolute top:6 right:8 z-index:1（`app.css:1153`）盖住 textarea 右缘滚动条上半段；padding-right 44px 只保首行不与钮重叠（票 58 注释自述）。
- R9：新供面；遮罩浮层交互先例 = `md-table-preview`（R2 删除后其遮罩模式由图片预览继承）。
- R10：composer 展开/收起无过渡动画（对比侧栏/侧板既有过渡）。
- R11：grips = 无 handler 静态图标（`Sidebar.tsx:715` 分区行 / `:784` 组行；hover 让位 `app.css:838`）；组序与组内行序现全由排序键派生（`group.ts:88-90`——Updated/Created 切换合法翻转组序）；会话项目身份 = 文件头 `header.cwd`（`parse.ts:61/176`——分组/resume cwd 全由它派生）；偏好持久化 = `settings.preferences`（hiddenGroups/readStates 同库）；ZCode 语义 = `workspaceSidebar.reorderSection`「移动分区」+ 任务拖拽 drop zone。
- R12：`TitleBar.tsx:54-60` 写死 disabled（aria Back/Forward，零 handler，R1 起遗留）。
- R13：sendPin 单次消费（`ChatView.tsx:151`）+ 排队注入无 entry 变化不触发滚动 + composer 收回 viewport 时序竞态。
- R14：**live 条目 images ABSENT**——host `user_message` echo 只带 text（`host/index.ts:296/495`），`chat-reducer.ts:59-63` 注释明言「images reach the entry on the next replay」；票 79 smoke 验的是回放路径故绿。steer/follow-up 主机路径带图（`toImageContents`，`host/index.ts:512-514`）——丢的是 echo 投影。
- R15：票 56 提升规则——最新文本块 = 临时正文提至容器下方 + 常显段（`turn-collapse.ts` 现行分组，`chat-reducer.ts` 新文本块重划分）；落定态（最终正文 + 折叠容器）为 ZCode 构图。
- R16：`--accent-orange #ec7931`（`app.css:25`）focus-visible 规则散布（`:5006` md-block-btn / `:5244` diagram menu item）；点击/菜单选完焦点滞留按钮 → Enter 原生激活聚焦钮（还会吃掉 composer 的 Enter 发送）。
- R17：`ChatView.tsx:311` `<div className="msg msg-user">{turn.userText}</div>`——images 从不渲染；回放数据已就绪（`parse.ts:309-317`），live 靠 R14 同一 echo 增量。
- R18：`TreePanel.tsx:37` document mousedown 外点关闭不豁免 owning 钮 + `ChatView.tsx:274` / `App.tsx:1559` click toggle = **票 70 同构竞态**（mousedown 先关 → click 再 toggle 又弹开 =「点不收」）。

## R1–R18 决议（每条：痛点 / 归类 / 定稿）

### R1 回合文件条 settled-only —— 1.6 交付行为修订（Q1）
- **痛点**：回合进行中文件条就出现（1.6 票 78 交付「live 随工具落定增长」），干扰阅读。
- **定稿**：live 全程不渲染条；agent_end 落地瞬间原位出现（正文下方/容器后）；**Stop/中断/出错回合照出条**（文件更改是事实投影，与回合成败无关）；FollowView 同规则。

### R2 表格完整展示 —— 1.4 交付行为修订（Q2）
- **痛点**：表体压在 360px 内上下滚才能看全；ZCode 参照帧实为完整展示。
- **定稿**：去 360px cap——表体自然高度随转录流完整展示（转录自身滚动），宽表保留横向滚动；**md-table-preview 浮层与 eye/expand 钮删除**（完整展示后成死 UI；「表格 fullscreen 维持不做」豁免同步维持）；工具栏只剩 复制 / CSV / TSV。

### R3 MCP 节——配置管理 —— 1.5 裁决重开 + 全新需求（Q3/Q4/Q5/Q9）
- **痛点**：装了 pi-mcp-adapter 后无 GUI 管理面。
- **定稿**：设置窗新 **MCP 节**（Skills/Packages 同级）：**全局卡/项目卡**（Skills 双卡同款）——server 列表（多层配置解析 + 来源徽标 + 有效配置合并视图）、**启停**（enable/disable，写 `.pi/mcp.json` disabled 标志 = adapter 同语义）、**增改删 server**（写入目标 = `/mcp setup` 的两个正规目标：项目 `.mcp.json` / 全局 `~/.config/mcp/mcp.json`）、**OAuth 授权流**（server 行 Authenticate → host 经 adapter 起流 → 系统浏览器 → localhost 回调自动完成；**手动粘贴回调 URL 兜底输入**（网关/手动场景，Q9 操作者确认「要做」）；凭据全在 adapter/系统钥匙串，PiCode 零凭据读写）、打开配置文件入口、needs-auth 徽标。
- **红线**：外部 host 配置（Cursor/Claude 等）= 兼容只读发现、绝不写（adapter 同纪律）；PiCode 不重复实现 adapter 的 host-config discovery 默认关闭语义。

### R4 MCP 状态投影 —— 全新需求 · additive 增量（Q4）
- **定稿**：server 行连接状态（connected/failed/needs-auth/not-connected/disabled + toolCount）——host inline extension 订阅 adapter `MCP_STATUS_EVENT`（pi.events 进程内总线）转发 renderer；按「**聚焦会话的 adapter 快照**」投影，无活跃会话时如实显无数据；懒启动 server 不因查看状态而连接（数据源如实）。**additive 契约增量：host→renderer 状态事件（实施时报备入 host-contract smoke）**。与 R3 拆两票（Q4 拍板）。

### R5 子智能体供面 —— 全新需求 · additive 增量（Q6/Q7/Q8/Q14）
- **痛点**：装了 pi-subagents 后 PiCode 无任何子代理可见性与控制（TUI 有 FleetView + `/subagents-fleet`）。
- **定稿（Q6 = (b) 全进侧板，三张 ZCode 截图构图锁死）**：
  - **侧板新「Subagents 目录 tab」**：Running/Ended 两段；状态徽标对齐 ZCode 七态词汇的 Pi 映射（Running/Waiting/Blocked/Completed/Failed/Cancelled/Lost → pi-subagents state 投影，票内定映射表）；"Show 20 more" 步进；空态文案对齐（"No running subagents"）。数据 = **父会话文件 subagent 工具调用记录重放**（ADR-0002 精神：会话记录是唯一事实源，重开会话可重建列表）+ **async 工件（status.json）live 增补**（tmpdir 工件会被清理、不作历史源）；嵌套子代理只显顶层（折叠计数，Q7）。
  - **点击目录行 → 同侧板开「子代理对话 tab」**（以任务命名，一子代理一 tab，tab 条 ×/+；转录渲染复用主转录组件族 + 底部 composer）：运行中发送 = **steer**（RPC acknowledged 通道，投递失败如实显回执，Q8①）；**已结束只读转录**（resume 复活不做——豁免候选，Q8②）。
  - **停止钮 = 运行行方形钮，点击后确认框 → RPC stop**（Q8③ 操作者拍板需确认框——与 ZCode 卡上直终不同；前台子代理 = abort/dispose 语义）。
  - **侧板开合钮运行计数徽标**（收起态一眼可见——待审批角标先例，Q14），点击开侧板直达目录 tab。前台运行在父会话聊天流内的既有工具卡照旧（目录是聚合面）。
  - **additive 契约增量**：host inline extension 经 `subagents:rpc:v1:*` 桥接 status/steer/stop（+ fleetStatus DTO）与 `subagent:async-started/complete`、`subagent:child-status` 事件 → 契约事件/命令转发（实施时报备入账）。
- **范围外记录**：agent 定义管理（ZCode settings.subagents 对应物——Q8④）、子代理 resume 复活、嵌套展开、跨会话 fleet。

### R6 工作容器折叠锚定 —— 交付行为修订（Q10）
- **定稿**：确定性锚定规则——视口不在底部：**栏头视觉锚定不动**（点击的那行永不跳，内容向下展开/向上收拢）；吸底态：**保持贴底**（底不动，栏头按需上移）。ChatView/FollowView 同规。

### R7 composer 图片遮盖文字修复 —— 缺陷（Round 2 免问定稿）
- **需求锁死**：任何换行不被图片遮盖。根因候选锁定 composer 布局群；**dev app 复现定位 = 票内第一验收项**（不臆测纪律）。

### R8 展开钮与滚动条共存 —— 缺陷（免问）
- **定稿**：滚动条完整可见可用；实现形态票内裁量（钮位是票 58 操作者批准位——不动钮则让滚动条让位，如 scrollbar-gutter / 动态 padding）。

### R9 composer 图片放大预览 —— 全新需求（Q11）
- **定稿**：点击 composer 附件缩略图 → 全屏遮罩预览（复用 md-table-preview 的遮罩模式——R2 删浮层后模式继承）；**四种退出：空格 / 右上角 ❌ / Esc / 点击遮罩空白**（操作者指定前两种，Q11 加后两种，已确认）。

### R10 展开/收起动画 —— 缺陷（免问）
- **定稿**：composer 展开/收起加过渡动画，丝滑度对齐侧栏/侧板开合；prefers-reduced-motion 降级直切（既有惯例）。

### R11 侧栏拖拽重排 —— 全新需求（Q12/Q15/Q16/Q17）
- **定稿**：**项目组内会话拖拽排序 + 项目组之间拖拽排序**（Q15 确认读法；跨项目移动会话不做——会话项目身份 = 文件头 cwd，移动 = 写 Pi 会话文件 = 红线）。筛选下拉 Sort by 增第三项 **Manual**：首次拖拽自动切入；手动顺序（组内行序 + 组序）存 `settings.preferences`（重启保留、会话文件零改动）；切回 Updated/Created = 自动排序生效（手动顺序保留不生效，再拖回 Manual，Q16）；**Timeline 无拖拽**（时间线按定义排序）；**置顶区不参与**；组行 ⋮⋮ 变真拖拽句柄（Q12 的删案对组行作废——它有功能了）；**Projects 分区行的 grip 删除**（PiCode 无分区重排语义）；会话行 = 行本体拖拽（句柄形态票内裁量）；灰行（cwd missing）照常可拖；拖拽动画/放置指示对齐 ZCode 构图；ZCode 空组 drop zone 不做（Q17④）。

### R12 删除 titlebar ‹ › 幽灵钮 —— 清理（Q13 = 删）
- **定稿**：两枚写死 disabled 的占位钮删除；视图导航历史若要做单独立项（本批不做）。

### R13 发送落底 —— 缺陷（免问）
- **定稿**：发送后视图必须落底（新回合 Working 为输入框上最底元素——操作者原话「输入框上最下面的应该是 agent 的 worked 内容」）；sendPin 改**闩**（到底才清，不再单次消费），idle 发送 / steer / follow-up / 排队注入四路全覆盖；期间用户上滑立即接管（票 75 滚轮永远赢不回退）。

### R14 Edit 图片还原 live 路径修复 —— 票 79 缺陷修复 · additive 增量（免问）
- **根因**：live 条目 images ABSENT（echo 只带 text），票 79 只修了回放路径。
- **定稿**：host `user_message` echo 增图片部件（steer/follow-up echo 同修）→ chat-reducer 落账 live 条目 → Edit 即时还原原文+原图。**additive 契约增量：user_message 事件增 images 字段（实施时报备入账）**——与 R17 共用同一增量。

### R15 live 回合纯时间序 —— 1.6 交付行为修订（Q18）
- **定稿**：live 流式 = **纯时间序单流**——全部文本块按发生顺序内联于工具之间、随容器流式展开，**无提升、无降级轮换、无常显段（live 期）**；落定态维持现状（最终回合正文在容器下方 + 容器折叠——ZCode 构图不变）；审批卡按其工具将现之位内联渲染；ChatView/FollowView 同规。CONTEXT.md「回合正文/常显段/过程叙述」词条随票修订（live 语义部分；落定语义不变）。

### R16 按钮焦点纪律 —— 缺陷（Q19）
- **定稿**：鼠标点击与菜单选择完成后按钮**立即 blur**、焦点归还 composer 输入框（Enter 永远回到发送）；橙色 focus 圈**只在纯键盘 Tab 导航出现**（:focus-visible——鼠标流永远不可见；Q19 确认保留 Tab 圈）；全局清扫交互控件（chip/History/+/菜单行/工具卡钮/侧栏钮/顶栏钮）。

### R17 发送气泡图片缩略图 —— 全新需求 · 与 R14 同增量（Q20）
- **定稿**：用户气泡渲染**已附图片缩略图条**（回放数据就绪，live 靠 R14 echo 增量）；点缩略图 → R9 同一预览浮层（四种退出同）。

### R18 History 按钮 toggle 修复 —— 缺陷（Round 3 免问定稿）
- **根因**：票 70 同构竞态（外点关闭不豁免 owning 钮）。
- **定稿**：票 70 同款修复——外点关闭豁免 History 钮（或等价实现）；验收 = 展开态再点必收、真外点照关、Esc 照关。

### R19 技能调用显示——消息泡重构 + marker 出容器 —— 交付行为修订（Q21 + 操作者细化）
- **痛点**：①只发技能（无文字）时用户泡是空灰盒，太丑；②技能使用行（Skill to-spec）渲染在 Worked 容器体内（`TurnContainer.tsx:140-144`），落定折叠即被吞——希望最终显示在容器外。
- **根因**：空泡 = `ChatView.tsx:311` 空串照渲染（display text 剥离技能 prologue 后为空）；marker 在容器体内随折叠消失。ZCode 把技能当 work item 放容器内（bundle `chat.toolCall.skill.*` 族）——移出容器 = **操作者批准的 ZCode 偏离**（工作容器常驻同款）。
- **定稿（Q21 原推荐被操作者细化改判）**：**重构消息泡**——泡成为组合块：**技能渲染（有技能时：魔杖 icon + Skill + 名字）+ 用户文本（有时）+ 图片缩略图（R17）**。skill-only → 泡内只渲染技能（空灰盒消失）；技能+文字 → 泡内两者都渲染；**容器体内 marker 行退役**（技能故事由泡承载——泡在容器外，live 与落定同位常驻，折叠不再吞）。①（marker 出容器）操作者同意；Copy 语义不变（拷用户原话，不拷技能渲染）；Edit 动作行随泡块（锚定不变）；与 R15 无冲突（泡是回合头静态块，不进流）；与 R17 同渲染区段（同票或紧邻）。

### R20 应用图标 —— 全新需求（Q22 选型）
- **痛点**：PiCode 全仓无任何自定义图标（无 icns/icon 资产、package.mjs 无 icon 选项）——打包产出为 Electron 默认图标。
- **取证**：ZCode 图标形制校准（黑 squircle + 白粗斜体 Z——只读查看后弃用，资产不入库——红线）；本会话设计四案（`.scratch/picode-1-7/icon-proposals/`，自绘几何斜体 π SVG 骨架——右腿出头读 π、无字体依赖）。
- **定稿（Q22 = V2）**：**黑 squircle（#262626→#0f0f0f 微渐变）+ 白几何斜体 π + 品牌橙 #ec7931 终端光标块**——家族形（ZCode 同构同色系）+ 品牌橙区分记号 +「agent 在工作」暗示。交付 = SVG master 正式化进仓库资产 + icns/png 全尺寸 + 接入打包链（@electron/packager icon 选项）+ dev 窗口 Dock 图标。

### R21 SVG/HTML/图片双态预览 —— 全新需求（Q23 全按推荐）
- **痛点**：侧栏文件标签打开 SVG/HTML 只有源码（无渲染态）；图片二进制直接拒显（"no text preview"）。
- **根因**：预览分类仅三态——markdown（唯一有渲染/源码双态的先例）/ source / binary（`preview/policy.ts` kindForEntry + `PreviewTab` binary 拒显分支）；SVG/HTML 落 source、图片落 binary。
- **定稿**：①**SVG** = 渲染态（img data-URL——SVG 在 img 中脚本不执行，静态渲染安全）+ 源码双态，默认渲染；②**HTML** = 渲染态（**sandboxed iframe：allow-scripts、无 allow-same-origin、无 Node 访问**——LLM 生成的带内联脚本报告完整渲染且帧隔离）+ 源码双态，默认渲染，相对资源以文件所在目录为 base；③切换 UI 复用 markdown 的 Rendered/Source segmented control（wrap 开关沿用 source 态才显示的规则）；④**常见图片格式（png/jpg/gif/webp）从 binary 拒显改 img 直显**（单态无源码）。超限大文件回退源码（markdown 的 size 上限语义沿用）。

### R22 侧栏零标签自动折叠 —— 全新需求（Round 7 免问定稿）
- **痛点**：右侧栏所有 tab 关闭后，面板残留一个空壳（"Choose which tab to open" 选择页），要手动折叠。
- **根因**：零 tab 状态可达（review 也可关，`panel-model` close-tab 无特判）；关到零时 SidePanel 显 tab 选择页空态（`SidePanel.tsx:124/245`）而面板 open 状态不变。
- **定稿**：**openTabs 为空 → 面板自动折叠**（`sidePanelOpen` 翻 false——跨 reducer 联动的落点票内裁量：渲染层派生 effect 或 App 层联动均可）；重开路径不变（⌥⌘B / 标题栏钮 → 面板开，零 tab 时显既有 tab 选择页兜底）；深链自动展开行为不回归（open-tab 均伴随 open-side-panel，已核实）。

### R23 queue 面板布局修复 + 排队消息 Edit —— 缺陷 + 新供面 · additive 增量（Q24 全按推荐）
- **痛点**：① queue 行边框与 composer 卡边框/圆角重合（截图实证；follow-up 同布局同病）；② 排队未发送的 steer/follow-up 消息无 Edit——要改字只能 Clear 重打，带图更没辙。
- **根因**：`.queue-panel` 无水平内距（`app.css:6847` margin 0 0 6px），`.queue-item` 边框盒直接顶到卡边与卡片圆角边框重合；QueuePanel 无行级动作。数据面：SDK 0.85.1 `queue_update` 只有 `steering: string[] / followUp: string[]`——**无 id、无图片**；无单条移除 API（仅 `clearQueue()` 全清返回文本数组）；但 steer/followUp **入队时图片是带进 agent 队列的**（host 调 `steer(text, images)`，SDK 的 UI 镜像数组只存文本——agent-session.js `_queueSteer`）。
- **定稿**：① 布局修复——queue 行与卡片边框/圆角分离（水平内距 + 与 textarea/footer 的间距分隔），纯 CSS 票内裁量；② **行内 Edit 钮**（steer/follow-up 行都有）→ 该条从队列移除 + composer 预填原文+原图（与 Edit-resend 同型）；③ **每行 × 删除**（同机制不预填；全局 Clear 保留）；④ 实现 = **host 侧镜像**（出队时记 text+images）+ **clearQueue/requeue 舞步**（clearQueue → 剔除目标条 → 按序重投喂剩余条，图片从镜像取，保序）；**additive 契约增量：host op `edit_queue_entry` / `remove_queue_entry`**（实施时报备入账）。SDK 竞态诚实记录：消息投递与舞步之间有毫秒级窗口（SDK 队列面只有文本无单条操作），行为由 smoke 验证。

### R24 一键折叠所有分组 —— 全新需求（Q25 全按推荐）
- **痛点**：侧栏缺一键折叠所有 project 分组（现只能逐组点击，票 39）。
- **取证**：ZCode 同款动作对在案（bundle `workspaceSidebar.collapseAllGroups`「收起全部」/ `expandAllGroups`「展开全部」）；R11 删除的分区行 grip 腾出的正是这个落点。
- **定稿**：① Projects 分区行右侧常驻 **Collapse all / Expand all** 两个小钮（筛选下拉不加——视图动词近手）；② collapse-all = 全部组置折叠（各组保留折叠前形状记忆——票 39 语义不破）；expand-all = 全部展开（恢复各自记忆形状）；与手动单组折叠混用安全；③ 仅 Projects 视图显示（Timeline 无分组、隐藏）；置顶区不受影响；无分组时 no-op；形状记忆仍会话期内存级（重启回默认——票 39 口径不变）。

### R25 working 转环增强 —— 全新需求（Round 9 免问定稿）
- **痛点**：live 时只有容器顶 header 左侧一个小转环，不明显；希望容器展开时底部也有一个，且两处都更明显。
- **定稿**：①容器展开（live）：体底部新增同款转环（左对齐于容器体底缘，与顶 header 镜像位）；②折叠（live）：维持 header 单环位置不变；③两处转环都**增强可见性**（更大直径 + 品牌强调色/不透明——具体参数 visual harness 校准，票内裁量）；④仅 live（落定无环）；FollowView 同规。

## Grilling 记录

- **Round 1（Q1–Q8）**：Q1 文件条 settled 三边界按推荐 / Q2 表格按推荐 / Q3 **确认 MCP 重开** / Q4 L3+L4 按推荐（拆两票）/ Q5 **改判：OAuth 授权流要做**（原推荐不做）/ Q6 **= (b) 全进侧板**（附三张 ZCode 截图）/ Q7 数据边界按推荐 / Q8 ①steer ②已结束只读 ③**改判：停止需确认框**（原推荐直终）④定义管理范围外。
- **Round 2（Q9–Q14 + 九条补充）**：Q9 OAuth = 自动回调 + 手动粘贴兜底 / Q10 容器锚定按推荐 / Q11 预览退出四种 / Q12 删 grip + **加码：实现拖拽重排** / Q13 ‹ › = 删 / Q14 侧板钮徽标按推荐；九条补充当场核因——补2/补3/补5/补8/补9 免问定稿，补1/补4/补6/补7 立问。
- **Round 3（Q15–Q17 + History + 补新1/补新2）**：Q15 拖拽语义确认（组内排序 + 组间排序；跨项目移动红线不做）/ Q16 Manual 排序模式整包 / Q17 供面细节整包（组行 grip 转正、分区行 grip 删、灰行可拖、无 drop zone）；History = 票 70 同构竞态实锤免问。
- **Round 4（Q18–Q20 + 补新3）**：Q18 live 纯时间序按推荐 / Q19 焦点纪律按推荐（Tab 圈保留）/ Q20 气泡缩略图 + 预览全做；补新3 当场核因免问。**pi16-* 帧补 track**（4b65ac0）。
- **Round 5（Q21 + 细化）**：skill-only 空泡 + 技能行被折叠吞（本批第 18 条痛点）。原推荐 = 空泡消失、marker 独占回合头、动作行挂 marker；**操作者细化改判 = 重构消息泡**（泡 = 技能渲染 + 用户文本组合块；容器内 marker 退役）。定稿见 R19。
- **Round 6（Q22–Q23）**：Q22 图标四案选型 = **V2**（π + 橙终端光标——原推荐即 V2）；Q23 SVG/HTML/图片双态预览全按推荐（含 HTML 带脚本沙箱策略）。定稿见 R20/R21。
- **Round 7（免问）**：侧栏零标签自动折叠（第 21 条痛点）——空壳选择页现状实锤，规则唯一（零 tab = 折叠，重开显选择页），免问定稿。定稿见 R22。
- **Round 8（Q24–Q25）**：Q24 queue 三件套全按推荐（布局修复 / 行内 Edit 带图还原 / 每行 × 删除 / additive op）；Q25 一键折叠全按推荐（分区行双钮 + 形状记忆语义不变）。定稿见 R23/R24。
- **Round 9（免问）**：working 转环增强（第 24 条痛点）——规格由操作者直接给全（展开=底部加环、折叠=维持头部、两处更明显），无分支边界，免问定稿。定稿见 R25。
- 至此前沿树空：24 条痛点 → 25 个 R 簇 × 全部边界均有裁决。

## 归类记录

- 缺陷 8：R7（图片遮盖）、R8（滚动条）、R10（动画缺失）、R13（发送不落底）、R14（票 79 live 丢图）、R16（焦点滞留）、R18（History 竞态）、R23 布局半边（queue 行边框重合）。
- 交付行为修订 5：R1（票 78 live 增长）、R2（1.4 表格卡 360px）、R6（容器无锚定）、R15（票 56 提升规则）、R19（技能 marker 容器内 + 空泡）。
- 清理 1：R12（幽灵钮删除）。
- 全新需求 11：R3+R4（MCP 管理——1.5 Q1 裁决重开前提）、R5（子智能体）、R9（图片预览）、R11（拖拽重排）、R17（气泡缩略图）、R20（应用图标）、R21（双态预览）、R22（零标签自动折叠）、R23 编辑半边（排队消息 Edit/移除）、R24（一键折叠）、R25（转环增强）。
- 调查存档不立票 0。
- 范围外新增记录：agent 定义管理、子代理 resume 复活、嵌套子代理展开、跨会话 fleet、跨项目移动会话（红线）、视图导航历史（‹ › 若日后要做）、空组 drop zone、HTML 预览 devtools/编辑能力、pdf 等其他二进制格式预览。

## 术语（随票入 CONTEXT.md；本会话只写 .scratch/ 不碰根目录文件）

- **子智能体目录（Subagent Directory）**：侧板中的子代理聚合 tab：Running/Ended 两段、状态徽标、Show 20 more 步进；数据 = 父会话记录重放 + async 工件 live 增补；点击行开对话 tab。_Avoid_: FleetView（TUI 组件名）；智能体（含义过宽）；进程（ZCode 卡的另一节，PiCode 不做）。
- **子代理对话（Subagent Transcript）**：侧板内以任务命名的一子代理一 tab 的转录视图：运行中可 steer 发送、已结束只读、方形钮确认后停止。_Avoid_: 主会话栏（那是 ChatView）；FollowView（那是只读跟随另一端的会话）。
- **Manual 排序（Manual Sort）**：筛选下拉 Sort by 的第三项：拖拽即切入，手动组序与组内行序持久化于本地偏好；Updated/Created 仍可切回。_Avoid_: 自定义排序（同义不精确）；置顶（Pin 是另一动作）。
- **图片预览（Image Preview）**：composer 附件缩略图与发送气泡缩略图点击后的全屏遮罩预览；退出 = 空格/❌/Esc/遮罩点击。_Avoid_: lightbox（实现词）；表格预览（R2 已删除的旧浮层）。
- **MCP 节（MCP Section）**：设置窗的 MCP 服务器管理面：全局/项目双卡、来源徽标、启停、增改删、OAuth 授权流、状态投影。_Avoid_: 插件（ZCode 市场语义）；服务器管理（含义过宽）。
- **词条修订**：「回合正文/常显段/过程叙述」的 live 语义（提升与常显段仅存在于落定态；live = 纯时间序单流）。

## 依赖与波次提示（/to-tickets 用）

- **additive 契约/投影增量四项**（实施时报备入 host-contract smoke）：R4 MCP 状态桥接（host 事件）；R5 子代理 RPC/事件桥接（host 事件 + 控制命令）；R14/R17 `user_message` echo 增 images；R23 `edit_queue_entry` / `remove_queue_entry` ops（host 队列镜像 + clear/requeue 舞步）。
- **同文件群 A（composer 群）**：R7、R8、R9、R10、R16 全落 Composer/expand/app.css——强串行或合并验证区段；R16 全局清扫跨组件但模式统一（可独立尾票）。
- **同文件群 B（转录/回合群）**：R15、R1、R6 都动 turn-collapse/ChatView/TurnContainer——串行（建议 R15 模型先行，R1/R6 跟上）；R18（TreePanel）独立。
- **同文件群 C（侧栏群）**：R11 独占 Sidebar/group.ts/偏好结构；R12（TitleBar）独立。
- **大项 R5**：桥接（host）+ 目录 tab + 对话 tab + 停止钮 + 徽标——本批体量最大，建议拆 2–3 票（如：桥接+目录 / 对话+steer / 停止+徽标）。
- **R3/R4 拆两票**（Q4 拍板）：配置管理节 / 状态投影。
- R14 与 R17 同增量同渲染区段（用户条目）——可同票或紧邻串行；R9 是 R17 预览的前置。
- 独立可并行：R2（Markdown 表格）、R13（scroll-stay/ChatView 但与 B 群弱邻接）、R10、R12。

## 操作者待办

1. 会话内贴图若有 Desktop 原件，复制入 `.scratch/compare/`（`pi17-*` 前缀）——本会话无法从聊天贴图落盘。
2. 实施期跑 dev app / smoke 遵守 AGENTS.md dev-app serialization（每票验收项内嵌 ps 自查——1.5 起口径）。
3. `merge-ticket.sh` 已含 `picode-1-7`（52a31dc）——无需再补。
