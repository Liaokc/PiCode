# 126: MCP 状态条边框分离——设置窗间距修缮

**What to build:** 设置窗 MCP 节的状态提示条（`.settings-mcp-status-line`，如「The focused session's adapter has not reported MCP status yet.」）与下方 Global servers 白卡的**边框分离**——增加间距或调整层级（纯 CSS，票内裁量；与 Skills/Packages 节同类元素的间距节奏对齐）。状态条自身语义零改动（票 96 的诚实降级投影）。

**背景（取证）：** 操作者图2：灰色状态条紧贴 Global servers 卡、边框重叠（「我不喜欢变框重叠，请修复」）。`app.css:8216` `.settings-mcp-status-line` 与卡片容器间距缺失。

**Blocked by:** 无（独立微票）.

**Status:** ready-for-agent

## Acceptance

- [ ] visual harness：MCP 节帧——状态条与两卡（Global/Project）边框零重叠
- [ ] 状态条显隐两态（有快照/无快照）布局均不破；Skills/Packages 节不回归
- [ ] typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

## Comments

- 2026-09-22 (requirements intake)：P19 定稿为 R16。票 89/96 交付物视觉缺陷，纯 CSS。
