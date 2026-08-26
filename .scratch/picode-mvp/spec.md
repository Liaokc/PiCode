# PiCode MVP

Status: ready-for-agent

## Problem Statement

Pi Agent (the `pi` coding-agent CLI) is a terminal UI: powerful, but only usable inside a terminal, with no visual session tree, no streamed file diff, and no way to follow a long agentic turn at a glance. The user wants a **local desktop GUI** that feels like ZCode — streaming LLM output, visible tool executions, a session sidebar — but driven by Pi as the kernel, not by wrapping ZCode.

## Solution

PiCode is a local Electron desktop app that drives Pi Agent as its kernel. The user opens a working directory, talks to Pi in a chat-like panel, watches the model's response stream in live (markdown-rendered) along with every tool it runs (bash, edit, write, grep, …) as collapseable cards, and manages sessions (new / resume / fork / history tree) from a sidebar. Model/provider and thinking level are switchable from a settings panel. The app binds one active session per window; history is browseable as a tree.

## User Stories

1. [x] As a developer, I want to launch PiCode and pick a working directory, so that Pi runs in the project I care about.
2. [x] As a developer, I want to type a prompt and see Pi's answer stream in live, word by word, so that I can react while it thinks rather than waiting for a finished wall of text.
3. [x] As a developer, I want the assistant's streamed markdown to render (headings, code blocks, lists), so that the answer is readable, not raw text.
4. [x] As a developer, I want to see every tool Pi is running as a collapseable card (name + arguments + live status), so that I can follow what the agent is doing.
5. [x] As a developer, I want a tool card to show a terminal state (running / done / errored), so that I know whether a step succeeded.
6. [x] As a developer, I want to approve or deny each tool Pi wants to run before it executes, so that I keep control over what the agent is allowed to do to my project.
7. [x] As a developer, I want a denied tool to be blocked (and optionally tell Pi why), so that the agent adjusts rather than making the change anyway.
8. [x] As a developer, I want my allow/deny choice recallable, with an option to save a default for that tool, so that I do not have to re-approve the same safe tool every turn.
9. [x] As a developer, I want to abort Pi's current turn or a running tool, so that I can stop runaway work without killing the app.
10. [x] As a developer, I want to see which files Pi changed and a lightweight diff of those changes, so that I can review what the agent did.
11. [x] As a developer, I want a session sidebar listing my past sessions, so that I can resume where I left off.
12. [x] As a developer, I want to fork a past session into a new branch of work, so that I can explore an alternative without losing the original.
13. [x] As a developer, I want to start a fresh session in the same directory, so that I can ask an unrelated question without polluting current context.
14. [x] As a developer, I want a history tree view of my sessions, so that I can see how branches of work relate to each other.
15. [x] As a developer, I want to switch model / provider and thinking level from a settings panel, so that I can tune cost and reasoning depth.
16. [x] As a developer, I want to see the current model, provider, and thinking level in the UI, so that I know what I'm talking to.
17. [x] As a developer, I want progress/status feedback when Pi is starting up or busy, so that I know the app hasn't hung.
18. [x] As a developer, I want errors from Pi (tool failures, model errors, provider issues) surfaced clearly in the UI, so that I can diagnose and recover.
19. [x] As a developer, I want the app to shut down Pi's child process cleanly when I quit, so that no orphan processes are left behind.
20. [x] As a developer, I want to see the trust/approval posture (how Pi loads project-local resources) in the UI and settings, so that I understand and can control what Pi ingests.
21. [x] As a developer, I want the transcript of the current session (user + assistant + tool turns) to be coherent and scrollable, so that I can refer back to what was asked and done.

> **Spec ↔ implementation closeout (2026-08-25):** all 21 User Stories checked
> against `src/` + `scripts/` (typecheck, `vitest` 42/42, `electron-vite build`,
> and the real-SDK smokes/e2e all green; installed Pi agent untouched). Full
> record, including the two deviations opened (D1 record-only, D2 busy-drop
> feedback), in `closeout.md`. New ticket `08` tracks D2.

## Implementation Decisions

- **Shell**: Electron + React + Vite, TypeScript throughout. Single-window app binding one active session.
- **Kernel topology (ADR-0002)**: Pi's in-process Node SDK (`createAgentSession`) runs in a **forked child process**; the Electron main process owns the child lifecycle and bridges structured events to the renderer over IPC (via `contextBridge`/preload). Fallback: raw `--mode rpc` subprocess. Remote Unix-socket control (`PiClient`/`RemoteSession`) is out of scope for MVP.
- **One test seam** (highest seam): the **agent-host message contract** — the typed set of commands (submit prompt, abort, new/fork/resume/session, set model/thinking) flowing in and events (text delta, tool execution start/update/end, session/model state, error) flowing out across the child-process boundary. All user-visible behaviour is reducible to this contract; the renderer consumes a normalized transcript/state derived from it. Tests drive the contract: integration tests run the real SDK host as a black box; unit tests drive the UI-side state with a fake host emitting fixtures.
- **Session truth source**: Pi's own JSONL files under `~/.pi/agent/sessions/` are consumed read-only; PiCode builds a derived index for the sidebar/fork list. No copying of session data.
- **Working-directory model**: one directory bound as the session scope on launch; new session = new fork in the same scope; switching directory re-binds Pi.
- **MVP is single-active-session**; the sidebar renders history as a tree. Concurrent multi-session panes are out of scope.
- **Tool-approval model (amended, Phase 0^)**: PiCode includes a **per-execution approval gate**. Before Pi runs a tool, PiCode surfaces an allow/deny choice in the renderer and gates the execution. Implemented on the SDK's public extension surface: a `tool_call` handler may `block`/terminate or patch args, and `ctx.ui.confirm()` is bridged to the renderer via a custom `ExtensionUIContext` supplied through `bindExtensions` (ADR-0002). Denials can carry a reason so Pi adjusts. Choices are per-choice with an optional saved default. PiCode consumes Pi **read-only** (no modification to the installed package or `~/.pi/agent` config).

> **^ Phase 0 resolution (2026-08-25, ticket `01`):** a viable per-execution
> interception/approval channel **exists** (extension `tool_call` +
> `ToolCallEventResult.block`, plus a bridged `ctx.ui.confirm()`), using only
> public, exported SDK APIs — no install modification. Detail in
> `phase0/FINDINGS.md`. This amends the earlier "show, don't intercept" default.

## Testing Decisions

- A good test asserts **external behaviour through the agent-host contract**, not implementation details of the renderer or Electron internals.
- **Tested seams**:
  - The **agent host** (child process) against the real Pi SDK — the Phase 0 feasibility harness doubles as the integration seam: drive `createAgentSession`, assert we observe ≥1 text-delta event and ≥1 `tool_execution_*` event, and that child-process fork + IPC round-trips without blocking and cleans up on exit.
  - The **UI-side state reducer / transcript model** against a fake host fixture — assert that a sequence of contract events (text deltas, tool start→done, session switch, model change, error) reduces to the intended UI state (streamed text, tool card lifecycle, sidebar tree, status).
- **Prior art**: none exists yet (greenfield); the reducer-over-event-contract pattern mirrors the SDK's own `subscribe((event) => …)` model.

## Out of Scope

- Native terminal panel; real-time character-level diff overlay; concurrent multi-session panes; remote/socket multi-client control; packaging, signing, auto-update, cross-platform distribution.
- PiCode editing Pi's own settings/auth files — that stays with the `pi` CLI / `.pi` config (and Pi is consumed read-only).

## Further Notes

- **Phase 0 resolved (2026-08-25).** Ticket `01` proved clean external driving (≥1 streamed text + ≥1 tool event through the child-process host), stable SDK child-process isolation, and a **viable per-execution approval channel**. The approval gate is now part of the MVP (see Implementation Decisions, Tool-approval model). Detail in `phase0/FINDINGS.md`.
- **Pi is consumed read-only.** The installed Pi package and `~/.pi/agent` config are never modified; PiCode uses only public, exported SDK/RPC surfaces.
- Session data lives under Pi's own `~/.pi/agent/sessions/`; the sidebar is a derived read-only index, so PiCode and the `pi` CLI can coexist on the same sessions.
