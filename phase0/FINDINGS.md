# Phase 0 findings: external driving + tool-approval channel

Ticket: `01-drive-real-pi-sdk-through-host.md` (`.scratch/picode-mvp/issues/`)
Date: 2026-08-25
Kernel: `@earendil-works/pi-coding-agent` v0.84.2 (globally installed)

## Result

**All four acceptance criteria are green, against the real SDK + real endpoint**
(machine default `provider=bella-8000`, `model=deepseek-ai-DeepSeek-V4-Flash-0731`).
The Phase 0 tracer bullet holds: the in-process Pi SDK runs in a forked child
process and its streamed text + tool-execution events cross the process boundary
without blocking, with a clean shutdown and no orphan process.

Reproduce: `cd phase0 && node src/driver.ts` (see `phase0/README.md` for setup).

Observed on a real run (`phase0/observed-events.jsonl`):

- 258 streamed `text_delta` events (started `\n\n Let me …`).
- 2 tool executions, both `bash` (driven by an `ls` request), each observed as a
  full lifecycle across the boundary:
  `call_…: start:bash → update → update → end(ok)`.
- Host exited with code 0 after an explicit dispose; `ps` shows no orphan.

## Event surface (verified in the real run)

Out of the SDK's `AgentSessionEvent`, these are the ones PiCode's UI needs and
their exact shapes cross the boundary as plain JSON (`dist/core/extensions/types.d.ts`):

- Streaming text: `message_update` with `assistantMessageEvent.type === "text_delta"`.
- Tool visibility lifecycle: `tool_execution_start` (`toolName`, `args`),
  `tool_execution_update` (`partialResult`), `tool_execution_end` (`isError`).
- Turn/agent framing: `message_start`/`message_end`, `turn_start`/`turn_end`,
  `agent_start`/`agent_end`, `agent_settled`.

## Approval-channel conclusion: **a per-execution interception channel IS viable**

The spec (`spec.md` "Tool-approval model" + Further Notes) defaults to
"show, don't intercept" and gates an allow/deny gate on Phase 0. That gate is now
unlocked: a real, per-execution allow/deny (and argue-mutation / termination)
channel exists and is mode-agnostic.

### 1. Interception gate — `tool_call` extension event (`ToolCallEventResult.block`)

- Registered via `pi.on("tool_call", handler)` (extension API, works in SDK and
  RPC modes alike — it is the extension event bus, not a TUI/RPC feature).
- Fires **before** the tool executes and **can block** (docs: "Fired before a
  tool executes. Can block.").
- `ToolCallEventResult`: `{ block?: boolean; reason?: string; terminate?: boolean }`.
  Returns/throws from the handler to approve or deny. `event.input` is mutable →
  arguments can even be patched before execution.
- This is the direct per-execution gate the ticket asks about. It works without
  any terminal/UI.

### 2. Human confirmation — `ctx.ui.confirm()`

- `ExtensionUIContext.confirm(title, message)` returns `Promise<boolean>`.
- In **RPC mode**: fully functional — translated into an `extension_ui_request`
  / `extension_ui_response` sub-protocol on stdio (`docs/rpc.md` "Extension UI
  Protocol"); `ctx.hasUI` is `true`. The consuming host answers the confirm.
- In **SDK-in-child-process mode** (our ADR-0002 route): `AgentSession` defaults
  `_extensionMode = "print"` with an empty UI context, so `hasUI` is `false`
  and `confirm()` is a no-op **unless** the integrator supplies a UI context.
  However `AgentSession.bindExtensions({ uiContext, mode })` is a public method
  (`dist/core/agent-session.d.ts`), so PiCode can inject a custom
  `ExtensionUIContext` implementation that bridges `confirm()` back to the
  Electron main/renderer. Same pattern is how the official TUI/RPC provide it.

### 3. Abort

- `session.abort(): Promise<void>` aborts the current turn; `ctx.signal`
  (`AbortSignal`) is available to extension handlers for abort-aware nested work.

### Recommendation → spec amendment before Phase 2

Both the interception gate (no UI needed) **and** a human-confirm path (needs a
bridged `ExtensionUIContext` in SDK mode, or is native in RPC mode) are
feasible. **We should insert an approval gate before Phase 2** rather than keep
"show, don't intercept" — the channel is proven, so the MVP's no-gate default is
no longer forced. Concretely: use the `tool_call` event as the throttle point and
bridge `confirm()` via a custom `ExtensionUIContext` (SDK route) to surface an
allow/deny choice in the renderer, defaulting to deny or a saved decision.

Note: Pi's own `trust` gate is unrelated — it governs project-resource *loading*,
not per-tool-call execution (ADR-0001/0002). The approval gate here is on top of,
and separate from, trust.
