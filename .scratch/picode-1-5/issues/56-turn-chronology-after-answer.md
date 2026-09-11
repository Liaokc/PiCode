# 56: 回合时间序修订——lastText 后全行常显下方

**What to build:** 回合**最后一个文本块之后的所有行**（工具/思考/审批）按转写顺序**常显正文下方，live 与落定同位**（ZCode 同型——修订票 53 Q11a 的「仅工具」裁剪）：① 审批卡挂起时即出现在正文下方（其工具将现之位），批准后**原位**变工具卡——两态零跳变；② 工具结果之后模型新产的思考块渲染在正文下方，不再爬回容器、不再跑到正文上方；③ 新文本块流式开始时旧答案降级为过程叙述归容器、常显段相应清空（票 53 既有规则，操作者重申「中途的正文不能是最后的正文」）——时间序永远成立；④ lastText 之前的 work 归容器不变。FollowView 共享同一模型。

**背景（取证）：** splitTurn 仅 `index > lastText && kind==='tool'` 进 afterAnswer，approval/thinking 无条件归 work——entry 298→301 实测：审批卡悬在正文上方（容器内），批准执行后工具卡跳到正文下方（pi15-approval-above-answer / pi15-tool-below-answer）；工具结果后的第二个 thinking（4812ch）渲染进容器跑到正文上方（pi15-post-answer-thinking-misplaced）。ZCode 把可见正文之后的所有行（assistantFollowingRows，不分类型）常显正文下方。

**Blocked by:** 55（同文件强串行：回合分组纯模型 + 容器渲染条件——55 先改投影基座，本票在其上扩展分割规则）。

**Status:** claimed

- [x] 分割决策表扩展（表驱动）：lastText 后 thinking/approval → 常显段；lastText 前 work 归容器不变；更早文本 → 过程叙述不变
- [x] 降级重划分：新文本块流式开始时旧答案降级过程叙述归容器、常显段清空——决策表覆盖
- [x] 审批两态同位：挂起卡位置 = 批准后工具卡位置（同一槽位，零跳变）
- [x] 常显段内 thinking 行渲染为折叠单行（Thought · Ns ›，可展开看全文），与容器内思考行同组件
- [x] ChatView / FollowView 同规则零开关
- [ ] electron smoke：脚本化 live 回合经审批闸门断言挂起/执行两态同位 + 工具后思考在正文下方
- [x] visual harness：时序帧（对照 pi15-approval-above-answer / pi15-post-answer-thinking-misplaced 场景修复后形态）
- [x] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [ ] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 56`。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R8，Q13=A + 操作者重申降级规则）。波次 W2，**Blocked by 55**。修订票 53 的 Q11a 裁剪（可逆显示投影规则修订，无新 ADR）。术语「常显段（After-Answer Segment）」随票入 CONTEXT.md。
