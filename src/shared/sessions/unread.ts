/**
 * Session read state (ticket 28): unread is a LOCAL preference — an mtime
 * watermark per session plus a manual unread override bit. Session files are
 * never touched (zero session-file writes; ZCode's own unread is local too).
 *
 * Auto rule: growth past the watermark while the session is NOT the view on
 * screen (focused or followed) sets unread; while it IS the view, the
 * watermark chases the file's mtime and the override clears — reading is the
 * only way to make it read. First sighting of a session baselines it at the
 * mtime seen, so a fresh install or an upgrade never floods the sidebar with
 * unread rows: only growth AFTER PiCode first noticed the session counts.
 *
 * Pure: no I/O, no time or randomness — table-tested at Seam-1. Callers
 * hand in the index's modifiedAt; the 2s index poll is what makes the
 * observation turn-granular in practice.
 */

/** Read state of ONE session. */
export interface SessionReadState {
  /** Session-file mtime (ms) as of the last read — the growth watermark. */
  watermarkMs: number
  /** Manual unread override (Mark as Unread ↔ Read; the menu entry itself
   * ships in ticket 35 — this is the model layer). */
  manualUnread: boolean
}

/** Per-session read states, keyed by Pi session id (stable across renames). */
export type ReadStates = Record<string, SessionReadState>

/** Result of an upsert: the next record plus whether anything actually
 * changed (callers skip the preference write when nothing did). */
interface Upsert {
  next: ReadStates
  changed: boolean
}

function upsert(prev: ReadStates, id: string, state: SessionReadState): Upsert {
  const entry = prev[id]
  if (entry && entry.watermarkMs === state.watermarkMs && entry.manualUnread === state.manualUnread) {
    return { next: prev, changed: false }
  }
  return { next: { ...prev, [id]: state }, changed: true }
}

/** Unread projection of ONE session (pure): growth past the watermark or a
 * manual override — unless the session is the view on screen right now
 * (reading it as you watch) or archived (archived rows never show unread;
 * archiving itself ships in ticket 35 — this is the reserved filter slot). */
export function isSessionUnread(
  state: SessionReadState | undefined,
  modifiedAtMs: number,
  onView: boolean,
  archived: boolean
): boolean {
  if (onView || archived) return false
  if (state === undefined) return false // never seen = read until baselined
  if (state.manualUnread) return true
  return modifiedAtMs > state.watermarkMs
}

/** Baseline every session without an entry at its current mtime (first
 * sighting counts as read). Entries that exist — including manual overrides —
 * are left untouched; returns the SAME record when nothing is missing. */
export function baselineReadStates(
  prev: ReadStates,
  sightings: ReadonlyArray<{ id: string; modifiedAt: number }>
): Upsert {
  const additions: ReadStates = {}
  for (const { id, modifiedAt } of sightings) {
    if (prev[id] === undefined && additions[id] === undefined) {
      additions[id] = { watermarkMs: modifiedAt, manualUnread: false }
    }
  }
  const ids = Object.keys(additions)
  if (ids.length === 0) return { next: prev, changed: false }
  return { next: { ...prev, ...additions }, changed: true }
}

/** The session is the view on screen: advance its watermark to the file's
 * current mtime and clear any manual override. Returns the record unchanged
 * when it is already up to date (no preference write needed). */
export function markSessionRead(prev: ReadStates, sessionId: string, modifiedAtMs: number): Upsert {
  return upsert(prev, sessionId, { watermarkMs: modifiedAtMs, manualUnread: false })
}

/** The manual override (Mark as Unread ↔ Read): setting the bit pins unread
 * until the session is read; clearing it advances the watermark so growth
 * already on screen counts as read. */
export function setManualUnread(
  prev: ReadStates,
  sessionId: string,
  unread: boolean,
  modifiedAtMs: number
): Upsert {
  return unread
    ? upsertKeepWatermark(prev, sessionId, modifiedAtMs)
    : markSessionRead(prev, sessionId, modifiedAtMs)
}

function upsertKeepWatermark(prev: ReadStates, sessionId: string, modifiedAtMs: number): Upsert {
  const watermarkMs = prev[sessionId]?.watermarkMs ?? modifiedAtMs
  return upsert(prev, sessionId, { watermarkMs, manualUnread: true })
}

/** Which sessions the sidebar lights the unread dot for (pure projection
 * over the index). `onViewId` is the focused session while Follow is
 * inactive, `onViewFile` the followed file while it is active — the view on
 * screen is always read, and while following, the suspended focused
 * session's growth counts like any background session's. */
export function unreadSessionIds(
  sessions: ReadonlyArray<{ id: string; file: string; modifiedAt: number }>,
  states: ReadStates,
  onViewId: string | null,
  onViewFile: string | null,
  archivedIds: ReadonlySet<string> = new Set()
): ReadonlySet<string> {
  const unread = new Set<string>()
  for (const s of sessions) {
    const onView = (onViewId !== null && s.id === onViewId) || (onViewFile !== null && s.file === onViewFile)
    if (isSessionUnread(states[s.id], s.modifiedAt, onView, archivedIds.has(s.id))) unread.add(s.id)
  }
  return unread
}
