# 93: 发送落底——sendPin 改闩、四路发送全覆盖

**What to build:** 发送消息后视图**必须落底**——新回合的 Working 容器成为输入框上方最底元素（操作者原话：「发送消息后主会话中输入框上最下面的应该是 agent 的 worked 内容」）。实现 = sendPin 从单次消费改**到达底部才清的闩**；覆盖四路：idle 发送 / steer / follow-up / **排队注入**（队列注入现在完全不触发滚动）；闩生效期间用户上滑**立即接管**（票 75 滚轮永远赢，不回退）。

**背景（取证）：** `ChatView.tsx:151` sendPin 单次消费（effect 一轮即清，entry 晚到/多轮增长时闩已失效）；排队注入无 entry 变化（queue_update 不触发滚动 effect）；composer 收回改 viewport 的时序竞态。既有立法：票 75 方向感知（heldAway 闩）+ 票 45 吸底决策表——本票是 selfSent 臂的补全。

**Blocked by:** 82（live 回合纯时间序——同 ChatView 滚动 effect 区段串行）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1 决策表扩展：selfSent 闩（置位→到底才清）× 上滑接管 × 四路发送（idle/steer/follow-up/queue-inject）全组合
- [ ] electron smoke：滚离底部状态发送 → 落底且 Working 为最底元素；排队注入落底；落底过程中上滑立即停（滚轮赢）
- [ ] jump-to-latest / 回底钮 / 74 号吸底既有行为零回归
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
