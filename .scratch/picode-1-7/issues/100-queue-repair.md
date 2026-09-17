# 100: queue 面板修缮——布局分离 + 行内 Edit（带图）/ 删除

**What to build:** steer/follow-up 队列面板三件套：①**布局修复**——queue 行与 composer 卡边框/圆角分离（水平内距 + 与 textarea/footer 的间距分隔；现状行边框直接顶到卡边与圆角重合——截图实证，follow-up 同病）；②**行内 Edit 钮**（两类行都有）→ 该条从队列移除 + composer 预填原文+**原图**（与 Edit-resend 同型）；③**每行 × 删除**（同机制不预填；全局 Clear 保留）。实现 = **host 侧队列镜像**（出队时记 text+images）+ **clearQueue/requeue 舞步**（clearQueue → 剔除目标条 → 按序重投喂剩余条、图片从镜像取、保序）。**additive 契约增量：host op `edit_queue_entry` / `remove_queue_entry`（实施时报备入 host-contract smoke）**。SDK 竞态诚实记录：消息投递与舞步之间有毫秒级窗口（SDK 0.85.1 队列面只有文本、无单条移除），行为由 smoke 验证。

**背景（取证）：** `.queue-panel` 无水平内距（`app.css:6847`）+ `.queue-item` 边框盒顶满卡宽；`QueuePanel.tsx` 无行级动作；SDK 面 = `queue_update` 只有 `steering: string[] / followUp: string[]`（无 id 无图片）+ `clearQueue()` 全清（agent-session.d.ts:430）；图片在入队时已进 agent 队列（`agent-session.js` _queueSteer：content 含 images）——host 镜像是图片的唯一可靠来源。全局 Clear 语义 = `clear_queue`（host/index.ts:677）。

**Blocked by:** 97（用户条目三合一——同 host/index.ts 文件，弱邻接转显式串行）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：队列镜像纯模型（edit/remove 舞步保序、图片保留、clearQueue 返回值对账、投递竞态对账策略）表驱动
- [ ] **additive 报备**：两 op 进 host-contract smoke（含旧载荷兼容）
- [ ] electron smoke：行边框与卡边分离（视觉断言）；带图排队 → 行内 Edit → composer 原文+原图 + 该条出队 → 重发正常；行 × 删除仅去该条；全局 Clear 照旧
- [ ] 重投喂保序断言（多条排队时编辑中间条，前后条顺序不变、图片不丢）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
