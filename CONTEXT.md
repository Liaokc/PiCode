# PiCode

A local desktop GUI for the Pi coding agent. Pi Agent is the execution kernel; PiCode is an Electron shell that mimics ZCode's interaction logic (streaming output, tool-call visibility, session tree). PiCode does not wrap or embed ZCode; it drives Pi directly via its official RPC/SDK protocol.

## Language

**Pi Agent (Pi)**:
The coding-agent CLI (`@earendil-works/pi-coding-agent`) that PiCode wraps. It is the kernel: it runs the model, executes tools, and owns the session. It is a TUI in `interactive` mode, and an event-streaming daemon in `--mode rpc`.
_Avoid_: kernel, agent

**PiCode**:
This project's Electron desktop app. It provides the GUI shell, drives Pi through RPC/SDK, and renders Pi's events as a ZCode-like interface.
_Avoid_: ZCode, the GUI

**RPC mode**:
Pi's non-interactive `--mode rpc` subprocess protocol: JSON commands on stdin, JSONL events on stdout. It is the external-integration surface PiCode targets first.
_Avoid_: the protocol, pipe mode

**Session**:
A Pi conversational transcript stored as a JSONL file with a tree structure (`id`/`parentId`). PiCode surfaces sessions in a sidebar and can fork/resume them.
_Avoid_: conversation, chat

**Tool execution**:
A single tool running inside Pi (bash, edit, write, grep, …). Pi emits `tool_execution_start/update/end` events for it. This is a visibility unit, not (necessarily) an approval gate.
_Avoid_: tool call card, tool invoke

**Trust**:
Pi's gate for whether project-local resources (`.pi/settings.json`, extensions, skills) are loaded into the session. It is an input-loading guard, not a per-tool-call allow/deny. RPC mode never prompts; a saved/global decision is followed silently.
_Avoid_: permission, approval

**Streaming output**:
The incremental rendering of the assistant's response text (text deltas) and file edits as they arrive from Pi.
_Avoid_: live text, chat stream

## Decisions

- **Pi is consumed read-only.** The installed Pi Agent package (`@earendil-works/pi-coding-agent`) and its `~/.pi/agent` config must never be modified or patched. PiCode only imports Pi's public, exported SDK/RPC surfaces and reads its config/session files; any capability that would require editing the install is off the table.
- Electron + React + Vite shell, written in TypeScript throughout.
- Pi kernel runs in a **child process** (SDK `createAgentSession` forked into a separate process); Electron IPC bridges structured events to the renderer. Fallback: raw `--mode rpc` subprocess. Remote-socket control (`PiClient`/`RemoteSession`) is a later evolutionary direction, not MVP.
- **Session truth source** is Pi's own JSONL files (`~/.pi/agent/sessions/`), consumed read-only; PiCode maintains a derived index for the sidebar, never copying session data.
- **Working-directory model**: PiCode binds one working directory as the session scope on launch (mirrors ZCode's "open a project"); new session = new fork in the same scope; switching directory re-binds Pi.
- **Single active session** in the MVP sidebar; history rendered as a tree. Concurrent multi-session panes are a Phase 3 candidate, not MVP.
- Interaction semantics borrow from ZCode; visuals are self-contained, not a clone of ZCode's UI.
- MVP scope = streaming output + tool-execution visibility **plus a per-execution approval gate** (Phase 0 proved a viable interception channel; the "show, don't intercept" default is superseded).
