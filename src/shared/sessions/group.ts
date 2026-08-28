/**
 * Sidebar grouping/filtering/time-formatting (pure). Shapes the flat session
 * index into the screenshot 01/02 left-column form: a Pinned section on top,
 * then per-project groups, newest first everywhere.
 */
import type { SessionSummary } from './types.ts'

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

const byRecency = (a: SessionSummary, b: SessionSummary): number => b.modifiedAt - a.modifiedAt

/** Group sessions for the sidebar: pinned section first, then project groups. */
export function groupSessions(sessions: SessionSummary[], pinnedIds: ReadonlySet<string>): GroupedSessions {
  const pinned = sessions.filter((s) => pinnedIds.has(s.id)).sort(byRecency)

  const byCwd = new Map<string, SessionSummary[]>()
  for (const session of sessions) {
    if (pinnedIds.has(session.id)) continue
    const list = byCwd.get(session.cwd)
    if (list) list.push(session)
    else byCwd.set(session.cwd, [session])
  }

  const groups: SessionProjectGroup[] = [...byCwd.entries()]
    .map(([cwd, list]) => ({ cwd, project: projectLabel(cwd), sessions: list.sort(byRecency) }))
    // Newest group first, judged by its most recent session.
    .sort((a, b) => (b.sessions[0]?.modifiedAt ?? 0) - (a.sessions[0]?.modifiedAt ?? 0))

  return { pinned, groups }
}

/** Case-insensitive title/project filter; blank query keeps everything. */
export function filterSessions(sessions: SessionSummary[], query: string): SessionSummary[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return sessions
  return sessions.filter(
    (s) => s.title.toLowerCase().includes(needle) || projectLabel(s.cwd).toLowerCase().includes(needle)
  )
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** A session file touched within this window counts as running elsewhere (Live). */
export const LIVE_WINDOW_MS = 120_000

/** True when a session shows the Live Follow active state in the sidebar. */
export function isSessionLive(session: SessionSummary, nowMs: number): boolean {
  const delta = nowMs - session.modifiedAt
  return delta >= 0 && delta < LIVE_WINDOW_MS
}

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
