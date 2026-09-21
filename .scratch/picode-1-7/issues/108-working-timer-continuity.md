# 108: 计时与时长显示——锚点派生口径迁移（live 计时不丢 + Worked 时长）

**What to build:** 容器 header 计时/时长全面改为**回合锚点派生**：①**live 计时不丢（R29）**——`now - startedAt`（锚点 = 该回合用户消息/首工作项的条目时间戳——会话文件有记录），四种切换组合（置顶↔置顶、置顶↔非置顶 双向）切回后计时**从原值继续**、不归零；折叠/展开不归零（既有）。②**Worked 时长显示（R30）**——落定回合统一在 **chevron 右侧**显时长（回合首条目 ts → 末条目 ts 派生），**含重放回合**（票 14「回放回合无时长」口径修订——原前提不成立，条目时间戳必在）；流式过的落定回合同位置统一。FollowView 同规。

**背景（取证）：** `use-elapsed-seconds.ts` = 纯 tick 计数器（`useState(0)` + interval +1），注释自述「container row never unmounts **across folds**」——只考虑了折叠（票 55），没考虑 **ADR-0006 切换语义（后台不渲染 + 切回重挂载）**：容器卸载即归零，切回从 1s 重数（操作者实拍 pi17-working-7s 现场）；且 seconds 归零使落定回合 `timed` 假 → 切回后 "Worked" 无时长（R30 的第二症状）。同坑先例 = 票 61 的 Thinking 行——已用 `useElapsedClock` 从条目级开始时间戳派生。R30 的时长数据 = 回合首末条目 ts（ADR-0002 数据源如实；票 14「无时长」前提已不成立——口径修订）。

**Blocked by:** 94（工作容器折叠锚定——同 TurnContainer 区段串行）.

**Status:** ready-for-human

## Acceptance

- [x] Seam-1：锚点派生纯函数（startedAt 锚点选取/落定时长 = 首末条目 ts 差/无锚点防御）表驱动
- [x] R30：落定回合 chevron 右侧显时长——本视图流式回合与**重放回合**都显；live 的 Working · Ns 内联不变
- [x] electron smoke：A 运行中切 B 再切回 → 计时从原值继续（≥ 切离时刻）；四种切换组合全覆盖；落定回合 chevron 右侧时长（**重开会话的重放回合也显**）
- [x] 折叠/展开不归零（票 55 语义不回归）；FollowView 同规
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-21 (implement session，t108-timer-continuity @ d432eff，含 94 基座)：实现完成并全量验证，未自行 merge——**操作者/合并会话：`bash scripts/merge-ticket.sh 108`**。要点：
  - **Seam-1**：新纯模块 `shared/turn-duration.ts`（表驱动 15 测试）——`turnStamps` 折叠（锚点 = 首个带戳条目：用户回执优先、缺席降级首工作项；末戳 = 末条目；全无戳 → 双 null 无锚点防御）；`deriveWorkingSeconds`（R29：now − 锚点，floor、钳 ≥1，无锚/无钟回退本地 tick——票 61 纪律）；`deriveWorkedSeconds`（R30：首末戳差 floor 钳 ≥1；无戳时 in-view tick 回退，重挂载无戳 → 不显时长的不诚实降级）。`groupTurns` 每回合折叠一次 stamps 上 TurnGroup（`startedAtMs`/`endedAtMs`），模型零读钟。
  - **数据（ADR-0002，纯增量）**：`UserEntry.startedAtMs`（live = user_message 回执戳；重放 = 记录 ts）、`AssistantEntry.endedAtMs`（live = message_end 回执戳；重放 = 记录 ts——会话文件整条消息写一次即完成时刻）；`replayEntry` 解析 `item.timestamp`（NaN 安全降级 undefined）；App 派发边界 `stampThinkingStart` → `stampReceiptAnchors`（thinking_delta + 新增 user_message/message_end，wrapped 内层同盖）。会话文件契约零改动（戳全在 reducer 缝与渲染层）。
  - **视图**：TurnContainer 迁移 `useElapsedSeconds` → `useElapsedClock` + 纯派生——live「Working · Ns」内联位置不变；落定「Worked › Ns」时长在 chevron 右侧，**流式过的与重放的同位统一**（票 14「回放无时长」前提退役——条目时间戳必在）；零工作 inert 行无 chevron 时紧跟标签。tick-only hook 退役（pi17-working-7s 归零缺陷的元凶）；FollowView 经 replayEntry + groupTurns 自动同规。
  - **验证**：vitest 1954/1954（115 文件，含新 turn-duration 套件 + reducer/grouping 戳传播用例）；typecheck 双 tsconfig 清；lint 零新增（基线错误均在未触碰文件）；`visual:worked` 全断言绿（wc1 重放「Worked 5s」、wc2 静默期锚点派生 1s、wc3–wc6 无回归）。**electron smoke 全套 ALL GREEN（exit 0，零 FAIL）**：票 55 段改造后通过（重放时长真实 ISO 种子；fold 探针重锚 1s→2s 语义不变）；接管重放腿新增 chevron 右侧时长断言通过；**新票 108 段（零模型调用）**：两会话经会话目录种子 + contract 流通告（纯焦点切换路径），live 回合经 wrapped 事件折入，leg0 绝对诚实性 `3s == wall 3s`，四置顶组合 round-trip `3→6→8→10`（每次切回 ≥ 切离时刻 + 1，后台期间流照常折叠且切回追平），落定 span ≥ 10s 落 chevron 右侧，wrapped history_loaded（真实 ISO）重放「Worked › 5s」；37 host 零孤儿收尾。跑前/重试前均 `ps` 自查（两次撞 wt-110/wt-112 并行 dev-app 锁，等待窗口后重跑）。
  - **报备**：① smoke 票 55 段的旧断言按 R30 口径修订（重放 `durations === 0` → `=== 1` + '5s' 文本；fold 探针 duration 索引 1→2）——口径变更非回归，票 14 前提退役所致；② 接管重放腿新增两条断言（重放时长 ≥1 + 至少一枚紧邻 chevron）——增量；③ 本机 run-2 的票 106 instant-card 对账失败与另一次 run 的票 76 provider 定位失败均未复现（模型时序/环境 flake，无关阶段，未触碰）。
  - **rebase**：main 推进（票 110 并入，携 smoke.ts/App.tsx 改动）后 rebase 零冲突；rebase 后 vitest 1954/1954 + typecheck 双清 + electron smoke 复跑 ALL GREEN（同 leg 值：3s == wall 3s，3→6→8→10，replay 5s）。
  - **code-review 双轴（review-standards + review-spec 并行子代理）**：Standards 0 硬违反 + 4 判断性意见；Spec 五条验收全部可溯源、无阻塞（两处轻微超范围均已披露：CONTEXT.md 词条同步、PNG 证据帧刷新；两备忘：live 锚点用渲染回执戳（票 61 同口径先例）、start-无-end 的 tick 回退超出字面无锚防御属保留旧行为的追加防御）。**判断性意见已采纳**：① App 戳名谓提取 `isReceiptStamped`（消除双份成员测试）；② `deriveWorkedSeconds` 改收 `TurnStamps` 对（TurnContainer 直传 turn，消除裸基元簇）；③ live 时长渲染门改 `turn.live`（消除恒真 null 检查误读）；④ smoke chevron-右断言形状提取 `afterChevron()` 探针片段（三处共用）。采纳后 vitest 1954/1954 + typecheck 双清 + electron smoke 复跑 ALL GREEN（exit 0，38 host 零孤儿）。跨 smoke/harness 的 sig 探针镜像保留——两文件为刻意镜像的 harness 孪生（票 103 先例）。
