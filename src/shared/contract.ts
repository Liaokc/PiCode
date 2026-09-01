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
import type { SessionDefaults } from './preferences.ts'
import type { SessionTreePayload, TranscriptItem } from './sessions/types.ts'

// ---- ticket 05: composer + approval gate shared vocabulary ----

/** Pi thinking levels (mirrors the SDK union; re-declared so the renderer
 * never imports the Pi SDK — Seam-1 guardrail). */
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Access Mode presets (CONTEXT.md): tiers of the PiCode approval gate —
 * NOT Pi project trust, which stays untouched. */
export type AccessMode = 'full-access' | 'standard' | 'read-only'

/** An image attachment sent with a prompt: raw base64 (no data: prefix). */
export interface ImageAttachment {
  mimeType: string
  data: string
}

/** A model as shown in the composer's cascading model menu. */
export interface ModelRef {
  providerId: string
  modelId: string
  name: string
}

/** Provider grouping for the cascading model menu (Pi available models). */
export interface ProviderModels {
  providerId: string
  /** Provider display name (falls back to the provider id). */
  name: string
  models: ModelRef[]
}

/** One row of the composer `/` menu. */
export interface SlashCommandItem {
  name: string
  description: string
  argumentHint?: string
  source: 'prompt' | 'skill' | 'builtin'
}

/** The per-session commands the renderer sends to ONE backing host process
 * (ticket 20): the session-scoped slice of the command vocabulary, targeted
 * through `session_command` so the supervisor can route it by sessionId.
 * The un-targeted legacy members stay for compatibility (they route to the
 * most recently announced session). */
export type SessionCommand = Extract<
  ParentToHost,
  { type: 'prompt' | 'abort_turn' | 'steer_prompt' | 'follow_up_prompt' | 'clear_queue' | 'set_model' | 'set_thinking_level' | 'set_access_mode' | 'approve_tool' | 'deny_tool' | 'compact_session' | 'list_files' | 'navigate_tree' | 'fork_session' | 'set_session_label' | 'request_tree' }
>

/** Renderer → agent host system. */
export type ParentToHost =
  /** Spawn a host process and create a Session working in `cwd`.
   * `defaults` (ticket 11) carries the settings-window's default model and
   * thinking level for NEW sessions; the host applies them before the first
   * announcement. Resumes never receive or apply defaults. */
  | { type: 'create_session'; cwd: string; defaults?: SessionDefaults }
  /** Send the current turn's user message to the active session. */
  | { type: 'prompt'; text: string; images?: ImageAttachment[] }
  /** Abort the in-flight agent turn; the session stays usable. */
  | { type: 'abort_turn' }
  /** Spawn a host process that reopens an existing session file (Handoff). */
  | { type: 'resume_session'; sessionFile: string; cwd: string }
  /** Send one session-scoped command to the host process backing `sessionId`
   * (ticket 20 registry semantics: the target session, not "the" session). */
  | { type: 'session_command'; sessionId: string; command: SessionCommand }
  /** In-place tree navigation: move the leaf to an earlier entry, same file. */
  | { type: 'navigate_tree'; entryId: string }
  /** Fork: extract the path root→entry into a NEW session file. */
  | { type: 'fork_session'; entryId: string }
  /** Rename the active session (write-back as a Pi session_info entry). */
  | { type: 'set_session_label'; name: string }
  /** Ask the host to (re-)send the session tree payload. */
  | { type: 'request_tree' }
  /** Inject the message into the RUNNING turn (explicit Steer choice). */
  | { type: 'steer_prompt'; text: string; images?: ImageAttachment[] }
  /** Queue the message for after the running turn (explicit Follow-up choice). */
  | { type: 'follow_up_prompt'; text: string; images?: ImageAttachment[] }
  /** Empty the steering + follow-up queue. */
  | { type: 'clear_queue' }
  /** Switch the session model (provider→model cascade menu). */
  | { type: 'set_model'; providerId: string; modelId: string }
  /** Switch the session thinking level (composer dropdown). */
  | { type: 'set_thinking_level'; level: ThinkingLevel }
  /** Switch the approval-gate tier via the Access Mode chip. */
  | { type: 'set_access_mode'; mode: AccessMode }
  /** Approve a pending tool call; `remember` adds a same-tool rule to the current preset. */
  | { type: 'approve_tool'; toolCallId: string; remember: boolean }
  /** Deny a pending tool call; the reason is fed back to the agent. */
  | { type: 'deny_tool'; toolCallId: string; reason: string }
  /** Manually compact the session context (`/compact`). */
  | { type: 'compact_session' }
  /** List candidate files under the session cwd for @-mention completion. */
  | { type: 'list_files'; requestId: string; query: string }

/** Supervisor → host process lifecycle control (never sent by the renderer). */
export type HostControlCommand = { type: 'shutdown' }

/** One session's worth of contract events: everything a host process emits
 * for the session it backs, plus the supervisor-synthesized lifecycle events
 * for it (`host_exit`, `session_detached`). Tagged with a sessionId by the
 * supervisor (ticket 20) so the renderer can route events per session. */
export type SessionScopedEvent =
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
  /** The session's label was written back successfully. */
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
  /** Streaming thinking increment for the currently open assistant message. */
  | { type: 'thinking_delta'; delta: string }
  /** The currently open thinking block closed; `durationMs` was measured by the host. */
  | { type: 'thinking_end'; durationMs: number }
  /** A tool call began executing. */
  | { type: 'tool_start'; toolCallId: string; name: string; args: Record<string, unknown> }
  /** Live partial output from a running tool call (appended to prior updates). */
  | { type: 'tool_update'; toolCallId: string; partial: string }
  /** A tool call finished; `output` is the serialized final result and replaces any partials. */
  | { type: 'tool_end'; toolCallId: string; output: string; isError: boolean }
  /** The currently open assistant message finished. */
  | { type: 'message_end' }
  /** The agent run finished; streaming state must settle. */
  | { type: 'agent_end' }
  /** The turn failed (model/API/preflight error); partial output is preserved. */
  | { type: 'turn_error'; message: string }
  /** The host process died. `clean` = expected exit (code 0, no crash). */
  | { type: 'host_exit'; clean: boolean; code: number | null; signal: string | null }
  // ---- ticket 05: composer + approval gate events ----
  /** Composer session state pushed after `session_created` and on rebuilds. */
  | {
      type: 'composer_state'
      model: ModelRef | null
      thinkingLevel: ThinkingLevel | null
      availableLevels: ThinkingLevel[]
      accessMode: AccessMode
    }
  /** Pi available models grouped by provider (cascading menu data). */
  | { type: 'models_available'; providers: ProviderModels[]; current: ModelRef | null }
  /** A model switch landed; carries the clamped thinking state with it. */
  | { type: 'model_changed'; model: ModelRef; thinkingLevel: ThinkingLevel | null; availableLevels: ThinkingLevel[] }
  /** A thinking-level switch landed. */
  | { type: 'thinking_level_changed'; level: ThinkingLevel; availableLevels: ThinkingLevel[] }
  /** The approval gate switched tier (Access Mode chip). */
  | { type: 'access_mode_changed'; mode: AccessMode }
  /** The `/` menu rows: Pi prompt templates + skills + PiCode-executable built-ins. */
  | { type: 'slash_commands'; commands: SlashCommandItem[] }
  /** The gate needs a human decision before a tool call executes. */
  | { type: 'approval_required'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  /** A pending approval was resolved (approve/deny/cancelled) — ack for the pill. */
  | { type: 'approval_resolved'; toolCallId: string; approved: boolean; reason: string | null }
  /** Reply to `list_files`; relative paths under the session cwd. */
  | { type: 'file_list'; requestId: string; files: string[] }
  /** Live steering/follow-up queue contents (SDK queue state). */
  | { type: 'queue_update'; steering: string[]; followUp: string[] }
  /** Non-transcript notice (compaction progress etc.) for the toast area. */
  | { type: 'host_notice'; level: 'info' | 'error'; message: string }
  /** Supervisor-synthesized: this session's host moved on to a DIFFERENT
   * session (in-host fork re-announcement). The session no longer has a
   * backing host; its file remains and can be resumed (ticket 20). */
  | { type: 'session_detached' }

/** Agent host system → renderer. Applied in arrival order; since ticket 20
 * every event carries its session scope: the supervisor wraps host events in
 * `session_event`, and the renderer's session registry routes them by
 * sessionId. The unwrapped shapes remain valid for single-session consumers
 * (visual-QA harnesses inject them directly). */
export type HostToParent =
  | SessionScopedEvent
  /** A session-scoped event, tagged with the session it belongs to (ticket
   * 20). Background sessions keep emitting these while unfocused. */
  | { type: 'session_event'; sessionId: string; event: SessionScopedEvent }
