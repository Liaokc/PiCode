# 56: 回合时间序修订——lastText 后全行常显下方

**What to build:** 回合**最后一个文本块之后的所有行**（工具/思考/审批）按转写顺序**常显正文下方，live 与落定同位**（ZCode 同型——修订票 53 Q11a 的「仅工具」裁剪）：① 审批卡挂起时即出现在正文下方（其工具将现之位），批准后**原位**变工具卡——两态零跳变；② 工具结果之后模型新产的思考块渲染在正文下方，不再爬回容器、不再跑到正文上方；③ 新文本块流式开始时旧答案降级为过程叙述归容器、常显段相应清空（票 53 既有规则，操作者重申「中途的正文不能是最后的正文」）——时间序永远成立；④ lastText 之前的 work 归容器不变。FollowView 共享同一模型。

**背景（取证）：** splitTurn 仅 `index > lastText && kind==='tool'` 进 afterAnswer，approval/thinking 无条件归 work——entry 298→301 实测：审批卡悬在正文上方（容器内），批准执行后工具卡跳到正文下方（pi15-approval-above-answer / pi15-tool-below-answer）；工具结果后的第二个 thinking（4812ch）渲染进容器跑到正文上方（pi15-post-answer-thinking-misplaced）。ZCode 把可见正文之后的所有行（assistantFollowingRows，不分类型）常显正文下方。

**Blocked by:** 55（同文件强串行：回合分组纯模型 + 容器渲染条件——55 先改投影基座，本票在其上扩展分割规则）。

**Status:** ready-for-human

- [x] 分割决策表扩展（表驱动）：lastText 后 thinking/approval → 常显段；lastText 前 work 归容器不变；更早文本 → 过程叙述不变
- [x] 降级重划分：新文本块流式开始时旧答案降级过程叙述归容器、常显段清空——决策表覆盖
- [x] 审批两态同位：挂起卡位置 = 批准后工具卡位置（同一槽位，零跳变）
- [x] 常显段内 thinking 行渲染为折叠单行（Thought · Ns ›，可展开看全文），与容器内思考行同组件
- [x] ChatView / FollowView 同规则零开关
- [ ] electron smoke：脚本化 live 回合经审批闸门断言挂起/执行两态同位 + 工具后思考在正文下方（**阶段已实现并入库，验证被环境焦点争用阻塞**——见 Comments）
- [x] visual harness：时序帧（对照 pi15-approval-above-answer / pi15-post-answer-thinking-misplaced 场景修复后形态）
- [x] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [x] typecheck / lint / vitest 全绿；code-review 双轴通过（electron smoke 项除外，见上）

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 56`。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R8，Q13=A + 操作者重申降级规则）。波次 W2，**Blocked by 55**。修订票 53 的 Q11a 裁剪（可逆显示投影规则修订，无新 ADR）。术语「常显段（After-Answer Segment）」随票入 CONTEXT.md。
- 2026-09-11 (implement, t56-turn-chronology @ 9a09549 + e1c8dac): 全验收项落地（electron smoke 验证面除外，见下）。
  - **Seam-1 纯模型**（`src/shared/turn-collapse.ts`）：`splitTurn` 一行规则变更——lastText 之后**全部非文本行**（tool/thinking/approval）进 afterAnswer（撤回票 53 Q11a 的仅工具裁剪，对齐 ZCode assistantFollowingRows 全类型常显）；重划分由 findLastIndex 每次重算自然覆盖（新文本流式 → 旧答案降级过程叙述、段内行滚回容器、常显段清空——「中途的正文不能是最后的正文」）。`pendingApproval` 语义收窄：只计容器体内的挂起 pill（派生自 split 后的 work，draft 累积字段删除）——段内 pill 不再强开容器，否则决策一落容器必然砰关、两态同槽被跳变破坏（手动折叠 + 正文后闸门路径实测会跳）。
  - **表驱动 7 例**：正文后 thinking 入段 + 段内转写顺序（tool 后 thinking 在 tool 下）、降级重划分（tool 回滚 + afterAnswer 清空）、降级重划分（段内 pending pill 回滚重触发自动展开）、段内挂起 pill 位置、两态同槽（pending → approved → tool 原位转换无重排）、正文前闸门保持自动展开；改写票 53 「post-answer thinking stays folded」例为票 56 语义。vitest 1128/1128（81 文件）。
  - **渲染**：零功能性改动——TurnWorkRows 已共享全部行型（段内 thinking = 同一 ThinkingRow 折叠单行可展开；段内 pill 同一 ApprovalPill 带 Approve/Approve & Remember/Deny）；AnswerBlock/TurnContainer/ChatView 仅注释更新；ChatView open 条件不变（pendingApproval 新语义下自动正确）。FollowView 同投影零开关。
  - **术语**：CONTEXT.md「常显段（After-Answer Segment）」入册（intake-grilling.md 草案全收）；「回合正文」改「正文之后的全部行入常显段」；「工作容器」补「容器体收纳正文**之前**的工作（正文后的行入常显段）」。
  - **electron smoke**：新 ticket-56 段（contract stream，无模型调用，`worked_container_done` 后）——① live 回合正文流式后闸门询问，断言挂起 pill 在正文下方（`.turn-after-answer` 内、`.turn-container` 内为零）；② approval_resolved + tool_start/end 复放宿主批准序列，几何断言 pill→tool 同槽（±2px，实测 297→297px 零跳变，同一段内子索引不变）；③ 工具后 thinking 在段内 tool 下方（idx 1）且默认折叠、点击展开全文；④ agent_end 落定后段组成与顺序不变、无行回爬容器。另修订两处既有 fold-purity 探针（follow 结构化回合 + takeover 重放审计）：票 23「折叠期零可见行」改为票 56 语义（`.turn-container .thinking-row === 0` + 段内 2 tool 卡含 1 error 卡 + 1 折叠 thinking 行）——该两处旧探针编码了被本票修订的「thinking 全折叠」规则。
  - **visual harness**：`PICODE_VISUAL_CHRONOLOGY=1`（`npm run visual:chronology`），断言式（违规 exit 1）——tc1 挂起 pill 正文下方帧 / tc2 工具卡同槽帧（几何断言）/ tc3 工具后 thinking 在 tool 下折叠单行帧 / tc4 落定组成顺序帧，对照 pi15-approval-above-answer 与 pi15-post-answer-thinking-misplaced 修复后形态；基座 visual harness 让位（visual.ts stand-down 先例）；全 4 帧 13:16 实跑通过，PNG 入库。
  - **⚠ electron smoke 验证被环境阻塞（非代码阻塞）**：烟囱链在 ticket-44 真剪贴板阶段要求真实窗口焦点（document.hasFocus），macOS 15 协作激活在操作者持续使用其它应用时拒绝焦点窃取（烟囱自注："denies a focus steal while the user is actively typing"）。实施会话 13 次运行（含两次手动 + 一个 10 连重试器，每次带 1s System Events frontmost 敲门）全部卡在票 44 焦点闸门——前置最前应用实测 Chrome → 企业微信（操作者持续使用中，疑似会议）；单测探针（/tmp focustest-probe）证实焦点在操作者交互间歇能落地（3.5s 窗口）但烟囱到达票 44 的 10s 窗口未逢间歇。**阻塞点在本票改动之前的阶段，与本票文件零因果**（票 56 段为纯 contract-stream 注入；visual harness 同通道实跑全绿）。待操作者空出机器 3 分钟后 `npm run smoke:electron` 复跑即验（ALL GREEN 照惯例全链复跑）。
  - **gate 状态**：typecheck 绿；lint 0 error（EmptyState 预存 warning 非本票）；vitest 1128/1128；code-review 双轴（无子代理通道，实施会话自审两轴分离报告）——Standards：readSlot 探针多余 userGesture 实参 + settle 注释措辞两处已修（e1c8dac），其余遵循先例（每 visual-harness 独立文件与工具函数按 14 个既有 harness 惯例豁免 Duplicated Code 判定）；Spec：9 验收项逐条对照无缺漏、无范围蔓延（pendingApproval 收窄为两态同槽验收项的必要推论，已在注释与本 Comments 论证）。
  - **ps 自查**：每次应用通道前执行；期间曾发现一次残留 Electron 主进程（票 44 fail 路径 app.exit 后）已 kill；通道零并跑。
  - **交接给合并会话**：完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 56`；electron smoke 复跑通过后再 merge（或由操作者裁决验收）。
