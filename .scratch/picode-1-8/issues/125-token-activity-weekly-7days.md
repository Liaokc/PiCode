# 125: Token Activity weekly = 本周 7 天——零用量空色格 + tooltip + 焦点圈修复

**What to build:** `usage/HeatmapView.tsx` weekly 模式重实现（Q4=B 裁决）：①**本周 7 天**——7 格按周内日排（周起始票内依 ZCode 校准裁量：周一/周日），替代现行周聚合格（30 天 ≈ 5 格）；②**零用量日空色格渲染**——某天没有用量也出格（空色 = 零用量色阶），绝不缺格（Daily 模式的零用量格缺失同修——「某天没有用量就用没有用量的颜色的方框展示，而不是不显示这个方框」操作者原话）；③**hover tooltip**——悬浮格子显示当日用量（与曲线图/圆环图同族 tooltip；weekly 格显该日 token 数 + 日期）；④**最左格焦点圈左线裁剪修复**——点击最左格时周围灰框左线被容器裁剪（CSS padding/overflow 修正）；⑤**Daily / Cumulative 模式不动**（Daily 的既有月格形态保持——本票只重实现 weekly + 通用零格/tooltip/裁剪三修）。

**背景（取证）：** 操作者图10：weekly 5 格（周聚合格）+ 点击最左格焦点圈左线不完整 + tooltip 形态与曲线/圆环不一致。Q4 裁决 B：「改成『本周 7 天』视图」。现状实现 = `HeatmapView.tsx` 周聚合。

**Blocked by:** 无（独立；与 124 同页弱邻接——数据流只读不改）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：周格生成表驱动（7 天序列/周起始/零日空格/tooltip 数据/跨月与年首周边界）
- [ ] electron smoke / visual：weekly 七格帧（对照操作者期望形态）；hover tooltip 断言；最左格焦点圈完整（visual 帧）；Daily/Cumulative 零回归
- [ ] 零用量日空色格在 Daily 模式同样渲染（不缺格）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P11 四连定稿为 R10（Q4=B：weekly 改本周 7 天；tooltip/焦点圈/空格三修随票）。周聚合格形态退役（操作者裁决推翻，非 ZCode 参照项——语义裁决）。
