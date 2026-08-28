# 10: 用量统计页

**What to build:** 设置窗口壳（导航分组裁剪自 ZCode：General / Appearance / Models / Data & Statistics）+ Usage 页全量：五张数字卡（累计 Token、峰值、最长聊天时长、当前/最长连续天数）；GitHub 式热力格（daily/weekly/cumulative 切换）；近 7 日/近 30 日切换的每模型多色折线趋势；模型占比环形图带图例百分比；数据点下钻到 Session 明细。图表只消费聚合缓存，估算成本处处显式标注。

**Blocked by:** 09 Usage 聚合器、01 净场与脚手架。

**Status:** ready-for-human

- [x] 全部图形数据来自聚合缓存而非现场扫文件
- [x] 五卡/热力格/折线/环形对照截图 09 的版式结构一致
- [x] 时间范围与热力格三种口径切换正确联动
- [x] 下钻明细能看到来源会话并可跳转回任务
- [x] 成本数字全部带 estimated 标注

## Comments

- **0b5a84d** (t10-usage-page) — Usage 页落地（已 rebase 到含 t02 的 main，chat 与 settings/usage 并存）：
  - **IPC（Seam-2 唯一出口）**：main 侧 `usage/service.ts` 持有 UsageStore 聚合缓存（`~/.pi/agent/sessions`，与 TUI 共享），`ipcMain.handle('usage:snapshot')`；preload 增 `picode.usage.snapshot()`。渲染层零文件访问、零 SDK import（grep 验证）。
  - **纯函数层（TDD 先行）**：`shared/usage/format.ts`（英文数字/时长/成本格式化，日期 UTC 钉死）、`shared/usage/charts.ts`（五卡 statCards、热力格 heatmapGrid 三口径、trendChart 700×280 几何、niceCeil、Catmull-Rom 平滑、donutSlices 圆弧）、`shared/settings-model.ts`（导航裁剪 General/Appearance/Models + Data & Statistics 组、heatmap 档位、7/30 切换、下钻选择，含 dateTo 周区间）。日期算术去重为 `shared/usage/dates.ts`。
  - **UI（截图 09 版式）**：SettingsWindow 壳（← Back to Workspace + 分组导航，未建 section 留位给 ticket 11）+ UsagePage：五数字卡、Token Activity 热力格（Daily/Weekly/Cumulative 切换、月份标签、周格单行居中）、Time Range 行 + 每模型多色平滑折线（步进 5 日刻度）、Model Usage 环形 + 图例百分比；任一数据点（热力格/折线/环形）下钻右侧抽屉：session×day 明细、Open task 跳回工作区。
  - **成本估算标注**：页头 `Estimated cost $X · estimated`、明细行 `est.`、明细脚注 estimatedCostText；环形图例只显 tokens 无成本数字。
  - **QA 钩子**：`VITE_PICODE_VIEW=settings` 启动直达设置页供人工对照截图。
  - 验证：typecheck / lint / build 全绿；**113 测试全过**（本票新增 68：format 12、charts 17、settings-model 4、service 3、layout-model 增量 2 + 既有 30）；真实库冒烟：40.67M tokens 卡片、30 日趋势 4 模型、xTicks 每 5 日、cumulative max == totalTokens（幂等）。
  - 评审中修复真 bug：热力格 cumulative 口径曾对已累计 cells 二次累加（54.3M > 41.3M），已改为恒用 daily cells 由 charts 内部变换。
  - 已知边界：Open task 目前跳回工作区（会话深链待 ticket 04 侧边栏落地）；视觉像素对照是人工关卡，请用 `npm run dev` + `VITE_PICODE_VIEW=settings` 核对截图 09。
  - 合并请在根工作区执行：`cd ~/PiCode && git merge --no-ff t10-usage-page`
- 2026-08-28 (merge session): 分支已由先前的合并流程带入 main（merge commit `e33117b`）；合并后 main 复核 typecheck 绿、210 vitest 全过。**注意：tracker 提交 2495b19 只记录 ready-for-human，未见人工目检（截图 09 对照，`VITE_PICODE_VIEW=settings npm run dev`）的验收记录** —— 操作者确认目检通过后，本票才改标 resolved。worktree `wt-10-usage-page` 与分支 `t10-usage-page` 已清理（不影响任何已合并内容）。
