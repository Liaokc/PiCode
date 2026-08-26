/**
 * Agent-host message contract (shared).
 *
 * This is the typed boundary that separates the Pi SDK child process from the
 * Electron main process (ADR-0002). Everything crossing this boundary is plain,
 * serializable JSON — no shared class instances. It is the single source of
 * truth for the UI: all user-visible behaviour reduces to these events, and the
 * renderer consumes a normalized state derived from them (see chatReduce).
 *
 * Parent→Host are *commands*; Host→Parent are *events* (`event` carries the raw
 * AgentSessionEvent from the SDK, which is already JSON-shaped for the
 * streaming / tool subsets we forward — nothing is dropped, so tool events ride
 * through for the later tool-visibility work).
 *
 * Working directory: bound to the session scope at fork time. The main process
 * passes the chosen directory to the child host as a spawn argument, so no
 * `init` command is needed here — the host boots straight into a session for
 * that directory (`createAgentSession({ cwd })`).
 */
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

/**
 * A per-execution tool-approval request, surfaced by the host before Pi runs a
 * tool. The execution is suspended until the parent (renderer) replies with an
 * `approvalResponse` carrying the same `requestId` (ticket 03).
 */
export interface ApprovalRequest {
  kind: "approvalRequest";
  /** Opaque id correlating the pending execution to the user's later choice. */
  requestId: string;
  /** The tool Pi is about to run (bash / edit / write / …). */
  toolName: string;
  /** The tool's (JSON-serializable) arguments, for the renderer to show. */
  args: Record<string, unknown>;
}

/** The user's allow/deny decision for a previously surfaced ApprovalRequest. */
export interface ApprovalResponse {
  kind: "approvalResponse";
  requestId: string;
  decision: "allow" | "deny";
  /** Optional reason the user gave; a denial with reason reaches Pi so it can adjust. */
  reason?: string;
  /** Persist this decision as the default for the tool, so it isn't re-asked. */
  remember?: boolean;
}

/** A model the settings panel can switch to (drives session.setModel). */
export interface ModelInfo {
  /** `provider/modelId`, the exact ref accepted by set-model. */
  ref: string;
  provider: string;
  id: string;
}

/**
 * Pi's trust posture (ticket 06) — the input-loading gate for project-local
 * resources (`.pi/settings.json`, extensions, skills), surfaced read-only. It is
 * independent of PiCode's own per-tool approval gate. Computed in the child host
 * (its `session.settingsManager`), which is where the SDK lives.
 */
export interface TrustInfo {
  /** settings.json `defaultProjectTrust`: ask / always / never. */
  defaultProjectTrust: "ask" | "always" | "never";
  /** Whether the working directory has trust-requiring project resources. */
  hasTrustResources: boolean;
}

/** Messages the child-process host emits back to the parent. */
export type HostToParent =
  | {
      kind: "ready";
      sessionId: string;
      cwd: string;
      model?: string;
      /** Current thinking level (off/…/max), for the status header (ticket 06). */
      thinking?: string;
      /** Read-only trust posture for the settings panel (ticket 06). */
      trust?: TrustInfo;
    }
  | { kind: "event"; event: AgentSessionEvent }
  /** Emitted once the current prompt has fully finished (incl. retries). */
  | { kind: "done" }
  /** Child confirming it has disposed its session and is exiting cleanly. */
  | { kind: "shutdown"; code: number }
  | { kind: "log"; level: "info" | "warn" | "error"; message: string }
  /** The host is suspending a tool execution pending a user allow/deny. */
  | ApprovalRequest
  /**
   * The host replaced its active session after a new/resume/fork (ticket 05).
   * Carries the new session's identity so the renderer can keep the sidebar
   * active-marker and the header in sync. Fired *after* the new session is live.
   */
  | {
      kind: "session-switched";
      sessionId: string;
      /** Absolute path of the new session file (undefined for in-memory). */
      sessionPath?: string;
      reason: "new" | "resume" | "fork";
      /** Id of the session this one branched from, when known (fork/new-from). */
      parentSessionId?: string;
    }
  /**
   * The host applied a model switch (session.setModel). `model` is the now-active
   * `provider/modelId` for the status header (ticket 06).
   */
  | { kind: "model-changed"; model: string }
  /** The host applied a thinking-level switch (session.setThinkingLevel). */
  | { kind: "thinking-changed"; level: string }
  /** The available, auth-validated models for the settings panel (ticket 06). */
  | { kind: "models"; models: ModelInfo[] };

/** How Pi queues a prompt submitted while a turn is in flight (ADR-0003). */
export type StreamingBehavior = "steer" | "followUp";

/** Commands the parent sends into the child-process host. */
export type ParentToHost =
  | {
      /**
       * Send a prompt. When the host is mid-turn (`streaming`), `streamingBehavior`
       * selects how Pi queues it (ADR-0003, ticket 08):
       * - "steer"    — inject mid-turn: delivered after the current assistant turn's
       *                tool calls, before the next LLM call; does not interrupt.
       * - "followUp" — run after the agent otherwise stops.
       * Omitted when idle (normal send). If streaming and omitted, the SDK throws
       * ("Agent is already processing"), so the renderer supplies it when streaming.
       */
      kind: "prompt";
      text: string;
      streamingBehavior?: StreamingBehavior;
    }
  | { kind: "abort" }
  | { kind: "shutdown" }
  /** Clear Pi's pending steering/follow-up queues (ticket 08, queue panel). */
  | { kind: "clear-queue" }
  /** Resolve a suspended tool execution with the user's allow/deny choice. */
  | ApprovalResponse
  /**
   * Drive the host's session lifecycle (ticket 05):
   * - `new`    — replace the active session with a fresh one in the same scope.
   * - `resume` — re-open `sessionPath` (a historical session) as active.
   * - `fork`   — branch a new session from `forkEntryId` of the active session
   *              (or of `sourcePath` when referencing a historical session); the
   *              source is never mutated.
   */
  | {
      kind: "session-command";
      command: "new" | "resume" | "fork";
      /** resume / fork-of-historical: the JSONL file to switch to first. */
      sessionPath?: string;
      /** fork: the entry id within the (possibly switched-to) session to branch from. */
      forkEntryId?: string;
    }
  /**
   * Switch the active session's model. `modelRef` is `"provider/modelId"`; the
   * host resolves it against the SDK model runtime and applies it via the public
   * `session.setModel()` API (ticket 06).
   */
  | { kind: "set-model"; modelRef: string }
  /** Switch the active session's thinking level (session.setThinkingLevel). */
  | { kind: "set-thinking"; level: string }
  /** Request the available, auth-validated models for the settings panel. */
  | { kind: "list-models" };
