# 112: pi agent 0.86.1 升级适配——SDK 对齐检查点

**What to build:** 内嵌 SDK 从 **0.85.1 升级到 0.86.1**（ADR-0005 对齐检查点——TUI 全局 pi 已实测 0.86.1，首次漂移；0.86.1 = Meta Muse provider + 启动提速 + /bug·剪贴板修复，零新增 breaking，0.86.0 的 breaking 分析原样适用）：①升级依赖并修复 typecheck 实证的一切签名/类型断点；②**会话格式兼容冒烟**——TUI 0.86 写的会话（含新 entry 类型：`before_agent_start` 持久化、`pi.bug-report` 等）在 PiCode 能打开、转录投影对未知/新 entry 类型**优雅降级**（不崩、不丢既有条目）；③changelog 影响面适配（0.86.0 三条 breaking 交叉核对均不命中 + 0.86.1 零 breaking，以 typecheck/回归实证收口）；④全量回归绿（vitest / host-contract smoke / electron smoke）。

**背景（取证，intake 交叉核对 0.86.0/0.86.1 changelog × PiCode 集成面）：** 0.86.0 三条 breaking **均不命中**（0.86.1 无新增 breaking——仅 provider 增补/启动提速/修复）——①pi-ai `Context`→`TranscriptContext` 是自定义 provider 流 API（PiCode 零自定义 provider，直通 SDK 内建流）；②`ToolCall.arguments`/`ToolResultMessage.details` 收紧为 JSON 兼容值（PiCode 消费的 details.diff/images/async 信息本就是 JSON 值——收紧不破坏读取）；③`user_bash` fail-closed（PiCode/gate-extension 不用 user_bash）。用面签名全在位（createAgentSessionServices/FromServices/Runtime、SessionManager.open/create、steer/followUp/clearQueue/setSessionName、queue_update 事件形态不变）。可选项：`pi.on()` 现返回退订函数（gate-extension 可选采纳，不强制）。相关新行为：strict-prefer JSON sampling 默认化、per-model compaction overrides——投影/门行为无依赖，回归验证收口。

**Blocked by:** None (can start immediately，但宜在 110/111 之后跑全量回归以一次收口).

**Status:** ready-for-agent

## Acceptance

- [ ] package.json 内嵌 SDK 升 0.86.0；typecheck 双 tsconfig 实证三条 breaking 不命中（或命中即修）
- [ ] **会话格式兼容冒烟**：TUI 0.86 写的会话（含新 entry 类型）在 PiCode 打开——既有条目完整、新类型优雅降级（parse 不抛、不丢条目）；用 TUI 真建一个含 /bug 或 before_agent_start 持久化的会话做种子
- [ ] ADR-0005 例行：TUI↔内嵌 SDK 版本对齐记录入票（0.86.1 = 0.86.1，无漂移收口）
- [ ] 全量回归：vitest / host-contract smoke（4 个 additive 增量仍在）/ electron smoke 全绿
- [ ] 跑 dev app / smoke 前 `ps` 自查（dev-app serialization）

- 2026-09-20 (intake 同步)：TUI `pi update` 后实测 **0.86.1**（0.86.1 = Meta Muse provider/启动提速/修复——零新增 breaking；0.86.0 分析原样适用）；票目标版本 0.86.0 → **0.86.1**。`pi update` 跳过扩展（--extensions 另行）——票 111 的 pi-subagents 0.70.0 基准不受影响。
