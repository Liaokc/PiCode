# 53: 回合正文分割——最后文本块=正文，过程叙述归 Worked（ChatView+FollowView）

**What to build:** 结算后的回合正文只显示该回合**最后一个文本块**（位置规则，非语义判定）；之前的思考/工具/**过程叙述文本**全部收进 Worked 容器——运行中容器照旧自动展开、结算收起、错误回合保持展开（票 23 既有行为不变）；正文**之后**若还有工具行，**常显在正文下方**（转写顺序，ZCode 对齐，Q11a）。**ChatView 与 Live Follow 同规则**（Q10a：groupTurns 三面共享纯模型，零开关）。fork anchor 语义不变（= 最后文本承载 entry，与现状等价）；流式尾文本作为正文持续可见。

**背景（取证）：** 现状票 23 设计即"所有 assistant 文本 part 无条件进 answer"——长任务回合正文 = 叙述墙，最终答案被淹没（会话 01a0801b 实证，截图 pi14-narration-in-answer）；ZCode 分段算法（`Ant`/`Tnt`，bundle 只读取证）：可见正文 = latestAssistantTextRow，之前全进 history 折叠容器（运行中自动开、结算收），之后常显。附带：**「回合正文（Turn Answer）」「过程叙述（Interim Narration）」词条落 CONTEXT.md**（草案见 `../intake-grilling.md`）。

**Blocked by:** 48（按 spec 建议 R0 后开吃准事件语义；无硬文件冲突——Q-B 确认挂 48 单边）。

**Status:** ready-for-agent

- [ ] 结算回合正文仅最后文本块（复现 pi14-narration-in-answer 场景验证修复）
- [ ] 过程叙述在容器内：展开可见、折叠隐藏；容器 live 展开/结算收起/错误展开零回归
- [ ] 正文后工具行常显下方（转写顺序）
- [ ] FollowView 同规则；fork anchor 不回归；流式尾作为正文持续可见
- [ ] groupTurns 分割决策表表驱动（Seam-1：最后文本块/过程叙述/后续工具/流式尾/错误/无文本回合）
- [ ] electron smoke + visual 帧对照 pi14-narration-in-answer 入库
- [ ] 两词条入 CONTEXT.md（与 intake-grilling 草案一致）；性能红线：纯模型改动零额外转录重渲染；typecheck / lint / test 全绿

## Comments

- 2026-09-09 (requirements intake): 建票（spec R4，Q6 参照 ZCode + Q10 同步 + Q11a）。与 51/52 无文件交集，可在 48 合入后与其二并行。波次：W2（48 合入后）。
