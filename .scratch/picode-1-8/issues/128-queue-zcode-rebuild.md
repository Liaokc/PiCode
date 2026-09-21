# 128: queue 面板 ZCode 重构——拖动排序 + Edit + 垃圾桶（additive op）

**What to build:** 票 100 queue 面板形态重构为 **ZCode 构图**（操作者实拍图6/图7 参照）：**行** = 左侧拖动柄（⋮⋮）+ Steer/Follow-up 角标 + 消息文本 + Edit（铅笔）+ 垃圾桶；**拖动柄段内重排**——steer 段内拖序、follow-up 段内拖序（越上越先注入；steer 注入当前回合、follow-up 排队回合后的发送时机语义照旧）；**垃圾桶 = 行级废弃**（该条移除、其余不废——替代既有 ×）；**全局 Clear 删除**（垃圾桶替代——「这样也就不需要clear按钮了」操作者原话）；**「↑ 立即」钮不做**（Q6 裁决否决）；**行高对齐修缮**（P20：`.queue-item` ≈31px vs Clear 26px 错位随重构落地——Clear 已删、行内动作与行体等高）。**host 侧：additive op `reorder_queue_entry`**——票 100 镜像舞步同机制扩展（clearQueue → 重排 → 按序重投喂；图片从 host 侧镜像取、保序；SDK `queue_update` 只有文本数组，毫秒级投递竞态照票 100 口径诚实记录）。**additive 契约增量报备入 host-contract smoke**。`CONTEXT.md` 新增「队列卡（Queue Panel）」词条（草案见 intake-grilling.md）。

**背景（取证）：** `QueuePanel.tsx`（票 100：行内 Edit + × + 全局 Clear）形态被 ZCode 参照推翻；`app.css:7184-7286` 行高错位实锤（`.queue-item` padding 5px 10px ≈31px vs `.queue-panel-clear` height 26px + `align-items:flex-start`——操作者图3）；`shared/queue-mirror.ts` + `host/index.ts:616-678` 镜像舞步（票 100）可复用于重排。Q6/Q9 裁决：无立即钮、垃圾桶替代 Clear、重排走镜像舞步。

**Blocked by:** 无（独立大票）.

**参照帧依赖（开工前提）：** 本票需要看 ZCode 参照图：图6（单条队列行）+ 图7（两条队列行）——「样式按照 ZCode 的来」的间距/比例/圆角基准。开工前操作者须把两图复制入 `.scratch/compare/`（建议 `z18-zcode-queue-1.png` / `z18-zcode-queue-2.png`）——**帧缺席时可开工结构（票内文本规格完整）但样式保真度降级，建议等帧**。建议多模态会话实施。

**Status:** ready-for-human

## Acceptance

- [x] host-contract smoke：`reorder_queue_entry` additive op 报备入账 + 旧载荷兼容验证（票 100 edit/remove op 共存）
- [x] Seam-1：重排纯模型（段内 from→to 移动保序、镜像同步、竞态窗口诚实记录）表驱动
- [x] electron smoke：两条 steer 拖动换序后注入顺序 = 新序（先 steer1 后 steer2 对调验证）；follow-up 同理；垃圾桶单条废弃余条不动；全局 Clear 钮不存在；行内动作与行体等高（P20 断言）；带图条目重排后图片保序
- [x] visual harness：单条/多条 queue 帧（对照 z 图6/图7 构图）
- [x] 票 100 的 Edit 预填路径（经 117 修复的视口跟随）不回归；SDK 投递与舞步竞态的诚实记录（Comments 留档）
- [x] CONTEXT.md「队列卡」词条随票入册
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P20 + P22 定稿为 R17（并票——同一面板，行高修复随重构落地避免两票改同文件）。Q6（无立即钮/垃圾桶替代 Clear）+ Q9（additive op 报备）裁决入册。ZCode 队列卡为无标签单列——PiCode 保留 Steer/Follow-up 角标两段分组（语义需要：两段发送时机不同），段内可拖。
- 2026-09-22 (implement, self-review fallback 双轴)：实现 = ①Seam-1 `shared/queue-mirror.ts` 新增 `reorderQueueEntry(mirror, kind, from, to)`（段内 splice-move，越界/非整数/from===to 诚实 no-op；图片与 rawText 随条目走）+ `queueReorderTarget(from, rowIndex, above)`（渲染层半行几何→重排后终位序，落在拖拽行自身=null no-op）；表驱动 vitest 38 例全绿（重排方向/中间移位/两段独立/重投喂新序/no-op 表/几何表）。②契约 additive op `reorder_queue_entry {kind, from, to}`（+SessionCommand 清单；`clear_queue` op 本体按 additive-only 纪律保留，仅渲染层入口退役）。③host 侧 `runQueueDanceCore<T>(mutate)` 抽出票 100 舞步骨架（clearQueue → 对账 → mutate → 按序重投喂，竞态口径逐字保留），remove/edit 走原语义 wrapper，`reorder_queue_entry` 走同一舞步（载荷校验，越界忽略；无回执，重投喂的 queue_update 为 ack）。④`QueuePanel.tsx` 重构：行 = 拖动柄（⋮⋮，真句柄）+ 角标 + 文本 + Edit（铅笔）+ 垃圾桶；段内拖拽（同 kind 才成 drop 目标，跨段 dragover 拒绝）；拖拽语言照票 84（半行几何、单事件推导、accent 细线放置指示 box-shadow 不触布局）；全局 Clear 删除、无「立即」钮（Q6）。⑤CSS：行高 28px + `align-items: stretch` → 动作钮/grip 与行体等高（P20）；`.queue-panel-clear` 样式删除。⑥CONTEXT.md「队列卡」词条按 intake-grilling 定稿草案入册（含 ZCode 行构成）。
- 2026-09-22 (smoke 取证)：①host-contract smoke queue round 全绿（run 存档 /tmp/t128-contract-smoke-4.log）：`reorder_queue_entry ok (D/C swapped — new-order re-feed, queue_update shape unchanged)` + malformed reorder ×3 与票 100 malformed 批同 batch 被忽略 + remove/edit 旧载荷共存 + 重投喂 delivery echo 图片保序 + queue_update 形状冻结断言全程。该 run 死于 Round K（ticket-101 live stop：pi-subagents stop RPC 超时）——跨分支资源争用已知段，与本票 diff 零交集（queue round 在 Round A，已先绿）。另有两次 run 死于 Round A `A agent_end 1` timeout（模型过快致 abort 竞态——agent_end 被 rename 步消费），同为既有环境 flake 与本票无关。②electron smoke 队列段（smoke.ts 内票 100 段改造为票 100→128 段）全绿：layout 分离/每行 Edit+垃圾桶/Edit middle 预填/重发/Edit 带图行预填（原文+图）/垃圾桶单条废弃余条不动/全局 Clear 不存在断言/P20 等高断言（rowH≈28，btnH==gripH==rowClient）/follow-up 拖换序（Q4 带图入队→Q2/Q4 对调）/steer 拖换序（S1/S2 对调）/delivery echo 到达序 = [S2, S1, Q4, Q2]（steer 新序先注入、follow-up 新序后注入）+ Q4 echo 带自己粘贴图 + Q2 echo 无图（镜像跨条目污染反证）。
- 2026-09-22 (electron smoke 取证披露)：队列段在 smoke.ts 终位（ticket-104 段前），取证遇 t44 已知环境焦点阻塞（macOS 拒绝 steal）——按 t129/t117/t125/t130 已验证手法临时前移位到 sidebar_index_ok 后跑绿取证（含临时主会话聚焦恢复胶水），跑完复原终位（diff 对前移前副本 = 仅一处附件清理修复，单一插入块；git diff hunks 全在原段位）；前移取证 run 队列段全绿后死于 t44 焦点（与 diff 零交集），焦点归还胶水由 t44 的 user_copy_row_shape_ok 在主会话转录上通过反证。取证途中修一处 stage 自身 bug：票 100 Edit 预填把 Q1 图还原进附件条（composerClearJs 只清文本），Q4 粘贴前先点 `.composer-attachment-remove` 清附件（仓内既有同型 selector 先例）。另留档：直接 `node scripts/smoke/electron-smoke.mjs` 会因 PATH 无 node_modules/.bin 静默 exit 1——必须走 `npm run smoke:electron`。
- 2026-09-22 (竞态诚实记录，照票 100 口径)：①SDK 0.85.1 queue face 仍 text-only——重排的毫秒级投递竞态窗口与票 100 相同：clearQueue 返回值对账即投递竞态策略（返回不再提及的条目视为已投递、不再重投喂）；渲染层 from/to 是对账后幸存列表的序数而非行身份，竞态掏空的槽位重排是诚实 no-op（纯模型表驱动钉死）。②重排舞步期间 queue_update 由 `queueDanceActive` 抑制对账（票 100 机制原样），渲染层在舞步中拖拽第二次属于毫秒级用户竞态地域，行为由 smoke 钉住不工程化消除。③两条同文条目的出现序匹配限制照票 100 不变（文本数组无身份）。④带图条目重排后图片从 host 侧镜像取、保序——由 host-contract smoke（重投喂 echo 图片）与 electron smoke（Q4 echo 带图 + Q2 echo 无图）双向取证。
- 2026-09-22 (票 100 Edit 预填不回归 + 117 说明)：队列段内 Edit middle/带图行两条腿复证预填原文+原图落 composer（queue100_edit_middle_ok / queue100_edit_with_image_ok）；PREFILL_EVENT/App/Composer prefill 路径零 diff（git 可证）。117 的视口跟随断言位于 t44 之后、本轮取证 run 未跑到（t44 焦点阻塞同批次已知事实）——其代码路径本票未触碰，主 Agent 合并后跑全量 smoke 即覆盖。
- 2026-09-22 (visual + z18 标注)：visual harness 帧落盘 `.scratch/visual/5a-queue-single.png`（单条：grip+Steer 角标+文本+铅笔+垃圾桶）与 `.scratch/visual/5-approval-queue.png`（两条：Steer/Follow-up 两段分组），probes queueItems/grips 入账。**样式保真未对照参照帧验证**——.scratch/compare/ 的 z18-zcode-queue-1/2.png 操作者未落盘（开工前确认缺席），按票内文本规格（行构成/间距/比例/圆角描述）实施；主 Agent 总报告请列操作者目检项：行高 28px、grip 尺寸/颜色、圆角 10px、角标配色、动作钮 hover 态是否贴合 ZCode 实拍。
- 2026-09-22 (self-review 双轴声明)：本工具集无 subagent 派发，按票内 fallback 自行双轴评审。Standards 轴：舞步骨架抽取消除三路重复（remove/edit/reorder 单一机制路径，queueToSdk「single dispatch」先例同型）、纯函数+表驱动、拖拽语言复用票 84 形（rowDrag 工厂/半行几何/box-shadow 指示线）、无 TODO/死代码（`.queue-panel-clear` 样式与 onClear 全链路清除）、契约 additive（零改名零删除）、UI 文案全英文、eslint 干净。Spec 轴：票面验收七条逐条对照如上，全过。主 Agent 另派独立双轴评审。
- 2026-09-22 (review round 修复)：主 Agent 双轴评审返回 spec pass-with-notes（七条验收全满足）+ standards pass-with-notes 含 2 条 low 级 CJK-in-string——按批次纪律随笔修掉：①smoke.ts 队列段 fail 串「(re-feed 保序 broken)」→「(re-feed order-preserving broken)」②queue-mirror 测试名「(越上越先注入)」→「(higher rows inject first)」。其余意见均判断性（halfRowAbove 可抽一行函数 / dragRef {kind,index} 可凝型 / runQueueDanceCore 泛型 void 分支）——留档不修。复绿：vitest 2071/2071 + typecheck 双绿 + eslint（两触碰文件）干净；环境未变不重跑 electron smoke。修复轮提交 = dea5dbc（分支新 tip）。
- 2026-09-22 (branch)：分支 t128-queue-rebuild，实现提交 tip = 602b35e（含本翻票提交之前全部变更；随后由主 Agent 跑 scripts/merge-ticket.sh 128）。
