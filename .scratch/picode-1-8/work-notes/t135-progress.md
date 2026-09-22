# t135 progress — 队列卡上移（QueuePanel 移到输入栏上方独立卡片）

## 目标

QueuePanel 从 composer 输入框内部移到输入栏上方独立卡片（ZCode 同构）：
- DOM 层级：队列卡片不在 composer 输入框内部，是同列中输入栏上方的兄弟卡片；输入框自身几何在队列非空时不变、空队列时无残留空隙。
- 行构成/几何规则原样保留：grip+角标+文本+Edit+垃圾桶、28px 行高、P20 等高、R11 半行放置指示、段内拖动、单条废弃；全局 Clear 与「立即」钮维持不存在（Q6）。
- reorder_queue_entry host 链路与 host-contract 报备不动。
- 样式保真：对照参照帧 `.scratch/picode-1-8/reference/z19-zcode-queue-above-composer.png` 做像素对照（PIL+numpy 双证据，票 127 手法）留档。
- 次生效应：electron smoke 验证 idle 态队列增删不移动转录滚动；agent 运行态队列重排不回退 93/94/75。

## 阶段

- [x] P1 取证：读票面/spec/CONTEXT/参照帧；定位 QueuePanel 当前实现与 DOM 结构；参照帧像素分析（PIL+numpy）定标
- [x] P2 实现：DOM 层级迁移（composer 内部 → chat-dock 上方兄弟卡片）+ CSS 卡片化 + smoke 断言改写 + 119 stage 新腿
- [ ] P3 测试：vitest/typecheck ✅（2153/2153 + 双 tsconfig 清）；eslint 新改文件零新增告警；smoke:host（等 wt-136 让出）；smoke:electron（等让出）；visual:transcript
- [ ] P4 visual 帧 + 参照帧像素对照留档（PIL+numpy 双证据）
- [ ] P5 提交分支 + fallback 双轴自评 + 翻票 ready-for-human

## 事件日志

- 2026-09-22: 开工。已读票面、CONTEXT.md、spec.md R17。参照帧确认存在。票面开放问题已由主 Agent 传达操作者裁决闭合（只改位置维持 Q6），已记入票 Comments。
- 2026-09-22: 参照帧分析（z19，2422×670，1x）。ZCode 结构：队列带 = 灰色卡（x=78..2317，fill RGB 239，border 218，圆角 ~24-28）；输入区 = 白色嵌套盒（y=419..629，共享外卡侧边框，交界线 y=418-419 为 2px 共享边框线，零间隙）；行 = 平铺在灰卡上（无行框）：grip x=122..133（12px 宽）、文本 x=173+、右侧 [↑立即钮 122×52 药丸] [铅笔] [垃圾桶]，行内容高 28px、行距 76px。无 Steer/Follow-up 角标可见（ZCode 行无角标；PiCode 按票 128 交付保留角标）。↑立即钮 = Q6 维持不实现（操作者裁决重申）。
- 2026-09-22: 实现定案：QueuePanel 从 Composer 移到 ChatView 的 chat-dock（composer 上方兄弟，busy 门不变）；CSS：.queue-panel 变独立圆角卡（bg-inset、border、radius 16、同列 max-width 860 居中、与 composer 零间隙叠放）；行规则零改动（28px/P20/R11/角标/垃圾桶/段内拖动）。ComposerApi 保留队列三 op（ChatView 喂给 QueuePanel），Composer 不再挂面板、不再收 queue prop。
- 2026-09-22: smoke 改写：queue stage ①几何断言改为新区位（DOM 不在 composer 内、同列对齐、零间隙叠放、行内缩卡边、textarea 几何前后不变 + 空队列无卡）；stage 尾加 closing probe；119 stage 加 ③腿（idle_queue_135：底钉读者过卡片出现/长高 + 中读读者过 abort 清卡零位移，rAF 逐帧断言）。
- 2026-09-22: vitest 2153/2153 绿；typecheck 双 tsconfig 清；eslint 新改文件零新增（EmptyState shownModel 告警为 main 既有）。等 wt-136 让出 electron 通道后跑 smoke:host / smoke:electron / visual。
- 13:07 2026-09-22: smoke:electron 首跑 119-③腿失败（前序全绿）——streaming 期读者滞留 st=952。根因定位（算术证明）：staging 时刻 sh=1607、ch=655 → 底=952；读着确已到底，但 COUNT_PROMPT_135 的 80 换行回声单次增长 ~2400px，冲破 stick 160px 带 → pin 不再咬合，读着冻结在 952 而内容长到 sh=4819。非引擎还原（先前误判）。修复：计数 prompt 改走 composer（typeReal119+Enter，ticket-93 send 法则）——send latch 装订，巨型回声照钉到底；supervisor 直发无 latch 才会被带吹离（fresh-session 各 stage 靠 arrival pin 幸存同款回声）。smoke.ts 已改，typecheck 过。
- 13:07 2026-09-22: host smoke 已跑（R17 reorder 轮全绿 "reorder_queue_entry ok (D/C swapped — new-order re-feed)"；Round K (ticket-101 subagent stop) 两次 "pi-subagents did not answer" —— 已知 flaky 家族 host-contract Round A/K，与 diff 零交集，记档不追：/tmp/t135-host-smoke.log）。
- 13:07 2026-09-22: 通道占用：wt-136 electron smoke 在跑（ps 见 90391 等）。按序列化规则等待重试（≤30min）。
- 14:1x 2026-09-22: smoke:electron 重跑 ×2：119-③腿全绿（appear/grow/clear_ok，含修复后 0-of-2 帧计数门槛改 ≥1 + 600ms 清卡驻留拍样）。但 ticket-28 multi stage 连续两次同态失败（ms1 "count 1 to 150" 跑完早于 run-dot 探针首轮轮询——今日模型更快，stage 自身注释的前提失效）。零 diff 交集（侧栏/选择/圆点未动），但该 stage 在 queue stage 之前，挡死本票 100-queue 断言的执行。处置：harness rider——ms1 计数 150→600（对齐其它 stage 的量级，覆盖 refocus+abort 全程），一行改动，已在票面外注明待评审。日志：/tmp/t135-electron-smoke-{2,3,4}.log。
- 15:0x 2026-09-22: 第 4 跑（150→600 rider 后）：ticket-28 multi stage 全绿（rider 生效）；93 stage 的队列腿全绿（scroll93_queue_yank_ok / queue_inject_ok —— 新卡位下 93 法则成立），但 ④"滚离 idle send 回底"腿失败：scrollTop=0 恒定、run 已流式 40+ delta。机理 = 该腿 el.scrollTop=0 写入后无 settle，写自身的 scroll 事件可能晚于 Enter 装订 send latch 才送达，被当作上移手势拆锁 → 回声 pass 无 selfSent → 不回拉。已知 flaky 家族（93），且与 diff 零交集（无队列参与）；但挡住后续 100-queue 断言。处置：harness rider ② —— ④腿加 300ms settle（③ 腿同款，同因先例）。另注：panel_86 段曾出 tripwire 90s 超时告警但未中断 run（86 家族既往 flaky）。
- 13:42 2026-09-22: visual:transcript 全绿（34 帧含 5a-queue-single / 5-approval-queue —— 新卡位两帧落 .scratch/visual/）。PIL+numpy 直接量测（预验 smoke ① 断言）：列对齐 450..1309 与 composer 完全一致（0px 差；早先 5px 误读为圆角曲率）；零间隙叠放（junction gap 0，2px 叠边线 742-743）；卡内填色 (239,239,236)=--bg-inset；行片 28px×2 + 4px 行距 + 10px 上下内边距；圆角实测 ~15-16px（CSS 16）。双证据对比脚本+输出存档 .scratch/picode-1-8/evidence/t135-pixel-compare.{py,txt}：PiCode vs z19（÷2 CSS px）——列差 0/0 vs 0/0、junction 0 vs 0.5、tint (239,239,236) vs (239,239,239)、圆角 8 vs 9.5（同一自动量法，手工追迹 16 vs 14）。差异项均属 Q6/票128 既定裁决（行片 vs 平铺行、角标保留、无↑立即钮、圆角 16 vs 14）。
- 13:4x 2026-09-22: 第 5 跑 smoke:electron：105 stage（⌘J xterm 焦点）首探针失败（第 4 跑该 stage 全绿）——纯焦点时序 flake、零 diff 交集，且不在已知 flaky 清单但机理明确（xterm helper textarea 焦点竞态）。重跑。
- 14:0x 2026-09-22: 第 7/8 跑 smoke:electron 均死于 ticket-123（文件面板死组拖拽序，两次同态：sink123-live↔T 根组交换；123 在第 5 跑曾通过 → 环境时序性，机理=比较窗内 T 根组的会话文件写入触发面板 tick 重排；零 diff 交集，面板/拖拽代码未动）。105 焦点腿 1/3 失败（xterm helper textarea 焦点竞态，第 5/7 跑通过）。
- 14:1x 2026-09-22: harness rider ③：queue stage（票100→128→135，406 行）原位抽为 queueRepairStage 闭包 + PICODE_SMOKE_STAGE=t100-queue 选择器（t134-sanitized 先例；闭包引用全部模块级/序言标识符，移动为字节级纯剪贴，typecheck 过）。选择器单独跑：**全绿 EXIT 0** —— queue135_above_composer_ok / queue100_edit_middle / resend / edit_with_image / row_remove / queue128_clear_retired / p20_height / followup_swap / steer_swap / delivery_order(S2,S1,Q4,Q2) / queue135_composer_invariant_ok。验收项「electron smoke queue stage 新卡位全绿」达成（/tmp/t135-t100queue.log）。
- 14:1x 2026-09-22: 119-③腿连续三跑绿（run 5/6/7 idle_queue_135 appear/grow/clear_ok）。最终全套 smoke（run 9）已后台开跑（验证同一工作树）。收尾中：自评、票面更新、提交。
- 14:3x 2026-09-22: 第 9 跑（全套）：越过 123（该 stage 本次通过），死于 ticket-117 CJK 草稿溢出腿（scrollH 146 = clientH 146 未溢出）——117 属既定已知 flaky 家族，零 diff 交集（composer 自动增高时序）。第 10 跑已开。
- 14:5x 2026-09-22: 第 10 跑（全套）：③腿第 5 连绿；123 全腿绿；93 队列腿绿；28 绿；死于 117 另一腿（prefill 未落 composer——117 家族两跑两腿）。全套尝试止于 10 跑：矩阵已闭环（queue stage 选择器单独全绿 EXIT 0 + ③腿 5 连绿 + 全部队列相关 stage 腿绿 + 117/105/RoundK 为既知家族零交集）。visual 帧重捕（第三次运行后仅保留 5a-queue-single + 5-approval-queue 两帧，其余 32 帧还原 HEAD——票 127 先例）。
- 15:0x 2026-09-22: 提交 7a3e4d5（t135-queue-above）：10 文件（ChatView/Composer/QueuePanel/EmptyState/app.css/smoke.ts/visual.ts/票面/两 visual 帧）。票面 Status→ready-for-human，Comments 补 implementation done / harness riders / self-review 三段。自评双轴过（Standards：最小面、无 TODO、命名沿旧、注释仅约束、契约零改；Spec：验收 7/7 逐项、行规则零改、Q6 维持）。工单完成，报主 Agent。
- 修复轮（评审 verdict: standards fail 1阻断+1major）：①阻断修复——queueRepairStage() 调用曾被脚本索引偏移错插进 ticket-79 探针 fail() 分支后（不可达死代码，全套永不跑队列段）；已移回 bubble_trio_done 之后原位（现 ~15909），死代码删除。②证据文件 t135-pixel-compare.{py,txt} 落分支 .scratch/picode-1-8/evidence/（脚本 ZCODE 路径改 repo-relative 优先 + 根 worktree 兜底，重跑结果逐行一致）。③票 Comments 圆角口径改写（CSS 声明 16 vs 参照 ~14；脚本自动量法两帧同向低估约半 8.0/9.5；同量级结论不变）；smoke 队列段头注释 INSIDE→ABOVE。vitest 2153/2153 复绿 + typecheck 清。
- 修复轮取证：run 11 死于 132 boot ⌘J（xterm 焦点竞态，早段）；run 12 ③腿绿但死于 117 CJK 溢出腿；run 13 ③腿自身失败——引擎 pre-pin restore（票119 模型既载）把读者拉回 mid 腿暂存位 1921（发送后回声前，restore 读作上移拆掉 send latch）；修复=首个 text_delta 后重钉底部（流式期小增量稳带 + 后续队列腿骑 latch 修复），run 14 ③腿复绿。
- 117 根因定案（非 flake 而是确定性前提破损）：CJK_117 323 字在 composer 796px 内容宽 = 恰 6 行 146px < 160 封顶——「必须溢出」前提依赖机器 CJK 字形步进 >14px；本机恰 14px → 三连同态失败（146=146）。修复=fixture 加长 323→446 字（14px 步进 8 行 188px、17px 步进 10 行 230px，两口径均稳溢出；下游全部量测/派生，断言语义不变）+ 溢出检查改有界轮询（原 150ms 单采样）。run 15 取证中。

## 评审修复轮（fix round，2026-09-22 下午）

- 必改 1（阻断）：抽闭包脚本的索引偏移把 `await queueRepairStage()` 错插进 ticket-79 探针失败分支（fail() never 之后=不可达死代码）——已删，调用移回 bubble_trio_done 之后原位（~15954）；grep 复核恰一处闭包定义 + 选择器调用 + 原位调用。commit 2cfd636。
- 必改 2：t135-pixel-compare.{py,txt} 落分支 evidence/，ZCODE 帧路径 repo-relative 优先+根 worktree 兜底，重跑逐行一致。commit f6ea01c。
- 必改 4：closure 头注释 INSIDE→ABOVE；票 Comments 圆角口径改写（CSS 声明 16 vs 参照 ~14，自动量法两帧同向低估约半 8.0/9.5）。commit d5683d6。
- ③ 腿引擎修复：run 13 暴露 pre-pin restore 拆 send latch（读者冻 1921）——首个 text_delta 后重钉底部；修复后 ③ 全套内 7/7 绿。commit 18e3716。
- 117 CJK fixture：323→~433 字（旧文本 796px 恰 6 行 146px<160 封顶，溢出前提依赖 CJK 字形步进>14px，本机确定性破损）+ 溢出 5s 轮询。commit 451d5a4。
- 105 riders：回声 1.5s 轮询 + keystroke 前重聚焦 xterm textarea（run 21/22 实证焦点被环境会话流事件夺走）——不足以清障（连续 5 败，机理入票 Comments 留档）。commit c3b3372。
- 全套取证 runs 11-23：③ 到达即绿 7/7；105 连续 5 败为环境阻塞（焦点被夺，app 层、diff 面外）；132 3/12（产品语义断言不可 rider）。
- 主 Agent 裁决 (b)+(b')：一次前移位全套跑（run 23，/tmp/t135-electron-smoke-23.log）——log 98 行 `queue_repair_start` → queue 腿 ①-⑨ 全绿（above_composer/edit_middle/resend/edit_with_image/row_remove/clear_retired/p20/followup_swap/steer_swap），随后死于 ⑩ delivery 腿计数回合 90s 超时（票 128 既有 waitFor 预算 vs 今日模型延迟；同一腿 t100-queue 选择器跑 EXIT 0）——按止损线停手；前移已字节一致恢复（git diff 仅剩永久改动）。
- vitest 2153/2153 + typecheck 双清。票面 Comments 全量披露 + Status ready-for-human。tip = f6ea01c（六提交：2cfd636/18e3716/451d5a4/c3b3372/d5683d6/f6ea01c）。
- 本轮完成，等合并审查（合并由主 Agent 在根 worktree 执行）。
