# 111: pi-subagents 0.70.0 适配——集成面重验

**What to build:** pi-subagents 已更新 **0.68.0 → 0.70.0**（本机 09-20 就位；0.69.0 09-18 / 0.70.0 09-19 发布）。在 0.70.0 上**重验 90/99/101 的全部集成面**：①RPC 回复形状（`subagents:rpc:v1:*` status/steer/stop 回复、fleetStatus DTO v1、asyncSnapshot）；②async 工件字段消费（status.json：runId/sessionFile/state/tokens/workflowGraph）；③事件（async-started/complete、child-status）；④七态投影实测对照真实运行（起一个真实子代理跑全程）。**漂移即修、不漂移留档确认**；不新增功能面（0.70 新能力 allowedAgents/defaultSubagentOnlyExtensions/typed gates 的呈现 = 观察项不立项）。

**背景（取证）：** 核心集成面文档核对**无 breaking**——RPC 通道/方法面、fleetStatus DTO、工件路径与字段、事件族在 0.70.0 docs 全部在位；0.70 变更 = 新能力 + 修复（detached 子代理可见性、tool_budget_exhausted 报告、usage 对账、FleetView 分组/着色）。但 90/99/101 的实现以 0.68.0 文档为基准且**尚未在 0.70.0 上跑过**——适配验证在合入前完成。

**Blocked by:** 101（子代理停止+徽标——重验对象是其交付面；随其合入后进行）.

**Status:** ready-for-agent

## Acceptance

- [ ] 集成面重验清单留档：RPC 回复形状 / status.json 字段 / 事件 / 七态投影 × 0.70.0 实测（真实子代理运行）——逐项「确认无漂移」或「漂移 + 修复 sha」
- [ ] electron smoke：90/99/101 的既有 stage 在 0.70.0 上全绿
- [ ] 若有漂移：修复 + 注明 0.70.0 的对应 CHANGELOG 条目；无漂移：票内明确记录「无漂移」结论
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
