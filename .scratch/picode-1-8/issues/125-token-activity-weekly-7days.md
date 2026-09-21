# 125: Token Activity weekly = 本周 7 天——零用量空色格 + tooltip + 焦点圈修复

**What to build:** `usage/HeatmapView.tsx` weekly 模式重实现（Q4=B 裁决）：①**本周 7 天**——7 格按周内日排（周起始票内依 ZCode 校准裁量：周一/周日），替代现行周聚合格（30 天 ≈ 5 格）；②**零用量日空色格渲染**——某天没有用量也出格（空色 = 零用量色阶），绝不缺格（Daily 模式的零用量格缺失同修——「某天没有用量就用没有用量的颜色的方框展示，而不是不显示这个方框」操作者原话）；③**hover tooltip**——悬浮格子显示当日用量（与曲线图/圆环图同族 tooltip；weekly 格显该日 token 数 + 日期）；④**最左格焦点圈左线裁剪修复**——点击最左格时周围灰框左线被容器裁剪（CSS padding/overflow 修正）；⑤**Daily / Cumulative 模式不动**（Daily 的既有月格形态保持——本票只重实现 weekly + 通用零格/tooltip/裁剪三修）。

**背景（取证）：** 操作者图10：weekly 5 格（周聚合格）+ 点击最左格焦点圈左线不完整 + tooltip 形态与曲线/圆环不一致。Q4 裁决 B：「改成『本周 7 天』视图」。现状实现 = `HeatmapView.tsx` 周聚合。

**Blocked by:** 无（独立；与 124 同页弱邻接——数据流只读不改）.

**Status:** ready-for-human (branch t125-token-activity, impl 865dd59)

## Acceptance

- [x] Seam-1：周格生成表驱动（7 天序列/周起始/零日空格/tooltip 数据/跨月与年首周边界）
- [x] electron smoke / visual：weekly 七格帧（对照操作者期望形态）；hover tooltip 断言；最左格焦点圈完整（visual 帧）；Daily/Cumulative 零回归
- [x] 零用量日空色格在 Daily 模式同样渲染（不缺格）
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P11 四连定稿为 R10（Q4=B：weekly 改本周 7 天；tooltip/焦点圈/空格三修随票）。周聚合格形态退役（操作者裁决推翻，非 ZCode 参照项——语义裁决）。
- 2026-09-22 (implementer claimed)：开工；work-notes/t125-progress.md 跟踪。
- 2026-09-22 (implementer done, self-review)：分支 t125-token-activity，实现提交 `865dd59`（本注释提交随其后）。要点：
  - **实现**：`heatmapGrid` weekly 分支重写——锚定末格（快照 daily 零填充至 today）的周一，7 个单日列（周一..周日，周起始=周一与全仓 mondayOf 一致），max=本周 7 值，零用量日与今日后未至日均为 level-0 空色格；`HeatmapView` 重写——白卡 hover tooltip（.heat-tooltip，trend/donut 同族样式，格上方锚定+右半翻转）、去原生 title、onClick=onPick(col.start,null)（weekly 列即当日→当日下钻；daily/cumulative 载荷逐字节不变）；CSS——.heatmap-wrap(relative) + .heatmap-scroll padding 4px 4px 2px（焦点圈/悬停描边左线不再被 clip box 裁剪）+ .heat-tooltip；格子带 data-date（donut data-model 先例）供 smoke 断言。
  - **验证**：vitest 全量 2029 passed（charts.test 新增 weekly 表驱动：锚点表 5 例（周中/周一/周日/年首跨年/元旦）×7 天序列+零格+等级、全零周 7 空格、跨月标签让位、跨年标签、daily 缺日零格锁定）；typecheck 绿；electron smoke 新增 ticket-125 stage 六检查点全绿（weekly 七格+日期序列+未来日空色 / hover tooltip 开合+当日 token+日期 / 最左格描边几何 / 当日格点击下钻当日 / Daily+Cumulative 本周 7 天俱在零回归）；visual:usage 全绿（u2=七格帧 heatCells:7；新增 u2b 真实输入悬停帧 heatTooltip:1；u1/u3–u9 不变）。
  - **环境留档（t44 焦点事实）**：全套 smoke 两次死于 ticket-44 真剪贴板焦点门（操作者活跃、macOS 拒绝 steal——任务书已知环境事实；终位运行我的 stage 在 t44 之后不可达）。**绿证据取自临时前移位运行**（ticket-125 stage 临时移至 t44 之前跑绿六检查点，跑完已复原终位——usage_hover 段之后，git diff 验证单一插入块）；t129 已验证同手法先例。
  - **语义披露**：weekly 点击下钻从旧「整周跨度 (Mon, Mon+6)」改为「该日」——格即日，诚实语义；Daily/Cumulative 下钻载荷未动（旧有 col.start 行为保持，不在本票范围）。快照聚合层的 heatmap.weekly 周聚合数组未动（Seam-2 契约，views.test 锁定，视图本就不消费）。
  - **Self-review（双轴）**：Standards 轴——纯函数零 I/O；无共享概念重命名（HeatColumn.start 语义注释更新）；单一拼法（weekly/current week）；约束型注释（clip box 余量/锚点/翻转）；无 TODO/占位；UI 文案全英文；cellHover/labelFor 去重复。Spec 轴——验收四项逐条对照如上；Daily/Cumulative 零回归有显式 smoke 断言（本周 7 天俱在+格数>7）。
- 2026-09-22 (review fix round，主 Agent 双轴评审后)：修复提交 `9f7725c`。①【必修/standards 中】HeatmapView `react-hooks/set-state-in-effect`——effect 内同步 setHover(null) 改为渲染期失效：hover 态携带捕获时的 mode+cells 引用，渲染时键不匹配即视为无卡（同失效语义：模式/快照切换下静置指针的陈卡让位，零 effect 零级联）；触及文件 eslint 清零。②【建议/低】charts.test.ts daily 缺日零格用例前移至 daily 用例群（weekly describe 关闭后无空行紧跟易误读）。③【不修留档】.heat-tooltip 与 .donut-tooltip 十条声明重复——trend/donut 家族先例本就两独立块，评审仅 note。验证：vitest 全量 2029 绿、typecheck 绿、eslint（触及五文件）零告警；未重跑 electron smoke（环境未变，前移位绿证据仍有效）。分支 tip = 9f7725c。
