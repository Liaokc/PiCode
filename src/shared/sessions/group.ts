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
