# 128: queue 面板 ZCode 重构——拖动排序 + Edit + 垃圾桶（additive op）

**What to build:** 票 100 queue 面板形态重构为 **ZCode 构图**（操作者实拍图6/图7 参照）：**行** = 左侧拖动柄（⋮⋮）+ Steer/Follow-up 角标 + 消息文本 + Edit（铅笔）+ 垃圾桶；**拖动柄段内重排**——steer 段内拖序、follow-up 段内拖序（越上越先注入；steer 注入当前回合、follow-up 排队回合后的发送时机语义照旧）；**垃圾桶 = 行级废弃**（该条移除、其余不废——替代既有 ×）；**全局 Clear 删除**（垃圾桶替代——「这样也就不需要clear按钮了」操作者原话）；**「↑ 立即」钮不做**（Q6 裁决否决）；**行高对齐修缮**（P20：`.queue-item` ≈31px vs Clear 26px 错位随重构落地——Clear 已删、行内动作与行体等高）。**host 侧：additive op `reorder_queue_entry`**——票 100 镜像舞步同机制扩展（clearQueue → 重排 → 按序重投喂；图片从 host 侧镜像取、保序；SDK `queue_update` 只有文本数组，毫秒级投递竞态照票 100 口径诚实记录）。**additive 契约增量报备入 host-contract smoke**。`CONTEXT.md` 新增「队列卡（Queue Panel）」词条（草案见 intake-grilling.md）。

**背景（取证）：** `QueuePanel.tsx`（票 100：行内 Edit + × + 全局 Clear）形态被 ZCode 参照推翻；`app.css:7184-7286` 行高错位实锤（`.queue-item` padding 5px 10px ≈31px vs `.queue-panel-clear` height 26px + `align-items:flex-start`——操作者图3）；`shared/queue-mirror.ts` + `host/index.ts:616-678` 镜像舞步（票 100）可复用于重排。Q6/Q9 裁决：无立即钮、垃圾桶替代 Clear、重排走镜像舞步。

**Blocked by:** 无（独立大票）.

**参照帧依赖（开工前提）：** 本票需要看 ZCode 参照图：图6（单条队列行）+ 图7（两条队列行）——「样式按照 ZCode 的来」的间距/比例/圆角基准。开工前操作者须把两图复制入 `.scratch/compare/`（建议 `z18-zcode-queue-1.png` / `z18-zcode-queue-2.png`）——**帧缺席时可开工结构（票内文本规格完整）但样式保真度降级，建议等帧**。建议多模态会话实施。

**Status:** ready-for-agent

## Acceptance

- [ ] host-contract smoke：`reorder_queue_entry` additive op 报备入账 + 旧载荷兼容验证（票 100 edit/remove op 共存）
- [ ] Seam-1：重排纯模型（段内 from→to 移动保序、镜像同步、竞态窗口诚实记录）表驱动
- [ ] electron smoke：两条 steer 拖动换序后注入顺序 = 新序（先 steer1 后 steer2 对调验证）；follow-up 同理；垃圾桶单条废弃余条不动；全局 Clear 钮不存在；行内动作与行体等高（P20 断言）；带图条目重排后图片保序
- [ ] visual harness：单条/多条 queue 帧（对照 z 图6/图7 构图）
- [ ] 票 100 的 Edit 预填路径（经 117 修复的视口跟随）不回归；SDK 投递与舞步竞态的诚实记录（Comments 留档）
- [ ] CONTEXT.md「队列卡」词条随票入册
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P20 + P22 定稿为 R17（并票——同一面板，行高修复随重构落地避免两票改同文件）。Q6（无立即钮/垃圾桶替代 Clear）+ Q9（additive op 报备）裁决入册。ZCode 队列卡为无标签单列——PiCode 保留 Steer/Follow-up 角标两段分组（语义需要：两段发送时机不同），段内可拖。
