# 135: 队列卡上移——steer/follow-up 队列改为输入栏上方独立卡片（ZCode 同构，参照帧已落盘）

**What to build:** 队列面板位置重构：steer/follow-up 队列消息从**输入栏内部**移到**输入栏上方独立卡片**（ZCode 同构）。现状=票 128 的 QueuePanel 嵌在 composer 输入框内部（行嵌在 textarea 区域里，见 `.scratch/picode-1-8/reference/current-queue-inside-composer.png`）；目标=队列是一张独立圆角卡片，直接叠在输入栏上方（composer 输入框自身的几何不变），见 ZCode 参照帧 `.scratch/picode-1-8/reference/z19-zcode-queue-above-composer.png`（**本次参照帧已由操作者落盘——样式保真须对照参照帧验证**，与 z18 缺席时不同）。行构成沿用票 128 交付：grip(⋮⋮) + Steer/Follow-up 角标 + 文本 + Edit(铅笔) + 垃圾桶；拖动重排（半行几何放置指示 R11）、行高 28px、动作钮与行体等高（P20）、段内拖动 gate——全部几何规则在新区位原样保留；`reorder_queue_entry` 宿主链路与 host-contract 报备不动；全局 Clear 维持退役（Q6）。

**开放问题（已闭合，操作者裁决）：** ZCode 参照帧中每行带「↑ 立即」钮——操作者裁决「还是只改位置、维持 Q6」：**不加**立即钮、全局 Clear 维持退役，本票=纯区位重构。

**次生效应（须验证）：** 队列卡片生长/收缩发生在 composer 同列上方——会改变转录 cell 的 clientHeight，属票 119 idle-pin 补偿模型的触发形状。electron smoke 须验证：idle 态下队列增删（卡片出现/长高/清空）不移动转录滚动位置（可在既有 idle_typing_119 stage 加一腿或新增小段）；agent 运行态队列重排不回退票 93/94/75 语义。

**Blocked by:** 无（基于 main 331922e；队列行为本身已由 128 落地，本票只动区位与容器）.

**Status:** ready-for-human

## Acceptance

- [x] 队列为独立卡片叠在输入栏**上方**（DOM 上不在 composer 输入框内部；输入框几何在队列非空时不变）；空队列时无卡片、composer 无残留空隙
- [x] 卡片视觉对照 ZCode 参照帧验证（rounded 卡片、行构成与间距；PIL+numpy 像素双证据留档，沿票 127 手法）
- [x] 行构成/几何规则原样保留：grip+角标+文本+Edit+垃圾桶、28px 行高、P20 等高、R11 半行指示、段内拖动重排、单条废弃；全局 Clear 与「立即」钮维持不存在（Q6）
- [x] electron smoke：queue 段（t128 交付的 delivery echo 顺序/图保序/Clear 缺席/P20 断言）在新区位全绿（选择器如因 DOM 层级变化需调整，断言语义不变）；idle 态队列增删腿绿（次生效应项）
- [x] `reorder_queue_entry` host-contract round 不回归
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
- [x] visual 帧：队列非空新区位帧入 `.scratch/visual/`

## Comments

- 2026-09-22 (requirements intake)：操作者原话：「steer/follow-up queue 的消息放到输入栏上，而不是输入栏内部，像ZCode一样（截屏2026-09-21 23.46.53），但是现在是放在输入栏内的（截屏2026-09-22 11.42.32）」。参照帧已复制入仓 `.scratch/picode-1-8/reference/`（z19-zcode-queue-above-composer.png / current-queue-inside-composer.png）。「↑ 立即」开放问题已向操作者提出，回复前按 Q6 不实现。
- 2026-09-22 (operator ruling)：开放问题闭合——只改位置维持 Q6，不加「↑ 立即」钮，全局 Clear 维持退役；本票=纯区位重构（主 Agent 裁决传达）。
- 2026-09-22 (implementation done)：实现=QueuePanel 从 Composer（输入卡内部）移到 ChatView 的 chat-dock（composer 上方兄弟，busy 门不变），队列三 op 沿 ComposerApi 由 ChatView 喂给面板；CSS：`.queue-panel` 变独立圆角卡（`--bg-inset` 填色 + `--border` + 圆角 16 + 软阴影 + 10/14 内边距），`.chat-dock .queue-panel` 与 composer 同列（width 100% / max-width 860 / 居中）零间隙叠放；行规则零改动（票 128 交付原样）。验证矩阵：vitest 2153/2153；typecheck 双 tsconfig 清；host smoke R17 `reorder_queue_entry` 轮全绿（“D/C swapped — new-order re-feed”）；electron smoke queue stage（票 100→128→135 全腿：above_composer / edit_middle / resend / edit_with_image / row_remove / clear_retired / p20 / followup_swap / steer_swap / delivery_order=S2,S1,Q4,Q2 / composer_invariant）通过 `PICODE_SMOKE_STAGE=t100-queue` 选择器单独驱动全绿 EXIT 0（日志 /tmp/t135-t100queue.log，harness 抽包见下方 rider ③）；idle 队列增删腿（idle_queue_135：底钉读者过卡片出现/长高 + 中读读者过 abort 清卡零位移，rAF 逐帧）连续四跑绿。像素双证据（PIL+numpy）存档 `.scratch/picode-1-8/evidence/t135-pixel-compare.{py,txt}`：列对齐 0px 差 vs z19 参照帧 0px、交界零间隙（2px 叠边线）、填色 (239,239,236) vs (239,239,239)、圆角同量级（16 vs ~14）——差异项均属 Q6/票128 既定裁决（白行片 vs 平铺行、角标保留、无↑立即钮）。visual 帧更新：`.scratch/visual/5a-queue-single.png` + `5-approval-queue.png`（新区位）。
- 2026-09-22 (harness riders，均零产品面改动，待评审确认)：① ticket-28 multi stage 的 ms1 计数 150→600（今日模型更快，150 计数先于 run-dot 探针首探跑完，两连失败挡死后续 stage；600 对齐其它 stage 量级）；② ticket-93 ④腿 `el.scrollTop=0` 写入后加 300ms settle（同 stage ③腿同款先例——否则写入自身的 scroll 事件可晚于 Enter 装订 send latch 送达而被当作上移手势拆锁，回声 pass 无 selfSent 不回拉）；③ queue stage（406 行）原位抽为 `queueRepairStage` 闭包 + `PICODE_SMOKE_STAGE=t100-queue` 选择器（t134-sanitized 先例；闭包引用全为模块级/序言标识符，移动为字节级纯剪贴），全套行为不变（原位同点调用同一闭包）。全套 smoke 环境性 flake（已知家族或机理已析、零 diff 交集，按规则记档不追）：105 xterm 焦点腿 1/3 失败、117 CJK 溢出腿（第 9 跑）、123 死组拖拽腿 2/4（第 5/9 跑通过；机理=比较窗内 T 根组会话文件写入触发面板 tick 重排）；host-contract Round K（ticket-101 subagent stop）两次 “pi-subagents did not answer”（已知 A/K 家族）。日志：/tmp/t135-electron-smoke-{2..10}.log、/tmp/t135-host-smoke.log。
- 2026-09-22 (self-review)：双轴自评过。Standards 轴：改动最小面（三组件一处挂点 + CSS 一块 + smoke 两腿 + harness 三 rider）；无 TODO/占位；命名沿用既有（queue-panel/ComposerApi/queue-item）；注释只解释约束（几何不变/锁存法则）；IPC/shared 契约零改动（additive-only 遵守）。Spec 轴：验收七项逐项对照上文全过；行规则零改动由 vitest+smoke 128 腿背书；Q6 维持（无 Clear/无立即钮，smoke 断言 `queue-panel-clear === null` 仍在）。风险敞口：全套 smoke 在今日环境下有上述家族性 flake（非本票引入，均机理可析）；`t100-queue` 选择器为新增 harness 面（回归风险=全套原位调用同一闭包，行为等价）。
