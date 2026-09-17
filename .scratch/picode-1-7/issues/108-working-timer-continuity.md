# 108: Working 计时跨切换不丢——锚点派生口径迁移

**What to build:** Working 容器计时改为**回合锚点派生**：`now - startedAt`（锚点 = 该回合用户消息/首工作项的条目时间戳——会话文件有记录）。四种切换组合（置顶↔置顶、置顶↔非置顶 双向）切回后计时**从原值继续**、不归零；折叠/展开不归零（既有）；落定冻结语义保持（settle 时刻 - startedAt 自然成立）；重放回合无时长降级照旧（票 14）；FollowView 同规。

**背景（取证）：** `use-elapsed-seconds.ts` = 纯 tick 计数器（`useState(0)` + interval +1），注释自述「container row never unmounts **across folds**」——只考虑了折叠（票 55），没考虑 **ADR-0006 切换语义（后台不渲染 + 切回重挂载）**：容器卸载即归零，切回从 1s 重数（操作者实拍 pi17-working-7s 现场）。同坑先例 = 票 61 的 Thinking 行——已用 `useElapsedClock` 从条目级开始时间戳派生（「they DO unmount across folds, so their seconds must derive from the entry-level start timestamp」）。本票 = 该口径迁移到容器 header。

**Blocked by:** 94（工作容器折叠锚定——同 TurnContainer 区段串行）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：锚点派生纯函数（startedAt 锚点选取/落定冻结/重放降级/无锚点防御）表驱动
- [ ] electron smoke：A 运行中切 B 再切回 → 计时从原值继续（≥ 切离时刻）；四种切换组合（置顶/非置顶）全覆盖；落定后冻结、重放回合无时长
- [ ] 折叠/展开不归零（票 55 语义不回归）；FollowView 同规
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
