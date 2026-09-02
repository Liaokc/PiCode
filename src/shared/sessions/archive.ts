/**
 * Session archive (ticket 35): a session-level LOCAL preference — archived
 * rows disappear from the sidebar's two list views while the session file
 * itself is never touched. Like group hiding (ticket 19's filterHiddenGroups
 * precedent), archiving is a pure SIDEBAR PROJECTION over the session index:
 * the ⌘K task-search palette and the follow/resume paths are never fed this
 * filter, so hiding never makes a session unreachable. The archive list view
 * behind the trash button lists everything archived for one-click restore.
 *
 * Pure: no I/O, no time — table-tested at Seam-1.
 */

/** Drop archived sessions from the sidebar's list projection (ticket 35).
 * Consumed by BOTH sidebar views (Projects and the Groups all-tasks view)
 * and the Pinned section via groupSessions — archived sessions cannot be
 * pinned (archiving a pinned task unpins it), so a pre-filtered list keeps
 * every section consistent. */
export function filterArchived<T extends { id: string }>(
  sessions: readonly T[],
  archivedIds: ReadonlySet<string>
): T[] {
  return sessions.filter((session) => !archivedIds.has(session.id))
}

/** The trash button's archive view: exactly the archived sessions, newest
 * first — each row one click from restore. */
export function archivedList<T extends { id: string; modifiedAt: number }>(
  sessions: readonly T[],
  archivedIds: ReadonlySet<string>
): T[] {
  return sessions.filter((session) => archivedIds.has(session.id)).sort((a, b) => b.modifiedAt - a.modifiedAt)
}
