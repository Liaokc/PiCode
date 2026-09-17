# 89: MCP 管理节——设置窗配置面（双卡/启停/增改删/OAuth）

**What to build:** 设置窗新增 **MCP 节**（Skills/Packages 同级），端到端：①**全局卡/项目卡**（Skills 双卡同款）——server 列表读 adapter 的多层配置（user-global shared → Pi 全局覆盖 → 项目 .mcp.json → Pi 项目覆盖），来源徽标 + 有效配置合并视图（胜出来源可见）；②**启停** per server（写 `.pi/mcp.json` 的 disabled 标志 = adapter `/mcp enable|disable` 同语义）；③**增改删 server**（写入目标 = adapter `/mcp setup` 的两个正规目标：项目 `.mcp.json` / 用户全局共享配置 `~/.config/mcp/mcp.json`）；④**OAuth 授权流**——server 行 Authenticate → host 经 adapter 起流 → 系统浏览器打开 → localhost 回调自动完成；**手动粘贴回调 URL 兜底输入**（网关场景）；⑤每层打开配置文件入口；needs-auth 状态徽标（状态数据本身是票 96）。红线：**OAuth 凭据全在 adapter/系统钥匙串，PiCode 零凭据读写**；外部 host 工具配置（Cursor/Claude 等）= 只读兼容发现、绝不写。

**背景（取证）：** 1.5 Q1「MCP 管理出局」裁决重开（前提变化实证：usage.md Design Principles =「不内建、可装包」；操作者已装 pi-mcp-adapter 2.34.0 全局 Pi 包——`~/.pi/agent/settings.json` packages 在册；TUI `/mcp` 全管理面板在案）；操作者机器当前**零 MCP 配置文件**（空态如实 = 首用户形态，Packages 节先例）。适配器配置语义全录 `../intake-grilling.md` R3/R4 节。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Acceptance

- [ ] Seam-1 表驱动：多层配置解析/合并（优先级序 + 胜出来源标注）与写入目标解析（增改删 → 正确层文件）全表；空态如实
- [ ] electron smoke：双卡渲染 + 来源徽标；启停写 `.pi/mcp.json` disabled 标志（文件断言）；增/改/删 server 落盘正确层；打开配置文件入口
- [ ] OAuth 流：Authenticate 触发 host 桥接 → 浏览器打开（shell 外部打开断言）→ 回调自动完成路径（mock/记录）+ 手动粘贴兜底输入可用；**凭据零落 PiCode** 断言
- [ ] 外部 host 配置文件零写入断言
- [ ] 安全文案沿用 Pi 官方口吻（packages run with full system access 族）
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
