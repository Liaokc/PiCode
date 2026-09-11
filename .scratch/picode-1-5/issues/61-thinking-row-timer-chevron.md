# 61: ThinkingRow 双修——entry 级计时 + 箭头对齐

**What to build:** ① 思考行计时基准从组件局部搬到 **entry 级开始时间戳**：流式开始即记录，显示秒数由（当前 − 开始）推算——容器折叠重开（组件重挂载）从同一时间戳续算，**7s 不再变 3s**；块关闭时 host 回填 durationMs 冻结标签（既有契约不变）；回放块无时长规则不变（会话文件不记录——票 14）。② 思考行箭头对齐 Worked 容器惯例：**收起 ›（右）、展开 ⌄（下）**——与回合容器同一套折叠语言。

**背景（取证）：** 思考行计时 = 组件挂载局部 interval（use-elapsed-seconds 纯视图时钟）——容器折叠时 body 卸载、重开重挂载、tick 归零（pi15-thinking-timer-7s 显 Thinking·7s → pi15-thinking-timer-reset 折叠重开显 Thinking·3s）。箭头：`.thinking-row-open` 对 ChevronDown 起底 rotate(180deg) → 收起显 ↓ 展开显 ↑，与 TurnContainer（收起 › 展开 ⌄）方向相反（pi15-thinking-chevron-up）。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] 时长推导纯函数（表驱动）：同一开始时间戳重挂载不重置 / durationMs 冻结优先 / 回放块无时长降级（既有票 14 规则回归零变化）
- [ ] 思考部分流式开始时记开始时间戳（reducer 侧 additive 字段，缺席回退现行为）
- [ ] 箭头：收起 ›、展开 ⌄（与 TurnContainer 同型；live 态 Thinking 与落定态 Thought 一致）
- [ ] visual harness：思考行收起/展开两态帧（含折叠容器重开场景计时连续）
- [ ] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [ ] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 61`。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R7，Q14=A；箭头无取舍随票修）。波次 W1。独立小票（缺陷，双症一票）。
