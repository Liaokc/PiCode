# Run Pi's SDK in a child process, bridged to Electron over IPC

PiCode's kernel uses Pi's in-process Node SDK (`createAgentSession`) but **forks it into a separate child process**, bridging structured events to the Electron main process over IPC, rather than (a) running the SDK inside the Electron main process, (b) using the raw `--mode rpc` stdio subprocess, or (c) the remote Unix-socket `PiClient`/`RemoteSession` control surface.

Why: the SDK is the official external-integration entry point with full typed `AgentSessionEvent` contracts (`message_update`/`text_delta`, `tool_execution_start/update/end`) — the lowest-cost, most stable surface for a streaming UI. But it runs in-process (verified: `AgentSession` spawns no subprocess), so embedding it directly in the Electron main process denies process isolation; forking it gives a ZCode-like "harness in a separate process" shape without the schedule cost of adapting RPC's flat JSONL dialect. Raw `--mode rpc` is the fallback if SDK child-process isolation proves fragile; the socket control surface is a later phase (multi-frontend on one agent server).

Status: accepted

Constraints: Pi is consumed **read-only**. The installed `@earendil-works/pi-coding-agent` and its `~/.pi/agent` config are never modified or patched; PiCode only imports the package's public, exported SDK/RPC surfaces. The child-process host is the only boundary — it talks to the SDK in-process inside its own fork and crosses IPC as plain JSON.

Consequences: the main process owns the child-process lifecycle (spawn, clean kill, orphan cleanup); events cross a serialization boundary, so payloads crossing IPC are plain JSON, not shared class instances. Per-tool-call approval is implemented on top of the SDK's public extension events (`tool_call` + `ToolCallEventResult`, and a bridged `ExtensionUIContext.confirm`), which are official exported APIs — no install modification required.
