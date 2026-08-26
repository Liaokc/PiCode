# 01: Drive the real Pi SDK through a child-process host and observe streamed text + a tool execution

**What to build:** a child-process agent host that runs Pi's in-process SDK (`createAgentSession`) in a forked process and emits structured events over its contract. A headless driver proves, end to end: start the host, open a session, send a prompt, and observe at least one streamed text delta (`message_update`/`text_delta`) and at least one tool-execution lifecycle (`tool_execution_start/update/end`) crossing the boundary. Also settles the approval-channel question that gates the whole tool UX.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Child-process host boots the real Pi SDK in a separate process using the machine's configured provider/model.
- [x] A prompt sent through the host yields ≥1 streamed text-delta event observed by a client outside the host.
- [x] The same run yields ≥1 tool-execution event sequence (start → update/end) observed by the client.
- [x] Child-process fork + event round-trip completes without blocking, and the host shuts down cleanly with no orphan process.
- [x] A record of the approval-channel investigation: whether any viable per-execution allow/deny or interception channel exists (tool events + abort, or an extension-UI confirm path). If yes, a spec-amendment note for inserting an approval gate is attached; if no, the "show, don't intercept" default stands.

<!--
  ✅ Phase 0 — DONE (2026-08-25). Implementation in `phase0/`; full record in `phase0/FINDINGS.md`.

  Verdict: ALL GREEN against the real SDK + real endpoint (bella-8000 / deepseek-ai-DeepSeek-V4-Flash-0731).
  - 258 streamed `text_delta` observed; 2 `bash` tool lifecycles (start→update→end(ok)) observed across the fork boundary.
  - Clean shutdown (exit 0), no orphan process. Reproduce: `cd phase0 && node src/driver.ts`.

  Approval-channel conclusion: a per-execution interception channel IS viable →
  amend the spec to insert an approval gate before Phase 2 ("show, don't intercept"
  is no longer forced).
  - Interception gate exists independently of any UI: extension `tool_call` event +
    `ToolCallEventResult.block` (mode-agnostic, works in SDK and RPC).
  - Human confirm() viable: native in RPC mode (extension_ui_request/response sub-protocol);
    in SDK child-process mode via a bridged custom `ExtensionUIContext`
    (`AgentSession.bindExtensions({ uiContext, mode })`).
  - `session.abort()` + `ctx.signal` cover abort.
-->

