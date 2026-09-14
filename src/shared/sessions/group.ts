/**
 * Sidebar grouping/filtering/time-formatting (pure). Shapes the flat session
 * index into the screenshot 01/02 left-column form: a Pinned section on top,
 * then per-project groups, newest first everywhere.
 */
import type { SessionSummary } from './types.ts'

/** Sidebar view vocabulary (ticket 33, the filter dropdown): the list form —
 * per-project groups or one flat timeline. */
export type SessionView = 'projects' | 'timeline'

/** Sidebar sort vocabulary (ticket 33, the filter dropdown): updated = file
 * mtime, created = file birthtime (degrading to the header timestamp). */
export type SessionSort = 'updated' | 'created'

export interface SessionProjectGroup {
  cwd: string
  /** Directory basename — the group header text. */
  project: string
  sessions: SessionSummary[]
}

export interface GroupedSessions {
  pinned: SessionSummary[]
  groups: SessionProjectGroup[]
}

/** The timeline view's flat payload (ticket 33): the pinned section stays a
 * distinct top block, everything else is ONE recency-sorted list. */
export interface TimelineSessions {
  pinned: SessionSummary[]
  sessions: SessionSummary[]
}

/** Creation clock of one session (ticket 33): the file birthtime when the
 * host could read one, else the session header timestamp, else 0 — the
 * created sort never sees NaN, and missing birthtimes degrade gracefully. */
export function sessionCreatedMs(session: SessionSummary): number {
  if (typeof session.createdAt === 'number' && Number.isFinite(session.createdAt) && session.createdAt > 0) {
    return session.createdAt
  }
  const parsed = Date.parse(session.startedAt)
  return Number.isNaN(parsed) ? 0 : parsed
}

const sortKey = (session: SessionSummary, sort: SessionSort): number =>
  sort === 'created' ? sessionCreatedMs(session) : session.modifiedAt

const tieKey = (session: SessionSummary, sort: SessionSort): number =>
  sort === 'created' ? session.modifiedAt : sessionCreatedMs(session)

/** Newest-first comparator for the dropdown's sort key; ties fall to the
 * other clock so equal mtimes (bulk copies) still age-order. */
function bySortOrder(sort: SessionSort): (a: SessionSummary, b: SessionSummary) => number {
  return (a, b) => sortKey(b, sort) - sortKey(a, sort) || tieKey(b, sort) - tieKey(a, sort)
}

/** The Pinned section under one sort key — shared by both views. */
function pinnedSorted(
  sessions: SessionSummary[],
  pinnedIds: ReadonlySet<string>,
  sort: SessionSort
): SessionSummary[] {
  return sessions.filter((s) => pinnedIds.has(s.id)).sort(bySortOrder(sort))
}

/** Group sessions for the sidebar: pinned section first, then project groups.
 * `sort` (ticket 33) is the dropdown's sort key — it orders the pinned
 * section, every group's rows, and the groups themselves. */
export function groupSessions(
  sessions: SessionSummary[],
  pinnedIds: ReadonlySet<string>,
  sort: SessionSort = 'updated'
): GroupedSessions {
  const order = bySortOrder(sort)
  const pinned = pinnedSorted(sessions, pinnedIds, sort)

  const byCwd = new Map<string, SessionSummary[]>()
  for (const session of sessions) {
    if (pinnedIds.has(session.id)) continue
    const list = byCwd.get(session.cwd)
    if (list) list.push(session)
    else byCwd.set(session.cwd, [session])
  }

  const groups: SessionProjectGroup[] = [...byCwd.entries()]
    .map(([cwd, list]) => ({ cwd, project: projectLabel(cwd), sessions: list.sort(order) }))
    // Newest group first, judged by its most recent session under the SAME
    // sort key (group order legitimately flips between Updated and Created).
    .sort((a, b) => sortKey(b.sessions[0] ?? a.sessions[0], sort) - sortKey(a.sessions[0] ?? b.sessions[0], sort))

  return { pinned, groups }
}

/** Timeline view (ticket 33): ALL sessions flattened into one sorted list —
 * no project headers — with the pinned section kept as its own top block.
 * Like the Groups all-tasks view it succeeds, it is fed no hidden-projects
 * filter: decluttering must never make a session unreachable. */
export function timelineSessions(
  sessions: SessionSummary[],
  pinnedIds: ReadonlySet<string>,
  sort: SessionSort = 'updated'
): TimelineSessions {
  return {
    pinned: pinnedSorted(sessions, pinnedIds, sort),
    sessions: sessions.filter((s) => !pinnedIds.has(s.id)).sort(bySortOrder(sort))
  }
}

/**
 * Drop locally-hidden project groups from the sidebar's Projects list
 * (ticket 19). Hiding is a pure sidebar PROJECTION over the session index:
 * session files are untouched, pinned rows are hoisted above groups and stay
 * visible, and neither ⌘K search nor the Groups all-tasks view is fed this
 * filter — decluttering must never make a session unreachable.
 */
export function filterHiddenGroups<T extends { cwd: string }>(
  groups: readonly T[],
  hiddenCwds: ReadonlySet<string>
): T[] {
  return groups.filter((group) => !hiddenCwds.has(group.cwd))
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** A session file touched within this window counts as running elsewhere (Live). */
export const LIVE_WINDOW_MS = 120_000

/** True when a session shows the Live Follow active state in the sidebar.
 * Clock skew (mtime in the future relative to a stale render tick) counts as
 * live — matching relativeTime's clamping. */
export function isSessionLive(session: SessionSummary, nowMs: number): boolean {
  return nowMs - session.modifiedAt < LIVE_WINDOW_MS
}

/** What the Live Follow view's Open action should do (ticket 24). Decided
 * against a FRESH index scan at click time: a still-running session rejects
 * the takeover (toast), a quiet one resumes through the existing Handoff
 * chain, and a session that vanished from disk can only report that. */
export type FollowTakeover = 'resume' | 'still-live' | 'missing'

export function decideFollowTakeover(summary: SessionSummary | null, nowMs: number): FollowTakeover {
  if (summary === null) return 'missing'
  return isSessionLive(summary, nowMs) ? 'still-live' : 'resume'
}

/** Toast copy when the Open re-check finds the session running again —
 * shared so the electron smoke can assert the exact wording. */
export const FOLLOW_TAKEOVER_REJECTED_TOAST = 'Session is still running in another window.'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Compact relative time for sidebar rows: just now / 39m ago / 3h ago / 2d ago / Aug 27. */
export function relativeTime(modifiedMs: number, nowMs: number): string {
  const delta = Math.max(0, nowMs - modifiedMs)
  if (delta < MINUTE_MS) return 'just now'
  if (delta < HOUR_MS) return `${Math.floor(delta / MINUTE_MS)}m ago`
  if (delta < DAY_MS) return `${Math.floor(delta / HOUR_MS)}h ago`
  if (delta < 7 * DAY_MS) return `${Math.floor(delta / DAY_MS)}d ago`
  const date = new Date(modifiedMs)
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`
}

/** Group header text for a working directory. */
export function projectLabel(cwd: string): string {
  const trimmed = cwd.replace(/\/+$/, '')
  const base = trimmed.split('/').pop() ?? ''
  return base === '' ? 'Unknown project' : base
}

// ---- Skills-section project list (ticket 67) ----

/** One known-project record for the Skills section's Project card (the
 * scan candidates): distinct session cwds with recency + session count. */
export interface KnownProject {
  cwd: string
  /** Directory basename — the group header text. */
  name: string
  sessionCount: number
  /** Most recent session mtime under this project — recency ordering. */
  latest: number
}

/**
 * Derive the known-project list from the session index: distinct cwds,
 * each with its folder name, session count, and most recent mtime,
 * newest project first. Pure — the CALLER applies the fs candidate
 * pre-filter (hasProjectTrustResources) and any visibility rules.
 */
export function projectListFromSummaries(sessions: readonly SessionSummary[]): KnownProject[] {
  const byCwd = new Map<string, { sessionCount: number; latest: number }>()
  for (const session of sessions) {
    const entry = byCwd.get(session.cwd) ?? { sessionCount: 0, latest: 0 }
    entry.sessionCount += 1
    entry.latest = Math.max(entry.latest, session.modifiedAt)
    byCwd.set(session.cwd, entry)
  }
  return [...byCwd.entries()]
    .map(([cwd, stats]) => ({ cwd, name: projectLabel(cwd), ...stats }))
    .sort((a, b) => b.latest - a.latest || a.cwd.localeCompare(b.cwd))
}

/** Case-insensitive substring filter over project name and cwd — the
 * Project card's project-search entry. Empty query = no filter. */
export function filterKnownProjects(projects: readonly KnownProject[], query: string): KnownProject[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...projects]
  return projects.filter(
    (project) => project.name.toLowerCase().includes(needle) || project.cwd.toLowerCase().includes(needle)
  )
}
