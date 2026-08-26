# Drive Pi directly over its RPC/SDK, not by wrapping ZCode

We build PiCode as an Electron shell that drives Pi Agent (the installed `@earendil-works/pi-coding-agent`) through its official RPC mode / Node SDK, instead of swapping a harness into ZCode or embedding ZCode. ZCode's Electron shell and internal harness communicate over a private MessagePort IPC with no SDK/plugin extension point, so any "swap the model/harness" approach is a dead end. Pi officially supports external-process integration via `--mode rpc` (JSONL over stdio) and an in-process Node SDK (`createAgentSession`).

Status: accepted

Consequences: PiCode owns the entire GUI and the Pi process lifecycle itself. Pixel parity with ZCode is not a goal; interaction semantics are. The approval model differs from ZCode: Pi's trust gate governs project-resource loading, not per-tool-call execution, so tool-call UI is visibility-first.
