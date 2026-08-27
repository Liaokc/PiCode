# 09: Usage 聚合器（纯函数，可并行）

**What to build:** 无 UI 的纯模块：Pi Session jsonl 条目流 → 聚合统计结构（总量/峰值/连续天数/热力格/按日按模型折线数据/模型占比）。fixture 表驱动测试覆盖增量追加、compaction 条目、截断行等边界；增量监听避免全量重扫且不双计；CLI 入口可直接打印聚合结果供核对。Estimated Cost 字段在此层产出并永远携带估算标记。

**Blocked by:** None (can start immediately — 与 01 并行泳道)。

**Status:** ready-for-agent

- [ ] fixture 样本全绿：正常流、追加式增长、compaction、半行截断
- [ ] 抽取一个真实历史会话人工核对统计数字一致
- [ ] 重复触发增量扫描结果幂等（无双计）
- [ ] 聚合结果类型稳定到可被图表直接消费（Seam-2 契约）
