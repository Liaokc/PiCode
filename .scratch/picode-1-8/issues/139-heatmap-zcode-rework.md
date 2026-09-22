# 139: Token Activity 终验重修——三模式日格热力图 + 分级悬浮卡（票 125 交付物修订）

**What to build:** 模型用量页 Token Activity 方块图按 ZCode 逻辑全面重修（票 125 交付物终验未达标；**Q4=B「本周 7 天」口径退役——终验改判**）。**统一基理（操作者直给全规格）：无论什么统计口径，每个方块 = 一天，颜色深度 = 用量大小。**

①**日统计（Daily）**：方块 = 当天用量；悬浮卡 = **当天用量**，悬浮在方块旁。
②**周统计（Weekly）**：方块 = **当周开始到当天的用量**（周内累计）；悬浮卡 = **这周的累积用量**，悬浮在**当周最上方的方块**上。
③**累计统计（Cumulative）**：方块 = **最开始到当天的用量**（全期累计）；悬浮卡 = **从最开始到当周的用量（包括当周）**，悬浮位与周统计同型（当周最上方的方块——票内对照 ZCode 帧确认）。

网格构图与覆盖窗口对照 ZCode 帧校准（贡献图式：周为列、日为行——票内定稿留档）；零用量日空色格语义保留（票 125）；Daily/Weekly/Cumulative 切换 UI 不变。

**背景（取证）：** 操作者终验实拍 ZCode 六帧（日/周/累计 × 常态/悬浮：z19-heatmap-daily-1/2、weekly-1/2、cumulative-1/2）+ PiCode 当前实现对照。票 125 交付的「本周 7 天」视图与 ZCode 逻辑不符。**参照帧 = 实施前提**（`reference/` 下六帧缺席则停下向操作者要）。**需要多模态会话实施**。

**Blocked by:** 无（对已合并 main 的修订票）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：三模式日格聚合纯函数表驱动（daily=当日 / weekly=周初到当日 / cumulative=期初到当日；零用量日空色格；跨周边界与年首；悬浮卡内容与锚位三模式各表）
- [ ] 悬浮卡：daily 锚方块旁显当日；weekly 锚当周最上方方块显本周累计；cumulative 锚同型显期初至当周含当周
- [ ] visual harness：三模式常态 + 悬浮六帧对照 z19-heatmap-*
- [ ] electron smoke：三模式切换与悬浮断言；Daily/Cumulative 既有切换不回归
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake，Round 8)：P30 定稿 R23。**Q4=B 口径退役**（终验改判——操作者终验直给 ZCode 全规格）；票 125 的零用量空格/tooltip 存在性语义被本票继承并按 ZCode 重定锚位。
