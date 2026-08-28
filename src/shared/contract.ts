/**
 * Seam-1: the PiCode IPC contract between the renderer and the agent host
 * system (ADR-0003). The renderer's ONLY source of chat/session state is the
 * `HostToParent` event stream delivered through this contract; it never
 * imports the Pi SDK. Contract additions must be additive-only while parallel
 * tickets are in flight (AGENTS.md).
 *
 * Two parties talk here:
 * - `ParentToHost`: renderer commands, relayed by the main process. A command
 *   may be consumed by the supervisor (`create_session`) or by the host
 *   process itself (`prompt`, `abort_turn`).
 * - `HostToParent`: events towards the renderer. Most are emitted by the host
 *   process; `host_exit` is synthesized by the supervisor when the host
 *   process dies. One host process instance backs exactly one session.
 *
 * Every member must stay JSON-serializable (it crosses process IPC).
 */

/** Renderer → agent host system. */
export type ParentToHost =
  /** Spawn a host process and create a Session working in `cwd`. */
  | { type: 'create_session'; cwd: string }
  /** Send the current turn's user message to the active session. */
  | { type: 'prompt'; text: string }
  /** Abort the in-flight agent turn; the session stays usable. */
  | { type: 'abort_turn' }

/** Supervisor → host process lifecycle control (never sent by the renderer). */
export type HostControlCommand = { type: 'shutdown' }

/** Agent host system → renderer. Applied in arrival order by the chat reducer. */
export type HostToParent =
  /** A host process created the session; any previous session is replaced. */
  | { type: 'session_created'; sessionId: string; cwd: string; model: string | null }
  /** Session creation failed in the host process (which then exits). */
  | { type: 'session_error'; message: string }
  /** Echo of a prompt accepted by the host, before the agent starts. */
  | { type: 'user_message'; text: string }
  /** The agent began processing a run (one prompt, possibly many turns). */
  | { type: 'agent_start' }
  /** A new assistant message opened inside the running agent turn. */
  | { type: 'message_start' }
  /** Streaming text increment for the currently open assistant message. */
  | { type: 'text_delta'; delta: string }
  /** The currently open assistant message finished. */
  | { type: 'message_end' }
  /** The agent run finished; streaming state must settle. */
  | { type: 'agent_end' }
  /** The turn failed (model/API/preflight error); partial output is preserved. */
  | { type: 'turn_error'; message: string }
  /** The host process died. `clean` = expected exit (code 0, no crash). */
  | { type: 'host_exit'; clean: boolean; code: number | null; signal: string | null }
