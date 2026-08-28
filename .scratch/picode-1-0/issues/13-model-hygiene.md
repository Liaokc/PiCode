# 13: 模型用量数据卫生——冒烟隔离 + 大小写归一

**What to build:** 让用量统计只反映真实使用。冒烟测试产生的会话不再写入 `~/.pi/agent/sessions`（改用隔离的 agentDir 或 `--no-session`）；聚合器对 model 标识按大小写不敏感分组（展示保留首次出现的原拼写），使 `GLM-5.3-flash` 与网关回显的 `glm-5.3-flash` 永远折叠为同一个模型。

**背景**：实测发现真实用量（大写，$32.93/2.55 亿 tokens，provider bella）与冒烟测试消耗（小写回显，$0.15，散布于 33+ 个 `picode-smoke-*` 临时会话目录）被当成两个模型分开统计。根因不是配置（models.json 仅一条大写条目），而是 (a) 冒烟工装直接写共享会话库、(b) 聚合分组未归一大小写。

**Blocked by:** 12 终局 QA（工装文件 `scripts/smoke/*` 正被 T12 会话编辑，合并后再动，避免活体冲突）。

**Status:** ready-for-agent

- [ ] 跑一遍完整冒烟套件前后，`~/.pi/agent/sessions` 下会话文件数量零增长（临时目录策略或 agentDir 隔离生效）
- [ ] 聚合器单元测试：同一模型两种大小写的 usage 事件折叠为一个分组，tokens/cost 相加
- [ ] usage CLI 对当前真实库输出单一 `GLM-5.3-flash` 条目（大写展示），tokens/cost 为两来源之和
- [ ] 存量污染处理策略明确记录（保留历史但可识别，或提供一次性清洗脚本，二选一）
