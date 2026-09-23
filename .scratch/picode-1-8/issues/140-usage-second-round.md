# 140: Token Activity 终验修复二轮——列环去格框 + 52 列满显不滚动 + 曲线/圆环固定一周

**What to build:** 操作者 npm run dev 终验反馈四处修订（模型累积用量界面）：

①**weekly/cumulative 悬浮去格框**：悬浮在某格上时，当前 = 整周列灰环 + 悬浮格更深色框（`button.heat:hover` 的 1.5px outline 与 `.heatmap-col-hover` 列环叠加）；改为**只有整周列灰环**，悬浮格不再有额外的更深色框（悬浮格与同列兄弟格视觉一致）。daily 模式的悬浮格高亮不变；键盘 focus ring 不受影响。

②**52 列满显不滚动**：日/周/累计三模式的贡献图网格永远完整显示 52 列×7 行（ZCode 构图），去掉左右滑动（当前 `.heatmap-scroll` overflow-x:auto + `.heatmap` width:max-content 在窗口窄时溢出滚动）。改为适配容器宽度满显（列宽随容器收缩，ZCode 参照=52 列恒可见）；月份标行同规则。**展示维度 ≠ 统计维度**：cumulative 的方块值仍从数据期初累计（52 周窗外不显示也要统计到——现状「窗前携带」语义，保持并在测试中锁定）。

③**曲线图固定一周**：Daily Token Trend 固定只展示一周（当天往前数 7 天，含当天共 7 格，同 trendView(7) 现语义），退役 7/30 天 Time Range 切换行（range-row UI 移除）。settings-model 的 `TrendRange` 类型与 `trendRange` 字段**保持不删不改**（shared additive-only），UI 层固定传 7。

④**圆环图固定一周**：Model Usage 圆环只统计一周（当天往前数 7 天，含当天），退役 t124 R9 的全期口径（「donut 全期、trend 范围」分窗语义由本票改判为两图统一 7 天窗）；t124 的零用量模型过滤（excludeZeroTokenModels，先滤后切 top-6）语义保留。数据源 = `snapshot.daily[].byModel`（DayUsage 按日按模型，trendView 7 天窗口同源）。

**背景（取证）：** 操作者终验实跑反馈（2026-09-23）：①悬浮格深框 = 双 outline 叠加（app.css `button.heat:hover` 1.5px + `.heatmap-col-hover .heat` 1px）；②左右滑动 = `.heatmap-scroll` overflow-x:auto；③④ = ZCode 参照构图（曲线/圆环只看一周）。参照帧 `.scratch/picode-1-8/reference/z19-heatmap-*`（52 列满显构图可直接对照）。**需要多模态会话对照帧校准。**

**Blocked by:** 无（对已合并 main 的修订票，139 之后）.

**Status:** ready-for-agent

## Acceptance

- [ ] weekly/cumulative：悬浮只余整周列灰环，悬浮格无更深色框（断言：col-hover 内 hovered 格与同列兄弟格 outline 一致/无额外 hover outline）；daily 悬浮格高亮保留；键盘 focus ring 不回归
- [ ] 三模式网格 52 列×7 行恒满显、无横向滚动（容器不再 overflow-x:auto；窄窗列宽收缩适配）；cumulative 方块值仍含 52 周窗外历史（「窗前携带」测试锁定不回归）
- [ ] 曲线固定 7 天窗（当天往前数 7 天含当天），Time Range 切换行退役；settings-model 零改动（TrendRange 类型/字段/action 保留，仅 UI 不再渲染）
- [ ] 圆环固定 7 天窗（当天往前数 7 天含当天），全期口径退役；excludeZeroTokenModels 先滤后切 top-6 保留；顶部 Total Tokens 等五张统计卡保持全期口径不动
- [ ] visual harness 帧刷新与断言更新（weekly/cumulative 悬浮帧无格框；52 列满显帧；曲线/圆环 7 天帧；退役的 30 天/全期帧处置）；electron smoke 断言更新（trend/donut 相关阶段）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-23 (operator feedback，主 Agent 立票)：操作者终验 npm run dev 直给四处修订；①②为 139 交付物修订，③④为新增规格（ZCode 参照）。t124 R9「donut 全期」分窗语义由本票改判为统一 7 天窗。参照帧沿用 z19-heatmap-*，无需新帧。
