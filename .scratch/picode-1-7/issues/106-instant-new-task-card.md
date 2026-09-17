# 106: 新会话卡片秒出——乐观占位 + 对账

**What to build:** New Task 在新文件夹创建会话时，侧栏**分组与会话卡片立即出现**（ZCode 秒出 parity）：create 派发时 renderer 以已知 cwd **乐观注入占位会话**（registry 合并——现有分组/排序语义生效），`session_created` 到达后用真实 summary 对账替换；boot 失败 = 移除占位 + toast 如实（不留幽灵条目）。占位卡不显未知量（token/时间等不伪装），不冒充已确认会话。索引轮询机制不动。

**背景（取证）：** 现链 = host 冷启动（spawn + SDK + pi-subagents/pi-mcp-adapter 扩展加载）→ `session_created` → 文件落盘 → 索引 2 秒轮询（`index-service.ts:194` setInterval tick，cacheSignature 变化才广播）→ onIndexChanged → 刷新——层层叠加导致卡片迟现。ZCode 秒出 = 自有存储即时写。乐观卡是 renderer 侧的即时路径，与索引 eventual 一致（announce 后对账）。

**Blocked by:** 95（一键折叠分组——同 Sidebar/分组渲染区段串行）.

**Status:** ready-for-agent

## Acceptance

- [ ] electron smoke：新文件夹 New Task → 分组与卡片**立即**出现（占位态）→ session_created 后对账为真实卡片（id/名称就位）
- [ ] boot 失败路径：占位移除 + 错误 toast（无幽灵条目）
- [ ] 既有文件夹建会话同样秒出；排序/分组/拖拽（票 84）与占位卡共存不冲突
- [ ] 占位卡不显示未知量（无假 token/时间）；真实卡片替换后数据完整
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
