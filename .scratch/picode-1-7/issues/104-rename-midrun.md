# 104: 运行中重命名会话——移除 settled 守卫（TUI parity）

**What to build:** agent 运行中重命名会话**直接成功**（TUI `/name` 运行中可用的 parity）——不再报 `session_command_error` toast；改名成功后 `session_renamed` + 侧栏索引刷新照旧。

**背景（取证）：** `host/index.ts` handleRename 开头 `requireSettledSession()` 守卫——运行中被拒发错误 toast（操作者截图 pi17 图1 = 右下角 toast 现场）；TUI 的 `/name` 在 agent 运行时可用 = SDK `setSessionName` 支持运行中改名。移除守卫即修复；改名其余链路（session_renamed 事件/索引刷新/⌘R 语义）零改动。

**Blocked by:** 100（queue 修缮——同 host/index.ts 文件，弱邻接转显式串行）.

**Status:** ready-for-agent

## Acceptance

- [ ] electron smoke：agentRunning 中重命名 → 成功（无错误 toast），侧栏标题即时更新；落定态重命名不回归
- [ ] host-contract smoke：set_session_label 运行中路径通过
- [ ] vitest / typecheck 全绿；跑 dev app / smoke 前 `ps` 自查（dev-app serialization）
