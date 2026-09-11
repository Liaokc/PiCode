# PiCode 1.5 — 幽灵 cwd 供面 × Worked 容器常驻 × 回合时间序修订 × 高级代码块全家庭 × Composer 三修 × 导航轨层叠

Status: ready-for-agent

本 spec 覆盖工单 54 起（同目录 `issues/`，编号全局连续）。取证 = 操作者 2026-09-10 真实使用报痛 10 条 + 实拍九帧（已归档 `.scratch/compare/`：`pi15-*`）+ main 源码逐项核因 + 会话库只读取证（01a0810d entry 272–302：零工作项回合结构 / 自适应思考 token 反推 / 回合时间序全记录）+ ZCode bundle 只读行为取证两次（mermaid 图卡结构 / 能力位默认 / 零工作回合无容器 / 正文后全类型常显；用后即弃未复制任何资产）；全部取舍经 /grill-with-docs 三轮十四问（Q1–Q14，含两次取证插入）定稿（全记录见 `intake-grilling.md`）。术语遵循 `CONTEXT.md`。

## Problem Statement

1.4 验收后的真实使用判定——功能面完整，但**五处缺陷与三处供面缺口**：

- **幽灵 cwd 无供面**：活会话的工作目录被删（worktree 合并典型）——运行继续但文件工具全部显式失败，没有任何提示；退出重启后会话从侧栏无声消失（票 42 过滤的副作用），历史像被吞了。
- **Worked 容器一显一隐**：纯文本回合（无 thinking 无工具）live 时显示空壳 "Working · 1s"、落定后容器整个消失——像数据丢失；且模型尚未吐字的静默期转录区无任何反馈。
- **回合内时间序倒挂**：审批卡悬停在已输出的正文上方，批准执行后工具卡又跳到正文下方；工具结果之后模型产的思考块爬回容器、渲染在正文上方——转写顺序与显示顺序不一致。
- **高级代码块缺失**：agent 产出的 mermaid 流程图只能看源码（真实用例实锤）；ZCode 有图卡渲染、代码卡行号与下载、表格多格式复制——PiCode 全缺。
- **Composer 遮盖**：输入首行文本与光标从右上角展开钮下穿过被不透明钮底遮住；展开钮也没有快捷键。
- **导航轨盖右键菜单**：侧栏会话行的九项菜单右缘被主区导航轨的 tick 束穿透覆盖。
- **ThinkingRow 双症**：思考计时在容器折叠重开后从零重计（7s→3s）；箭头方向与 Worked 惯例相反（收起↓展开↑）。

## Solution

八项需求（R1–R8），全部对齐实证参照（ZCode 实机行为参数 / 会话库证据）：

0. **幽灵 cwd 供面（R1）**：活会话 cwd 被删 → 该会话视图常驻预警横幅（纯说明、不可关、恢复即消）；重启后死 cwd 会话改灰行 + "cwd missing" 说明（点击解释不 resume、无害菜单项保留、⌘K 维持排除、复现自动恢复）。
1. **展开钮快捷键（R2）**：⌘E 全局 toggle，两处 composer 同享，tooltip 改键帽。
2. **遮盖修复（R3）**：textarea 右侧 padding 预留按钮区，文本/光标永不穿钮下，保留右上角位置。
3. **高级代码块全家庭（R4）**：mermaid 图卡（懒加载依赖、闭合渲染、失败回退源码）+ 代码卡行号/下载/startLine + 表格 copy as CSV/TSV——逐项对齐 ZCode bundle 实证形态。
4. **Worked 容器常驻化（R5）**：每回合必有容器（live "Working·Ns" 含静默期、落定 "Worked·Ns" 不消失）；零工作项回合体空且不可展开；操作者裁决的 ZCode 偏离（正文输出也算 work）。
5. **导航轨层叠修复（R6）**：主区自构成层叠上下文，轨道困在主区内，侧栏整体（含菜单）恢复高于轨道。
6. **ThinkingRow 双修（R7）**：计时基准 entry 级开始时间戳（折叠重开不重置）；箭头对齐 Worked 惯例（收起 › 展开 ⌄）。
7. **回合时间序修订（R8）**：lastText 之后的所有行（工具/thinking/审批）按转写顺序常显正文下方、live 与落定同位（修订票 53 Q11a 裁剪）；审批与工具同位不跳变；中途正文降级归容器（票 53 规则重申）。

另存档一项调查结论（无票）：GLM-5.3-flash "hello" 回合思维链缺失 = 模型自适应思考（max 是预算上限非强制开关），请求体正确、token 账目吻合，非 PiCode/Pi 缺陷。

## User Stories

### R1 幽灵 cwd 供面

1. As an operator whose worktree gets merged away mid-run, I want a persistent banner in that session's view, so that I immediately know why file tools start failing.
2. As an operator, I want the banner to state that the session keeps running but cannot be reopened after exit, so that I can plan accordingly.
3. As an operator, I want no dismiss button on the banner, so that a critical fact cannot be accidentally hidden.
4. As an operator, I want the banner to disappear automatically when the directory reappears, so that the warning never outlives its truth.
5. As a multi-session operator, I want only the affected session's view to show the banner, so that other sessions stay undisturbed.
6. As an operator restarting the app, I want dead-cwd sessions to still appear in the sidebar as dimmed rows with a "cwd missing" note, so that my history never silently vanishes.
7. As a curious operator, I want clicking a gray row to show an explanation toast instead of crashing the host, so that exploration is always safe.
8. As a tidy operator, I want harmless actions (Archive, Copy task path) on gray rows, so that I can still organize them.
9. As a launcher user, I want ⌘K to keep excluding dead-cwd sessions, so that it only offers actionable targets.
10. As an operator whose directory comes back, I want gray rows to restore to normal automatically, so that recovery needs no manual step.

### R2 展开钮快捷键

11. As a keyboard-first user, I want ⌘E to toggle the composer's expanded input, so that a bigger writing surface is one chord away.
12. As a new-task starter, I want ⌘E to work in the New Task empty state, so that both composers behave identically.
13. As a toggler, I want ⌘E while expanded to collapse, so that the chord is self-inverting.
14. As a tooltip reader, I want the expand button to show the ⌘E keycap, so that the shortcut is discoverable (tooltip discipline).
15. As an Esc user, I want the existing Esc / re-click / send-to-collapse paths unchanged, so that the chord adds a path instead of replacing one.

### R3 遮盖修复

16. As a long-prompt writer, I want my text and cursor never to run under the expand button, so that nothing I type is hidden.
17. As a layout-minded user, I want the button to stay at the approved top-right position, so that the fix doesn't relocate the control.
18. As an expanded-input user, I want the same text clearance while expanded, so that no state reintroduces covering.

### R4 高级代码块全家庭

19. As a diagram reader, I want closed mermaid fences rendered as diagrams, so that flowcharts are readable at a glance.
20. As an impatient reader, I want streaming (unclosed) mermaid fences shown as source code, so that partial blocks never flash broken diagrams.
21. As an error-averse reader, I want a mermaid block that fails to parse to fall back to a source card, so that content is never lost behind a render error.
22. As a label scanner, I want the diagram card to declare "mermaid" in its header, so that every card states its type.
23. As a presenter, I want a fullscreen mode on diagram cards, so that large graphs are inspectable.
24. As an explorer, I want pan and zoom on rendered diagrams, so that dense graphs are navigable.
25. As an archiver, I want to download diagrams as SVG, PNG, or MMD, so that I can reuse them outside the app.
26. As a re-editor, I want to copy the mermaid source, so that I can tweak the diagram definition.
27. As a code reader, I want line numbers on code cards by default, so that I can reference positions.
28. As a density-minded reader, I want the noLineNumbers meta to disable them, so that model-intended minimal blocks stay minimal.
29. As a code exporter, I want a download button on code cards, so that snippets can be saved as files.
30. As a diff reader, I want startLine=N meta support, so that file-slice blocks show true line numbers.
31. As a spreadsheet user, I want to copy tables as CSV or TSV, so that they paste cleanly into other tools.
32. As a table user, I want the existing copy-as-Markdown / preview / expand controls untouched, so that nothing I use regresses.

### R5 Worked 容器常驻化

33. As a live watcher, I want every turn to show its Working container from the start, so that the agent's activity is always visible (no silent dead zone).
34. As a settled reader, I want every turn to keep its Worked row after settling, so that nothing ever disappears from the transcript.
35. As a reader of pure-text turns, I want the Worked row to record the turn's duration, so that the effort is visible even without foldable work.
36. As an interaction purist, I want empty containers to be non-expandable (no chevron, no click), so that no control opens into nothing.
37. As a follow-mode user, I want the same always-present containers in Live Follow, so that watched sessions read identically to local ones.

### R6 导航轨层叠

38. As a sidebar user, I want the row context menu to render above the navigator rail, so that menu items are never covered by ticks.
39. As a rail user, I want the rail and its hover bubble to behave exactly as before inside the chat area, so that the fix doesn't regress ticket 46.

### R7 ThinkingRow 双修

40. As a live watcher, I want the thinking duration to survive folding and reopening the container, so that the counter reflects real elapsed time.
41. As a settled reader, I want the frozen host-measured duration once a block closes, so that the number is authoritative.
42. As a visual scanner, I want thinking chevrons to follow the Worked convention (right when collapsed, down when expanded), so that all fold controls speak one language.

### R8 回合时间序修订

43. As a chronology purist, I want the approval card to appear below the answer text (where its tool will run), so that pending and executed states occupy the same slot.
44. As a chronology purist, I want thinking that streams after the answer to render below the answer and tool rows, so that the display matches what actually happened.
45. As a settled reader, I want post-answer rows to stay below the answer after settling, so that settling never re-orders the transcript.
46. As a turn-structure reader, I want superseded mid-turn texts to fold into the Worked container as narration, so that only the last text block is the answer (ticket 53 rule confirmed).
47. As a transcript reader, I want pre-answer work to stay folded in the container, so that the container keeps holding the work phase.
48. As a follow-mode user, I want the same sequencing in Live Follow, so that both views share one time-order rule.

### 横切

49. As an operator, I want additive contract increments reported at implementation time, so that the contract ledger stays honest.
50. As an English-UI stickler, I want all new copy in English, so that the interface-language constraint holds.

## Implementation Decisions

- **R1 幽灵 cwd**：检测零新建——索引服务既有 2s 扫描已对全部去重 cwd stat 且 liveness 参与变更签名（票 42 基建），cwd 死亡/复现即触发刷新。**契约增量（additive，实施时报备）**：会话摘要投影增 cwdMissing 标志（缺席 = 旧载荷照常校验通过）；活 host 豁免语义不变（运行中的会话不出灰行、出横幅）。渲染层：横幅挂在受感染会话的会话视图顶部，文案三条事实（运行继续 / 文件工具会失败 / 退出后无法重开），**纯派生投影**——cwd 存活性翻转即自动显隐，无关闭钮；侧栏灰行 = 置灰 + meta 区 "cwd missing" 说明，点击仅弹解释 toast（resume 路径零触碰——对已删 cwd 的 resume 仍会 host 崩溃，灰行是纯展示态）；右键菜单保留 Archive / Copy task path / Copy session file path / Copy session ID，打开类动作不出现；⌘K 面板继续排除死 cwd 会话（launcher 只供可行动目标）。会话文件零改动。
- **R2 ⌘E**：全局键位表（物理 code、meta-only、⌥ 拒绝——既有表驱动先例）新增 KeyE 行 → toggle 动作；App 层路由进既有的 composer 展开状态机，状态机增**键位事件**（与 click/Esc/send 并列，纯函数扩展）；New Task 与会话内共组件自动同享；FollowView 无 composer 自然 no-op；tooltip 有快捷键只显键帽 ⌘E（词汇表纪律自动适用）。
- **R3 遮盖**：输入区右侧 padding 预留按钮区（按钮 right 偏移 + 宽度 + 余量 ≈ 44px），折叠与展开两态同规则；按钮 chrome 与右上角位置不动（操作者 Q12 拍板过位置，遮盖是缺陷不是位置错误）；ZCode 无此钮（1.4 已记录的操作者批准偏离），无校准参照。
- **R4 代码块全家庭**：新增 mermaid npm 依赖，**按图型懒加载分片**（ZCode 同型——动态 import 块不进主包）。**围栏卡型投影 = 纯函数**：lang=mermaid 且围栏闭合且解析成功 → 图卡；流式未闭合或解析失败 → 源码卡回退（lang 标签照常，不弹错误 toast）。图卡形态对齐 ZCode 取证：小写 mono 标签头 + 右上 sticky 操作钮组（download SVG/PNG/MMD 菜单、copy 源码、fullscreen）+ 渲染体 panZoom；fullscreen 为根层浮层、Esc 退出。代码卡：行号默认开、noLineNumbers 元参数可关、startLine=N 元参数平移计数、download 钮（按语言推导扩展名）。表格：既有工具排上 CSV/TSV 两项；表格 fullscreen 维持不做（ZCode 自身显式关闭）。mermaid 主题用库默认（浅色）——深色主题是全应用范围外项。
- **R5 容器常驻**：回合分组投影改为**有用户气泡的回合必有容器**：live 期 "Working · Ns"（容器级计时保留——容器本体不因折叠卸载，计时不丢），落定 "Worked · Ns"（回放回合无时长沿用票 14 规则只显 "Worked"）；零工作项回合容器体空且**不可展开**（无 chevron、点击无响应、aria-disabled——可展开 ⇔ 体非空）；ChatView 既有 `|| turn.live` 空壳条件由新规则取代；FollowView 同投影。**ZCode 偏离记录在案**：ZCode 零工作回合不渲染容器（bundle 实证 `u ? … : null`），操作者裁决常驻——正文输出也算 work 阶段。HEAD 回合（无用户气泡孤儿条目）维持现状。
- **R6 层叠**：chat 主区自构成层叠上下文（isolation / 等效 z-index 方案），使导航轨的 z 值在主区子树内参与比较而非根上下文；侧栏子树（含 z:80 右键菜单）整体恢复高于轨道。被拒：菜单 portal 到 body（改动更大、引入定位新复杂度）。验证面：轨道悬停气泡、回底钮（z:10）、根层 tooltip/浮层不受影响。
- **R7 ThinkingRow 双修**：思考部分流式开始时记 entry 级开始时间戳，显示秒数由（当前 − 开始）推算——重挂载/折叠重开从同一时间戳续算不归零；thinking_end 时 host 回填 durationMs 冻结标签（既有契约）；回放块无时长规则不变（会话文件不记录——票 14）。箭头：对齐 Worked 惯例——收起 ›、展开 ⌄（旋转基准反转，与回合容器同型）。
- **R8 时间序**：分割纯模型修订——**lastText 之后的全部行**（tool/thinking/approval）进常显段，按转写顺序渲染正文下方，live 与落定同位（ZCode 同型，修订票 53 Q11a 的仅工具裁剪）；lastText 之前的分类不变（thinking/审批/前置工具 → 容器；更早文本 → 过程叙述）。审批与工具同位：挂起审批卡在正文下方其工具将现之位，批准后原位变工具卡——**零跳变**。流式重划分维持：新文本块开始时旧答案降级为过程叙述归容器、常显段相应清空（票 53 既有规则，操作者重申确认）。FollowView 共享同一模型。
- 术语随票入 CONTEXT.md：「工作容器（Worked Container）」「预警横幅（CWD Banner）」「灰行（Dimmed Row）」「图卡（Diagram Card）」「常显段（After-Answer Segment）」——草案见 `intake-grilling.md`。UI 文案全英文（词汇表约束不变）。

## Testing Decisions

- 延续仓库原则：**好测试只测外部行为**——给定会话快照/契约事件/坐标，断言状态与可见输出；不测内部调用序列、不测 CSS 字节。
- **零新缝**，全落既有四缝：
  - **Seam-1 表驱动 vitest**（本批 6 个纯模型/投影族）：R1 cwdMissing 投影（死亡/活豁免/复现恢复，cwd-liveness 套件扩展）；R2 键位表 KeyE 行 + 展开状态机键位事件（keymap 与 expand 机器套件扩展）；R4 围栏卡型决策表（mermaid 闭合/未闭合/解析失败 → 卡型）+ 行号/startLine 投影 + CSV/TSV 序列化；R5 回合分组投影（零工作项回合必有容器 + 空体标志；live/落定；FollowView 同模型零开关）；R7 思考时长推导纯函数（同一开始时间戳重挂载不重置）；R8 分割决策表扩展（lastText 后 thinking/approval → 常显段；审批两态同位；降级重划分）。先例：chat-reducer、turn-collapse、keymap、cwd-liveness、expand 机器套件。
  - **host-contract smoke**：R1 的 cwdMissing 增量到时报备入账并验证旧载荷兼容（既有惯例）。
  - **electron smoke**：R1 横幅显隐 + 灰行 + 点击 toast + 目录复现恢复；R2 ⌘E 两处 composer toggle + tooltip 键帽；R4 种子会话 mermaid 图卡渲染 + CSV copy + 行号；R5 零工作项回合 Worked 行常驻（对照 pi15-empty-worked-container 场景）；R8 脚本化 live 回合经审批闸门断言挂起/执行两态同位且工具后思考在正文下方。
  - **visual harness**：R3 文本贴钮帧 + 展开态帧；R4 图卡帧 + 行号帧；R5 零工作落定帧（对照 pi15-empty-worked-container）；R6 菜单压轨帧（对照 pi15-rail-over-context-menu）；R8 时序帧（对照 pi15-approval-above-answer / pi15-post-answer-thinking-misplaced）。
- 性能红线：R4 mermaid 懒加载（主包零增量，ZCode 同型）；R5/R8 纯模型改动零额外转录重渲染（票 30/46/53 memo 先例）。

## Out of Scope

- 死 cwd 会话的降级只读打开（转录可读但不能续跑——Q3 拍板 A，候选未来批）。
- 横幅上的动作钮（Archive/关闭会话——Q2 拍板纯说明，侧栏供面已够）；死 cwd 新状态点色（Q1 拍板横幅足够，状态点词汇不动）。
- mermaid 之外的特殊围栏渲染（math/KaTeX 等）；代码卡文件图标（1.4 先例维持）；表格 fullscreen（ZCode 自关）。
- Composer 拖拽 resize 手柄；展开态跨重启持久化（组件本地状态维持）。
- 零工作项容器体里塞内容（时长行即全部——正文不进容器，「回合正文」词条不动）。
- 回放思考块的补算时长（会话文件无数据——票 14 规则 stands）。
- 会话条目本身的重排（显示层投影修订，会话文件零改动）。
- GLM 自适应思考等模型/供应商行为（调查已存档，Pi 红线不可改）。
- 深色主题（持续范围外）。

## Further Notes

- **取证链**：三轮十四问全记录与模块级根因见同目录 `intake-grilling.md`；实拍九帧 `pi15-*` 在 `.scratch/compare/`；会话库证据（01a0810d：零工作回合 272→273 / hello 292→293 与对照回合 291 的 token 反推 1.66–1.72 ch/tok / 回合时间序 298→301）；ZCode bundle 只读提取两次（mermaid 图卡 `data-streamdown:"mermaid-block"` 结构、能力位 `!==false` 默认全开、`pF={table:{fullscreen:!1}}`、零工作回合 `u ? … : null`、followingRows 全类型常显）——用后即弃，未复制任何资产。
- **思维链缺失存档（无票）**：GLM-5.3-flash 自适应思考——请求体正确（`thinking:{type:"enabled",budget_tokens}`）、token 计量与可见内容精确吻合、同会话同档位 30+ 条混杂有无思考。max = 预算上限非强制开关；TUI 显示逐字节一致。立此存照避免复查。
- **依赖决策**：R4 新增 mermaid npm 依赖（懒加载分片）——操作者拍板（Q6=C「越完美越好」）；渲染层依赖、可逆，无新 ADR。
- **ADR 检查**：无新 ADR——R5 为操作者批准的 ZCode 偏离（记录在案 + 术语入册）；R8 为可逆的显示投影规则修订（修订票 53 Q11a 裁剪）；R1 执行票 42 既有语义的显示面补全。
- **工单依赖提示（/to-tickets 用）**：R5 与 R8 都动回合分组纯模型 + 容器渲染条件——**强串行建议（R5 先、R8 后）**；R1 横幅也接会话视图——R1/R5/R8 同文件三写者，/to-tickets 裁量波次；R2（键位表/展开状态机）与 R3（Composer padding）Composer 邻接——串行或验证区段不相交；R4（Markdown 块投影）独立可并行（需网络装依赖）；R7（ThinkingRow）独立可并行。R1 是唯一触 main/contract 的票（additive）。
- **操作者待办**：`scripts/merge-ticket.sh:50` ls-files 补 `picode-1-5`（勿再绕）；实施期跑 dev app / smoke 遵守 dev-app serialization。

## Comments

- 2026-09-10 (requirements intake): 十四问三轮定稿（Q1–Q11 Round 1–2、Q10 因操作者澄清「历史都有容器 vs PiCode 发送的没有」重问并升级为常驻化裁决、Q12 因思维链调查两度插入后拍板、Q13/Q14 追加痛点后定稿）。全记录：`intake-grilling.md`。思维链缺失经三层彻查（接线 / 请求体 / token 反推）立此存照：非缺陷，模型自适应行为。
- 2026-09-11 (batch scope expansion): 操作者追加管理面需求（MCP/插件/技能）与 Usage 图表三项痛点，经 grill-with-docs 取证定稿（Q1–Q11，全记录 `intake-mgmt-recon.md`）：**MCP 出局**（Pi 不消费，管理面与 Pi 消费面严格一致）；**票 63 = 设置窗基座 + Skills 节**（Q3/Q4/Q9/Q10=A）、**票 64 = Packages 节**（Q2=C 全套+项目级，Q8 命名 Packages，Q11 信任态只读）、**票 65 = Usage 图表补齐**（1.3 批 R11 既定决议未交付的补交付 + 双区间风格统一，对照 pi15-usage 两帧与 z13-usage 两帧）。三票编号 63–65 全局连续，与 R1–R8 的 54–62 零文件交集，不扰动已开工票；**操作者拍板全部纳入 v1.5.0 发布范围**。
- 2026-09-11 (缝确认，追加链)：63/64/65 零新缝——全落既有四缝；64 经 host 侧包管理（npm/git 源拉取，非 IPC 契约面）；63 的 probe 技能来源维度为 additive 契约增量，实施时报备。
- 2026-09-10 (缝确认)：零新缝——全落既有四缝（Seam-1 表驱动 / host-contract smoke / electron smoke / visual harness），已向操作者报备，复触发 /to-spec 视为无异议。R1 cwdMissing 为 **additive 契约增量**，按惯例实施时报备。
- 2026-09-10 (分类记录)：缺陷 5（R3 遮盖、R5 空壳+消失、R6 层叠、R7 计时+箭头、R8 时间序跳变——R5/R8 分别修订票 49/53/46 的交付语义）、全新需求 3（R1 幽灵 cwd 供面、R2 ⌘E、R4 代码块全家庭）、调查存档 1（思维链缺失，无票）。
