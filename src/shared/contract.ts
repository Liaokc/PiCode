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
import type { QueueKind } from './queue-mirror.ts'
import type { McpRuntimeStatus, McpServerStatusData, McpStatusSnapshotData } from './mcp-status.ts'
import type { SessionTreePayload, TranscriptImagePart, TranscriptItem } from './sessions/types.ts'
import type { SubagentCallInfo, SubagentFleetDTO, SubagentRunState } from './subagents/types.ts'
import type { UsageTokens } from './usage/types.ts'

export type { SubagentCallInfo, SubagentFleetDTO, SubagentRunState }
export type { QueueKind }
export type { McpRuntimeStatus, McpServerStatusData, McpStatusSnapshotData }

// ---- ticket 05: composer + approval gate shared vocabulary ----

/** Pi thinking levels (mirrors the SDK union; re-declared so the renderer
 * never imports the Pi SDK — Seam-1 guardrail). */
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** All seven Pi thinking levels in canonical order (mirrors the SDK's
 * THINKING_LEVEL_OPTIONS). Ticket 41: the new-task empty state offers the
 * full menu before any host exists — in-session lists stay host-pushed and
 * clamped per model (composer_state / thinking_level_changed). */
export const ALL_THINKING_LEVELS: readonly ThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
]

/** Access Mode presets (CONTEXT.md): tiers of the PiCode approval gate —
 * NOT Pi project trust, which stays untouched. */
export type AccessMode = 'full-access' | 'standard' | 'read-only'

/** Ticket 71: the zero-contract truncation marker for `file_list`. When the
 * host's candidate walk hit its entry cap (non-repo workspaces only), the
 * marker rides as the LAST element of `files`; the composer strips it and
 * renders the honest "truncated" hint row. The NUL prefix is the contract:
 * no filesystem path can contain it, so it can never collide with a real
 * candidate. `git ls-files` candidates (in-repo workspaces) are always full
 * and never carry it. */
export const FILE_LIST_TRUNCATED = '\u0000truncated'

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
  /** Ticket 77 (purely additive, reported into the host-contract smoke): the
   * model's context window in tokens, read from the pi-ai Model by the host
   * (the runtime fills the model config's optional field with a 128k
   * default). ABSENT on legacy payloads and on the new-task projection —
   * consumers must treat absence as "window unknown" (the context ring
   * degrades to its grey no-window ring, never to an invented percentage). */
  contextWindow?: number
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
  { type: 'prompt' | 'abort_turn' | 'steer_prompt' | 'follow_up_prompt' | 'clear_queue' | 'edit_queue_entry' | 'remove_queue_entry' | 'set_model' | 'set_thinking_level' | 'set_access_mode' | 'approve_tool' | 'deny_tool' | 'compact_session' | 'list_files' | 'navigate_tree' | 'fork_session' | 'set_session_label' | 'request_tree' | 'get_branch' | 'mcp_auth_start' | 'mcp_auth_input_resolve' | 'subagent_status' }
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
  /** Inline Edit one queued entry (ticket 100, additive): the host runs the
   * clearQueue → reconcile → drop-target → re-feed dance (the SDK 0.85.1
   * queue face is text-only, no single-entry removal) and answers
   * `queue_entry_edited` with the entry's raw text + images for the composer
   * prefill. `index` is the row's ordinal in the LAST queue_update arrays.
   * Answered even when a race delivery emptied the slot (found: false) —
   * the survivors re-feed regardless. */
  | { type: 'edit_queue_entry'; kind: QueueKind; index: number; requestId: string }
  /** Per-row × removal (ticket 100, additive): the same dance minus the
   * prefill reply — the re-feed's queue_update events are the ack. */
  | { type: 'remove_queue_entry'; kind: QueueKind; index: number }
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
  /** List candidate files under the session cwd for @-mention completion.
   * Ticket 71: the host answers with the repo's own candidate set via
   * read-only `git ls-files` (the branch_info precedent: zero writes) when
   * the cwd is inside a git work tree; the capped walk stays the fallback
   * for non-repo workspaces. Matching/ranking stays renderer-side. */
  | { type: 'list_files'; requestId: string; query: string }
  /** Ask for the git branch of the session workspace (ticket 21, READ-ONLY:
   * no checkout, no ref writes — display only). Answered with `branch_info`. */
  | { type: 'get_branch' }
  /** Trigger the MCP OAuth authorization flow for one server in THIS
   * session's host (ticket 89, additive): the host runs the adapter's own
   * `/mcp-auth <server>` command — the browser opens and the localhost
   * callback completes inside the adapter; PiCode never touches
   * credentials. The manual-paste fallback rides `mcp_auth_input_required`
   * / `mcp_auth_input_resolve`; the flow terminates with
   * `mcp_auth_completed`. */
  | { type: 'mcp_auth_start'; serverName: string }
  /** Renderer's manual-paste answer to `mcp_auth_input_required` (ticket 89):
   * the pasted callback URL, or null when cancelled/aborted. */
  | { type: 'mcp_auth_input_resolve'; requestId: string; value: string | null }
  /** Ask the host for one subagent live snapshot (ticket 90, additive):
   * the bridge answers with `subagent_status` — the live async-run states
   * (status.json artifacts, live augmentation only) plus pi-subagents'
   * fleet DTO when its RPC answers. Answered even when the pi-subagents
   * bridge is unavailable (`available: false`) so the renderer's polling
   * needs no timeout logic. */
  | { type: 'subagent_status'; requestId: string }

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
  /** Replay of an existing session's transcript (resume / tree navigation).
   * `usage` (ticket 77, additive): the leaf path's most recent VALID assistant
   * usage under the TUI-calibrated rule (shared/context-ring.ts) — the
   * resumed context ring's starting value. ABSENT on legacy payloads and
   * null when the path records no valid usage; both mean "grey idle ring". */
  | { type: 'history_loaded'; items: TranscriptItem[]; usage?: UsageTokens | null }
  /** The session's entry tree (resume, navigation, rename, request_tree). */
  | { type: 'session_tree'; tree: SessionTreePayload }
  /** The session's label was written back successfully. */
  | { type: 'session_renamed'; name: string | null }
  /** A fork extracted a new session file; resume it to continue there. */
  | { type: 'fork_created'; sessionFile: string; cwd: string }
  /** A session command (navigate/fork/rename) failed; session stays usable. */
  | { type: 'session_command_error'; message: string }
  /** Echo of a prompt accepted by the host, before the agent starts.
   * `entryId` (ticket 51, additive): the real session entry id, present when
   * the host relayed the message at its persistence moment; absent → the
   * renderer falls back to its synthetic positional id. `images`
   * (ticket 97, additive, reported into the host-contract smoke): the
   * persisted message's inline image parts, in content order — present only
   * on messages that carry images (prompt AND delivered steer/follow-up
   * echoes alike); absent → imageless messages keep the exact pre-97 event
   * shape. Feeds the live bubble's thumbnail strip and the edit-resend
   * prefill (the images no longer wait for the next replay). */
  | { type: 'user_message'; text: string; entryId?: string; images?: TranscriptImagePart[] }
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
  /** A tool call finished; `output` is the serialized final result and replaces any partials.
   * `diff` (ticket 78, additive): the result's display diff text — present when the SDK
   * result carries a string `details.diff` (the edit tool); absent on every other tool
   * and on pre-78 payloads. Feeds the turn file bar and its turn-diff side-panel tab.
   * `subagent` (ticket 90, additive, reported into the host-contract smoke): the
   * pi-subagents structured run identity — present when the SDK result carries record
   * `details` with a run identity (the subagent tool); absent on every other tool and
   * on pre-90 payloads. Feeds the subagent directory's primary source. */
  | { type: 'tool_end'; toolCallId: string; output: string; isError: boolean; diff?: string; subagent?: SubagentCallInfo }
  /** The currently open assistant message finished. `entryId` (ticket 51,
   * additive): the real session entry id of the finished message, read back
   * when the host persisted it — the fork anchor depends on it; absent →
   * synthetic id fallback (aborted-turn shapes). `usage` (ticket 77,
   * additive): the finished message's usage under the TUI-calibrated
   * validity rule (shared/context-ring.ts); ABSENT on legacy payloads and on
   * aborted/errored/usage-less messages — the renderer keeps its previous
   * value then. */
  | { type: 'message_end'; entryId?: string; usage?: UsageTokens }
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
  /** Reply to `list_files` (ticket 71): relative paths under the session cwd
   * — `git ls-files` (tracked + untracked-unignored) when the cwd answers as
   * a git work tree, else the capped directory walk. A capped walk appends
   * `FILE_LIST_TRUNCATED` as the last element (honest degradation). */
  | { type: 'file_list'; requestId: string; files: string[] }
  /** Reply to `get_branch` (ticket 21): the git branch of the session's
   * workspace, read-only. `null` = not a git repo / git unavailable — the
   * UI hides the badge instead of erroring. */
  | { type: 'branch_info'; branch: string | null }
  /** Live steering/follow-up queue contents (SDK queue state). The shape is
   * FROZEN at ticket 05 (text arrays only) — ticket 100's mirror lives
   * host-side, so old payloads keep validating unchanged. */
  | { type: 'queue_update'; steering: string[]; followUp: string[] }
  /** Reply to `edit_queue_entry` (ticket 100, additive): the removed
   * entry's raw text + attachments for the composer prefill.
   * `found: false` (the entry raced into delivery before the dance) →
   * text/images are empty and the renderer must NOT touch the composer —
   * the survivors re-feed either way. */
  | { type: 'queue_entry_edited'; requestId: string; found: boolean; text: string; images: TranscriptImagePart[] }
  /** Non-transcript notice (compaction progress etc.) for the toast area. */
  | { type: 'host_notice'; level: 'info' | 'error'; message: string }
  // ---- ticket 89: MCP OAuth bridge (additive; the flow rides the adapter's
  // own `/mcp-auth` command — credentials never enter PiCode) ----
  /** The adapter's flow needs the manual callback-URL paste (gateway
   * scenario, or the operator chooses the fallback): the settings window
   * shows the dialog with `title` verbatim (it carries the authorization
   * URL) and answers via `mcp_auth_input_resolve`. */
  | { type: 'mcp_auth_input_required'; requestId: string; serverName: string; title: string }
  /** A progress/error notice emitted by the adapter DURING an in-flight
   * OAuth flow (notices outside a flow are never relayed). */
  | { type: 'mcp_auth_notice'; serverName: string; level: 'info' | 'warning' | 'error'; message: string }
  /** The flow terminated: `ok` = no error-level notice arrived during the
   * flow; `notices` carries the relayed tail for the status line. */
  | { type: 'mcp_auth_completed'; serverName: string; ok: boolean; notices: Array<{ level: 'info' | 'warning' | 'error'; message: string }> }
  // ---- ticket 90: the subagent bridge (additive, reported into the
  // host-contract smoke). The host's inline extension subscribes to
  // pi-subagents' in-process RPC + lifecycle events and forwards them; the
  // renderer never talks to the Pi SDK (Seam-1). ----
  /** Answer to `subagent_status`: `available` = the pi-subagents bridge is
   * wired in this host (its RPC answered); `runs` = the live async-run
   * states the bridge read from the runs' status.json artifacts (LIVE
   * augmentation only — artifacts get cleaned, the session replay stays the
   * historical source); `fleet` = pi-subagents' bounded fleet DTO when its
   * RPC answered, null otherwise. */
  | { type: 'subagent_status'; requestId: string; available: boolean; runs: SubagentRunState[]; fleet: SubagentFleetDTO | null }
  /** pi-subagents `subagent:async-started` forwarded (bounded fields): an
   * async run detached and is running. The task/goal text is redacted by
   * pi-subagents itself — the row's title comes from the session record. */
  | { type: 'subagent_async_started'; runId: string; mode?: string; agent?: string; agents?: string[]; asyncDir?: string }
  /** pi-subagents `subagent:async-complete` forwarded: a run reached a
   * terminal state. `state` is pi-subagents' artifact state vocabulary. */
  | { type: 'subagent_async_completed'; runId: string; state?: string; success?: boolean; summary?: string; durationMs?: number }
  /** pi-subagents `subagent:foreground-complete` forwarded: a detached
   * FOREGROUND child settled (no async artifact exists for these — this
   * event is the only live terminal evidence). */
  | { type: 'subagent_foreground_completed'; runId: string; mode?: string; agent?: string; success?: boolean; state?: string; summary?: string; taskIndex?: number }
  /** pi-subagents `subagent:child-status` forwarded: an observer hint about
   * one child's stop lifecycle (duplicates possible; not authoritative —
   * status snapshots are). Feeds later surfaces; the directory ignores it. */
  | { type: 'subagent_child_status'; runId: string; childId: string; status: 'stopping' | 'stopped'; ts: number; agent?: string; stepIndex?: number; label?: string }
  // ---- ticket 96: the MCP status bridge (additive, reported into the
  // host-contract smoke). The host's inline extension subscribes to the
  // adapter's versioned status channel (pi.events in-process bus) and
  // forwards the VALIDATED snapshot; receive-only — the renderer never
  // commands a status read, so viewing the section can never connect a
  // lazy server (zero-side-effect by construction). ----
  /** The focused session's adapter status snapshot (versioned, bounded —
   * shared/mcp-status.ts): per-server runtime status + tool counts, plus
   * the snapshot totals. Session-scoped: the renderer projects it onto the
   * config rows of the FOCUSED session only; no snapshot (adapter absent,
   * host booting) renders the honest no-data state, never an invented
   * status. An EMPTY snapshot rides the session shutdown. */
  | { type: 'mcp_status'; snapshot: McpStatusSnapshotData }
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
