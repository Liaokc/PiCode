/**
 * ⌘K task-search model (ticket 11, user story 49): the palette searches
 * TASKS ONLY — fuzzy over the task title and its project label — and the
 * selection movement wraps so the whole flow (invoke → filter → select →
 * jump) never leaves the keyboard. Pure functions; the component supplies
 * rendering and the open/jump actions.
 */
import { fuzzyScore } from './composer/fuzzy.ts'
import { projectLabel } from './sessions/group.ts'
import { cwdRowState } from './sessions/cwd-liveness.ts'
import type { SessionSummary } from './sessions/types.ts'

export const TASK_SEARCH_LIMIT = 10

/**
 * Rank tasks against `query` (blank query keeps the given order). Matching
 * text is `title` + project label; recency order breaks score ties so the
 * palette feels like the sidebar, newest first.
 */
export function searchTasks(
  sessions: readonly SessionSummary[],
  query: string,
  limit: number = TASK_SEARCH_LIMIT
): SessionSummary[] {
  const needle = query.trim()
  if (needle === '') return sessions.slice(0, limit)
  const scored: Array<{ session: SessionSummary; score: number; index: number }> = []
  for (let index = 0; index < sessions.length; index++) {
    const session = sessions[index]
    const score = Math.max(
      fuzzyScore(needle, session.title) ?? Number.NEGATIVE_INFINITY,
      fuzzyScore(needle, projectLabel(session.cwd)) ?? Number.NEGATIVE_INFINITY
    )
    if (score !== Number.NEGATIVE_INFINITY) scored.push({ session, score, index })
  }
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored.slice(0, limit).map((hit) => hit.session)
}

/** Selection movement with wrap-around; count 0 (empty list) stays put. */
export function nextSelectionIndex(current: number, delta: number, count: number): number {
  if (count === 0) return 0
  const next = (current + delta) % count
  return next < 0 ? next + count : next
}

/** ⌘K offers actionable targets only (ticket 54): a dimmed row — a session
 * whose cwd is gone with NO live host in this app — is display-only and
 * must not be offered for opening (resume on a deleted cwd makes the host
 * exit(1)). Sessions with a live host keep their entry: switching to one is
 * a pure focus change. The dimmed predicate is cwdRowState's — one source
 * of truth for the gray row; an old payload without the additive field is
 * untouched. */
export function excludeDimmedRows<T extends { id: string; cwdMissing?: boolean }>(
  sessions: readonly T[],
  liveIds: ReadonlySet<string>
): T[] {
  return sessions.filter((s) => cwdRowState(s.cwdMissing === true, liveIds.has(s.id)) !== 'dimmed')
}
