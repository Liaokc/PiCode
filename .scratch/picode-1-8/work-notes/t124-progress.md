# t124 progress — 用量页修缮：零用量模型过滤 + Open task 按钮删除

**本票目标一句话**：所选 Time Range 内 0 token 模型从 Daily Token Trend 图例序列 + Model Usage 圆环扇区 + 圆环图例剔除（shared/usage/ 纯投影函数 excludeZeroTokenModels，trend/donut 共用同一过滤，严格 0 才剔，非零极小保留，范围切换动态重投影，DrillDown 会话行不动）；DrillDownPanel 行内 Open task 按钮与 onOpenTask 布线删除；票 3x 用量聚合口径（ADR-0002）零改动。

## 阶段=开工

- 2026-09-21 21:30:41 UTC — 开工：worktree t124-usage-zero-filter（基于 main 391bad7），先读票面/spec R9+R15/CONTEXT.md/ADR-0002 再动手。票文件：`.scratch/picode-1-8/issues/124-usage-zero-filter-open-task.md`；spec：`.scratch/picode-1-8/spec.md`（R9 §77、R15 §97、落点 §130/136、验收 §149/151）。

## 方案定稿（实现前落盘）

- 2026-09-21 21:5x UTC — **R9 语义裁决（自查票面/spec/CONTEXT.md 后自答）**：严格 0 token 才剔（Q3=A），过滤面 = TrendChart 图例序列 + DonutChart 扇区与图例。**圆环保持全期（all-time）modelTotals 口径、只剔全期 0 token 条目**；曲线维持既有“所选范围内 0 token 剔除”（trendView 既有行为，票 3x 口径零改动）。两处共用同一纯函数 `excludeZeroTokenModels`（落 `shared/usage/aggregate.ts`，trendView 内联过滤改为委托、行为逐字节不变；Donut 侧 `excludeZeroTokenModels(modelTotals).slice(0, 6)`——先滤后切，0 token 模型不再占用 top-6 槽位）。依据：①票面自述「纯显示层过滤」+「票 3x 用量聚合口径零改动」——圆环改 range-scoped 会改数字含义与测量窗口，超出「过滤」；②Q3 裁决文=「严格 0 token 剔除」，图9 证据（qwen38_27 0 tokens / GLM-5.3 10.62M 0%）都是圆环全期数字上的取舍；③ZCode 参照（PiCode 1.0 视觉验收 Match）圆环本就全期。留档：若评审裁定圆环应随范围重投影，切换点= UsagePage 的 donut 投影一行（改喂 range-scoped totals）。
- 2026-09-21 21:5x UTC — **R15**：DrillDownPanel 删 onOpenTask prop + 行内 Open task 按钮 + 表头尾列占位 span；UsagePage/SettingsWindow 删布线；app.css 删 .dd-open 规则。行保留纯展示（flex 布局 dd-right 对齐不变）。
- 2026-09-21 21:5x UTC — **fixture**：`shared/usage/fixture.ts` 增两个导出常量模型——`FAKE_USAGE_ZERO_MODEL`（qwen3.8-27b，0 token 真实形态=失败调用产生 0 token cell）与 `FAKE_USAGE_TINY_MODEL`（glm-4.7-air，10K tokens 非零极小），落在 streak 日（back=2，7d/30d 双范围可见）——供 smoke/visual 断言「0 token 不见 + 非零极小保留」。
- 2026-09-21 21:5x UTC — **测试计划**：Seam-1 表驱动落 `tests/usage/views.test.ts`（excludeZeroTokenModels：0/非零极小/混合/全零→空/空入空出/保序；trendView：0-token 事件模型双范围皆不入列 + 范围切换重投影 30d-only 模型）；electron smoke 落 `src/main/smoke.ts` ticket-65 usage 段内新增 124 legs（30d/7d 图例断言 + x-label 数 3/7 作重投影信号 + dd-open 不存在 + 行不破）。

## 阶段=实现完成

- 2026-09-21 22:0x UTC — **实现落地**（未提交）：①`aggregate.ts` 增 `excludeZeroTokenModels`（严格 0 剔除非零极小留），trendView 内联过滤改为委托（行为不变）；②`UsagePage.tsx` donut = `excludeZeroTokenModels(modelTotals).slice(0, 6)`（先滤后切）+ 删 onOpenTask；③`DrillDownPanel.tsx` 删 Open task 按钮 + 表头尾列占位 + onOpenTask prop；④`SettingsWindow.tsx` 删布线；⑤`app.css` 删 .dd-open 两规则；⑥`fixture.ts` 增 FAKE_USAGE_ZERO_MODEL(qwen3.8-27b, 0 token, streak 日 back=2) + FAKE_USAGE_TINY_MODEL(glm-4.7-air, 10K tokens) 双导出常量；⑦`tests/usage/views.test.ts` 增 excludeZeroTokenModels 表驱动 + trendView 双新增例；⑧`tests/usage/fixture.test.ts` 增 124 fixture 契约例；⑨`smoke.ts` ticket-65 usage 段增 ⑥⑦⑧ legs（30d/7d/回 30d 图例断言 + x-label 3/7 重投影信号 + dd-open 零存在 + 行不破）。
- 2026-09-21 22:1x UTC — **验证**：typecheck 绿；vitest 全量 118 文件 2014+1 用例绿（含新增）。

## 阶段=验证完成

- 2026-09-21 21:5x UTC（本地 09-22 05:4x）— **node 版 smoke:usage PASS**（real store 270 会话/4 模型/3.57B tokens + 增量机全绿——ADR-0002 口径零回归）。
- 2026-09-22 05:50 CST — **visual harness 全绿**：`PICODE_VISUAL_OUT=/tmp/t124-visual npm run visual:usage` 九帧全捕获，签名 donutSlices=5（fixture 6 模型→0 token 剔除后 5）、series=5（30d/7d 双范围）、drilldown 开合正常、trend/donut hover 正常。证据帧已存 `/Users/liaokechen/PiCode/.scratch/picode-1-8/work-notes/t124-visual-{30d-trend,donut,drilldown,7d-trend}.png`。
- 2026-09-22 05:50 CST — **electron smoke 两次均死在 ticket-44 段**（窗口焦点被 macOS 拒绝，操作者活跃态；与 t122 同夜同症，已知批次环境事实，与本票 diff 零交集）——按协议留档不追；124 legs（⑥⑦⑧）已落 smoke.ts，环境允许时任意一次全量 smoke 即覆盖。日志 `/tmp/t124-smoke-electron.log`、`/tmp/t124-smoke-electron-r2.log`。
- 2026-09-22 05:5x CST — **self-review 双轴完成**：Standards 轴发现并修复一处脆弱断言（'0 tokens' 子串误伤 '120 tokens' → 改为 donut-legend-tokens span 精确匹配，修复后 typecheck/eslint 复绿）；Spec 轴 Acceptance 逐条对照通过。其余：纯函数单一拼写零重复、无死代码、无 TODO、UI 文案全英文。

## 阶段=终态

- 2026-09-22 05:5x CST — **提交**：实现提交 `2eba6e3f7e1e046d8521ae7c4372cb2f25c02ff0`（含全部实现 + 票面翻转 ready-for-human + 验收勾选 + self-review Comments），分支 tip `0e85349`（仅 sha 记录行）。分支 t124-usage-zero-filter，基于 main 391bad7。工作树净（progress 文件与证据帧保持 untracked）。未 merge、未 push（主 Agent 跑 `scripts/merge-ticket.sh 124`）。

## 阶段=修复轮（双轴评审采纳）

- 2026-09-22 06:0x CST — **必修（standards major）修复**：腿⑧原断言 `rows.slice(1).every(row => row.textContent.includes('tokens'))` 恒 false（会话行只渲染 formatTokenCount 裸数字，“tokens” 只在表头/footer；腿未真跑故未暴露）。改为真实行网格断言：每数据行一枚非空 `.dd-session` + 一枚数值 `.dd-tokens`（计数 = rows−1；数值 `/^[\\d.]+[KMB]?$/` 覆盖 formatTokenCount 全输出形），保留 dd-open 零存在 + 表头 Session/Tokens。DOM 双源核实：DrillDownPanel.tsx:74/77 + app.css:3519/3525 + t124-visual-drilldown.png（05:50 实拍同源 DOM，签名 drilldown:1）。
- 2026-09-22 06:0x CST — **minor 三项**：①smoke 段落注释改执行序（⑤图例过滤/⑥7d 切换/⑦下钻点击/⑧行纯展示）；②UsagePage donut 投影补测量窗分界注释（donut=全期、trend=范围，勿统一）；③fixture 拼写注册抽 registerSpelling（输出字节不变，确定性+契约例全绿）。
- 2026-09-22 06:0x CST — **验证**：vitest 2015/2015、typecheck/eslint 复绿；未跑 electron smoke（t44 环境未变，按指令）。
- 2026-09-22 06:0x CST — **修复轮提交**：`9075a5d`（修复本体）+ `caedff8`（票 Comments 记录，分支新 tip）。票面已追加 review fix round 记录。

