/**
 * Session view registry (ticket 20, ADR-0006): the ONE new renderer state
 * module that turns the single-session chat into multi-active sessions.
 * Maps sessionId → that session's view state (chat transcript state + tree +
 * error dismissal) and owns focus routing. The existing chat reducer is
 * reused untouched, folded once per session — this module only routes.
 *
 * Pure: no I/O, no SDK imports, no time or randomness — table-tested at
 * Seam-1 (spec: testing seam #1). Two event shapes flow in:
 * - wrapped `session_event` (the supervisor tags every host event with its
 *   session id) — routed by that id, focused or not;
 * - unwrapped legacy events (visual-QA harnesses inject the single-session
 *   shape directly) — routed to the focused session.
 */

import { chatReducer, initialChatState, type ChatAction, type ChatError, type ChatState } from './chat-reducer'
import type { HostToParent } from './contract'
import type { ComposerDraft } from './composer/drafts'
import { parkedDraft } from './composer/drafts'
import type { SessionTreePayload } from './sessions/types'
import type { SubagentFleetDTO, SubagentRunState } from './subagents/types'

/** View state of ONE session inside this app run. */
export interface RegistrySession {
  /** Pi session id — the registry key (matches SessionSummary.id). */
  id: string
  /** Working directory from the host's announcement; null while never announced. */
  cwd: string | null
  /** Absolute session file from the announcement; null while unknown. */
  sessionFile: string | null
  /** Latest announced session label. */
  name: string | null
  /** This session's transcript/composer state, folded by the chat reducer. */
  chat: ChatState
  /** Latest session tree payload (branch-history panel data), per session. */
  tree: SessionTreePayload | null
  /** Git branch of this session's workspace (ticket 21, read-only readout);
   * null = not a git repo / unknown yet — the badge just hides. */
  branch: string | null
  /** The error banner this session's user dismissed (per session, ticket 20). */
  dismissedError: ChatError | null
  /** Composer draft slot (ticket 74): this session's unsent text+images,
   * parked by the App when the view leaves and restored when the view
   * remounts. Written only through `set_session_draft` (the 空槽不存 rule
   * applies — an emptied draft clears the slot); a detach drops it with the
   * entry; memory-level — a restart loses it. null = no draft parked. */
  draft: ComposerDraft | null
  /** Ticket 90: the subagent bridge's live state, per session — the runs
   * the bridge last reported (artifact reads + lifecycle deltas, keyed by
   * run id) and the fleet DTO from pi-subagents' RPC. Purely live
   * augmentation: the directory's historical source is the transcript. */
  subagents: SubagentLiveState
}

/** Live subagent state of ONE session (ticket 90). */
export interface SubagentLiveState {
  /** Live async-run states by run id (status.json artifact reads, refined
   * by the forwarded lifecycle events). */
  runs: Record<string, SubagentRunState>
  /** pi-subagents' bounded fleet DTO from the last status reply; null while
   * never answered or the package is unavailable. */
  fleet: SubagentFleetDTO | null
  /** Ticket 101: run ids with an ACCEPTED stop request (ok:true receipt)
   * whose terminal evidence hasn't landed yet — the directory overlays the
   * honest "Stopping" state on those rows. Cleared by any terminal evidence
   * (a lifecycle completion, or a status snapshot that sees the run
   * terminal); a failed receipt never touches it. */
  stopping: ReadonlySet<string>
}

export function initialSubagentLiveState(): SubagentLiveState {
  return { runs: {}, fleet: null, stopping: new Set() }
}

export interface SessionRegistryState {
  /** Insertion-ordered sessions (announcement order). */
  sessions: RegistrySession[]
  /** The session whose view the main zone renders; null = empty state. */
  focusedId: string | null
}

export function initialRegistryState(): SessionRegistryState {
  return { sessions: [], focusedId: null }
}

/** Everything the registry folds: contract events (wrapped or legacy) plus
 * the registry's own UI actions. */
export type RegistryAction =
  | HostToParent
  | { type: 'toggle_turn_expanded'; turnId: string }
  | { type: 'toggle_thinking_expanded'; key: string }
  | { type: 'focus_session'; sessionId: string }
  | { type: 'dismiss_error' }
  | { type: 'set_session_draft'; sessionId: string; draft: ComposerDraft | null }

// ---- pure queries ----

export function focusedSession(state: SessionRegistryState): RegistrySession | null {
  return state.sessions.find((s) => s.id === state.focusedId) ?? null
}

/** Sessions whose host process is alive in this app (backing a live session).
 * Clicking such a session in the sidebar must FOCUS, never respawn. */
export function liveSessionIds(state: SessionRegistryState): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const s of state.sessions) if (s.chat.session !== null) ids.add(s.id)
  return ids
}

/** Sessions with a live host AND a run in flight — the sidebar's animated dot. */
export function runningSessionIds(state: SessionRegistryState): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const s of state.sessions) if (s.chat.session !== null && s.chat.agentRunning) ids.add(s.id)
  return ids
}

/** Sessions parked at the approval gate (ticket 25): at least one PENDING
 * pill in the folded chat state means the host suspended its run to wait for
 * a human decision. The pill sits in the session — focused or not — and the
 * sidebar lights its orange badge until a decision resolves it. Nothing here
 * ever approves on the user's behalf. */
export function awaitingApprovalSessionIds(state: SessionRegistryState): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const s of state.sessions) {
    if (s.chat.entries.some((e) => e.role === 'approval' && e.state === 'pending')) ids.add(s.id)
  }
  return ids
}

export type SidebarDotState = 'run-here' | 'awaiting-approval' | 'tui-live' | 'unread' | 'idle'

/** Fixed-slot sidebar dot (ticket 20 + 25 + 28): orange = parked at the
 * approval gate (wins over everything — the run is suspended, not visibly
 * working), animated = running in THIS app, green = written by another end
 * (120s rule), indigo = unread (grew unseen or manually flagged), empty slot
 * = idle. Priority: orange > animated > green > indigo > empty — a
 * higher-priority dot temporarily masks unread until the session goes
 * quiet. An in-app session never shows the TUI dot — its mtime freshness is
 * our own doing — but it DOES show unread once settled (a background turn
 * finished while the view was elsewhere). Concurrent two-end writes stay
 * un-arbitrated (spec, out of scope). */
export function sidebarDotState(
  awaitingApproval: boolean,
  runningHere: boolean,
  inApp: boolean,
  liveElsewhere: boolean,
  unread: boolean
): SidebarDotState {
  if (awaitingApproval) return 'awaiting-approval'
  if (runningHere) return 'run-here'
  if (!inApp && liveElsewhere) return 'tui-live'
  if (unread) return 'unread'
  return 'idle'
}

export type SidebarRowState = 'selected' | 'idle'

/** Sidebar row selection follows the VIEW (ticket 28): the row whose view is
 * on screen carries the selected styling. While Follow is active that is the
 * followed row — the previously focused row reverts to plain; with Follow
 * inactive it is the focused row again. Selection and running state are
 * decoupled: liveness stays with the dot, never with the row background. */
export function sidebarRowState(
  focusedId: string | null,
  followedFile: string | null,
  sessionId: string,
  sessionFile: string | null
): SidebarRowState {
  if (followedFile !== null) return sessionFile === followedFile ? 'selected' : 'idle'
  return sessionId === focusedId ? 'selected' : 'idle'
}

// ---- folding ----

function findSession(state: SessionRegistryState, id: string): RegistrySession | undefined {
  return state.sessions.find((s) => s.id === id)
}

/** A wrapped event for an id we have never seen (provisional supervisor ids
 * for failed spawns, or any event racing its announcement) opens a defensive
 * entry — metadata stays null until the host announces. */
function withEntryFor(state: SessionRegistryState, id: string): SessionRegistryState {
  if (findSession(state, id) !== undefined) return state
  return {
    ...state,
    sessions: [
      ...state.sessions,
      { id, cwd: null, sessionFile: null, name: null, chat: initialChatState(), tree: null, branch: null, dismissedError: null, draft: null, subagents: initialSubagentLiveState() }
    ]
  }
}

function foldInto(state: SessionRegistryState, id: string, action: ChatAction): SessionRegistryState {
  return {
    ...state,
    sessions: state.sessions.map((s) => (s.id === id ? { ...s, chat: chatReducer(s.chat, action) } : s))
  }
}

/** session_created carries the announcement: metadata lands, the tree and
 * dismissal reset, and the view auto-switches to the session (create/resume/
 * fork all announce, and all mean "now looking at it"). */
function applyAnnouncement(state: SessionRegistryState, id: string, event: Extract<HostToParent, { type: 'session_created' }>): SessionRegistryState {
  const withEntry = withEntryFor(state, id)
  const withMeta: SessionRegistryState = {
    ...withEntry,
    sessions: withEntry.sessions.map((s) =>
      s.id === id
        ? { ...s, cwd: event.cwd, sessionFile: event.sessionFile ?? null, name: event.name ?? null, tree: null, branch: null, dismissedError: null, subagents: initialSubagentLiveState() }
        : s
    ),
    focusedId: id
  }
  return foldInto(withMeta, id, event)
}

// ---- ticket 90: the subagent bridge's live-state folding ----------------

/** The artifact states a preserved run may carry: only terminal evidence
 * survives a snapshot that no longer sees the run. Live states (running/
 * queued/paused) vanish with their artifact — the honest fallback is the
 * replay projection (Lost for async launches), never a stale claim. */
const PRESERVED_SNAPSHOT_STATES: ReadonlySet<SubagentRunState['state']> = new Set([
  'complete',
  'failed',
  'partial',
  'stopped',
  'rejected'
])

/** An AVAILABLE snapshot replaces the runs it sees (fresh artifact evidence
 * wins) and the fleet DTO with it. Runs it does NOT see keep their last
 * known TERMINAL state — the artifacts behind a settled run get cleaned up
 * (the epistemology: no artifact + a recorded completion is still
 * Completed), so a cleaned artifact must not erase the completion a
 * forwarded event delivered. Live states absent from the snapshot are
 * dropped (no artifact, no recorded completion → the replay projection's
 * Lost, never a stale claim). available:false means no information —
 * nothing changes at all. */
function foldSubagentStatus(live: SubagentLiveState, runs: SubagentRunState[], fleet: SubagentFleetDTO | null, available: boolean): SubagentLiveState {
  if (!available) return live
  const seen = new Set<string>()
  const next: Record<string, SubagentRunState> = {}
  for (const run of runs) {
    seen.add(run.runId)
    next[run.runId] = run
  }
  for (const [runId, previous] of Object.entries(live.runs)) {
    if (seen.has(runId)) continue
    if (PRESERVED_SNAPSHOT_STATES.has(previous.state)) next[runId] = previous
  }
  // Ticket 101: a stopping marker drops as soon as the snapshot sees the
  // run terminal — the honest transition ended. Runs the snapshot doesn't
  // see keep the marker (the artifact may merely be mid-cleanup; the
  // lifecycle completion is the authoritative clear).
  const stopping = new Set([...live.stopping].filter((runId) => {
    const run = next[runId]
    return run === undefined || !isTerminalArtifactState(run.state)
  }))
  return { runs: next, fleet, stopping }
}

/** The artifact states that end a run. Membership coincides with the
 * preserved-snapshot set (terminal evidence is exactly what survives a
 * snapshot that no longer sees the run) — one set, two honest names. */
function isTerminalArtifactState(state: SubagentRunState['state']): boolean {
  return PRESERVED_SNAPSHOT_STATES.has(state)
}

/** Lifecycle events fold as deltas onto the last snapshot — a started run
 * appears immediately, a completed run's terminal state lands without
 * waiting for the next poll. */
function foldSubagentLifecycle(
  live: SubagentLiveState,
  event: Extract<HostToParent, { type: 'subagent_async_started' | 'subagent_async_completed' | 'subagent_foreground_completed' }>
): SubagentLiveState {
  const previous = live.runs[event.runId]
  if (event.type === 'subagent_async_started') {
    // Fresh run: seed Running, keeping whatever fields a prior snapshot
    // already carried for this id (none, normally).
    return {
      ...live,
      runs: {
        ...live.runs,
        [event.runId]: { ...previous, runId: event.runId, state: 'running' }
      }
    }
  }
  // Completion events: the terminal state plus the summary. A state pi
  // reports that the projection doesn't know still lands verbatim — the
  // directory's mapping table degrades unknown states honestly.
  const reported = event.state
  const known =
    reported === 'queued' ||
    reported === 'running' ||
    reported === 'complete' ||
    reported === 'failed' ||
    reported === 'partial' ||
    reported === 'paused' ||
    reported === 'stopped' ||
    reported === 'rejected'
      ? reported
      : undefined
  const derived: SubagentRunState = {
    ...(previous !== undefined ? previous : { runId: event.runId, state: 'running' as const }),
    runId: event.runId,
    state: known ?? (previous !== undefined ? previous.state : 'failed'),
    ...(event.summary !== undefined ? { summary: event.summary } : previous?.summary !== undefined ? { summary: previous.summary } : {})
  }
  // Ticket 101: this is the completion branch (started runs returned above)
  // — terminal evidence clears the run's stopping marker.
  const stopping = new Set([...live.stopping].filter((id) => id !== event.runId))
  return { ...live, runs: { ...live.runs, [event.runId]: derived }, stopping }
}

/**
 * Ticket 101: fold one `subagent_stop_receipt`. An accepted stop (ok:true,
 * pi-subagents' `stopping` state) marks the run Stopping — the badge
 * overlay the stop flow shows while the terminal evidence is in flight.
 * A failed receipt changes nothing: the row keeps its live state and the
 * App surfaces the error verbatim.
 */
function foldSubagentStopReceipt(live: SubagentLiveState, event: Extract<HostToParent, { type: 'subagent_stop_receipt' }>): SubagentLiveState {
  if (!event.ok) return live
  const stopping = new Set(live.stopping)
  stopping.add(event.asyncId)
  return { ...live, stopping }
}

function detach(state: SessionRegistryState, id: string): SessionRegistryState {
  return {
    sessions: state.sessions.filter((s) => s.id !== id),
    focusedId: state.focusedId === id ? null : state.focusedId
  }
}

/** Route one contract event (wrapped or legacy) and return the state. */
function foldEvent(state: SessionRegistryState, event: HostToParent): SessionRegistryState {
  if (event.type === 'session_event') {
    const { sessionId, event: scoped } = event
    if (scoped.type === 'session_detached') return detach(state, sessionId)
    if (scoped.type === 'session_created') return applyAnnouncement(state, sessionId, scoped)
    // A spawn that fails BEFORE its announcement (boot error, instant death)
    // has no announced session anywhere — focusing its defensive entry is
    // what surfaces the failure banner, exactly like the α single-session
    // world did.
    if (
      (scoped.type === 'session_error' || scoped.type === 'host_exit') &&
      findSession(state, sessionId) === undefined
    ) {
      return foldInto({ ...withEntryFor(state, sessionId), focusedId: sessionId }, sessionId, scoped)
    }
    const withEntry = withEntryFor(state, sessionId)
    // The tree is registry view state (per session, ticket 20) — the chat
    // reducer deliberately ignores tree payloads.
    if (scoped.type === 'session_tree') {
      return {
        ...withEntry,
        sessions: withEntry.sessions.map((s) => (s.id === sessionId ? { ...s, tree: scoped.tree } : s))
      }
    }
    // Same for the branch readout (ticket 21): per-session view state.
    if (scoped.type === 'branch_info') {
      return {
        ...withEntry,
        sessions: withEntry.sessions.map((s) => (s.id === sessionId ? { ...s, branch: scoped.branch } : s))
      }
    }
    // Ticket 90: the subagent bridge's live state — a status snapshot
    // replaces the runs record; lifecycle events fold as deltas. Per-session
    // view state, like the tree and the branch readout.
    if (scoped.type === 'subagent_status') {
      return {
        ...withEntry,
        sessions: withEntry.sessions.map((s) =>
          s.id === sessionId
            ? { ...s, subagents: foldSubagentStatus(s.subagents, scoped.runs, scoped.fleet, scoped.available) }
            : s
        )
      }
    }
    if (
      scoped.type === 'subagent_async_started' ||
      scoped.type === 'subagent_async_completed' ||
      scoped.type === 'subagent_foreground_completed'
    ) {
      return {
        ...withEntry,
        sessions: withEntry.sessions.map((s) =>
          s.id === sessionId ? { ...s, subagents: foldSubagentLifecycle(s.subagents, scoped) } : s
        )
      }
    }
    // Ticket 101: the stop receipt marks the run Stopping (ok:true) — the
    // registry-level view state the directory's badge overlay reads.
    if (scoped.type === 'subagent_stop_receipt') {
      return {
        ...withEntry,
        sessions: withEntry.sessions.map((s) =>
          s.id === sessionId ? { ...s, subagents: foldSubagentStopReceipt(s.subagents, scoped) } : s
        )
      }
    }
    // subagent_child_status: an observer hint only — the directory ignores
    // it (later surfaces consume it); nothing to fold today.
    if (scoped.type === 'subagent_child_status') return withEntry
    return foldInto(withEntry, sessionId, scoped)
  }
  // Legacy unwrapped event (single-session shape): the visual-QA harnesses
  // inject it, so it belongs to the FOCUSED session. session_created carries
  // its own id and always registers+focuses.
  if (event.type === 'session_created') {
    return applyAnnouncement(state, event.sessionId, event)
  }
  if (event.type === 'session_tree') {
    const focused = state.focusedId
    if (focused === null) return state
    return {
      ...state,
      sessions: state.sessions.map((s) => (s.id === focused ? { ...s, tree: event.tree } : s))
    }
  }
  // Legacy unwrapped branch readout belongs to the FOCUSED session, like the
  // other legacy events the visual-QA harnesses inject.
  if (event.type === 'branch_info') {
    const focused = state.focusedId
    if (focused === null) return state
    return {
      ...state,
      sessions: state.sessions.map((s) => (s.id === focused ? { ...s, branch: event.branch } : s))
    }
  }
  const focused = state.focusedId
  if (focused === null) return state
  return foldInto(state, focused, event)
}

export function registryReducer(state: SessionRegistryState, action: RegistryAction): SessionRegistryState {
  switch (action.type) {
    case 'toggle_turn_expanded': {
      const focused = state.focusedId
      if (focused === null) return state
      return foldInto(state, focused, action)
    }
    // Ticket 129: the thinking-row toggle rides the same focused-session
    // routing — the fold lands in the VIEWED session's chat state, so a
    // background session's thinking rows never move.
    case 'toggle_thinking_expanded': {
      const focused = state.focusedId
      if (focused === null) return state
      return foldInto(state, focused, action)
    }
    case 'focus_session': {
      if (findSession(state, action.sessionId) === undefined) return state
      return { ...state, focusedId: action.sessionId }
    }
    case 'dismiss_error': {
      const focused = state.focusedId
      if (focused === null) return state
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === focused ? { ...s, dismissedError: s.chat.error } : s
        )
      }
    }
    case 'set_session_draft': {
      // Ticket 74: the App parks the mounted composer's live draft into the
      // addressed session's slot — at switch time (before the view changes)
      // and after sends (an explicit null clears). The 空槽不存 rule applies
      // here, so an emptied draft leaves no slot behind. Unknown ids are
      // ignored: a park's owner always comes from a mounted ChatView, never
      // from a session the registry has not seen.
      if (findSession(state, action.sessionId) === undefined) return state
      const draft = action.draft === null ? null : parkedDraft(action.draft)
      return {
        ...state,
        sessions: state.sessions.map((s) => (s.id === action.sessionId ? { ...s, draft } : s))
      }
    }
    default:
      return foldEvent(state, action as HostToParent)
  }
}
