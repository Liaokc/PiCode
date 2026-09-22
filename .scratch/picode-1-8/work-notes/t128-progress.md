# t128 progress (queue 面板 ZCode 重构)

本票目标一句话: 把票 100 的 queue 面板重构为 ZCode 构图——行 = 拖动柄 + Steer/Follow-up 角标 + 文本 + Edit + 垃圾桶，段内拖序(host additive op `reorder_queue_entry` 镜像舞步扩展)、垃圾桶替代 ×/Clear、删全局 Clear、无「立即」钮、行高对齐(P20)，additive 契约报备入 host-contract smoke，CONTEXT.md 新增「队列卡」词条。

阶段 = 开工 (2026-09-22, worktree wt-128-queue-rebuild, branch t128-queue-rebuild @ 367c723)

z18 参照帧缺席: .scratch/compare/ 无 z18-zcode-queue-1/2.png —— 按主 Agent override: 按票内文本规格实施，Comments 标注「样式保真未对照参照帧验证」，不停下等待。

## 方案定稿 (2026-09-22) — 取证完毕,方案落盘
证据: src/shared/queue-mirror.ts (票100 舞步纯模型+removeQueueEntryAt/planQueueRefeed), src/host/index.ts:598-690 (runQueueDance), src/shared/contract.ts:121-164 (op 清单), src/renderer/src/components/QueuePanel.tsx (现形态: tag+text+Edit+× + 全局Clear), src/renderer/src/styles/app.css:7222-7330 (.queue-item 31px vs .queue-panel-clear 26px), src/main/smoke.ts:14287-14560 (票100 electron 段), scripts/smoke/host-contract-smoke.mjs:1224-1360 (queue round), src/main/visual.ts:1197-1227 (5-approval-queue 帧), src/renderer/src/components/Sidebar.tsx:758-802 (票84 拖拽语言: dragRef+半行几何+move effect), icons.tsx 已有 GripDotsIcon/TrashIcon/PencilIcon。

方案:
1. Seam-1 queue-mirror.ts 增 `reorderQueueEntry(mirror,kind,from,to)`(splice-move, 越界/同位=诚实no-op) + `queueReorderTarget(from,rowIndex,above)`(半行几何→终位序)。
2. contract.ts 增 additive op `reorder_queue_entry {kind,from,to}` + SessionCommand 清单。
3. host/index.ts: 舞步骨架抽 `runQueueDanceCore<T>(mutate)`(clearQueue→reconcile→mutate→按序重投喂,竞态口径不变), remove 走原语义 wrapper, 新增 reorder handler(载荷校验,恶意/越界忽略)。
4. QueuePanel.tsx 重构: 行 = grip(⋮⋮,draggable) + 角标 + 文本 + Edit + 垃圾桶; 段内拖拽(同 kind 才成 drop 目标, 半行几何, accent 细线放置指示 R11 语言); 全局 Clear 删除; 无立即钮。Composer/App 移除 onClearQueue, 增 onReorderQueueEntry。`clear_queue` op 本体保留(additive-only, 不删契约)。
5. CSS: 行高 28px + align-items:stretch → 动作钮与行体等高(P20); .queue-panel-clear 样式删除; 拖拽指示线。
6. smoke.ts 票100段改造为票128段: P20 断言 / Clear 不存在断言 / follow-up 段内拖换序(带图条目重排后 Edit 预填充图=图片保序) / steer 两条拖换序后 delivery echo 顺序=新序(turn 端注入,armed-wait 记录到达序) / 既有 Edit 预填+重发+行级废弃保留。
7. host-contract-smoke.mjs queue round: malformed reorder ops 入报备批; remove 后插 reorder 步 (D,C → C,D) 断言 queue_update 新序 + 旧载荷兼容不动。
8. visual.ts: 5a-queue-single 单条帧 + 既有 5-approval-queue 多条帧。
9. CONTEXT.md「队列卡」词条按 intake-grilling.md 定稿草案入册。

## 实现落盘① (2026-09-22) — 核心 diff 完成
- Seam-1: queue-mirror.ts 增 reorderQueueEntry + queueReorderTarget ✓; tests/shared/queue-mirror.test.ts 表驱动 38 绿 ✓
- contract.ts: additive op reorder_queue_entry {kind,from,to} + SessionCommand 清单 ✓
- host/index.ts: runQueueDanceCore<T>(mutate) 舞步骨架抽出(remove 语义原样保留为 wrapper), handleReorderQueueEntry + dispatch 载荷校验 ✓
- QueuePanel.tsx 重构: grip+tag+text+Edit+垃圾桶, 段内拖拽(同 kind gate), Clear 删除, 无立即钮 ✓; Composer.tsx onClearQueue→onReorderQueueEntry ✓; App.tsx handleReorderQueueEntry(修回被误删的 handleEditQueueEntry——一次 edit 事故,已复原) ✓
- app.css: 行高 28px + stretch(P20), grip, 垃圾桶, drop 线(票84 box-shadow 语言), .queue-panel-clear 样式删除 ✓
- 验证: vitest 38 绿 + typecheck 双 tsconfig 绿 ✓

## 实现落盘② (2026-09-22) — smoke 层 + 词条 + 票 Status
- smoke.ts 票100段改造为票100→128段: ①layout ②actions ③Edit middle ④resend ⑤Edit image ⑥trash 单条 ⑤'global Clear 不存在'断言 ⑥'P20 等高'断言(rowH≈28, btnH==rowClient, gripH==rowClient) ⑦follow-up 拖换序(Q4带图入队→Q2/Q4对调) ⑧steer 拖换序(S1/S2) ⑨delivery echo 到达序 = [S2,S1,Q4,Q2] + Q4 echo 带自己图 + Q2 echo 无图; 合成拖拽走票84模式(grip dragstart + row dragover/drop 半行几何); 视觉 TS 坑: waitFor 返回 Scoped 不因 matcher 收窄——用 Extract<Scoped,{type:'user_message'}> 断言
- visual.ts: 5a-queue-single 单条帧(grip probe) + 既有 5-approval-queue 多条帧 ✓
- host-contract-smoke.mjs: malformed reorder ×3 入报备批; 'A queue reordered' 步 (D,C→C,D) 断言 queue_update 新序后 edit 改瞄 index 0 (C); round 头注释更新 ✓
- CONTEXT.md「队列卡」词条入册(草稿后、编辑重发前) ✓
- vitest 全套 119 文件/2071 绿 ✓; typecheck 双绿 ✓
- 票 Status → claimed ✓
- 备注: vitest 一次运行输出里出现 "Switched to branch 'picode-ticket-21'" —— 查证为某测试 fixture 在临时目录做 git 操作, 本 worktree 分支未受影响 (git branch --show-current = t128-queue-rebuild)

## smoke 落盘① (2026-09-22) — host-contract smoke queue round 绿
- run1(未存档): 至 round K (ticket-101 subagent stop) 前 PASS——含 round A queue round
- run4(/tmp/t128-contract-smoke-4.log): queue round 全绿: reorder_queue_entry ok (D/C swapped — new-order re-feed, queue_update shape unchanged) + malformed reorder ops ×3 ignored + remove/edit 旧载荷兼容 + re-fed delivery echo image 保序 + clear ok + 'SMOKE queue round ok'
- run K 段死因: "subagent_stop_receipt ok=false pi-subagents did not answer" —— 跨分支资源争用已知段(ticket-101 subagent fixture), 与本票 diff 零交集, 留档不追 (批次纪律)
- run3/run2 死因: 'A agent_end 1' timeout —— 模型过快致 abort 竞态(machine 在 'A rename midrun' 步消费掉了 agent_end), 亦与本票 diff 零交集

## smoke 落盘② (2026-09-22) — electron queue 段绿(t44 前移取证法) + visual 帧落盘
- t44 死因确认: "window never took focus for the real-clipboard click" = 操作者活跃 macOS 拒绝 steal 焦点(批次已知环境类)。按 t129/t117/t125/t130 手法: 队列段临时前移至 sidebar_index_ok 后(附 TEMP 主会话焦点归还尾), run6 (/tmp/t128-electron-smoke-6.log) 全绿:
  queue100_layout/edit_middle/resend/edit_with_image/row_remove ok + queue128_clear_retired_ok + queue128_p20_height_ok + queue128_followup_swap_ok + queue128_steer_swap_ok + queue128_delivery_order_ok (echo 到达序 [S2,S1,Q4,Q2] + Q4 echo 带自己图 + Q2 echo 无图) + queue_repair_done
  焦点归还验证: t44 的 user_copy_row_shape_ok 在主会话转录上通过(段后跑到了 t44 才死于焦点)
- 途中修一处 stage bug: 票100 Edit 预填把 Q1 图还原进附件条(composerClearJs 只清文本), Q4 粘贴前先点 .composer-attachment-remove 清附件(与仓内既有同型 selector 一致)
- 复原: 段块移回终位(ticket-104 注释前), TEMP 尾删除; diff vs 前移前副本 = 仅附件清理修复(单一插入块); git diff hunks 全在原段位 14284-14650 无散块
- 坑档: 直接 `node scripts/smoke/electron-smoke.mjs` 会因 PATH 无 node_modules/.bin 静默 exit 1 —— 必须 npm run smoke:electron
- visual: 5a-queue-single.png(单条, queueItems=1 grips=1) + 5-approval-queue.png(两条, queueItems=2) 落盘 .scratch/visual-t128/, 目检构图 = grip+角标+文本+铅笔+垃圾桶 ✓ (t133 同时段在跑另一 visual —— 无焦点需求, 双跑互不干扰, 完成无碍)
- 117 视口段说明: 位于 t44 之后本轮未跑到; 但 prefill 路径(PREFILL_EVENT/App/Composer)零 diff, 队列 Edit 预填落位已由本段 edit_middle/edit_with_image 断言复证

## 终态 (2026-09-22 07:30)
- 实现提交 = 602b35e (feat, 14 files); 翻票提交 = 55c87df (chore, ticket → ready-for-human + Comments 记 602b35e + z18 标注 + self-review 双轴声明)
- 终验: vitest 2071/2071 绿 + typecheck 双绿 + eslint 干净; 分支 t128-queue-rebuild 干净 (仅 work-notes untracked)
- 不自行 merge/push (主 Agent 跑 scripts/merge-ticket.sh 128)
- 遗留风险: ①样式保真未对照 z18 参照帧(缺席), 主 Agent 报告列操作者目检项 ②全量 electron smoke 的 t44 及其后续段(含 117 视口断言)本轮未跑到——环境焦点阻塞, 非 diff 交集, 合并后跑全量覆盖 ③steer delivery 顺序依赖「巨长单 LLM 调用 turn 无中途注入点」假设——smoke 实证成立, SDK 若变需重审

## 修复轮 (2026-09-22 07:35)
- 双轴评审: spec pass-with-notes(七条全满足) + standards 2 条 low CJK-in-string 必修
- 修复: smoke.ts fail 串 → "(re-feed order-preserving broken)"; 测试名 → "(higher rows inject first)" (提交 dea5dbc)
- 判断性意见(halfRowAbove/凝型/泛型 void)留档不修; 票 Comments 已记
- 复绿: vitest 2071/2071 + typecheck + eslint ✓; electron smoke 不重跑(环境未变)
- 分支 tip = dea5dbc (随后 Comments 翻票提交)
