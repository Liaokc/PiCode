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
import type { SessionTreePayload } from './sessions/types'

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
  /** The error banner this session's user dismissed (per session, ticket 20). */
  dismissedError: ChatError | null
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
  | { type: 'focus_session'; sessionId: string }
  | { type: 'dismiss_error' }

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

export type SidebarDotState = 'run-here' | 'tui-live' | 'idle'

/** Fixed-slot sidebar dot (ticket 20): animated = running in THIS app, green
 * = written by another end (120s rule), empty slot = idle. An in-app session
 * never shows the TUI dot — its mtime freshness is our own doing; concurrent
 * two-end writes stay un-arbitrated (spec, out of scope). */
export function sidebarDotState(runningHere: boolean, inAppIdle: boolean, liveElsewhere: boolean): SidebarDotState {
  if (runningHere) return 'run-here'
  if (inAppIdle) return 'idle'
  if (liveElsewhere) return 'tui-live'
  return 'idle'
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
      { id, cwd: null, sessionFile: null, name: null, chat: initialChatState(), tree: null, dismissedError: null }
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
 * fork all announce, and all mean "now looking at it"). The transcript state
 * itself resets through the chat reducer's own session_created rule — this
 * module never re-implements chat folding. */
function applyAnnouncement(state: SessionRegistryState, id: string, event: Extract<HostToParent, { type: 'session_created' }>): SessionRegistryState {
  const withEntry = withEntryFor(state, id)
  const withMeta: SessionRegistryState = {
    ...withEntry,
    sessions: withEntry.sessions.map((s) =>
      s.id === id
        ? { ...s, cwd: event.cwd, sessionFile: event.sessionFile ?? null, name: event.name ?? null, tree: null, dismissedError: null }
        : s
    ),
    focusedId: id
  }
  return foldInto(withMeta, id, event)
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
    default:
      return foldEvent(state, action as HostToParent)
  }
}
