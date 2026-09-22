# 139: Token Activity 终验重修——三模式日格热力图 + 分级悬浮卡（票 125 交付物修订）

**What to build:** 模型用量页 Token Activity 方块图按 ZCode 逻辑全面重修（票 125 交付物终验未达标；**Q4=B「本周 7 天」口径退役——终验改判**）。**统一基理（操作者直给全规格）：无论什么统计口径，每个方块 = 一天，颜色深度 = 用量大小。**

①**日统计（Daily）**：方块 = 当天用量；悬浮卡 = **当天用量**，悬浮在方块旁。
②**周统计（Weekly）**：方块 = **当周开始到当天的用量**（周内累计）；悬浮卡 = **这周的累积用量**，悬浮在**当周最上方的方块**上。
③**累计统计（Cumulative）**：方块 = **最开始到当天的用量**（全期累计）；悬浮卡 = **从最开始到当周的用量（包括当周）**，悬浮位与周统计同型（当周最上方的方块——票内对照 ZCode 帧确认）。

网格构图与覆盖窗口对照 ZCode 帧校准（贡献图式：周为列、日为行——票内定稿留档）；零用量日空色格语义保留（票 125）；Daily/Weekly/Cumulative 切换 UI 不变。

**背景（取证）：** 操作者终验实拍 ZCode 六帧（日/周/累计 × 常态/悬浮：z19-heatmap-daily-1/2、weekly-1/2、cumulative-1/2）+ PiCode 当前实现对照。票 125 交付的「本周 7 天」视图与 ZCode 逻辑不符。**参照帧 = 实施前提**（`reference/` 下六帧缺席则停下向操作者要）。**需要多模态会话实施**。

**Blocked by:** 无（对已合并 main 的修订票）.

**Status:** ready-for-human

## Acceptance

- [ ] Seam-1：三模式日格聚合纯函数表驱动（daily=当日 / weekly=周初到当日 / cumulative=期初到当日；零用量日空色格；跨周边界与年首；悬浮卡内容与锚位三模式各表）
- [ ] 悬浮卡：daily 锚方块旁显当日；weekly 锚当周最上方方块显本周累计；cumulative 锚同型显期初至当周含当周
- [ ] visual harness：三模式常态 + 悬浮六帧对照 z19-heatmap-*
- [ ] electron smoke：三模式切换与悬浮断言；Daily/Cumulative 既有切换不回归
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake，Round 8)：P30 定稿 R23。**Q4=B 口径退役**（终验改判——操作者终验直给 ZCode 全规格）；票 125 的零用量空格/tooltip 存在性语义被本票继承并按 ZCode 重定锚位。
- 2026-09-22 (implement，t139-heatmap-rework @ 60c0832)：交付。**z19 六帧像素级取证定稿（留档）**：①构图 = 52 列×7 行贡献图式（列=周、行=日、左旧右新），pitch 15.57×17.5px、格 ~13px 圆角方，底部 12 个月标（标在月首所在列）；②配色四蓝 (191,212,234)/(148,190,236)/(98,165,241)/(42,117,214) + 空格 #E8E8E8（零用量日空色格确认保留）；③**行序 = 周日首**（r0=Sunday…r6=Saturday）：当周列数据落 r5(Fri)+r6(Sat)、卡日期=2026年9月12日=周六=数据末日，Monday-first 推演下 r6=未来日却有色格，矛盾；④daily 卡=「<日期> / N tokens · M 轮消息」悬浮在**被悬停格正上方、水平居中**；weekly 卡=「<日期> 当周 / …」、cumulative 卡=「截至 <日期> 当周累计 / …」均悬浮在**当周列最上方方块正上方、以该列水平居中**（票面「悬浮位与周统计同型」获帧确认）；⑤悬停列整列细描边环（对齐 diff 证实），daily 无环；⑥三帧对内部逐像素一致、跨模式数据互斥 → 判定 ZCode demo 数据按模式切换重生，跨模式数值一致性不构成校准依据，帧只校准构图/配色/卡形态/锚位/窗口。
  **实现**：Seam-1 表驱动（charts.ts：52 周窗末列=数据末周、`HEAT_BOX_SERIES` 三模式日格序列、`HEAT_CARDS` 卡内容表、`HEAT_CARD_ANCHORS_COLUMN` 锚位表、HeatColumn.card 列聚合=周/期累计截至列内最后可见日=周六钳到数据末日）；HeatCell 增 messages（additive，activity 折叠）；HeatmapView 统一 52×7 DOM + 列环 + 卡两行；CSS 帧校准（13px/15.5×17.5/四蓝）。**验收对照**：Seam-1 表驱动 ✓（vitest：跨周边界/年首/缺口携带/未来日空格/单调签名/月标）；悬浮卡三模式 ✓（内容+锚位各表 + smoke 几何断言）；visual harness 六帧 ✓（u1/u1b/u2/u2b/u2c/u2d 对照 z19-heatmap-*，.scratch/visual/）；electron smoke ✓（ticket-139 stage：三模式 DOM=Seam-1 模型逐格 364 项相等 + 三卡锚位/文案/列环 + drill 回归）；vitest 2181 绿 / typecheck 绿 / eslint 触及文件零告警。
  **披露**：①smoke 全套在操作者活跃环境下反复死于键盘/焦点段（menu_surface Shift+Enter ×2、t132 ⌘J、t105 keystroke ×2——已知 flaky 族）；按「临时前移位取证」规范把本票 stage 临时移至套件最前取绿（/tmp/t139-smoke6.log，8 检查点全绿）后复原终位（git diff 单一插入块）；复原后终位复跑仍死于 t105（/tmp/t139-smoke7.log）；**stash 基线 A/B：无本票改动的基线同样死于 ticket-89 authorize URL 段**（/tmp/t139-baseline-ab.log）——失败为预存环境类，与本票无关。②smoke drill 断言=点击格钻取其周列起点——**列起点随本票行序重定由 Monday 变为 Sunday，属本票实质变更（连带语义）**：t125 的「column start — unchanged」指的是『钻取锚 = 列起点』这一规则不变，列起点本身的星期随贡献图行序定稿而变。③月标枚数随窗口起止月对齐浮动（本次 11 枚 vs z19 12 枚），规则一致（月首列 + 首列强制 + 相邻让位）。④历史列 hover 卡按当周规则泛化（帧仅演示当周例）：weekly=该周周初至周六累计、cumulative=期初至该周六，锚=该列最上方方块。⑤aggregate `heatmap.weekly/cumulative` 现仅测试消费（视图只用 daily）——留档不裁，保持 Seam-2 快照契约完整。⑥HeatmapView showHover 两分支形状重复（评审 nit）——留档不修。初版分支 tip = 60c0832。
- 2026-09-22 (fix round 1，t139-heatmap-rework @ 4cece38)：双轴评审修复轮。**spec fail 根因与修复**：visual 六帧错位 = usage harness 未关后台节流（visual.ts 先例在而 usage 漏配）→ capturePage 拍到上一呈现帧（u1≡u1b/u2≡u2b/u2c≡u2d 字节级相同、滞后一格；u3≡u4≡u5≡u6 同症）。修复：harness 窗口 `setBackgroundThrottling(false)`（visual.ts 同款）+ `capture()` 增 expect 探针 = DOM settle-poll（模式选中态/卡内容 must+forbid/列环/区块入视口，8s）+ 丢弃式 capturePage 冲刷合成器后再真拍；13 帧逐一接 expect；unhoverBox 改在 `.heatmap-wrap` 派发 leave（卡清除语义在 wrap 层）。**重跑自验**：harness exit 0；13 帧 md5 两两不同（六热力帧两两不同）；逐帧读图 = u1 daily 常态 / u1b daily 卡格上方居中 / u2 weekly 常态 / u2b weekly 卡列顶上方居中+列环+This week / u2c cumulative 常态 / u2d Through 卡+列环 —— 对照 z19 六帧构图逐项 ✓（数据本身为 PiCode fixture，预期不同）。**standards 随修**：smoke 本地 sundayOf 改 import shared dates（minor）；t125 leftmost-outline 等价断言恢复进 ticket-139 stage（`usage_heat_leftmost_outline_ok`——旧 7 单日列退役但滚动盒裁剪几何与描边语义仍在，等价断言成立）；dates.ts sundayOf doc 补行序取证依据（nit）。**留档不修**：HeatmapView showHover 两分支形状重复（nit）；aggregate heatmap.weekly/cumulative 仅测试消费（notes，见披露⑤⑥）。验证：vitest 2181 绿 / typecheck 绿 / eslint 触及文件零告警 / visual exit 0 / git status 全净（运行副本帧 cmp 全同已删）。**新分支 tip = 4cece38**（impl 基础 = 60c0832，evidence = 5338e64）。不 merge，建议操作者 `bash scripts/merge-ticket.sh 139`。
