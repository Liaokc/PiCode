# 140: Token Activity 终验修复二轮——列环去格框 + 52 列满显不滚动 + 曲线/圆环固定一周

**What to build:** 操作者 npm run dev 终验反馈四处修订（模型累积用量界面）：

①**weekly/cumulative 悬浮去格框**：悬浮在某格上时，当前 = 整周列灰环 + 悬浮格更深色框（`button.heat:hover` 的 1.5px outline 与 `.heatmap-col-hover` 列环叠加）；改为**只有整周列灰环**，悬浮格不再有额外的更深色框（悬浮格与同列兄弟格视觉一致）。daily 模式的悬浮格高亮不变；键盘 focus ring 不受影响。

②**52 列满显不滚动**：日/周/累计三模式的贡献图网格永远完整显示 52 列×7 行（ZCode 构图），去掉左右滑动（当前 `.heatmap-scroll` overflow-x:auto + `.heatmap` width:max-content 在窗口窄时溢出滚动）。改为适配容器宽度满显（列宽随容器收缩，ZCode 参照=52 列恒可见）；月份标行同规则。**展示维度 ≠ 统计维度**：cumulative 的方块值仍从数据期初累计（52 周窗外不显示也要统计到——现状「窗前携带」语义，保持并在测试中锁定）。

③**曲线图固定一周**：Daily Token Trend 固定只展示一周（当天往前数 7 天，含当天共 7 格，同 trendView(7) 现语义），退役 7/30 天 Time Range 切换行（range-row UI 移除）。settings-model 的 `TrendRange` 类型与 `trendRange` 字段**保持不删不改**（shared additive-only），UI 层固定传 7。

④**圆环图固定一周**：Model Usage 圆环只统计一周（当天往前数 7 天，含当天），退役 t124 R9 的全期口径（「donut 全期、trend 范围」分窗语义由本票改判为两图统一 7 天窗）；t124 的零用量模型过滤（excludeZeroTokenModels，先滤后切 top-6）语义保留。数据源 = `snapshot.daily[].byModel`（DayUsage 按日按模型，trendView 7 天窗口同源）。

**背景（取证）：** 操作者终验实跑反馈（2026-09-23）：①悬浮格深框 = 双 outline 叠加（app.css `button.heat:hover` 1.5px + `.heatmap-col-hover .heat` 1px）；②左右滑动 = `.heatmap-scroll` overflow-x:auto；③④ = ZCode 参照构图（曲线/圆环只看一周）。参照帧 `.scratch/picode-1-8/reference/z19-heatmap-*`（52 列满显构图可直接对照）。**需要多模态会话对照帧校准。**

**Blocked by:** 无（对已合并 main 的修订票，139 之后）.

**Status:** ready-for-human

## Acceptance

- [x] weekly/cumulative：悬浮只余整周列灰环，悬浮格无更深色框（断言：col-hover 内 hovered 格与同列兄弟格 outline 一致/无额外 hover outline）；daily 悬浮格高亮保留；键盘 focus ring 不回归
- [x] 三模式网格 52 列×7 行恒满显、无横向滚动（容器不再 overflow-x:auto；窄窗列宽收缩适配）；cumulative 方块值仍含 52 周窗外历史（「窗前携带」测试锁定不回归）
- [x] 曲线固定 7 天窗（当天往前数 7 天含当天），Time Range 切换行退役；settings-model 零改动（TrendRange 类型/字段/action 保留，仅 UI 不再渲染）
- [x] 圆环固定 7 天窗（当天往前数 7 天含当天），全期口径退役；excludeZeroTokenModels 先滤后切 top-6 保留；顶部 Total Tokens 等五张统计卡保持全期口径不动
- [x] visual harness 帧刷新与断言更新（weekly/cumulative 悬浮帧无格框；52 列满显帧；曲线/圆环 7 天帧；退役的 30 天/全期帧处置）；electron smoke 断言更新（trend/donut 相关阶段）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-23 (operator feedback，主 Agent 立票)：操作者终验 npm run dev 直给四处修订；①②为 139 交付物修订，③④为新增规格（ZCode 参照）。t124 R9「donut 全期」分窗语义由本票改判为统一 7 天窗。参照帧沿用 z19-heatmap-*，无需新帧。
- 2026-09-23 (agent, t140 implemented on t140-usage-fixes)：四处修订全部落地，验收项逐条过：
  ① 悬浮去格框：app.css 列环规则并为一条（`.heatmap-col-hover .heat, .heatmap-col-hover button.heat:hover:not(:focus-visible)` = 1px border-strong 环）——悬浮格与同列兄弟 outline 一致（computed-style 相等），daily 的 1.5px 深框保留，键盘 :focus-visible 橙环不受影响。visual 断言：u2b/u2d 加 hovered-vs-sibling outline 相等探针；u1b 加 daily 悬浮 outline 非 none 探针。
  ② 52 列满显：`.heatmap-scroll` 去 overflow-x:auto（padding 保留，t125 左缘环距不回归）；`.heatmap`/`.heatmap-months` width:100%，列/月标 flex:1 分摊，`.heat` width:100%+aspect-ratio:1（方形观感，无最小列宽地板）。visual 断言：u1/u2/u2c 加 scrollWidth≤clientWidth 探针。cumulative「窗前携带」语义零改动（charts.test.ts 期初携带测试原样锁定）。
  ③ 曲线固定一周：UsagePage 删 range-row UI，`trendView(snapshot, 7)` 固定；settings-model.ts 零改动（TrendRange/trendRange/set-trend-range 原样保留，仅 UI 不再渲染/不再传 prop）。smoke 断言 `usage_range_row_retired_ok`（无 .range-row、无 'Trend time range' seg、x 轴恒 3 ticks）。
  ④ 圆环固定一周：aggregate.ts 抽共享 `usageWindow()`（trendView 与新 `modelWindowTotals()` 同源同窗，零契约增量——纯新增导出），数据源 snapshot.daily[].byModel；UsagePage 圆环 = excludeZeroTokenModels(modelWindowTotals(snapshot,7)).slice(0,6)（先滤后切 t124 R9 语义保留；share 按窗口自身总量计）；顶部五张统计卡全期口径未动。vitest 新增 modelWindowTotals 4 例（窗口计数/share 分母/零 token 模型留给调用方滤/空快照）。
  验证：vitest 2185 绿（124 文件）、typecheck 绿、eslint（touched files）绿；visual:usage 11 帧全过 + 逐帧读图自验（对照 z19 构图：满显、列环一致、7 天轴 Sep 17→23）；electron smoke 两 usage 阶段全绿（见下条披露）。帧处置：u7/u8 退役（其对应的 7/30 切换已不存在），u3 重指向固定 7 天帧，u6 为固定窗 hover 帧；.scratch/visual 帧已刷新。t139 settle-poll + setBackgroundThrottling(false) 保全未动。
- 2026-09-23 (agent, t140 disclosure)：electron smoke 全量跑被两处**预存 flaky**（已知 flaky 族 t132/t105 焦点族）提前 abort——t132 已做 stash 基线 A/B 取证（改动 stash+rebuild 后同点同文 FAIL，证据 .scratch/picode-1-8/work-notes/t140-smoke-evidence.md）；按 t44「阶段前移位取证后复原」规范，临时把 t132/t105 两处 fail 改 log-and-continue 取证，**usage_hover（ticket-65 段）与 usage_heat（ticket-139 段）全绿后复原**，复原后 git diff 验证无临时改动残留（仅本票正式改动）。两阶段之后 t89 OAuth 外开同样预存 flaky fail，不追。提交后请操作者 `bash scripts/merge-ticket.sh 140`。
- 2026-09-23 (agent, t140 review round 1 fixes, dual-axis review pass-with-notes → two must-fixes)：
  【必改 1】退役 tracked 帧清理：`git rm .scratch/visual/u7-usage-trend-7d.png` 与 `u8-usage-trend-7d-hover.png`（两张帧展示已退役的 7/30 切换 UI）——与 harness 退役及本票 Comments 记录一致，已在 fix-round 提交中删除（delete confirmed in commit）。
  【必改 2】窄窗满显探针/帧：visual-usage.ts 增 u10-usage-narrow——u1 后 harness 运行时放宽窗口最小宽（app 本身 minWidth 1040），内容区缩至 760×900（评审 720–800 带内），settle-poll 断言 364 格全渲染 + scrollWidth≤clientWidth（沿既有 +1 容差）+ 网格填满容器内边距盒不外溢（g.width ≥ s.width−12 且 g.right ≤ s.right+1），拍帧后恢复内容尺寸与最小尺寸，后续帧几何不受影响（u1b/u2b/u3 复归 1440×900 实测）。逐帧读图：u10 全 52 列收缩分摊满显、7 行、月标对齐、右缘收在 padding 内。
  验证：harness 12 帧 exit 0；vitest 全套 2185 绿（env -u）；typecheck 绿；git status 全净。aggregate/smoke/UsagePage/CSS 零改动。
  提交：fix-round 实质提交 = b69c5b5（u7/u8 删除 + u10 新增 + harness 探针）；本 Comments 提交即当时分支 tip（merge 以 tip 为准，bash scripts/merge-ticket.sh 140）。
