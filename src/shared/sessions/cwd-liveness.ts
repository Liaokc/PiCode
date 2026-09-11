/**
 * cwd-liveness for the session index (tickets 42 + 54, spec R1). A session
 * whose working directory no longer exists on disk is PHYSICALLY dead: the
 * only open path — resume with cwd = deleted directory — makes the host
 * exit(1) (the dead-cwd crash banners pi13-worktree-session-groups /
 * pi13-dead-cwd-host-exit), so a dead session must never be RESUMED.
 *
 * Ticket 54 supersedes ticket 42's reachability shape: dead-cwd sessions
 * STAY LISTED — the index only annotates the physical fact as the additive
 * `cwdMissing` flag — and the UI derives three states from flag × live
 * host (the cwdRowState table):
 *
 *   normal  — cwd alive (or flag absent: old payloads validate untouched);
 *   warning — cwd dead but a live host in this app (活豁免, ticket 42's
 *             exemption, semantics unchanged): the row stays normal and the
 *             session view carries the persistent CWD banner;
 *   dimmed  — cwd dead, no live host (死亡): a display-only gray row with
 *             the "cwd missing" meta — clicking explains (toast) and never
 *             resumes, the context menu keeps the harmless entries only,
 *             and ⌘K keeps excluding it.
 *
 * Recovery needs no manual step: a directory that reappears clears the flag
 * on the next scan (the gray row restores, the banner disappears). Session
 * files are never touched; nothing here is a preference and nothing is
 * filtered — the flag records a physical fact of the machine and every
 * consumer (sidebar, ⌘K palette, banner, click guard) derives its surface
 * from it downstream.
 *
 * Pure: stat results are injected (`cwdExists`), so the Seam-1 table tests
 * never touch the filesystem.
 */

/** Injected stat result: does this cwd exist as a directory RIGHT NOW? */
export type CwdExists = (cwd: string) => boolean

/** The ticket-54 summary annotation: every session stays listed; a session
 * whose cwd is physically gone gains `cwdMissing: true` (purely additive
 * contract field — sessions with a living cwd keep the EXACT pre-54 payload
 * shape, so old consumers and old payloads keep validating). Identity and
 * order preserved; the input is never mutated. */
export function withCwdMissing<T extends { id: string; cwd: string }>(
  sessions: readonly T[],
  cwdExists: CwdExists
): Array<T & { cwdMissing?: boolean }> {
  return sessions.map((session) => (cwdExists(session.cwd) ? session : { ...session, cwdMissing: true }))
}

/** The three UI states of one session row / palette entry (ticket 54).
 * `cwdMissing` is the index's physical fact (absent = alive, which is also
 * what a pre-54 payload without the field means); `liveInApp` is the
 * renderer's registry fact (a live host process in THIS app). */
export type CwdRowState = 'normal' | 'warning' | 'dimmed'

export function cwdRowState(cwdMissing: boolean | undefined, liveInApp: boolean): CwdRowState {
  if (cwdMissing !== true) return 'normal'
  return liveInApp ? 'warning' : 'dimmed'
}

/** Toast copy when a gray row is clicked (ticket 54): an explanation ONLY —
 * the click never resumes, because resume on a deleted cwd makes the host
 * exit(1). Shared so the electron smoke can assert the exact wording. */
export const CWD_MISSING_ROW_TOAST = 'This task cannot be reopened — its working directory no longer exists on disk.'
