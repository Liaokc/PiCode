# 55: Worked 容器常驻化——每回合必有、空体不可展开

**What to build:** 每个有用户气泡的回合**必有工作容器**：live 期 "Working · Ns"（首个工作项出现前也常驻——顺带消除静默期转录区无反馈），落定 "Worked · Ns"（回放回合无时长，沿用票 14 规则只显 "Worked"）；**零工作项回合**（无 thinking/工具/审批/过程叙述，如纯文本寒暄回合）容器体为空且**不可展开**——无 chevron、点击无响应（可展开 ⇔ 体非空，Q12 拍板 A）；正文仍常显容器外，「回合正文」词条不动。**ZCode 偏离记录**：ZCode 零工作回合不渲染容器（bundle 实证 `u ? … : null`），操作者裁决常驻——「正文输出也算 work 阶段，容器不允许消失」。FollowView 同规则。

**背景（取证）：** 现渲染条件 `(hasWork || live)` 造成零工作回合 live 空壳 "Working·1s"、落定整体卸载——一显一隐像数据丢失（pi15-empty-worked-container）。01a0810d 会话 16 回合中 2 个零工作项（entry 272→273 / 292→293），历史 14 个有工作项回合全部显容器——操作者感知的「历史都有、PiCode 发送的没有」即源于此不对称。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] 回合分组投影修订：有用户气泡回合必有容器 + 空体标志（表驱动：零工作 live / 零工作落定 / 零工作回放 / 有工作各态 / HEAD 回合维持现状）
- [ ] 空体不可展开：无 chevron、点击无响应、aria-disabled；有工作项时 chevron 与展开行为照旧（可展开 ⇔ 体非空）
- [ ] ChatView 空壳条件移除，由新规则取代；FollowView 同投影零开关
- [ ] 容器级计时跨折叠保持（折叠重开 Working·Ns 连续不归零——容器本体不因折叠卸载）
- [ ] electron smoke：零工作项回合 Worked 行落定后仍常驻（对照 pi15-empty-worked-container 场景）
- [ ] visual harness：零工作落定帧（对照 pi15-empty-worked-container）
- [ ] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [ ] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 55`。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R5，Q10 两度澄清后操作者裁决 + Q12=A）。**56 强串行于本票**（同文件：回合分组纯模型 + 容器渲染条件）。波次 W1。术语「工作容器（Worked Container）」随票入 CONTEXT.md（操作者批准的 ZCode 偏离在词条与 spec 双记录）。性能红线：纯模型改动零额外转录重渲染（票 30/46/53 memo 先例）。
