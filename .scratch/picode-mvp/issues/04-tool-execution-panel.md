# 04: Tool execution panel

**What to build:** make every tool Pi runs visible. Tool-execution lifecycle events are rendered as collapseable cards showing the tool name, its arguments, and a live status (running → done / errored), with the ability to abort a running tool or the current turn. This completes the "watch an agentic turn" story: input, streamed output, and the tools it ran all visible. It sits on top of the approval gate (03): cards render the executions that happen after approval.

**Blocked by:** 03 — Per-execution tool approval gate.

**Status:** resolved

- [x] Each tool Pi starts appears as a card with its name and arguments.
- [x] A card reflects lifecycle state: running, done, or errored, updating live from the event stream.
- [x] Cards are collapseable to keep long turns tidy.
- [x] The user can abort a running tool and abort the current turn from the UI.
- [x] Tool errors surface on the card rather than silently disappearing.
