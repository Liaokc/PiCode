# 03: Per-execution tool approval gate

**What to build:** give the user control over what Pi runs. Before Pi executes a tool, PiCode surfaces an allow / deny choice in the renderer and gates the execution: a denied tool is blocked (with an optional reason that Pi can act on), an approved tool runs. The choice is recallable per tool and can be saved as a default, so safe tools don't re-prompt every turn.

This is built on Pi's **public, exported SDK extension surface only** (Pi is consumed read-only — no modification to the installed package or `~/.pi/agent` config): a `tool_call` handler that may block/terminate or patch arguments, with `ctx.ui.confirm()` bridged to the renderer via a custom `ExtensionUIContext` supplied through `bindExtensions` (per ADR-0002 and `phase0/FINDINGS.md`).

**Blocked by:** 02 — Electron shell + host contract + live streaming render.

**Status:** resolved

- [x] When Pi is about to run a tool, the UI surfaces an allow / deny prompt before execution proceeds.
- [x] Approving lets the tool run; denying blocks it, and (when a reason is given) that reason reaches Pi so it can adjust.
- [x] A denied/approved tool does not proceed until the user's choice is received.
- [x] The user can save a default for a tool so repeated safe tools don't re-prompt every turn.
- [x] The gate works in the SDK-in-child-process topology (`tool_call` extension gate) with no change to the installed Pi.
- [x] Round-trips without deadlock: the gated tool proceeds or is blocked correctly, and the UI stays responsive.

## Comments

Implemented and verified (2026-08-25). All six acceptance criteria green.

- The interception point lives in the child host (`src/child/host.ts`) where the SDK `session` is held. A dedicated **inline extension** (injected via the public `DefaultResourceLoader` `extensionFactories` option) registers a `pi.on("tool_call", handler)` on the SDK extension event bus; the SDK invokes it **before** a tool executes. When a tool needs confirmation, the gate suspends execution, emits an `approvalRequest` to the parent (renderer), and resumes on the matching `approvalResponse`.
- Seam reuse (no renaming/redesign): the new `approvalRequest` / `approvalResponse` ride the existing `HostToParent` / `ParentToHost` contract, the existing `hostMessage` relay, and a new `approvalResponse` renderer→main IPC channel; `sessionService.respondToApproval` forwards the decision, and `main/index.ts` bridges it.
- `src/shared/approvalGate.ts` is a pure, dependency-injected gate (per-tool default cache, suspend/resolve, `rejectAll` on abort/shutdown so nothing deadlocks) — unit-tested (6 tests). `chatReduce.ts` folds `approvalRequest` into a `pendingApproval` and `approval-resolved` into `resolvedApprovals` (renderer UI state) — driven by the fake-host fixture (4 new reducer tests, 13 total).
- Renderer: `ChatPanel.tsx` renders an allow/deny modal with the tool name, JSON args, an optional deny reason, and a "remember this tool's default" checkbox; `App.tsx` sends the decision via `window.picode.respondToApproval` and folds the local echo.
- Implementation note vs. FINDINGS: I used the **`tool_call` extension gate** (FINDINGS' primary, recommended throttle point) as the interception mechanism rather than a bridged `ExtensionUIContext.confirm`. Both are public, read-only SDK APIs; the `tool_call` gate is the direct per-execution path the acceptance criteria exercise.
- Real-SDK verification, no change to installed Pi (`node_modules/@earendil-works/pi-coding-agent` mtime unchanged):
  - `scripts/smoke-approval.mjs` (new): forks the host, holds the first approval open (proves **suspension** — no tool execution completes while pending), then **allows** it (tool runs to `tool_execution_end isError=false`) and in a second prompt **denies** with a reason (tool blocked to `tool_execution_end isError=true`); clean shutdown, no orphan. **ALL GREEN.**
  - Existing `smoke-host.mjs` and `smoke-session.mjs` updated to answer approvals as allow so the 02 streaming/tool-lifecycle checks remain green — both **ALL GREEN.** `npm run typecheck` (node+web), `npm run build`, and 19 vitest tests all green.
- Cleanup: `tsconfig.node.json` gained `allowImportingTsExtensions` so the value-import of the shared gate resolves under Node 24 type-stripping (the host is forked, never bundled, and the SDK itself uses `.ts`-extension local imports).
