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
 * mtime, created = file birthtime (degrading to the header timestamp).
 * Ticket 84 adds `manual` — the user's drag arrangement (ManualSidebarOrder);
 * entered by the first drag or the dropdown, inactive while Updated/Created
 * is picked (the stored order is preserved, never applied). */
export type SessionSort = 'updated' | 'created' | 'manual'

/** The user's drag arrangement for the sidebar (ticket 84): the project-group
 * order plus one session order per group, keyed by cwd. Persisted as a local
 * preference — session files are never touched by reordering. Ids and cwds
 * missing from the structures (new sessions, new projects) fall back to the
 * Updated arrangement at the TAIL: stored positions rule what the user has
 * arranged; the unknowns line up newest-first after them, so an EMPTY order
 * renders exactly like the Updated sort. */
export interface ManualSidebarOrder {
  /** Group-internal session order: cwd → session ids, first = top. */
  readonly sessions: Readonly<Record<string, readonly string[]>>
  /** Project-group order (first = top). */
  readonly groups: readonly string[]
}

export const EMPTY_MANUAL_ORDER: ManualSidebarOrder = { sessions: {}, groups: [] }

/** True when nothing has ever been arranged — the Sidebar uses it to decide
 * between snapshotting the current render (first drag) and composing onto
 * the stored arrangement (every later drag). */
export function isEmptyManualOrder(order: ManualSidebarOrder): boolean {
  return order.groups.length === 0 && Object.keys(order.sessions).length === 0
}

export interface SessionProjectGroup {
  cwd: string
  /** Directory basename — the group header text. */
  project: string
  sessions: SessionSummary[]
}

/** True when one project group's cwd is dead (ticket 123): every row of a
 * group shares the file-header cwd, so ANY row's ticket-54 `cwdMissing`
 * flag reports the folder's physical fact. Dead groups sink below every
 * live group under ALL three sorts — the operator's rule (a folder that
 * no longer exists never outranks one that does) outranks every sort key,
 * Manual included. The live-host exemption (ticket 54's warning state) is
 * a ROW affordance, not a folder fact: the group sinks while the session
 * view's CWD banner explains the situation. Purely derived — the flag
 * clears on the next index scan when the directory reappears, and the
 * projection follows with no stored state. */
export function isDeadCwdGroup(group: { sessions: readonly { cwdMissing?: boolean }[] }): boolean {
  return group.sessions.some((session) => session.cwdMissing === true)
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

/** The two automatic sort keys — `manual` routes to its own render path and
 * never reaches these comparators. */
type AutoSort = Exclude<SessionSort, 'manual'>

const sortKey = (session: SessionSummary, sort: AutoSort): number =>
  sort === 'created' ? sessionCreatedMs(session) : session.modifiedAt

const tieKey = (session: SessionSummary, sort: AutoSort): number =>
  sort === 'created' ? session.modifiedAt : sessionCreatedMs(session)

/** Newest-first comparator for the dropdown's sort key; ties fall to the
 * other clock so equal mtimes (bulk copies) still age-order. */
function bySortOrder(sort: AutoSort): (a: SessionSummary, b: SessionSummary) => number {
  return (a, b) => sortKey(b, sort) - sortKey(a, sort) || tieKey(b, sort) - tieKey(a, sort)
}

/** The Pinned section under one sort key — shared by both views. Manual
 * never reaches it (pins don't drag): callers pass the auto key. */
function pinnedSorted(
  sessions: SessionSummary[],
  pinnedIds: ReadonlySet<string>,
  sort: AutoSort
): SessionSummary[] {
  return sessions.filter((s) => pinnedIds.has(s.id)).sort(bySortOrder(sort))
}

/** Group sessions for the sidebar: pinned section first, then project groups.
 * `sort` (ticket 33) is the dropdown's sort key — it orders the pinned
 * section, every group's rows, and the groups themselves. Under `manual`
 * (ticket 84) the pinned section stays Updated-sorted (pins never drag) and
 * the stored arrangement orders groups and rows; unknowns fall back to the
 * Updated arrangement at the tail, so an empty order renders like Updated.
 * Ticket 123: a dead-cwd group (its directory gone from disk) sinks below
 * every live group under ALL three sorts — see isDeadCwdGroup. */
export function groupSessions(
  sessions: SessionSummary[],
  pinnedIds: ReadonlySet<string>,
  sort: SessionSort = 'updated',
  manual: ManualSidebarOrder = EMPTY_MANUAL_ORDER
): GroupedSessions {
  const pinned =
    sort === 'manual'
      ? pinnedSorted(sessions, pinnedIds, 'updated')
      : pinnedSorted(sessions, pinnedIds, sort)

  const byCwd = new Map<string, SessionSummary[]>()
  for (const session of sessions) {
    if (pinnedIds.has(session.id)) continue
    const list = byCwd.get(session.cwd)
    if (list) list.push(session)
    else byCwd.set(session.cwd, [session])
  }

  if (sort === 'manual') return { pinned, groups: manualOrderedGroups(byCwd, manual) }

  const order = bySortOrder(sort)
  const built: SessionProjectGroup[] = [...byCwd.entries()]
    .map(([cwd, list]) => ({ cwd, project: projectLabel(cwd), sessions: list.sort(order) }))
    // Newest group first, judged by its most recent session under the SAME
    // sort key (group order legitimately flips between Updated and Created).
    .sort((a, b) => sortKey(b.sessions[0] ?? a.sessions[0], sort) - sortKey(a.sessions[0] ?? b.sessions[0], sort))
  // Ticket 123 liveness bucket: dead-cwd groups sink below every live group
  // under every sort — the filter preserves each bucket's sort-key relative
  // order (the sunk groups still age-order among themselves).
  return {
    pinned,
    groups: [...built.filter((group) => !isDeadCwdGroup(group)), ...built.filter((group) => isDeadCwdGroup(group))]
  }
}

/** The manual render's group sequence: stored cwds first (skipping cwds with
 * no live sessions), then the unknown cwds — newest group first, judged by
 * each group's most recent session mtime, the Updated baseline. Rows inside
 * every group follow the stored id order, unknown ids appended newest-first.
 * Ticket 123: a dead-cwd group NEVER rides the manual order — stored or
 * unknown, it diverts to the sunk tail (ordered by the Updated baseline,
 * the manual path's own fallback key), so the drag arrangement can never
 * resurrect a dead group above a live one. */
function manualOrderedGroups(
  byCwd: ReadonlyMap<string, SessionSummary[]>,
  manual: ManualSidebarOrder
): SessionProjectGroup[] {
  const storedLive: SessionProjectGroup[] = []
  const unknownLive: SessionProjectGroup[] = []
  const dead: SessionProjectGroup[] = []
  for (const cwd of manual.groups) {
    const list = byCwd.get(cwd)
    if (list === undefined) continue
    const group: SessionProjectGroup = {
      cwd,
      project: projectLabel(cwd),
      sessions: manualOrderedRows(list, manual.sessions[cwd])
    }
    if (isDeadCwdGroup(group)) dead.push(group)
    else storedLive.push(group)
  }
  for (const [cwd, list] of byCwd) {
    if (manual.groups.includes(cwd)) continue
    const group: SessionProjectGroup = {
      cwd,
      project: projectLabel(cwd),
      // Stored row order applies to unknown groups too (an id list can
      // exist without the cwd being arranged — a dead group excluded from
      // the groups array at snapshot time, or a row drag in a group born
      // after the stored order); undefined degrades to the Updated order.
      sessions: manualOrderedRows(list, manual.sessions[cwd])
    }
    if (isDeadCwdGroup(group)) dead.push(group)
    else unknownLive.push(group)
  }
  const groupRecency = (a: SessionProjectGroup, b: SessionProjectGroup): number =>
    sortKey(b.sessions[0] ?? a.sessions[0], 'updated') - sortKey(a.sessions[0] ?? b.sessions[0], 'updated')
  unknownLive.sort(groupRecency)
  dead.sort(groupRecency)
  return [...storedLive, ...unknownLive, ...dead]
}

/** One group's rows under manual order: stored ids first (only ids with live
 * sessions), then the unknowns in the Updated arrangement (newest first) —
 * an all-unknown group therefore renders exactly like Updated. */
function manualOrderedRows(
  sessions: SessionSummary[],
  storedIds: readonly string[] | undefined
): SessionSummary[] {
  if (storedIds === undefined) return [...sessions].sort(bySortOrder('updated'))
  const byId = new Map(sessions.map((s) => [s.id, s]))
  const stored = storedIds.flatMap((id) => {
    const session = byId.get(id)
    byId.delete(id)
    return session ? [session] : []
  })
  return [...stored, ...[...byId.values()].sort(bySortOrder('updated'))]
}

/** Timeline view (ticket 33): ALL sessions flattened into one sorted list —
 * no project headers — with the pinned section kept as its own top block.
 * Like the Groups all-tasks view it succeeds, it is fed no hidden-projects
 * filter: decluttering must never make a session unreachable. Under
 * `manual` (ticket 84) the flat list is the manual-ordered groups
 * concatenated — the timeline never drags, it only mirrors the Projects
 * arrangement. */
export function timelineSessions(
  sessions: SessionSummary[],
  pinnedIds: ReadonlySet<string>,
  sort: SessionSort = 'updated',
  manual: ManualSidebarOrder = EMPTY_MANUAL_ORDER
): TimelineSessions {
  if (sort === 'manual') {
    const grouped = groupSessions(sessions, pinnedIds, 'manual', manual)
    return { pinned: grouped.pinned, sessions: grouped.groups.flatMap((g) => g.sessions) }
  }
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
