/**
 * Seam-1: the PiCode IPC contract between the renderer and the agent host
 * system (ADR-0003). The renderer's ONLY source of chat/session state is the
 * `HostToParent` event stream delivered through this contract; it never
 * imports the Pi SDK. Contract additions must be additive-only while parallel
 * tickets are in flight (AGENTS.md).
 *
 * Two parties talk here:
 * - `ParentToHost`: renderer commands, relayed by the main process. A command
 *   may be consumed by the supervisor (`create_session`, `resume_session`) or
 *   by the host process itself (`prompt`, `abort_turn`, tree commands).
 * - `HostToParent`: events towards the renderer. Most are emitted by the host
 *   process; `host_exit` is synthesized by the supervisor when the host
 *   process dies. One host process instance backs exactly one session.
 *
 * Every member must stay JSON-serializable (it crosses process IPC).
 */
import type { SessionTreePayload, TranscriptItem } from './sessions/types.ts'

/** Renderer → agent host system. */
export type ParentToHost =
  /** Spawn a host process and create a Session working in `cwd`. */
  | { type: 'create_session'; cwd: string }
  /** Send the current turn's user message to the active session. */
  | { type: 'prompt'; text: string }
  /** Abort the in-flight agent turn; the session stays usable. */
  | { type: 'abort_turn' }
  /** Spawn a host process that reopens an existing session file (Handoff). */
  | { type: 'resume_session'; sessionFile: string; cwd: string }
  /** In-place tree navigation: move the leaf to an earlier entry, same file. */
  | { type: 'navigate_tree'; entryId: string }
  /** Fork: extract the path root→entry into a NEW session file. */
  | { type: 'fork_session'; entryId: string }
  /** Rename the active session (write-back as a Pi session_info entry). */
  | { type: 'set_session_label'; name: string }
  /** Ask the host to (re-)send the session tree payload. */
  | { type: 'request_tree' }

/** Supervisor → host process lifecycle control (never sent by the renderer). */
export type HostControlCommand = { type: 'shutdown' }

/** Agent host system → renderer. Applied in arrival order by the chat reducer. */
export type HostToParent =
  /** A host process created the session; any previous session is replaced. */
  | {
      type: 'session_created'
      sessionId: string
      cwd: string
      model: string | null
      /** Absolute session file when known (always for resumes). */
      sessionFile?: string | null
      /** Current session label at open time. */
      name?: string | null
      /** True when the host reopened an existing session file. */
      resumed?: boolean
    }
  /** Session creation failed in the host process (which then exits). */
  | { type: 'session_error'; message: string }
  /** Replay of an existing session's transcript (resume / tree navigation). */
  | { type: 'history_loaded'; items: TranscriptItem[] }
  /** The session's entry tree (resume, navigation, rename, request_tree). */
  | { type: 'session_tree'; tree: SessionTreePayload }
  /** The active session's label was written back successfully. */
  | { type: 'session_renamed'; name: string | null }
  /** A fork extracted a new session file; resume it to continue there. */
  | { type: 'fork_created'; sessionFile: string; cwd: string }
  /** A session command (navigate/fork/rename) failed; session stays usable. */
  | { type: 'session_command_error'; message: string }
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
