# 82: live 回合纯时间序——流式单流、无提升轮换

**What to build:** 流式回合的渲染改为**纯时间序单流**：全部 assistant 文本块按发生顺序内联于工具/思考行之间、随容器流式展开——不再把「最新文本块」提升为临时正文、不再有下一个文本块开始时的降级灰化轮换、live 期无常显段。**落定态维持现状**（最终回合正文在容器下方 + 容器折叠——ZCode 构图不变）；挂起审批卡内联于其工具将现之位；ChatView 与 FollowView 同规则。

**背景（取证）：** 现行为 = 票 56 提升规则（最新文本块 = 临时正文提至容器下方 + 常显段，`turn-collapse.ts` 分组 + chat-reducer 新文本块重划分）；操作者实拍（pi17-container-collapsed/-expanded）——「过程中的正文在最上方显示…展开后才是时间顺序…我希望全部都按照时间顺序」。ZCode 构图（落定态）不动；本票只改 live 语义。**CONTEXT.md 词条 rider**：「回合正文/常显段/过程叙述」的 live 语义随票修订（提升与常显段仅存在于落定态），落定定义不变。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1 表驱动：live 回合分组 = 纯时间序（文本块内联、无临时正文、无常显段、无重划分），落定分组与现状逐字节同构（含答案位置/常显段/容器折叠）
- [ ] 挂起审批卡在 live 流中占其工具将现之位（内联、两态零跳变语义保持）
- [ ] electron smoke：流式回合文本块按序内联、无灰化轮换；agent_end 落定后构图与现状一致
- [ ] FollowView 同规则验证
- [ ] CONTEXT.md 三词条修订随票入册（本会话只写 .scratch——词条草案在 `../intake-grilling.md`，实现票落地）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）；全英文文案
