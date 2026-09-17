# 96: MCP 状态投影——server 行连接状态

**What to build:** MCP 节（票 89）的 server 行增**连接状态投影**：connected / failed / needs-auth / not-connected / disabled（+ toolCount）。实现 = host inline extension 订阅 adapter 的版本化状态快照事件（`MCP_STATUS_EVENT`，pi.events 进程内总线）转发 renderer；按「**聚焦会话的 adapter 快照**」投影——无活跃会话时如实显无数据；**懒启动 server 不因查看状态而连接**（查看零副作用，数据源如实）。**additive 契约增量：host→renderer MCP 状态事件（实施时报备入 host-contract smoke）**。

**背景（取证）：** adapter README「Runtime status snapshots」节——快照含每 server name/status/toolCount/directToolCount/disabled + totalTools/connectedCount，机器可读只读投影；初始快照在初始化对账后发出、更新随状态变化、会话关停时空快照。状态是**会话作用域**运行时数据，配置文件（票 89）是全局面——两者在 UI 上分层如实呈现。

**Blocked by:** 89（MCP 管理节——状态行渲染在配置节内，Q4 拍板拆两票、89 先落）.

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1：状态快照投影纯模型（七态映射 / 无会话降级 / 懒启动零触发断言）
- [ ] **additive 报备**：状态事件进 host-contract smoke（含旧载荷兼容）
- [ ] electron smoke：有会话时状态行随快照更新（含 needs-auth 徽标）；无会话时如实空态；查看不触发连接
- [ ] OAuth needs-auth 与票 89 的授权流入坑衔接（Authenticate 钮可见性）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
