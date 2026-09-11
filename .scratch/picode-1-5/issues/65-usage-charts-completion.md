# 65: Usage 图表交付缺口补齐——过冲钳制 / 双区间风格统一 / 悬浮白卡

**What to build:** Usage 页三件（1.3 批 R11 既定决议的**补交付** + 双区间风格统一）：① **曲线钳制**——smoothPath Catmull-Rom 控制点钳制进 [top, baseline]，曲线永不跌破零基线（1.3 spec.md:110 的保形最小修；现 30 天视图蓝线在尖峰两侧过冲破底——pi15-usage-30d-trend）；② **7 天/30 天风格统一**——同一插值与钳制下两区间视觉语言一致（现 7 天过圆缓、30 天尖刺过冲——pi15-usage-7d/30d 对照）；③ **悬浮白卡**（1.3 spec 交付缺口的 ZCode 同型）：趋势图 hover = 竖导线 + 各线交点圆点 + 白卡 tooltip（日期 · 各模型 tokens · 合计，最近日吸附）；圆环 hover = 白卡 tooltip（模型名 · tokens · 占比）；**点击 drilldown 行为不变**。

**背景（取证）：** 操作者报「还是向下超出基准线」——查实 **1.3 批 R11 已定稿未交付**：1.3 spec.md:37/110 写明钳制根因（`smoothPath` 控制点 `c2y = p2.y − (p3.y − p1.y)/6`，p2 在基线且 p3.y < p1.y 时越界——charts.ts:222）与 hover 形态及测试计划，但 /to-tickets 时 R11 未落任何票（1.3 十票覆盖 R1–R10；38=R6+R7+R10 三合一），charts.ts 自 1.0 票 12 后零改动。1.3 取证帧 pi13-usage-trend（紫色平线过冲破底）与本批 pi15-usage-30d-trend 同症复现。ZCode 对齐锚点（1.3 留存帧）：z13-usage-trend-hover（白卡：日期 + 合计 + 分模型行 + 交点圆点）、z13-usage-donut-hover（白卡：模型 + tokens + 占比）、ZCode 曲线从不破底。现码：TrendChart 仅 onClick（drilldown 坐标映射函数在位可复用为 hover 映射）；DonutChart 无任何 hover 供面。

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [x] 钳制纯函数：smoothPath 控制点钳制进 [top, baseline]——尖峰两侧不过冲破底（表驱动：0→峰值→0 序列路径逐段 y ≥ baseline；平坦零序列仍为平线）
- [x] 双区间风格统一：7 天与 30 天同一插值/钳制参数——视觉语言一致（对照帧并排评审）
- [x] 趋势 hover：竖导线 + 各线交点圆点 + 白卡 tooltip（日期 · 各模型 tokens · 合计；最近日吸附——复用 onClick 坐标映射函数）；移出即隐
- [x] 圆环 hover：白卡 tooltip（模型名 · tokens · 占比）；移出即隐
- [x] 点击 drilldown 行为零回归（既有用例全绿）
- [x] Seam-1 表驱动：钳制函数（usage-charts 套件扩展——1.3 spec 预案的用例落地）+ hover 数据推导（坐标 → 日期索引 → 白卡内容）
- [x] electron smoke：hover 出 tooltip DOM（1.3 spec 预案落地）；drilldown 点击不回归
- [x] visual harness：趋势 hover 帧 + 圆环 hover 帧（对照 z13-usage 两帧）+ 30 天钳制后全图帧（对照 pi15-usage-30d-trend）
- [x] 跑 dev app / smoke / visual 前 ps 复核无其他 PiCode Electron/dev-app/smoke 进程；撞锁则等待重试不并跑
- [x] typecheck / lint / vitest 全绿；code-review 双轴通过

**交接：** 完成后不自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 65`。

## Comments

- 2026-09-11 (requirements intake): 建票。**性质 = 1.3 批交付缺口补齐**：R11 在 1.3 spec（37/110/120/121 行）定稿完整（根因/形态/测试预案/ZCode 参照帧全备）但 /to-tickets 时未落票——本票按 1.3 既有决议 + 本批双区间风格统一增量交付。波次：独立链（与 54–62、63/64 零文件交集），可即刻开工。tracker 追溯：1.3 spec Comments 的分类记录把 R11 计入缺陷数，但波次表未给它工单——/to-tickets 检查单教训（spec 每条 R 必须映射到票）已在 tracker 注明。
- 2026-09-11 (release scope): 操作者拍板「全部赶 v1.5.0」——本票纳入 v1.5.0 发布范围。
- 2026-09-11 (implementation): 完成于 `t65-usage-charts-completion`，commit **4fef625**。实现要点：
  - **钳制（charts.ts:222 根因修复）**：`smoothPath` 消费 `TrendPlotBand { top, baseline }`，`c1y/c2y` 双双钳进 [top, baseline]——锚点本就在带内，凸包性质令每段三次曲线整体入带（保形最小修）。修后平坦零段沿基线精确贴平，尖峰两侧零下潜（u3 帧对照 pi15-usage-30d-trend 已消）。
  - **双区间统一**：插值/钳制参数无 per-range 分支；y 几何只依赖值与共享 band——表驱动测试断言同 token 序列在 7d/30d 下 y 序逐点相等（u3/u7 帧并排对照）。
  - **趋势 hover**：`trendSnapAt(x, count, width)` = 共享最近日吸附（与旧 onClick 内联公式逐 x 等价的测试守护，drilldown 点击零回归）；白卡 = `trendHoverCard(view, index)`（日期 · 各模型 tokens · 合计；零值模型按 ZCode 形省略，z13-usage-trend-hover 实帧佐证）；导线/交点圆点走 `geo.band` + 系列点；移出即隐（mouseout+mouseleave，票 46 配方）。
  - **圆环 hover**：`donutHoverCard(slices, model)`（模型名 · tokens · 占比），光标锚定 + 右缘翻转；移出即隐。
  - **验收通道**：Seam-1 新增 10 例（全绿，82 文件 1165 测试）；electron smoke 新 stage（run-all stage 6 与 smoke:electron wrapper 加 `PICODE_FAKE_USAGE=1`，仅 usage 页消费）——hover 出 tooltip DOM（guide+dots+rows）/移出隐藏/圆环 hover/趋势点击 drilldown 全过（usage_*_ok 六连，末段 usage_hover_stage_done，整链 SMOKE done）；visual harness 新增 u6 螞势 hover / u7 7d 全图 / u8 7d hover / u9 圆环 hover 四帧（对照 z13-usage-*），u3 即钳制后 30d 全图帧。
  - **ps 复核**：跑前自查通过；实际撞锁一次（wt-63 dev app 于首跑中启动、共享 userData 致 smoke 进程被杀）——按规等待其退出后重跑，未并跑。
  - code-review 双轴通过：Spec 10/10 验收项全落（0 缺口 0 scope creep）；Standards 0 违规（2 判断项：hover 派发片段在 smoke.ts 与 visual-usage.ts 双层各存一份——仓内双层 harness 自包含惯例；右缘翻转以半宽阈值启发式而非卡片实测宽——对齐 ZCode 同型行为）。typecheck/lint/vitest 全绿。
  - **交接**：未自行 merge——操作者/合并会话执行 `bash scripts/merge-ticket.sh 65`。
- 2026-09-11 (operator deviation, pre-merge review): 操作者看帧后拍板「线条和圆环的颜色太亮了，用浅色系」——**对 ZCode 锚点帧的显式偏离**（票 59 先例：操作者裁决优先于实拍参照）。实现：`MODEL_PALETTE` 同色相从 Tailwind 500 档降到 400 档（#60a5fa/#4ade80/#c084fc/#f87171/#fb923c/#2dd4bf/#facc15/#a78bfa/#f472b6/#94a3b8），单点出口 `modelColor` 全覆盖（趋势线/圆环弧/图例点/hover 交点点），热力图自有蓝色刻度不动。9 帧全部重生成（u3–u9 含 hover 形态不变）；像素采样对照验证四条弧一致变浅（如蓝弧 #3b82f6→#60a5fa 同点采样 rgb(35,119,238)→rgb(75,155,244)，粗弧的残余视觉浓度属面积效应 + PNG iCCP 编码偏移，非旧色残留）。typecheck/lint/vitest 全绿（1165）。若还要更浅一档（Tailwind 300）改同一数组即可。实现 commit **0aad055**（9 帧重生成入库）。
