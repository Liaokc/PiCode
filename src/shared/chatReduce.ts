/**
 * UI-side state reducer for the chat panel.
 *
 * This is the spec's highest test seam (see spec.md "One test seam"): all
 * user-visible behaviour reduces to the agent-host contract, and this module is
 * the single pure function that folds `HostToParent` messages (plus the local
 * echo of a submitted prompt) into the UI state the renderer shows. Tests drive
 * it with a fake host fixture — no Electron or React internals involved.
 *
 * The contract events arrive incrementally (the SDK streams `text_delta`s), so
 * this reducer is deliberately a fold: call it once per message, threaded with
 * the previous state, and assistant text grows word-by-word.
 */
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { HostToParent, ModelInfo, TrustInfo } from "./contract";

/** The actions the reducer accepts — host contract messages plus local echoes. */
export type ChatAction =
  | HostToParent
  | { kind: "user-submitted"; text: string }
  /** Renderer-initiated abort of the current turn (echoed locally). */
  | { kind: "user-aborted" }
  /** Local echo once the user resolves a pending tool approval (allow/deny). */
  | {
      kind: "approval-resolved";
      requestId: string;
      toolName: string;
      decision: "allow" | "deny";
    };

export type AppStatus =
  | "idle"
  | "starting"
  | "ready"
  | "streaming"
  | "done"
  | "aborted"
  | "error"
  | "shutdown";

export type ToolStatus = "running" | "done" | "error";

export interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export interface ToolExecution {
  toolCallId: string;
  toolName: string;
  status: ToolStatus;
  /**
   * The tool's (JSON-serializable) arguments, captured verbatim from the
   * `tool_execution_start` event when Pi ships them. Shown on the card when it
   * is expanded. Empty when Pi didn't include args for a tool.
   */
  args: Record<string, unknown>;
  /** Streamed stdout / partial result accumulated live from update events. */
  partialResult: string;
  /** Human-readable failure detail, present only when the tool errored. */
  error?: string;
}

/**
 * A single file Pi changed during the current turn, surfaced for review (ticket
 * 06). Scoped to one turn: reset when a new prompt starts or the session changes.
 */
export type DiffKind = "added" | "modified";

export interface FileChange {
  /** Absolute path of the changed file. */
  path: string;
  /**
   * How the file changed. "added" means Pi wrote a file with no recoverable
   * "before" from the read-only event stream (write tool carries no prior
   * content), so the diff renders the full new content. "modified" means Pi
   * edited an existing file and its lossless unified patch was captured.
   */
  kind: DiffKind;
  /** The lightweight diff text for review (unified patch or full added content). */
  diffText: string;
}

/** A tool execution suspended in the renderer awaiting the user's allow/deny. */
export interface PendingApproval {
  requestId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/** A resolved approval, kept so the UI can reflect the allow/deny outcome. */
export interface ResolvedApproval {
  requestId: string;
  toolName: string;
  decision: "allow" | "deny";
}

/**
 * Pi's pending inject/queue state (ADR-0003, ticket 08). Mirrored read-only from
 * the SDK's `queue_update` events: `steering` are messages queued to inject
 * mid-turn; `followUp` are messages queued to run after the agent stops.
 */
export interface QueueState {
  steering: string[];
  followUp: string[];
}

export interface ChatState {
  status: AppStatus;
  sessionId?: string;
  /** Absolute path of the active session's JSONL file (ticket 05). */
  sessionPath?: string;
  model?: string;
  /** Current thinking level (off/…/max) shown in the status header (ticket 06). */
  thinking?: string;
  /** Available, auth-validated models for the settings panel (ticket 06). */
  models: ModelInfo[];
  /** Pi's read-only trust posture, relayed at boot (ticket 06). */
  trustInfo?: TrustInfo;
  cwd?: string;
  entries: ChatEntry[];
  tools: ToolExecution[];
  /** Files Pi changed in the current turn, for the diff review view (ticket 06). */
  fileChanges: FileChange[];
  /** Pi's pending inject/queue messages (ticket 08, ADR-0003). */
  queue: QueueState;
  error?: string;
  /** True once the user requests an abort of the current turn. */
  abortRequested?: boolean;
  /** The tool currently suspended awaiting an allow/deny (undefined when none). */
  pendingApproval?: PendingApproval;
  /** Recent resolved approvals (most recent last) for UI/mirroring. */
  resolvedApprovals: ResolvedApproval[];
  /** Monotonic id counter so pure reductions yield stable entry ids. */
  nextId: number;
}

export const initialState: ChatState = {
  status: "idle",
  entries: [],
  tools: [],
  fileChanges: [],
  queue: { steering: [], followUp: [] },
  models: [],
  resolvedApprovals: [],
  nextId: 0,
};

export function reduce(state: ChatState, action: ChatAction): ChatState {
  switch (action.kind) {
    case "ready":
      return {
        ...state,
        status: "ready",
        sessionId: action.sessionId,
        cwd: action.cwd,
        model: action.model,
        thinking: action.thinking,
        trustInfo: action.trust,
      };
    case "model-changed":
      // The host switched the active model; keep the header's model in sync.
      return { ...state, model: action.model };
    case "thinking-changed":
      return { ...state, thinking: action.level };
    case "models":
      // The host replied to a list-models request with the switchable models.
      return { ...state, models: action.models };
    case "session-switched":
      // The host replaced its active session (new/resume/fork, ticket 05). A
      // different session is now live, so reset the transcript/tools and point
      // the sidebar's active marker at the new identity.
      return {
        ...state,
        status: "ready",
        sessionId: action.sessionId,
        sessionPath: action.sessionPath,
        cwd: state.cwd,
        entries: [],
        tools: [],
        fileChanges: [],
        queue: { steering: [], followUp: [] },
        pendingApproval: undefined,
        resolvedApprovals: [],
        abortRequested: false,
        error: undefined,
        nextId: 0,
      };
    case "done":
      // If the turn was aborted, surface that rather than a clean "done".
      return { ...state, status: state.abortRequested ? "aborted" : "done" };
    case "shutdown":
      return { ...state, status: "shutdown" };
    case "log":
      return action.level === "error"
        ? { ...state, status: "error", error: action.message }
        : state;
    case "user-submitted":
      return pushEntry(state, { role: "user", text: action.text }, "streaming");
    case "user-aborted":
      return { ...state, abortRequested: true };
    case "approvalRequest":
      // A tool execution is suspended pending the user's decision.
      return {
        ...state,
        status: "streaming",
        pendingApproval: {
          requestId: action.requestId,
          toolName: action.toolName,
          args: action.args,
        },
      };
    case "approval-resolved":
      // The user chose; surface the outcome and clear the pending prompt.
      return {
        ...state,
        pendingApproval:
          state.pendingApproval?.requestId === action.requestId
            ? undefined
            : state.pendingApproval,
        resolvedApprovals: [
          ...state.resolvedApprovals,
          { requestId: action.requestId, toolName: action.toolName, decision: action.decision },
        ],
      };
    case "event":
      return reduceEvent(state, action.event);
    default:
      return state;
  }
}

function reduceEvent(state: ChatState, event: AgentSessionEvent): ChatState {
  switch (event.type) {
    case "message_update": {
      const assistantEvent = event.assistantMessageEvent;
      if (assistantEvent.type === "text_delta") {
        return appendAssistantText(state, assistantEvent.delta ?? "");
      }
      return state;
    }
    case "tool_execution_start": {
      return upsertTool(state, {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: normalizeArgs(event.args),
        status: "running",
        partialResult: "",
      });
    }
    case "queue_update": {
      // Pi's pending inject/queue state changed. The arrays are read-only copies
      // from the SDK event; mirror them into the UI queue panel (ticket 08).
      return {
        ...state,
        queue: { steering: [...event.steering], followUp: [...event.followUp] },
      };
    }
    case "tool_execution_update": {
      return updateTool(state, event.toolCallId, (t) => ({
        ...t,
        partialResult: t.partialResult + (event.partialResult ?? ""),
      }));
    }
    case "tool_execution_end": {
      const next = updateTool(state, event.toolCallId, (t) => ({
        ...t,
        status: event.isError ? "error" : "done",
        // Keep whatever showed the tool into an error state on the card rather
        // than silently dropping it — aligned with `tool_execution_end.isError`.
        error: event.isError ? describeToolError(event) : undefined,
      }));
      // On a successful edit/write, fold the change into the per-turn diff
      // review list (ticket 06). Failed tools don't change files.
      return event.isError ? next : recordFileChange(next, event);
    }
    default:
      return state;
  }
}

function pushEntry(
  state: ChatState,
  entry: Omit<ChatEntry, "id">,
  status: AppStatus,
): ChatState {
  const id = `entry-${state.nextId}`;
  return {
    ...state,
    status,
    entries: [...state.entries, { ...entry, id }],
    // A new turn starts a fresh diff review scope (ticket 06): only files
    // touched by the pending turn should surface, not earlier turns'.
    fileChanges: [],
    abortRequested: false,
    nextId: state.nextId + 1,
  };
}

/** Append a text delta to the active assistant entry, creating one if needed. */
function appendAssistantText(state: ChatState, delta: string): ChatState {
  const entries = [...state.entries];
  const last = entries[entries.length - 1];
  if (last && last.role === "assistant") {
    entries[entries.length - 1] = { ...last, text: last.text + delta };
    return { ...state, status: "streaming", entries };
  }
  const id = `entry-${state.nextId}`;
  entries.push({ id, role: "assistant", text: delta });
  return { ...state, status: "streaming", entries, nextId: state.nextId + 1 };
}

function upsertTool(state: ChatState, card: ToolExecution): ChatState {
  const existing = state.tools.some((t) => t.toolCallId === card.toolCallId);
  return {
    ...state,
    status: "streaming",
    tools: existing
      ? state.tools.map((t) => (t.toolCallId === card.toolCallId ? card : t))
      : [...state.tools, card],
  };
}

function updateTool(
  state: ChatState,
  toolCallId: string,
  fn: (t: ToolExecution) => ToolExecution,
): ChatState {
  return {
    ...state,
    tools: state.tools.map((t) => (t.toolCallId === toolCallId ? fn(t) : t)),
  };
}

/**
 * Normalize the tool's `args` payload into a renderable record. Args arrive as
 * opaque JSON from Pi (`args: any`); guard against null / non-object so a card
 * never crashes rendering a malformed payload.
 */
function normalizeArgs(args: unknown): Record<string, unknown> {
  return args && typeof args === "object" && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {};
}

/** Human-readable reason for a failed tool, derived from the end event. */
function describeToolError(event: AgentSessionEvent): string | undefined {
  if (event.type !== "tool_execution_end") return undefined;
  // `result` varies by tool; prefer keeping the raw shape for display, fall
  // back to a stable label when the SDK shipped nothing useful.
  const result = event.result;
  if (typeof result === "string" && result.trim()) return result.trim();
  if (
    result &&
    typeof result === "object" &&
    "error" in result &&
    typeof (result as { error: unknown }).error === "string"
  ) {
    return (result as { error: string }).error;
  }
  return "工具执行失败";
}

/** Narrowed tool-execution-end event for the file-change derivation helpers. */
type ToolEndEvent = Extract<AgentSessionEvent, { type: "tool_execution_end" }>;

/**
 * Fold a successful edit/write tool execution into the per-turn diff review
 * list. The change is anchored to the current session's active turn — it is
 * reset every prompt (see pushEntry) and on session switch — so files from
 * other turns or sessions are never attributed here.
 *
 * Both edit and write start events carry the target path (+ for write, the new
 * content) in `args`; the tool itself is tracked in `state.tools` keyed by
 * toolCallId, so we look the args up there. All data comes from Pi's own
 * read-only event stream — nothing is read from or written to disk.
 */
function recordFileChange(state: ChatState, event: ToolEndEvent): ChatState {
  const change = deriveFileChange(state, event);
  if (!change) return state;
  return upsertFileChange(state, change);
}

/**
 * Extract a single file change from a *successful* edit/write end event.
 *
 * - edit: Pi ships a lossless unified `patch` on `result.details`; we capture it
 *   verbatim as the diff (kind = modified). The patch is the "after" vs the
 *   real "before" Pi read — the honest source for what this turn changed.
 * - write: Pi emits only the new content in `args` and no "before" (it never
 *   reads the existing file), so per the read-only scope we treat it as a full
 *   addition rendered from `args.content` (kind = added).
 */
function deriveFileChange(
  state: ChatState,
  event: ToolEndEvent,
): FileChange | undefined {
  const tool = state.tools.find((t) => t.toolCallId === event.toolCallId);
  if (!tool) return undefined;
  const args = tool.args;
  const path = typeof args?.path === "string" ? (args.path as string) : undefined;
  if (!path) return undefined;

  if (tool.toolName === "edit") {
    const details = (event.result as unknown as { details?: { patch?: unknown } } | null)
      ?.details;
    const patch = typeof details?.patch === "string" ? (details.patch as string) : "";
    return { path, kind: "modified", diffText: patch };
  }
  if (tool.toolName === "write") {
    const content = typeof args?.content === "string" ? (args.content as string) : "";
    return { path, kind: "added", diffText: content };
  }
  return undefined;
}

/**
 * Add a file change, merging repeated edits to the same path in one turn so the
 * list stays a unique set of changed files. Multiple edits to one file append
 * their patches so no hunk is lost from the review view.
 */
function upsertFileChange(state: ChatState, change: FileChange): ChatState {
  const existingIndex = state.fileChanges.findIndex((f) => f.path === change.path);
  let fileChanges: FileChange[];
  if (existingIndex >= 0) {
    fileChanges = state.fileChanges.map((f, i) =>
      i === existingIndex
        ? { ...f, diffText: f.diffText ? `${f.diffText}\n${change.diffText}` : change.diffText }
        : f,
    );
  } else {
    fileChanges = [...state.fileChanges, change];
  }
  return { ...state, status: "done", fileChanges };
}
