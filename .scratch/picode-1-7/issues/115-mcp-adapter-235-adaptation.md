# 115: pi-mcp-adapter 2.35.0 适配——消费面重验

**What to build:** pi-mcp-adapter 已更新 **2.34.0 → 2.35.0**（本机 09-21 就位）。在 2.35.0 上**重验 89/96/110 的全部消费面**：①状态快照事件（`MCP_STATUS_EVENT` 形状：servers[].name/status/toolCount/disabled + totalTools/connectedCount）实测对照 96 的投影消费；②写入语义实测（disabled 旗标写 `.pi/mcp.json`、增改删写 setup 目标层——2.35 的 config 写入改为 symlink 原子替换，验证文件落点/内容不漂移）；③OAuth 流实测（浏览器回调 + 手动粘贴兜底——2.35 修复了 OAuth 重连可靠性，属有利变化）；④110 的双端矩阵在 2.35.0 上复跑。**漂移即修、不漂移留档确认**；不新增功能面（2.35 新能力 Jev/MCP Tasks/`/mcp edit`/runtime-only approval 的呈现 = 观察项不立项）。

**背景（取证，intake 交叉核对 2.35.0 changelog × PiCode 消费面）：** 核心消费面**无 breaking**——状态快照（README Runtime status snapshots 节原文在册：六态 + toolCount/directToolCount/disabled + 计数）、配置层级与写目标（「/mcp setup write targets … unchanged」原文在册）、OAuth 回调流（/mcp-auth + localhost callback + 手动粘贴）全在位。2.35 变更 = 新能力 + 修复（CJK 工具搜索、structuredContent 保留、config 写入 symlink 原子替换）+ Pi 0.86 peer 覆盖。

**Blocked by:** 96（MCP 状态投影——重验对象是其交付面）.

**Status:** ready-for-agent

## Acceptance

- [ ] 消费面重验清单留档：状态快照事件形状 / 写目标语义（disabled 旗标 + 增改删落盘层）/ OAuth 流 × 2.35.0 实测（89/96/110 既有 electron smoke 全绿即证）——逐项「确认无漂移」或「漂移 + 修复 sha」
- [ ] 若有漂移：修复 + 注明 2.35.0 对应 CHANGELOG 条目；无漂移：票内明确记录「无漂移」结论
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
