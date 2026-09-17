# 90: 子智能体桥接 + 目录 tab——host 侧数据面与聚合视图

**What to build:** 子智能体供面第一票：①**host 桥接**——host 的 inline extension 订阅 pi-subagents 的 in-process RPC（`subagents:rpc:v1:*`：status/fleet DTO）与 async 生命周期事件（`subagent:async-started/complete`、`subagent:child-status`），转发 renderer（**additive 契约增量：实施时报备入 host-contract smoke**）；②**目录投影纯模型**——父会话文件中 subagent 工具调用记录重放为**主源**（ADR-0002 精神：会话记录唯一事实源、重开会话可重建）+ async 工件（status.json）作 live 增补（tmpdir 工件会清理、不作历史源）；状态徽标 = 运行态到七态词汇（Running/Waiting/Blocked/Completed/Failed/Cancelled/Lost）的映射表（票内定稿留档）；Show 20 more 步进；嵌套子代理只显顶层（折叠计数）；③**侧板目录 tab UI**——Running/Ended 两段 + 空态文案（"No running subagents"）+ 行（状态徽标 + 标题 + 相对时间 + 结果一行预览，ZCode subagentDirectory 构图）。

**背景（取证）：** pi-subagents 0.68.0 docs（extension-api.md:96 in-process RPC / observability.md async 工件 `<tmpdir>/pi-subagents-<scope>/async-subagent-runs/<id>/status.json`）；ZCode bundle `subagentDirectory.*` 全键表（构图与文案校准）；操作者三帧（z17-subagent-card/-dir/-chat）。PiCode host 自带 inline extension（gate-extension 同管道）可订阅 pi.events。范围外：对话 tab（票 99）、停止（票 101）、agent 定义管理、resume、嵌套展开。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1 表驱动：目录投影纯模型（会话记录重放 + 工件合并、状态映射表全行、Show 20 more、嵌套折叠计数、重开会话重建）
- [ ] **additive 报备**：桥接事件/DTO 进 host-contract smoke（含旧载荷兼容）
- [ ] electron smoke：种子会话目录渲染（Running/Ended 两段 + 徽标 + 步进）+ live 工件驱动的状态更新 + 重开重建
- [ ] 前台子代理在父会话聊天流的既有工具卡零回归
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）；全英文文案（Subagents / Running / Ended / No running subagents / Show 20 more）
