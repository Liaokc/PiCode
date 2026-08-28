# 09: Usage 聚合器（纯函数，可并行）

**What to build:** 无 UI 的纯模块：Pi Session jsonl 条目流 → 聚合统计结构（总量/峰值/连续天数/热力格/按日按模型折线数据/模型占比）。fixture 表驱动测试覆盖增量追加、compaction 条目、截断行等边界；增量监听避免全量重扫且不双计；CLI 入口可直接打印聚合结果供核对。Estimated Cost 字段在此层产出并永远携带估算标记。

**Blocked by:** None (can start immediately — 与 01 并行泳道)。

**Status:** resolved

- [x] fixture 样本全绿：正常流、追加式增长、compaction、半行截断
- [x] 抽取一个真实历史会话人工核对统计数字一致
- [x] 重复触发增量扫描结果幂等（无双计）
- [x] 聚合结果类型稳定到可被图表直接消费（Seam-2 契约）

## Comments

- **704f557** (t09-usage-aggregator) — 聚合器落地：
  - `src/shared/usage/`：Seam-2 纯核。`types.ts`（契约类型）、`parse.ts`（jsonl 容错解析：半行截断 pendingTail、坏行计数、未知类型忽略、model_change 追踪在效模型）、`aggregate.ts`（fold 单文件 → day×model 格；`buildUsageSnapshot` 六件套 + heatmap 三口径 + `trendView(7|30)` + `sessionDays` 下钻行）。
  - `src/main/usage/store.ts`：字节偏移增量扫描，只读尾部完整行；文件变小重扫、消失即丢弃；快照由逐文件聚合以整数和重组 → 幂等由构造保证。
  - 成本口径：整数 micro-USD 记账（估算级精度、精确算术），`EstimatedCost.estimated: true` 字面量类型永真。
  - 测试 56 通过（fixture 表驱动：正常流/追加/compaction/截断/时区归日/空库）；typecheck、lint、build 全绿。
  - 人工核对：真实会话 `01a04350…` — CLI vs jq：19 events / 252,864 tokens / $0.0499 / 聊天跨度 14m58s，完全一致；成本差 <5 micro-USD 为文档化的逐事件取整。
  - 真实库幂等：连续两次扫描输出逐字节一致；冻结副本上追加一行后增量 == 全量重建（delta 恰为 1100 tokens / 1 event）。
  - 决策记录：① 日界 = 条目时间戳的本地日（时区可注入，默认系统）；② 树分支上被放弃路径的 usage 也计入（真实花费，ADR-0002 精神）；③ 周桶以周一为界；④ current streak 今日未活跃时回看昨日。
  - 合并请在根工作区执行：`cd ~/PiCode && git merge --no-ff t09-usage-aggregator`

- **验收（主会话）**：合并 sha `5c7a169` 后独立复验——typecheck 干净、56/56 tests 通过；核阅 fixture 覆盖（截断/追加/compaction/时区）与四条决策记录，符合 ADR-0002 与 Seam-2 契约。工单关闭。
