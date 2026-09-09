# 53: 回合正文分割——最后文本块=正文，过程叙述归 Worked（ChatView+FollowView）

**What to build:** 结算后的回合正文只显示该回合**最后一个文本块**（位置规则，非语义判定）；之前的思考/工具/**过程叙述文本**全部收进 Worked 容器——运行中容器照旧自动展开、结算收起、错误回合保持展开（票 23 既有行为不变）；正文**之后**若还有工具行，**常显在正文下方**（转写顺序，ZCode 对齐，Q11a）。**ChatView 与 Live Follow 同规则**（Q10a：groupTurns 三面共享纯模型，零开关）。fork anchor 语义不变（= 最后文本承载 entry，与现状等价）；流式尾文本作为正文持续可见。

**背景（取证）：** 现状票 23 设计即"所有 assistant 文本 part 无条件进 answer"——长任务回合正文 = 叙述墙，最终答案被淹没（会话 01a0801b 实证，截图 pi14-narration-in-answer）；ZCode 分段算法（`Ant`/`Tnt`，bundle 只读取证）：可见正文 = latestAssistantTextRow，之前全进 history 折叠容器（运行中自动开、结算收），之后常显。附带：**「回合正文（Turn Answer）」「过程叙述（Interim Narration）」词条落 CONTEXT.md**（草案见 `../intake-grilling.md`）。

**Blocked by:** 48（按 spec 建议 R0 后开吃准事件语义；无硬文件冲突——Q-B 确认挂 48 单边）。

**Status:** ready-for-human

- [ ] 结算回合正文仅最后文本块（复现 pi14-narration-in-answer 场景验证修复）
- [ ] 过程叙述在容器内：展开可见、折叠隐藏；容器 live 展开/结算收起/错误展开零回归
- [ ] 正文后工具行常显下方（转写顺序）
- [ ] FollowView 同规则；fork anchor 不回归；流式尾作为正文持续可见
- [ ] groupTurns 分割决策表表驱动（Seam-1：最后文本块/过程叙述/后续工具/流式尾/错误/无文本回合）
- [ ] electron smoke + visual 帧对照 pi14-narration-in-answer 入库
- [ ] 两词条入 CONTEXT.md（与 intake-grilling 草案一致）；性能红线：纯模型改动零额外转录重渲染；typecheck / lint / test 全绿

## Comments

- 2026-09-09 (requirements intake): 建票（spec R4，Q6 参照 ZCode + Q10 同步 + Q11a）。与 51/52 无文件交集，可在 48 合入后与其二并行。波次：W2（48 合入后）。
- 2026-09-09 (implementation start, t53-turn-answer-split): claimed——Seam-1 groupTurns 分割规则改造（最后文本块=正文 / 更早文本=过程叙述 work item / 正文后工具=常显段），TDD 先行。
- 2026-09-09 (implementation, t53-turn-answer-split): 完成并全绿。① Seam-1 `src/shared/turn-collapse.ts`：`splitTurn` 决策表（raw 转写序收集 → findLastIndex 定位最后文本块）——`TurnGroup.answer: TurnAnswerPart | null`（有且仅有一个 = 最后文本 part；无文本回合为 null）、更早文本 → `TurnWorkItem 'narration'`（过程叙述，随容器折叠）、正文后工具 → `TurnGroup.afterAnswer`（常显段，永不折叠）；正文后 thinking/approval 维持容器内容（票 23 零回归读法，spec 只点名工具行，表驱动行锁定）；fork anchor = answer.entryId = 最后文本承载 entry（与现状等价，`history_tree_fork_ok` 实证）；hasWork 只数可折叠内容（narration 计入、afterAnswer 不计）。② 渲染：`NarrationRow`（基础 work 行，13px muted pre-wrap）+ `TurnWorkRows` 从 TurnContainer 提取共享（容器体与常显段同 switch 同 handlers）+ AnswerBlock 单 answer 渲染 + `.turn-after-answer` 段（text → actions → tools）；navigator rail 气泡预览随之只显尾块（共享模型必至）。③ tests/shared/turn-collapse.test.ts 重写为票面六类决策表 10 行（最后文本块/过程叙述/后续工具/后续 thinking/顺序回滚/流式尾/无文本/错误回合/回合边界/fork anchor）+ navigator-rail 预览行更新；1069/1062→1069 全绿。④ electron smoke 尾部新增 `answer_split_*` stage（emitContractEvent 注入 settled replay——visual-perf 先例，零模型调用，置尾不扰后段）：结算后正文仅尾块 + 叙述折叠隐藏/展开双行可见 + 正文后工具常显；follow/takeover/replay 既有断言全绿（零回归实证）。⑤ visual:answer（PICODE_VISUAL_ANSWER=1，独占位注册进 visual.ts stand-down 链）两帧入库：as1-answer-split-settled / as2-answer-split-open（复现 pi14-narration-in-answer 场景验证修复）；visual.ts 基础 harness 2-settled 探针改新语义（answerBlocks===1）并重摄全帧。⑥ CONTEXT.md 两词条已落（intake-grilling 措辞原文）。**契约增量：零**（纯 renderer/model，IPC 未动）。性能红线：useMemo 依赖未动、groupTurns 仍 O(n) 单次派生，零新增重渲染路径。门禁：typecheck / lint / vitest 1069 / smoke:electron 全 stage 绿 / visual 三 harness 绿。/code-review 两轴：Standards 零硬违规（4 项 judgement call 备案：handlers 数据团维持 repo 既有散传惯例、narration entryId 保真溯源、probe SIG 自包含惯例、注释引用中文术语循 ThinkingRow 先例）；Spec 零缺失零蔓延（3 处解释性备案：正文后 thinking 折叠读法、气泡预览随模型、Copy 只拷正文）。**commits：73866a1（claim）+ 3aea510（feat 模型+渲染+表）+ f84d4e3（harness+smoke+词条）+ 6145f0c（visual 独占位）+ bbd039f（帧入库），基于 main fabb984。未自行合并——请操作者执行 `bash scripts/merge-ticket.sh 53`。
