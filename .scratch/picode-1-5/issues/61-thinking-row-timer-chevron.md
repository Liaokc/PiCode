# 61: ThinkingRow 双修——entry 级计时 + 箭头对齐

**What to build:** ① 思考行计时基准从组件局部搬到 **entry 级开始时间戳**：流式开始即记录，显示秒数由（当前 − 开始）推算——容器折叠重开（组件重挂载）从同一时间戳续算，**7s 不再变 3s**；块关闭时 host 回填 durationMs 冻结标签（既有契约不变）；回放块无时长规则不变（会话文件不记录——票 14）。② 思考行箭头对齐 Worked 容器惯例：**收起 ›（右）、展开 ⌄（下）**——与回合容器同一套折叠语言。

**背景（取证）：** 思考行计时 = 组件挂载局部 interval（use-elapsed-seconds 纯视图时钟）——容器折叠时 body 卸载、重开重挂载、tick 归零（pi15-thinking-timer-7s 显 Thinking·7s → pi15-thinking-timer-reset 折叠重开显 Thinking·3s）。箭头：`.thinking-row-open` 对 ChevronDown 起底 rotate(180deg) → 收起显 ↓ 展开显 ↑，与 TurnContainer（收起 › 展开 ⌄）方向相反（pi15-thinking-chevron-up）。

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] 时长推导纯函数（表驱动）：同一开始时间戳重挂载不重置 / durationMs 冻结优先 / 回放块无时长降级（既有票 14 规则回归零变化）
- [x] 思考部分流式开始时记开始时间戳（reducer 侧 additive 字段，缺席回退现行为）
- [x] 箭头：收起 ›、展开 ⌄（与 TurnContainer 同型；live 态 Thinking 与落定态 Thought 一致）
- [x] visual harness：思考行收起/展开两态帧（含折叠容器重开场景计时连续）
- [x] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [x] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 61`。

## Comments

- 2026-09-10 (requirements intake): 建票（spec R7，Q14=A；箭头无取舍随票修）。波次 W1。独立小票（缺陷，双症一票）。
- 2026-09-11 (implementation): 完成于 `t61-thinking-row-fixes`，commit **bd6fdb6**。实现要点：
  - 时间戳来源：dispatch 边界（App.tsx `stampThinkingStart`）在 `thinking_delta` action 上盖 `receivedAtMs`（包装 `session_event` 则盖内层）——Seam-1 reducer 纯度保持（只拷贝，不读钟；头注已同步）。契约事件类型零改动——additive 全部落在 chat-reducer 缝上（下条报备）。
  - **Additive 增量报备（横切项 49）**：① `ThinkingPart.startedAtMs?: number | null`（缺席/null = 无锚 → 视图回退本地 tick；回放块永不携带）；② `ChatAction` 事件侧分布化携带可选 `receivedAtMs`（仅 reducer 缝类型，非 IPC contract；所有既有 dispatch 字面量照常通过）。`contract.ts` 未动（R1 仍是唯一 contract 票）。
  - 派生纯函数 `shared/thinking-duration.ts`（7 行决策表）：durationMs 冻结优先 → 盖章流式 (now − startedAt) → 无章回退本地 tick → 落定无时长不显（票 14 零回归）。旧代码 streaming 优先于 durationMs 与新表在可达状态上行为相同（reducer 不变量使二者互斥）。
  - 箭头：ThinkingRow 随态交换 ChevronRight/ChevronDown（同 TurnContainer）；CSS 旋转基准仅余 `.tool-card-open`（ToolCard 票外保留）。
  - 视觉通道：`npm run visual:thinking`（PICODE_VISUAL_THINKING=1）断言式 harness —— th1 收起 › / th2 展开 ⌄ / th3 冻结 Thought·42s 三帧 + 折叠重开连续性探针 **2s → 5s**（重置会读 ~1s）；跑前 ps 复核无并跑进程。
  - code-review 双轴通过：Spec 6/6（0 缺口 0 scope creep）；Standards 0 违规（1 判断项：chevron 交换与 TurnContainer 同构，属仓内既有惯例，不抽取）。typecheck/lint/vitest 全绿（82 文件 1150 测试）。
- 2026-09-11 (merge, T00 合并会话): **merged as bf31ef2**（merge --no-ff；分支 rebase 后 feat=7de54de，分支自带 tracker sync 提交 83d20a7 自动去重）。
  - **验收口径**：操作者 2026-09-11 明示「61 已验收」；脚本门禁 typecheck 绿 + vitest **1153/1153（82 文件）**（1137 → 净增 +16：thinking-duration 新套件 + chat-reducer 表驱动扩展）。
  - **冲突处置**：1 处——src/main/index.ts 三段 harness 注册相邻追加（62 rail-stack 行 vs 61 thinking 行：import / isolate / start 同位互斥）→ 按 additive 纪律**双方保留**（与 package.json 双脚本、visual.ts 双守卫同构）；其余（smoke.ts/CONTEXT.md/app.css/package.json）自动合并。
  - **终态审计**：thinking-duration.ts 四态时长推导在位（冻结优先 → startedAtMs 推导 → 回放降级）；chat-reducer additive 时间戳字段；ThinkingRow chevron 同型（ChevronDown/Right + aria-expanded）；th1–th3 帧 + visual-thinking.ts + 注册行/脚本/守卫三处共存；无冲突标记残留。
  - **清理**：worktree 已 remove、分支已删（was 57fa44b 系前票 sha，本次删除指向 bd6fdb6'）。61 无下游票。
