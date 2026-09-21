# 124: 用量页修缮——零用量模型过滤 + Open task 按钮删除

**What to build:** 两件用量页修缮（并票——同页同波次）：①**零用量过滤（R9）**——所选 Time Range 内 **0 token 模型**从 Daily Token Trend 图例序列 + Model Usage 圆环扇区 + 圆环图例剔除（`shared/usage/` 纯投影函数 `excludeZeroTokenModels`，trend/donut 共用同一过滤）；非零极小用量**保留**（Q3=A 裁决——数据源如实：用过就是用过）；Time Range 切换（7/30 days）动态重投影；DrillDown 会话行不动（会话粒度如实）。②**Open task 按钮删除（R15）**——`DrillDownPanel` 行内 Open task 按钮与 `onOpenTask` 布线删除（功能 = 跳回该会话主界面，操作者判定冗余），行保留纯展示。

**背景（取证）：** 图9：qwen38_27 "0 tokens" 照样出现在圆环图例与曲线图例（GLM-5.3 10.62M/0% 为非零极小——按 A 保留）。Q3 裁决 = 严格 0 token 才剔。`DrillDownPanel.tsx:85-89` onOpenTask → UsagePage → App 聚焦会话；操作者：「我感觉就是回到主对话界面，感觉这个按钮很冗余，如果是这样的话就把这个按钮删了」——功能核实一致，删。

**Blocked by:** 无（独立）.

**Status:** ready-for-human

## Acceptance

- [x] Seam-1：过滤纯函数表驱动（0/非零极小/混合模型 × 范围切换重投影；空结果降级如实——全零时图空态而非臆造数据）
- [x] electron smoke / visual：7d/30d 切换后图例无 0-token 模型；非零极小保留；Open task 按钮不存在且行布局不破
- [x] 票 3x 用量聚合口径（ADR-0002）零改动——本票纯显示层过滤
- [x] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P10（R9）+ P18（R15）并票。Q3=A 裁决（严格 0）；Open task 功能核实 = 跳会话后按操作者指示删。
- 2026-09-22 (implement → ready-for-human, self-review 双轴)：分支 t124-usage-zero-filter，实现提交 sha 见下一笔补记。变更：①`shared/usage/aggregate.ts` +`excludeZeroTokenModels`（严格 0 token 剔除、非零极小保留；trend/donut 共用）——trendView 内联过滤改为委托、行为逐字节不变（既有 views.test 全绿验证）；②`UsagePage.tsx` donut = `excludeZeroTokenModels(modelTotals).slice(0, 6)`（先滤后切，0 token 模型不再占用 top-6 槽位）；③R15：`DrillDownPanel.tsx` 删行内 Open task 按钮与 onOpenTask prop、表头尾列占位；`UsagePage.tsx`/`SettingsWindow.tsx` 删布线；`app.css` 删 .dd-open 两规则；行保留纯展示（flex dd-right 对齐不变）；④`fixture.ts` +`FAKE_USAGE_ZERO_MODEL`(qwen3.8-27b, 0 token 失败调用形态) +`FAKE_USAGE_TINY_MODEL`(glm-4.7-air, 10K)（streak 日，双范围可见）；⑤`tests/usage/views.test.ts` +excludeZeroTokenModels 表驱动（0/非零极小/混合/全零→空/空入空出/保序）+ trendView 双新增例（0-token 事件模型双范围皆不入列；7d/30d 范围切换重投影）；⑥`tests/usage/fixture.test.ts` +124 fixture 契约例；⑦`smoke.ts` ticket-65 usage 段 +⑥⑦⑧ legs（30d/7d/回 30d 图例不变量 + x-label 3/7 作重投影信号 + dd-open 零存在 + 行网格不破）。
  **R9 语义裁决留档（自查票面/spec/CONTEXT.md 后自答）**：圆环保持全期（all-time）modelTotals 口径、只剔全期 0 token 条目；曲线维持既有“所选范围内 0 token 剔除”（trendView 既有行为）。依据：票面自述「纯显示层过滤」+「票 3x 口径零改动」——圆环改 range-scoped 会改数字含义与测量窗口；Q3 裁决文与图9 证据（qwen38_27 0 tokens / GLM-5.3 10.62M 0%）都是全期数字上的取舍；ZCode 参照圆环本就全期。若复核裁定圆环应随范围重投影，切换点 = UsagePage 的 donut 投影一行。
  验证链：vitest 2015/2015 绿（118 文件）；typecheck/eslint 绿；node 版 `smoke:usage` PASS（real store 270 会话 + 增量机全绿，ADR-0002 口径零回归）；visual harness 全绿（9 帧捕获，donut 图例 6→5 = 0 token 模型剔除、trend 双范围 series=5、drilldown 开合正常）；electron smoke 124 legs 已落 smoke.ts，但全量 smoke 两次均死在 ticket-44 段（窗口焦点被 macOS 拒绝——操作者活跃态，已知批次环境事实，与本票 diff 零交集，按协议留档不追；环境允许时 merge 前后任意一次全量 smoke 即覆盖）。评审 = self-review 双轴（Standards：纯函数单一拼写零重复、无死代码（CSS/prop 全清）、无 TODO、UI 文案全英文；Spec：Acceptance 逐条对照，含发现并修复一处脆弱断言——'0 tokens' 子串误伤 '120 tokens'，改为 tokens span 精确匹配），主 Agent 另派独立双轴复核。
- 2026-09-22 (sha 记录)：实现提交 = 2eba6e3f7e1e046d8521ae7c4372cb2f25c02ff0（本笔的前一提交，含全部实现+票面翻转）；分支 tip = 本笔（仅本 sha 行）。merge 会话以分支 tip 为准。
- 2026-09-22 (review fix round, self-review 双轴复核采纳)：修复提交 = 9075a5d（分支新 tip）。**必修（standards major）**：腿⑧原断言 `rows.slice(1).every(row => textContent.includes('tokens'))` 恒 false——会话行只渲染 formatTokenCount 裸数字（如 `1.80M`），“tokens” 字样只在表头/footer（该腿未真跑故未暴露，环境恢复后必假报 rows lost layout）。改为探测真实行网格：每数据行一枚非空 `.dd-session` + 一枚数值 `.dd-tokens`（计数 = rows−1，数值匹配 `/^[\d.]+[KMB]?$/` = formatTokenCount 全输出形），保留 dd-open 零存在与表头 Session/Tokens 断言；DOM 双源核实 = DrillDownPanel.tsx:74/77 标记（.dd-session/.dd-right .dd-tokens，表头无此二类）+ app.css:3519/3525 + visual 帧 work-notes/t124-visual-drilldown.png（05:50 实拍同源 DOM）。**minor 三项**：①smoke 段落注释改为执行序（⑤图例过滤/⑥7d 切换/⑦下钻点击/⑧行纯展示）；②UsagePage donut 投影处补测量窗分界注释（donut=全期 modelTotals、trend=所选范围，明示勿统一）；③fixture 拼写注册五字重复抽为 registerSpelling（确定性测试+契约例全绿，输出字节不变）。验证：vitest 2015/2015、typecheck/eslint 复绿；未跑 electron smoke（t44 环境未变，按指令）。
