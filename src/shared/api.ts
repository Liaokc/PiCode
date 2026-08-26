/**
 * The renderer-facing API surface, exposed by the preload bridge and consumed
 * by the React UI. Purely a type contract — every member resolves to plain,
 * serializable values across the IPC boundary.
 */
import type { HostToParent, TrustInfo } from "./contract";
import type { SelectDirectoryResult } from "./ipc";
import type { IndexedSession } from "./sessionIndex";

/** Re-exported for renderer convenience: Pi's read-only trust posture. */
export type { TrustInfo };

/** The user's decision for a pending tool approval, as the renderer supplies it. */
export interface ApprovalChoice {
  decision: "allow" | "deny";
  /** Optional reason (only meaningful for a denial — reaches Pi so it can adjust). */
  reason?: string;
  /** Persist this decision as the default for this tool. */
  remember?: boolean;
}

/** A session-lifecycle command the renderer asks the host to run (ticket 05). */
export interface SessionCommand {
  command: "new" | "resume" | "fork";
  /** resume / fork-of-historical: the JSONL file to open first. */
  sessionPath?: string;
  /** fork: the entry id within the session to branch from. */
  forkEntryId?: string;
}

export interface PiCodeApi {
  /** Open a directory picker; resolve with the chosen path or `canceled`. */
  selectDirectory(): Promise<SelectDirectoryResult>;
  /** Fork the agent host scoped to `cwd`. */
  startSession(cwd: string): Promise<{ ok: boolean; reason?: string }>;
  /** Forward a user prompt to the host, with an optional inject/queue mode. */
  submitPrompt(text: string, streamingBehavior?: "steer" | "followUp"): void;
  /** Clear Pi's pending steering/follow-up queues (ticket 08, queue panel). */
  clearQueue(): void;
  /** Abort the current turn. */
  abort(): void;
  /**
   * Resolve a suspended tool approval with the user's allow/deny choice. The
   * `requestId` matches an `approvalRequest` the renderer received from the host.
   */
  respondToApproval(requestId: string, choice: ApprovalChoice): void;
  /** Drive the host's session lifecycle: new / resume / fork (ticket 05). */
  sessionCommand(command: SessionCommand): void;
  /** Switch the active session's model (provider/modelId) via the host (ticket 06). */
  setModel(modelRef: string): void;
  /** Switch the active session's thinking level via the host (ticket 06). */
  setThinking(level: string): void;
  /** Ask the host for its available, auth-validated models (ticket 06). */
  listModels(): void;
  /**
   * Read the derived session index (history tree) for the current scope. The
   * index is derived read-only from Pi's JSONL sessions (see sessionIndex).
   */
  listSessions(): Promise<IndexedSession[]>;
  /**
   * Subscribe to relayed host messages (the incremental event stream). Returns
   * an unsubscribe function.
   */
  onHostMessage(callback: (message: HostToParent) => void): () => void;
}
