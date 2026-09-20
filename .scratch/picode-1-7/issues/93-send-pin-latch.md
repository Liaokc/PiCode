# 93: 发送落底——sendPin 改闩、四路发送全覆盖

**What to build:** 发送消息后视图**必须落底**——新回合的 Working 容器成为输入框上方最底元素（操作者原话：「发送消息后主会话中输入框上最下面的应该是 agent 的 worked 内容」）。实现 = sendPin 从单次消费改**到达底部才清的闩**；覆盖四路：idle 发送 / steer / follow-up / **排队注入**（队列注入现在完全不触发滚动）；闩生效期间用户上滑**立即接管**（票 75 滚轮永远赢，不回退）。

**背景（取证）：** `ChatView.tsx:151` sendPin 单次消费（effect 一轮即清，entry 晚到/多轮增长时闩已失效）；排队注入无 entry 变化（queue_update 不触发滚动 effect）；composer 收回改 viewport 的时序竞态。既有立法：票 75 方向感知（heldAway 闩）+ 票 45 吸底决策表——本票是 selfSent 臂的补全。

**Blocked by:** 82（live 回合纯时间序——同 ChatView 滚动 effect 区段串行）.

**Status:** ready-for-human

## Acceptance

- [x] Seam-1 决策表扩展：selfSent 闩（置位→到底才清）× 上滑接管 × 四路发送（idle/steer/follow-up/queue-inject）全组合
- [x] electron smoke：滚离底部状态发送 → 落底且 Working 为最底元素；排队注入落底；落底过程中上滑立即停（滚轮赢）
- [x] jump-to-latest / 回底钮 / 74 号吸底既有行为零回归
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-18 (implement session，分支 t93-send-pin @ 1aa7ff0+74a3cf2，rebase main 44fa8a4 含 82 基座)：**sendPin 单次消费 → 到达底部才清的闩**，纯模型 + 渲染层 + smoke 三层落地：
  - **Seam-1（`src/shared/scroll-stay.ts`）**：新增两个纯函数——`isAtBottom`（distance < 1px，吸收亚像素 scrollTop 噪声；刻意严于 160px 跟随带：arrival 是钉底落点，不是跟随门）与 `nextSendLatch`（闩转移：真实上滑 `deltaPx < -1` 即清位＝接管；视口在读到 ON 底＝arrival 清位——手动滚到底/底部钳制/上一 pass 自己的钉底都归此臂；其余——向下朝底、亚像素噪声、纯增长无位移——保持闩）。`shouldAutoScroll` 决策表函数体**零改动**：45/75 的 16 组合行逐一保真，`selfSent` 形参语义升格为「send 闩的置位态」（持续多 pass 而非单次）。模型头注释补票 93 立法（四路装填、queue_update 不改 entries 故队列注入靠原手势的闩存活到投递、接管后 agency 不反超）。
  - **ChatView（`src/renderer/src/components/ChatView.tsx`）**：`sendPin` ref 更名 `sendLatch`；装填点不变（`withPin` 包 onSend/onSteer/onFollowUp 三路——排队注入即 2/3 路手势的装填存活到投递）；**消费行删除**（不再单次清）；scroll 监听与 stick effect 双写点各补一行 `nextSendLatch`（与 `nextHeldAway` 同一 live delta 重放——同帧手势永不丢失，闩永不反超已发生的手势）；会话切换重置补闩。**93 窗口关闭**：旧代码 `if (selfSent) heldAway.current = false` 会让发送 pin 反超发送之后发生的上滑（echo pass 照样拽底——滚轮输给 pin）；新序 nextHeldAway→nextSendLatch 先行，接管先清闩再立 heldAway，echo pass 不拽。零额外渲染保持（闩 ref-only，写点全在既有 scroll 监听/effect）。
  - **vitest（`tests/shared/scroll-stay.test.ts`，TDD red→green）**：`isAtBottom` 4 行 + `nextSendLatch` 12 行转移表 + 「接管反超 agency」组合行（复现 93 窗口：上滑后 `shouldAutoScroll` 必须拒绝）+ 三段闩生命周期组合测试（idle 发送落底时序、排队注入装填存活、接管永久性——后续 pass 无再拽）。13/13 绿；全套 1645/1645 绿；typecheck 双 tsconfig 清。
  - **electron smoke（`src/main/smoke.ts` scroll93 stage，插于 scroll75 之后）**：隔离 store 全隔离会话四段断言：① busy 中滚离中部排队 follow-up → 队列确认后带内拽底（queue 面板自身改 viewport 的高度位移也被武装闩修复——下一 pass 重钉）；② **排队注入落底**：投递 DOM 锚定探测（`PICODE_93_Q` 入 thread && AT_BOTTOM && 末容器 'Working' 且底边入视口）+ 注入回合流式 3 delta 后仍钉底；③ **93 窗口滚轮赢**：同一条 executeJavaScript 内 type+Enter+上滑 60px（先于 echo 的 IPC 往返落地）→ echo 渲染 + 3 delta 后 scrollTop 恒在（pre-93 代码此步必被拽底——红）；④ 滚到顶 idle 发送 → 落底且 Working 容器为最底元素（操作者原话构图）。steer 与 follow-up 在渲染层同路径（同 withPin 装填、同 user_message 投递中继——仅 SDK 投递时序不同），由 ①② 覆盖，四路组合由 Seam-1 表锁定。
  - **首跑失败取证（诚实记录）**：首跑 ② 探针败（诊断 distance=0 却报失败）——隔离 store 会话文件实证：投递与注入回合的 user+assistant 均**已落账**，即 SDK `agent_end` 只在注入回合**完成后**发出（follow-up 队列非空则循环 continue 不终止），等 agent_end 再探 'Working' 结构性过晚（容器已落定 'Worked'）。修法 = 探测锚改投递 DOM 出现（150s 预算覆盖 host 计数流余量），3 delta 窗口搭注入回合的活流，自然 agent_end 替代 abort（74a3cf2）。复跑 stage 6 全绿（233s）。
  - **验证**：`npm run smoke` 六阶段全套 ALL GREEN（298s，exit 0）——scroll_stay（票 45）/ scroll75（票 75）既有阶段全绿零回归，jump-to-latest/回底钮行为未动；阶段间 `ps` 自查无其他 dev app/smoke 进程（本会话环境 ELECTRON_RUN_AS_NODE 未置位，无需 env -u）；首跑直跑 stage 6 漏设 PICODE_SESSION_DIR 曾写入真库 6 个会话文件，已用 `scripts/cleanup-smoke-sessions.ts --yes` 全量清除并复核真库无残留（工单 13 卫生机制照常把关）。
  - **CONTEXT.md rider**：吸底词条（回底钮目）补**自发送闩**段——四路装填、到达底部才清、接管清位、queue 注入靠原手势闩存活到投递。
  - **零契约增量**：contract.ts 零改动；改动静限 scroll-stay 纯模型 / ChatView 生命周期 / smoke / CONTEXT 词条。
- 2026-09-18 (code-review 双轴并行子代理，/code-review skill，base 44fa8a4…HEAD @ b115d53)：两轴均 **OK with notes（零硬违规、零 P0/P1）**。注：两个 reviewer 会话均无 shell 工具，未跑 git diff——按各文件全量 HEAD 审读（seam/tests/ChatView 滚动区/smoke stage ②/CONTEXT.md:130），行为从源码复核；supervisor 补跑了 diff-stat、vitest、typecheck 与 smoke（下方验证段）。
  - **Standards 轴（reviewer 子代理）**：确认达标——Seam-1 纯度（nextSendLatch/isAtBottom 无时间/IO/DOM）；ChatView ref-only 零额外渲染；票号注释（45/75/93）；英文注释+既定中文法条（到达底部才清/滚轮赢/回底/自发送复位）；CONTEXT rider ↔ 实现逐臂对应（接管 deltaPx<-1、arrival 含手动到底与钳制）；四路装填无旁路（withPin 包三回调，唯一 Composer 挂载点）；测试表驱动覆盖双清位臂+迟滞+接管+组合，16 行 stick 表原封。**P2 judgement call ×2**：① ChatView 两处 `nextHeldAway+nextSendLatch` 同对转移（Duplicated Code / Data Clumps）——已采纳修复：`advanceScrollLatches(deltaPx, el)` ref-only 共享转移（commit e2b7622 后），typecheck/vitest/smoke 复跑全绿；② smoke AT_BOTTOM 40px 容差 vs seam 1px——有意（DOM 级 UI 探针非 arrival 裁定），不动。
  - **Spec 轴（reviewer 子代理）**：需求 1（闩语义）/2（四路装填+队列注入真实投递——host 仅在 persistence 时刻中继，smoke ② 锚定真实注入而非入队时回显）/3（滚轮赢不回退）逐项验证；零回归保持；CONTEXT rider 在册。**P2 ×2**：① steer 未在 smoke 真实执行（覆盖依赖 withPin 代码同一性）——**书面豁免**：渲染层 steer 与 follow-up 为同一代码路径（withPin(onSteer) ≡ withPin(onFollowUp)，同 queue_update 面板、同 user_message 投递中继；差异仅在 SDK 投递时序——steer 队列在无工具回合的边界语义，属 SDK 领域非渲染滚动），smoke 加 steer 腿验证的是 SDK 时序而非本票行为，且会引入 SDK 边界时序 flake；四路组合由 Seam-1 表+生命周期测试锁定。② 「读者排队后上滑 → 注入不拽」为需求 3 接管法条的直接推论（接管清闩 → heldAway 挡拽），spec 文本已明定（「闩生效期间用户上滑立即接管」）——实现如实，留操作者 sign-off 记录于此。
  - **评审后验证**：diff-stat 五文件无外溢（scroll-stay.ts / ChatView.tsx / scroll-stay.test.ts / smoke.ts / CONTEXT.md + 议题/视觉资产）；vitest 1645/1645；typecheck 双 tsconfig 清；electron smoke 复跑 exit 0（scroll_stay/scroll75/scroll93 全绿零 FAIL）。
  - 视觉证据：`npm run visual:send-pin`（新增 `src/main/visual-send-pin.ts`，PICODE_VISUAL_SEND_PIN=1；隔离 store 播种回溯会话+真实侧栏点击打开+**真实 composer 发送**（手势装填——契约注入触不到 withPin））：`.scratch/visual/c93-a-scrolled-away.png`（滚离中部阅读位、回底钮可见）、`.scratch/visual/c93-b-send-landed.png`（发送后落底、活 Working 容器为输入框上最底元素——验收构图帧）。harness 断言式（违规 exit 1），可无人值守。
- 2026-09-18 (merge session，per 操作者验收指令「93 工单已验收」)：Status 翻转 ready-for-human + 四验收框按 Comments 既有证据链勾选（implement 含首跑取证与真库卫生闭环 / code-review 双轴 OK-with-notes 全处置 / 评审后验证 1645 + smoke exit 0 + visual 两帧）。合并会话仅簿记未重跑——合并后 main 上 typecheck + vitest 复验闭环。CONTEXT.md 吸底词条自发送闩段已随票，合并时核对。
