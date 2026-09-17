# 108: 计时与时长显示——锚点派生口径迁移（live 计时不丢 + Worked 时长）

**What to build:** 容器 header 计时/时长全面改为**回合锚点派生**：①**live 计时不丢（R29）**——`now - startedAt`（锚点 = 该回合用户消息/首工作项的条目时间戳——会话文件有记录），四种切换组合（置顶↔置顶、置顶↔非置顶 双向）切回后计时**从原值继续**、不归零；折叠/展开不归零（既有）。②**Worked 时长显示（R30）**——落定回合统一在 **chevron 右侧**显时长（回合首条目 ts → 末条目 ts 派生），**含重放回合**（票 14「回放回合无时长」口径修订——原前提不成立，条目时间戳必在）；流式过的落定回合同位置统一。FollowView 同规。

**背景（取证）：** `use-elapsed-seconds.ts` = 纯 tick 计数器（`useState(0)` + interval +1），注释自述「container row never unmounts **across folds**」——只考虑了折叠（票 55），没考虑 **ADR-0006 切换语义（后台不渲染 + 切回重挂载）**：容器卸载即归零，切回从 1s 重数（操作者实拍 pi17-working-7s 现场）；且 seconds 归零使落定回合 `timed` 假 → 切回后 "Worked" 无时长（R30 的第二症状）。同坑先例 = 票 61 的 Thinking 行——已用 `useElapsedClock` 从条目级开始时间戳派生。R30 的时长数据 = 回合首末条目 ts（ADR-0002 数据源如实；票 14「无时长」前提已不成立——口径修订）。

**Blocked by:** 94（工作容器折叠锚定——同 TurnContainer 区段串行）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：锚点派生纯函数（startedAt 锚点选取/落定时长 = 首末条目 ts 差/无锚点防御）表驱动
- [ ] R30：落定回合 chevron 右侧显时长——本视图流式回合与**重放回合**都显；live 的 Working · Ns 内联不变
- [ ] electron smoke：A 运行中切 B 再切回 → 计时从原值继续（≥ 切离时刻）；四种切换组合全覆盖；落定回合 chevron 右侧时长（**重开会话的重放回合也显**）
- [ ] 折叠/展开不归零（票 55 语义不回归）；FollowView 同规
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
