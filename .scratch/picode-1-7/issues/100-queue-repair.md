# 100: queue 面板修缮——布局分离 + 行内 Edit（带图）/ 删除

**What to build:** steer/follow-up 队列面板三件套：①**布局修复**——queue 行与 composer 卡边框/圆角分离（水平内距 + 与 textarea/footer 的间距分隔；现状行边框直接顶到卡边与圆角重合——截图实证，follow-up 同病）；②**行内 Edit 钮**（两类行都有）→ 该条从队列移除 + composer 预填原文+**原图**（与 Edit-resend 同型）；③**每行 × 删除**（同机制不预填；全局 Clear 保留）。实现 = **host 侧队列镜像**（出队时记 text+images）+ **clearQueue/requeue 舞步**（clearQueue → 剔除目标条 → 按序重投喂剩余条、图片从镜像取、保序）。**additive 契约增量：host op `edit_queue_entry` / `remove_queue_entry`（实施时报备入 host-contract smoke）**。SDK 竞态诚实记录：消息投递与舞步之间有毫秒级窗口（SDK 0.85.1 队列面只有文本、无单条移除），行为由 smoke 验证。

**背景（取证）：** `.queue-panel` 无水平内距（`app.css:6847`）+ `.queue-item` 边框盒顶满卡宽；`QueuePanel.tsx` 无行级动作；SDK 面 = `queue_update` 只有 `steering: string[] / followUp: string[]`（无 id 无图片）+ `clearQueue()` 全清（agent-session.d.ts:430）；图片在入队时已进 agent 队列（`agent-session.js` _queueSteer：content 含 images）——host 镜像是图片的唯一可靠来源。全局 Clear 语义 = `clear_queue`（host/index.ts:677）。

**Blocked by:** 97（用户条目三合一——同 host/index.ts 文件，弱邻接转显式串行）.

**Status:** ready-for-human

## Acceptance

- [x] Seam-1：队列镜像纯模型（edit/remove 舞步保序、图片保留、clearQueue 返回值对账、投递竞态对账策略）表驱动
- [x] **additive 报备**：两 op 进 host-contract smoke（含旧载荷兼容）
- [x] electron smoke：行边框与卡边分离（视觉断言）；带图排队 → 行内 Edit → composer 原文+原图 + 该条出队 → 重发正常；行 × 删除仅去该条；全局 Clear 照旧
- [x] 重投喂保序断言（多条排队时编辑中间条，前后条顺序不变、图片不丢）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-20 (implement session，分支 t100-queue-repair @ main f1008ea rebase 后含 97 基座，working tree)：三件套落地，Seam-1 TDD red→green，零回归闭环。取证链：
  - **Seam-1 队列镜像纯模型（`src/shared/queue-mirror.ts` 新模块 + `tests/shared/queue-mirror.test.ts`，19 例表驱动）**：镜像条目 = `{text（SDK 朝向文本）, rawText（用户原话 = Edit 预填）, images（镜像 = 图片唯一来源）, fresh（未见过面 = 可被展开式收养）}`。核心对账算法 `reconcileQueueMirror`：每 kind **保序子序列游标对齐**（SDK 队列 FIFO——交付删最老、入队追加，见到的数组恒为镜像入队序的子序列）——①游标条目 text 精确绑定；②fresh 条目仅在后面无精确匹配时**收养**见到的改写文本（skill/template 展开情形）；③游标跳过的条目即已投递（舞步依赖的竞态语义）；④见到的文本无人认领则跳过（镜像只跟踪 host 自己入队的）。`removeQueueEntryAt`（越界 = 竞态清空的诚实 no-op）+ `planQueueRefeed`（steering 先、followUp 后、各自保序带图）。诚实边界留档：SDK 0.85.1 队列面只有文本——重复文本条目不可区分，按序绑定可能跨竞态错附镜像图片；行序号是事后对齐槽位非行身份；毫秒级窗口由 smoke 钉住非竞态路径。
  - **Host 舞步（`src/host/index.ts`）**：`runQueueDance(kind, index)` = `clearQueue()` → 镜像对**返回值**对账（返回值不再点名的条目 = 毫秒窗口内已投递——丢弃不重投，无双重投递）→ 按槽位剔除目标 → `planQueueRefeed` 走 SDK 自己的 steer/followUp 逐条重投喂（图片从镜像取）。**调试取证**：首次 smoke 失败根因是 **clearQueue() 同步 emit 的空 queue_update 先把镜像 wipe 掉**（emit 监听器的对账与舞步自己的对账交叉）——修法 `queueDanceActive` 标志：舞步期间镜像由舞步独占（emit 侧对账抑制），舞步后投递竞态自愈于下一次见面。`handleQueued` 入队路径在 SDK 接受后镜像入账（raw text + imagePartsOf）；`queue_update` 事件形状冻结不变（镜像在 host 内部 reconcile 后原样转发）。运行中 settle 的毫秒窗口：重投喂条目与新生入队同语义（下一回合同样投递，非新腐烂类）——如实留档不额外设防。
  - **Additive 契约增量（`contract.ts`）**：`edit_queue_entry {kind, index, requestId}` / `remove_queue_entry {kind, index}` 两 op（SessionCommand 同步扩），回包事件 `queue_entry_edited {requestId, found, text, images}`（found=false = 竞态已投递——渲染端不动 composer，幸存者照常重投喂）；`queue_update` 形状逐字节不动（旧载荷兼容）。chat-reducer 穷举 switch 补 `queue_entry_edited` no-op case（request/response 回包非转录状态）。
  - **渲染端（QueuePanel/Composer/App）**：每行新增 Edit（PencilIcon）+ ×（CloseIcon）ghost 钮（aria-label 寻址）；App `handleEditQueueEntry` 以 requestId 关联回包（file_list 先例），found=true 时 dispatch `PREFILL_EVENT`（票 79 同一预填路径，composer 零新逻辑）；× 直发 remove op。全局 Clear 不动。
  - **布局修缮（app.css）**：`.queue-panel` 增 `padding: 0 18px`（与输入文本/附件条对齐）+ `margin: 8px 0 2px`（与 textarea/footer 间距分隔）——行边框不再顶到卡边与圆角重合；`.queue-item-text` 加 `flex: 1` 让 ellipsis 让位行内动作。
  - **host-contract smoke 报备（Round A 队列段重排，真模型真持久化路径）**：steer A 带图（票 97 腿保持）→ 投递后 follow-up B/D（带图）/C（带图）依次入队（顺序断言 [B,D,C]）→ 四个**畸形 op 报备**（缺字段/坏 kind/坏 index 类型——忽略不崩溃不改状态）→ `remove_queue_entry followUp 0`（B 出、D/C 原位——**保序断言**）→ `edit_queue_entry followUp 1`（回包 requestId/found/raw text/**镜像中的 C 图**逐项断言）→ 重投喂的 D 到 run 尾自然投递 → **交付回声仍带镜像图**（re-feed 图片不丢红线）→ `clear_queue` 空队列照常（全局 Clear 照旧）。每个 queue_update 步都过 `assertQueueShape`（恰 steering+followUp 两个 string 数组，加性纪律：镜像在 host 内部，事件面零增长）。**调试取证**：①B/D 走 steer 会在 turn 边界交付竞态编排——改 follow-up（只在 run 尾投递，编排窗口 = 整个 A 回合）；②A 的文本改成数数指令让 A 回合足够长。**smoke:host exit 0 全绿**。
  - **electron smoke 票 100 阶段（queue_repair，紧随 bubble_trio，fresh 会话真模型）**：真粘贴图 + Q1/Q2/Q3 三行入队 → ①**行/卡边分离几何断言**（行 rect 内缩卡边 ≥8px + 面板与 textarea/footer 有间隙，`queue100_layout_separated_ok`）→ ②每行恰 Edit+× 两钮 → ③中间行 Edit：composer 原文预填 + 该行出队 + 前后行保序（`queue100_edit_middle_ok`）→ ④重发：预填文本 Enter 再入队尾（`queue100_resend_ok`）→ ⑤带图行 Edit：composer 原文 + **原图附件即时还原**（host 镜像 live 腿，`queue100_edit_with_image_ok`）→ ⑥× 只去自己行（`queue100_row_remove_ok`）→ ⑦全局 Clear 照旧（`queue100_global_clear_ok`）→ Stop 收尾。**smoke:electron exit 0 全绿**（32 hosts 零孤儿）。
  - **visual 泡帧**：`visual.ts` 队列帧改发双类行（Steer + Follow-up），`5-approval-queue` 捕获呈现行内 Edit/× 与行/卡边分离——`.scratch/visual/5-approval-queue.png`。
  - **验证闭环**：vitest 1777/1777 全绿（+19 镜像表）；typecheck 双 tsconfig 清；eslint 本票新文件零告警（其余 9 项均为 main 既有）；smoke:host / smoke:electron / visual:transcript 全 exit 0；dev-app serialization：每次 smoke/visual 前 `ps` 自查（一次等到 wt-98/99 让出通道，另发现 electron 二进制懒下载完成后再跑）。
- 2026-09-20 (code-review，/code-review 双轴并行 reviewer 子代理，workflow 7a42d549，fixed point main @ f1008ea，working tree)：**Standards：零硬违规，OK with notes**；**Spec：零缺失零走样零实现错误，OK with notes**。
  - **Standards P2×2（已修）**：①舞步内 `target = survivors[kind][index]` 与 `removeQueueEntryAt` 返回的 `removed` 重复查找 + steer/followUp 分发在 handleQueued 与重投喂循环重复——修法：单一 `queueToSdk` 分发助手（入队路径与重投喂循环共用，steer/followUp 拆分永不漂移）+ 回包直接用 `removed`（冗余查找删除）；②App 事件解包 `editedEvent` 与 `scopeType` 重复同一三元式——修法：一次解包 `scopeEvent` 两处共用。修后 typecheck + vitest 回归全绿。
  - **Standards P2 判断题（record-only 不阻塞）**：`T100_B/D/C` 命名字母不显意图——用点处值自描述（文本即标识符），不改；`{kind, index}` 数据团——IPC 契约本就要名字段，打包无益，不改。
  - **Spec P2（report-only）**：①spec 写「出队时记 text+images」而实现为**入队后记账**——出队时记账无法支撑舞步（条目在队时即需图片），且 spec 背景句「图片在入队时已进 agent 队列……host 镜像是图片的唯一可靠来源」与 acceptance 均指向入队语义，按意图实现正确，此处点名措辞出入；②visual.ts 队列帧改发双类行、票 97 steer 文案改数数指令（代码内注释给出编排余量理由，票 97 回声断言同步保留）——两处一行 harness 改动，可接受；③34 张 .scratch/visual PNG 全帧重渲染为二进制噪声——已还原，仅保留本票 `5-approval-queue.png`。
