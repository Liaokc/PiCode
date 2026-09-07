/**
 * cwd-liveness filter for the session index (ticket 42, spec R4). A session
 * whose working directory no longer exists on disk is PHYSICALLY dead: the
 * only open path — resume with cwd = deleted directory — makes the host
 * exit(1) (the dead-cwd crash banners pi13-worktree-session-groups /
 * pi13-dead-cwd-host-exit), so the session is structurally unreachable and
 * must not enter the index at all: neither sidebar view (Projects /
 * Timeline) nor ⌘K can reach it.
 *
 * Boundary with the "hiding never makes a session unreachable" invariant:
 * archiving and group hiding guard LOCAL PREFERENCES and keep sessions
 * ⌘K-reachable by design; this filter records a physical fact of the
 * machine and therefore sits in the index scan itself — it is not a
 * preference, there is no archive box for it, and there is deliberately no
 * recovery path (Out of Scope: any deletion/migration of the filtered
 * files). Session files are never touched; a directory that reappears
 * simply makes its sessions listable again on the next scan.
 *
 * In-app LIVE host sessions are exempt: a session running in this app whose
 * cwd was deleted mid-run must not vanish from the registry/sidebar.
 *
 * Pure: stat results are injected (`cwdExists`), so the Seam-1 table tests
 * never touch the filesystem.
 */

/** Injected stat result: does this cwd exist as a directory RIGHT NOW? */
export type CwdExists = (cwd: string) => boolean

/** Sessions whose cwd is alive, plus every exempt (in-app live host)
 * session. Kept items keep their identity and order — this is a filter, not
 * a reshape. */
export function filterDeadCwd<T extends { id: string; cwd: string }>(
  sessions: readonly T[],
  cwdExists: CwdExists,
  exemptIds: ReadonlySet<string> = new Set<string>()
): T[] {
  return sessions.filter((session) => cwdExists(session.cwd) || exemptIds.has(session.id))
}
