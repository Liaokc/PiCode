# PiCode

给 Pi Agent 套一个 ZCode 外壳的桌面应用：**外观与交互属于 ZCode，大脑属于 Pi**。

## Language

### 系统

**PiCode**：
本项目。桌面端 Agent 应用，UI/交互复刻 ZCode，内部逻辑完全由 Pi 提供。
_Avoid_: 壳、客户端（指代不清）

**Pi Agent（Pi）**：
命令行 coding harness，是 agent 行为、模型调用与会话格式的唯一权威实现。作为依赖被嵌入，永不被修改。
_Avoid_: pi-cli、内核

**ZCode**：
现有桌面 App，仅作为 UI/交互的参照物。不修改、不执行其代码，不读写其本地业务数据；允许一次性只读提取样式常量（色值/间距/字号）作像素校准参照，用后即弃；其图标、字体、代码资产一律不得复制进本仓库。
_Avoid_: 参考项目

### 会话

**会话（Session）**：
一次连续的人机协作记录，格式与管理完全归 Pi 所有。TUI 与 PiCode 打开的是同一个会话存储。
_Avoid_: 聊天记录、对话、历史

**无缝衔接（Handoff）**：
同一会话可在 TUI 与 PiCode 任意一侧打开并继续工作，无需转换。
_Avoid_: 同步、迁移、导入导出

**只读跟随（Live Follow）**：
PiCode 旁观一个正在另一端（如 TUI）运行的会话并实时刷新展示；只看不发。Follow 激活时侧栏高亮跟随当前视图（单一派生）：followed 行持选中样式，前 focused 行还原普通底色；选中与运行解耦——运行状态由状态点承担。点回 focused 行退出 Follow，高亮跟回。
_Avoid_: 实时同步、接管

### 用量

**用量（Usage）**：
从 Pi 会话记录中推导出的 token 消耗统计口径。凡不在 Pi 会话记录中的消耗一概不计。
_Avoid_: 统计、监控（含义过宽）

**估算成本（Estimated Cost）**：
按公开定价折算的费用数字，UI 上必须显式标注为估算。
_Avoid_: 花费（暗示精确）

### 界面语言

布局与控件形态复刻 ZCode，但 **UI 文案一律使用英文**；以下术语是界面元素绑定的精确含义：

**Task**：
侧边栏与会话列表中的单个条目，一个 Task 就是一个会话（Session）。UI 上显示为“New Task”等文案，内部一律称 Session。
_Avoid_: 对话、聊天室、Conversation

**侧边面板（Side Panel）**：
主区右侧可展开的多标签容器：审查（Review）固定一张标签，每个深链打开的文件各成一张文件标签（×可关、互不影响），调用轨迹按会话文件在同一框架内占位；tab 条 ⌄ 打开标签页管理下拉（搜索 + 打开的标签页 + 最近关闭的标签页）；面板开合由标题栏切换钮与 ⌥⌘B 承担。终端不在其中（已迁往终端停靠）。
_Avoid_: 右侧栏、抽屉

**调用轨迹（Call Trace）**：
侧边面板中按会话文件成 tab 的只读检查器：entry = 一次模型调用——输入节（自上一 assistant 消息以来的 user / 工具结果块）+ 输出节（思考 / 助手文本 / 工具调用块，带工具名 chip 与调用 id）；usage 列（IN/OUT tokens、时长、时间戳）按 ADR-0002 从每条 assistant 消息 usage 推导，缺席优雅降级为只显时间戳。默认全展开；头部 = 统计行（调用数 · 总 token · 模型）+ 搜索（计数 + ↑↓ 导航）/ 块型开关（六类）/ 全部展开↔收起 / 打开所在目录 / 刷新 / 关闭；活跟随运行中会话（文件增长即重推导推送）。数据源如实原则：显什么 = Pi 会话文件实际记录了什么（SDK 内部 system prompt 不落盘，故「系统提示词」块通常缺席）。
_Avoid_: 调用日志（含义过宽）、执行历史（与 Branch history 混淆）、trace 面板（中英混用）

**最近关闭的标签页（Recently Closed Tabs）**：
侧边面板中被关闭的文件/轨迹标签的本地历史：偏好持久化、容量 10、按关闭时间倒序；标签管理下拉以相对时间展示，点击即重开为一张标签。打开同名标签即从历史中清出；会话文件与工作区零改动。
_Avoid_: 关闭历史（含义过宽）

**终端停靠（Terminal Dock）**：
主区下方唯一底部 dock 中的用户 shell 面板；⌘J 打开/关闭，或在与桥接面板同框时把内容切回终端。隐藏面板不结束 shell，关闭终端标签才结束。
_Avoid_: 底部面板、下方面板、控制台

**桥接停靠（Bridge Dock）**：
与终端停靠同框同位的桥接投屏面板（两者二选一显示），以命令流卡片展示桥接（Bridge）的命令与实时输出；⌥⌘J 开/关或从终端切入，转录中 bash 工具卡可一键跳转定位。纯只读，无输入路径。
_Avoid_: 输出面板、日志面板

**访问模式（Access Mode）**：
Composer 上的「完全访问」等芯片，映射为审批闸门的预设策略档位。
_Avoid_: 权限（与 trust 混淆）

**思考档位（Thinking Level）**：
Composer 上的「最高」等下拉项，直通 Pi 的 thinkingLevel。
_Avoid_: 推理强度

**技能卡（Skill Card）**：
Composer 输入区顶部的结构化命令卡：slash 菜单选中技能或 prompt 模板后渲染（紫罗兰魔杖图标 + 名称 + × 移除，形态对照 ZCode），参数文本跟卡后。**单槽 + 替换**——Pi 语义一条消息一个行首命令，同时最多一张卡，再选即替换；卡在场时输入 `/` 仍开菜单；发送时重组 `/skill:name args` / `/name args`，发送语义与裸文本时代逐字节一致（纯渲染层，零契约增量）；草稿随卡保留。手打 `/skill:` 前缀可剥匹配菜单技能行。New Task 与会话内两处 composer 共组件同规则。
_Avoid_: 裸文本命令（被本卡取代的旧插入形态）、chip（含义过宽，指 Access/Model 等页脚芯片）

**桥接（Bridge）**：
把 agent 正在执行的 bash 工具输出投屏到终端标签的单向观察通道。
_Avoid_: 共享终端（暗示双向接管）

**悬停提示（Tooltip）**：
控件悬停浮层，仅两态：控件有快捷键则只显快捷键键帽（⌘N/⌘K/⌘J…），纯图标钮无快捷键则只显短描述（复制、自动换行…）；两者兼有的只显快捷键。会话行（Task 行）不设悬停提示；路径/数值等数据揭示不走此组件。
_Avoid_: 原生 title 提示、气泡（含义过宽）

**预警横幅（CWD Banner）**：
受感染会话视图顶部的常驻警示条：该会话的工作目录在磁盘上被删（活 host 豁免态）时出现——三条事实（运行继续 / 文件工具会失败 / 退出后无法重开），无关闭钮，目录复现即自动消失；纯派生投影（cwd 存活性翻转即自动显隐，无关闭状态），只影响该会话视图，不动状态点词汇。
_Avoid_: 错误横幅（ErrorBanner 是 host 故障的另一组件）；可关闭提示（本横幅不可关）。

**灰行（Dimmed Row）**：
侧栏中死 cwd 会话（工作目录已删且无活 host）的展示态行：置灰 + "cwd missing" meta 说明；点击仅弹解释 toast、零 resume 调用（对已删 cwd 的 resume 必 host exit(1)）；右键菜单仅无害项（Archive / Copy task path / Copy session file path / Copy session ID），打开类动作不出现；⌘K 维持排除；目录复现自动恢复普通行。纯展示态，会话文件零改动。
_Avoid_: 归档（另一本地偏好动作）；隐藏（灰行可见不隐藏）；禁用（无禁用语义，是物理事实的投影）。

**状态点（Status Dot）**：
Task 行标题前固定槽位内的会话状态圆点：动画点 = 本应用运行中；橙点 = 会话停在审批闸门等待人工决定（待审批角标）；绿点 = 另一端（如 TUI）正在写入（120s 规则）；靛蓝实心点 = 未读（Unread）；空槽 = 空闲。优先级：橙 > 动画 > 绿 > 靛蓝 > 空槽——更高优先级暂时遮蔽未读，会话安静后露出；归档行不显示未读。橙点优先于动画点——等待批准即挂起，不显示为运行中。
_Avoid_: 角标（单用含义过宽，须作「待审批角标」）；进度指示器（点不表达进度）

**未读（Unread）**：
Task 的本地已读状态标记：会话文件在非聚焦/非跟随期间增长（回合粒度）自动置未读，聚焦（当前视图）自动清除；可手动 Mark as Unread/Read 覆盖（右键菜单入口，票 35）。仅存于本地偏好（mtime 水位 + 手动覆盖位），会话文件零改动；首次见到的会话以当时 mtime 基线化，升级不淹没侧栏。
_Avoid_: 未读数（无计数语义）；红点（颜色错误）

**筛选下拉（Filter Dropdown）**：
侧栏筛选钮打开的视图/排序下拉：**视图（View）**二选一——By project（按项目分组）或 Timeline（时间线，全部会话平铺、置顶区保留顶部）；**排序方式（Sort by）**三选一——Updated（文件 mtime）、Created（文件 birthtime，平台缺失时降级为会话头时间戳）、Manual（票 84 的手动拖序）。排序作用于两种视图；当前选择持久化于本地偏好。文本筛选行已退役（⌘K 覆盖搜索）。
_Avoid_: 筛选输入框（已退役）；分组/项目切换钮（被下拉取代）

**手动排序（Manual Sort）**：
侧栏拖拽重排（票 84）：Projects 视图内**组内会话拖序**（行本体拖拽）与**组间拖序**（组行 ⋮⋮ grip 为真拖拽句柄；Projects 分区行无 grip——分区不重排）。首次拖拽自动切入 Manual 排序（快照当下渲染序 + 落位，视图零跳动），下拉可勾选/切回；切回 Updated/Created 即自动排序生效（手动序保留不生效），再拖即重新进入。手动序（组内行序 + 组序）持久化于本地偏好，重启保留；Timeline 视图与置顶区不参与拖拽（Manual 下 Timeline 平铺手动组序）；灰行照常可拖；**跨项目移动会话不做**（会话项目身份 = 文件头 cwd——改它 = 写 Pi 会话文件 = 红线）；拖拽只写本地偏好，会话文件零改动。放置指示 = 目标边缘的细 accent 线。
_Avoid_: 拖拽同步（无多端语义）；排序持久化到会话（只写偏好）

**归档（Archive）**：
Task 的本地整理动作（票 35）：行右键菜单或行悬停钮触发；悬停钮临时替换状态点槽（同一槽位锚点，零重叠零位移）。归档行从侧栏两个视图（Projects / Timeline）消失，⌘K 仍可达（隐藏永不使会话不可达）；侧栏归档盒钮打开归档列表视图（整栏换装，文件浏览器模式先例）一键恢复；置顶归档隐含取消置顶。仅存本地偏好，会话文件零改动；归档 ≠ 删除。
_Avoid_: 删除（归档可恢复）；隐藏（含义过宽，组隐藏是另一操作）

**分组折叠（Group Fold）**：
项目组行点击触发的整组折叠/展开（票 39）：折叠收起该组全部会话行，再点展开并恢复折叠前的形状（Show more 的步进位置不丢）；Show more 每次展开 5 条、全展开转 Show less、Show less 一次回初始 5 条；组头无 caret、无计数。形状记忆仅会话期（内存级，重启回默认）；折叠是视图态，非归档。
_Avoid_: 归档（折叠不持久、可逆，归档是本地偏好的整理动作）；展开/收起箭头（caret 已随票删除）

**导航轨（Turn Navigator）**：
主转录左缘的垂直 tick 束（ZCode turn navigator 同型，票 46）：每个真实用户消息（含 steer/follow-up）一根；等宽基条以 scaleX 表达焦点/活跃衰减——视口锚定根 focus 前景色满宽、其余 muted 次级色按距离衰减有下限，运行中不低于 0.72 不透明；hover 右弹双段预览气泡（用户输入 clamp 2 行 + 助手回复 clamp 3 行，短延迟开合，上下移动气泡微位移跟随）；点击 smooth 平滑定位该用户消息（DOM 直查优先，未挂载 rAF 兜底等挂载）；tick 列垂直居中、独立滚动（滚轮滚 tick 列不滚转录）；tick < 2 整轨不渲染；窗口宽低于 864px（ZCode 校准）不显示，显隐带 opacity/位移过渡。仅 ChatView；FollowView 不做。渲染决策全部收敛于 Seam-1 纯模型（锚点分数、tick 显隐规则）。
_Avoid_: 黑条（颜色绑定）、minimap（语义不同）、进度条（tick 不表达进度）

**回底钮（Jump to Latest）**：
滚离转录底部超过吸底阈值（160px）时浮现于 Composer 上方中央的圆形 ↓ 钮（ZCode 同型：card 底 outline 圆钮，票 45）；点击平滑回底并恢复吸底；吸底态隐藏，显隐淡入淡出。配套**滚离保持**（Q12 行为变更 + 票 75 方向感知——滚轮永远赢）：流式期间用户上翻阅读保持原地——向上滚动手势（任意量，只要离底）立即解除吸底（reader-held-away 闩），置位期间内容增长绝不拽人（带内强吸不再违背「内容增长不拽人」的立法本意）；滚回底部（160px 带内）/ 自己发送（含 steer/follow-up）/ 点回底钮才恢复。吸底决策收敛为纯函数 `shouldAutoScroll`（滚动状态 × heldAway 闩 × 内容增长 × 是否自己发送，全 16 组合表驱动）；160px 阈值不再单独驱动对上翻读者的强吸，保留给回底钮显隐、闩的回底恢复臂与未-held 跟随门。仅 ChatView；FollowView 不做。
_Avoid_: 悬浮球（形态不符）；自动滚动（含义过宽——吸底只是其一种裁定）

**输入展开（Composer Expand）**：
Composer 输入卡右上角常驻展开钮：原位展开至约主区一半高（钳制 ~280–560px，下推转录非浮层），再点/Esc/⌘E 收回，发送后自动收回；⌘E 为全局键位 toggle（作用于当前聚焦会话或 New Task 空态的 composer——共组件自动同享，FollowView 无 composer 自然 no-op），悬停提示按纪律只显键帽 ⌘E。配套**自动增高**：输入区高度随内容 74px→160px（ZCode 校准封顶）增长，超出内部滚动；New Task 与会话内两处同规则。
_Avoid_: 全屏编辑（形态不符）；弹窗（非浮层）。

**草稿（Composer Draft）**：
切换视图仍保留的 composer 未发送内容（文本 + 图片）：per-session 槽（会话视图注册表，票 20 视图状态的对称扩展——修复切走重挂载丢草稿的对侧）+ New Task 单槽（App 层，启动空态与 ⌘N 共享）；切走即停槽、切回即恢复，发送自然清空，空草稿不占槽；内存级——重启即失（操作者拍板不跨重启）。会话 A/B 各自槽位独立互不串。
_Avoid_: 队列（Queue 是已提交待注入的消息）；草稿箱（无箱形，纯槽位）；持久化（内存级，重启即失）。

**编辑重发（Edit & Resend）**：
落定用户消息的编辑入口（票 79）：消息尾部动作行常驻「Edit」钮（agentRunning 时隐藏——点 Stop 后 agent_end 落地即复现）；点击无确认框：composer 预填**原文**（剥离技能注入序言的用户原话）+ **原图**（从用户条目图片部件还原附件态，操作者拍板图片回填）并聚焦，同时 `navigate_tree` 以该 user entry 为目标——Pi 原生 edit-and-resubmit 语义下 SDK 移叶至该消息**父 entry**（首条消息走 resetLeaf；同文件无损、天然 No summary；直达父 entry 有歧义——父本身可能是 user 消息，SDK 会再多移一层）；转录随即按新叶路径重放，被编辑消息与其尾部留在被弃分支上（树面板可达）；composer 草稿在位时点 Edit 直接替换。发送走既有 prompt 路径——原位分叉新分支，轻 toast（fork-toast 先例）；旧分支全保留。可编辑对象 = 全部落定 user 消息（含 steer/follow-up 注入的）。
_Avoid_: 重写消息（会话文件不可变——新分支不改旧记录）；编辑历史（含义过宽）；确认弹窗（无确认框，分支无损）。

**回合正文（Turn Answer）**：
落定回合中常显于 Worked 容器之外的 assistant 文本块，有且仅有一个 = 该回合**最后一个文本块**（位置规则，非语义判定）；更早文本块为过程叙述归容器；正文之后的全部行入常显段常显于正文下方。回合 live 流式期无正文（票 82）——全部文本块按时间序内联于容器流中，agent_end 落定即按本词条一次定稿（无提升、无降级轮换）。ChatView 与 FollowView 同规则。
_Avoid_: 最终答案（暗示内容语义判定）；中间输出（含义过宽）；临时正文（live 提升已随票 82 退役）。

**常显段（After-Answer Segment）**：
**落定回合**最后一个文本块之后、按转写顺序常显于正文下方的行（工具/思考/审批）（票 56，ZCode assistantFollowingRows 同型，修订票 53 的仅工具裁剪；票 82 收窄为落定态——live 期无常显段，全部行按时间序在容器流内）；live 期挂起审批卡内联于容器流中其工具将现之位，落定回合的挂起审批卡占常显段中其工具将现之位，批准后原位变工具卡（reducer 原位转换，两态零跳变）；流式期随新文本块重划分的降级轮换已随票 82 退役——重划分只发生在落定瞬间。段内思考行与容器内思考行同组件（折叠单行）。
_Avoid_: 尾部（含义过宽）；附加输出（暗示次要）。

**回合文件条（Turn File Changes）**：
每回合常显段末尾（正文下方）的文件更改聚合条（票 78）：折叠态「N files changed +X −Y」+ 展开箭头；展开为 per-file 行（图标 + 文件名 + 路径 + ± 计数 + Review + Open）。数据 = 回合内 edit/write 工具调用的纯投影：edit 的 ± 从工具结果 diff 文本解析、write 记 "+new" 不计行数、同文件多次 edit 合一行（diff 依序拼接）、read/ls 等不入条、无文件更改的回合不出条；live 随工具落定增长（live 与落定同构）。**Review** = 侧板回合 diff 标签（一回合一 tab，复用既有 diff 渲染语言渲染该回合 diff 文本——回合 diff 非 git diff，与 Review tab 并存）；**Open** = 既有预览深链。纯只读——无撤销钮（1.1 纪律）。
_Avoid_: 撤销条（无撤销语义）；变更日志（含义过宽）；git 变更（回合 diff 非仓库 diff）。

**过程叙述（Interim Narration）**：
**落定回合**内、最后一个文本块之前的 assistant 文本块——模型夹在工具调用间的工作叙述；归 Worked 容器（折叠隐藏，容器展开时可见），不进正文。live 流式期无过程叙述（票 82）——文本块一律为容器流中的时间序文本块（正文同款渲染），落定划分才产生过程叙述。
_Avoid_: 中间结果；思考（thinking 是另一类 work item）。

**工作容器（Worked Container）**：
每个回合（有用户气泡）必有的一行容器（票 55）：live 显 "Working · Ns"（首个工作项出现前的静默期即常驻），落定收起为 "Worked · Ns"（回放回合无时长，票 14 规则只显 "Worked"）；容器体在 live 期收纳整回合的时间序单流（思考/文本块/工具/审批按转写顺序，随容器流式展开，票 82），落定后收纳正文**之前**的思考/工具/审批/过程叙述（正文后的行入常显段，票 56）；零工作项回合体为空且不可展开（无 chevron、点击无响应——可展开 ⇔ 体非空）；常驻不消失——落定后仍在。**操作者批准的 ZCode 偏离**：ZCode 零工作回合不渲染容器（bundle 实证 `u ? … : null`），操作者裁决常驻——「正文输出也算 work 阶段，容器不允许消失」。
_Avoid_: 折叠条（强调折叠丢了常驻语义）；进度条（不表达进度）；折叠容器（体空时无折叠语义）。

**设置窗（Settings Window）**：
应用内第一个设置面：标题栏齿轮钮与 ⌘, 开合（Esc 亦关），窗口替换工作区三个区域（截图 09 构图）而非另开系统窗口——无模态：主窗会话在后台照常运行、事件流照常折叠。左侧节导航可扩展（General / Appearance / Models / Agent Resources / Data & Statistics），Skills 节以 Pi 实际加载面为准管理技能——**全局技能 / 项目技能双卡**（票 67）：全局卡（用户目录 + 包提供，任何目录都加载）+ 项目卡（跨会话索引已知项目按项目分组、fs 预筛候选后逐项目探测、组头带 trust chip；技能搜索框过滤两卡全部行，项目搜索框过滤项目组），来源徽标、per-技能启停写 Pi settings、打开所在目录、仅删 ~/.pi/agent/skills 下链接/条目。见 **Packages 节**。
_Avoid_: 设置页面（设置窗是完整窗口态，非主窗内嵌页）；弹窗（非浮层）；控制面板（含义过宽）。

**Packages 节**：
设置窗的包管理面（票 64）：全局层（~/.pi/agent/settings.json 的 packages 数组）与项目级层（聚焦 Task cwd 的 .pi/settings.json）同套管理——列表（npm:/git:/本地路径来源徽标 + 组件计数 extensions/skills/prompts/themes）、安装（来源输入 + 拉取进行态 + 失败 toast）、移除（确认框）、包级启停（写 pi config 同格式：关 = 包条目四过滤数组全 `[]`——SDK 明文「load none of that type」；开 = 摘空数组并回退字符串形式）。安装/移除走 Pi 本体包管理器（op host 内 DefaultPackageManager，与 `pi install/remove` 同代码路径，本地源相对化落盘同一落点）；**项目信任只读展示**：读 trust.json 保存决策 + 无决策时按 defaultProjectTrust 派生（ask/never → untrusted），untrusted 横幅明示「项目资源未被 Pi 加载」且项目动作锁定；信任决策本身留在 Pi 的 /trust，PiCode 零 trust.json 写入。安全文案沿用 Pi 官方口吻（packages run with full system access）。空态如实（操作者 packages 为空亦是首用户形态）。
_Avoid_: 插件（ZCode 的 plugin 语义绑死其市场体系，不借用）；市场（PiCode 不做发现/市场面）；信任管理（PiCode 只读展示，不代写决策）。

**MCP 节（MCP Section）**：
设置窗的 MCP 服务器管理面（票 89，与 Skills/Packages 同级）：pi-mcp-adapter 的多层配置面——**全局服务器 / 项目服务器双卡**（Skills 双卡同型），每行 = 有效配置合并视图（adapter 优先级序逐字段合并 + 胜出来源徽标 + 遮蔽层数徽标 + OAuth/Disabled 徽标）；启停写项目 Pi 覆盖层 `.pi/mcp.json` 的 disabled 旗标（adapter `/mcp enable|disable` 同语义——只写旗标、定义零复制）；增改删写 `/mcp setup` 的两个正规目标（项目 `.mcp.json` / 用户全局共享 `~/.config/mcp/mcp.json`），edit/delete 落胜出层自有文件；OAuth 授权流（server 行 Authenticate → 会话 host 桥触发 adapter 自己的 /mcp-auth → 系统浏览器 → localhost 回调自动完成；**手动粘贴 callback URL 兑底**；凭据全程只在 adapter/系统钥匙串——PiCode 零凭据读写）；每层打开配置文件入口；外部 host 工具配置（Cursor/Claude 等）= 只读兼容发现、绝不写，`~/.agents` 跨工具共享文件胜出 = 只读拒写。状态投影（connected/needs-auth 等）另立票 96。
_Avoid_: 插件（ZCode 市场语义）；服务器管理（含义过宽）；状态徽标（实时状态属票 96，本节徽标仅配置派生）。

**图卡（Diagram Card）**：
mermaid 围栏闭合且解析成功后渲染的图形卡（票 59，ZCode streamdown 管线同型）：小写 mono mermaid 标签头 + 右上操作钮组（download SVG/PNG/MMD 下拉、copy 源码、fullscreen）+ 渲染体 panZoom（滚轮缩放、拖拽平移、角部缩放控件）；fullscreen 为根层浮层、Esc 退；渲染主题用 mermaid 库默认浅色（深色全应用范围外）。**操作者批准的 ZCode 偏离**：ZCode 取证为 sticky 钮组，但卡片被转录滚动卷走时 sticky 头行悬停叠在自家图内容上——操作者拍板头行随卡滚走、不钉住。流式未闭合（mermaid 需全文）与解析失败均回退为代码卡——lang 标签照常、不弹错误 toast；mermaid 依赖按图型懒加载分片（动态 import），主包零增量。
_Avoid_: 代码卡（回退态才是代码卡）；预览（是正式渲染非浮层预览）。

**上下文圆环（Context Ring）**：
Composer 模型 chip 左侧的小圆环（票 77，ZCode 同型）：会话上下文占用的纯投影——最近一条有效 assistant usage（input + output + cacheRead + cacheWrite 四元组全计入，即 usage.total 的 ADR-0002 口径）÷ 当前模型 contextWindow。ready 态 hover 弹**数据弹层**（非 Tooltip 组件）：百分比 + used/limit + IN/OUT/cacheRead/cacheWrite 四元组 + 缓存命中率（cacheRead/(input+cacheRead)）；无有效 usage 或窗口未知显**灰环**、无 hover（无分母不造百分比——数据源如实原则）。纯投影零特判：compaction 后自然取最新 usage；中断/出错的消息不留 usage。仅 ChatView（FollowView 无 composer、New Task 无会话可量——回底钮先例）。
_Avoid_: 进度条（环不表达任务进度）；容量条（形态是环）；Tooltip（数据揭示不走悬停提示组件）；统计（Usage 是全局消耗口径，圆环只投影当前会话占用）。

## Constraints（词汇化的边界）

**红线**：
不修改 Pi 安装目录与 ZCode 应用内部的任何代码和数据；所有改动只发生在本仓库内。
