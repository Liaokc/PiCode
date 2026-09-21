/**
 * Optimistic New Task placeholders (ticket 106): the renderer-side instant
 * path that makes the sidebar's project group and session card appear the
 * moment a create is dispatched — not several layers later (host cold boot →
 * `session_created` → file lands → the index's 2s poll → onIndexChanged).
 * ZCode 秒出 parity: the card is injected with what is KNOWN at dispatch
 * time (cwd, the typed first message, the dispatch clock) and reconciled
 * against the same eventual sources every other surface trusts.
 *
 * Epistemology (the honest-placeholder rules):
 * - The placeholder NEVER claims a real session id — its id is a
 *   renderer-local `pending-create-N` marker; the real id arrives with
 *   `session_created` and is recorded as `announcedSessionId`.
 * - The placeholder is CONFIRMED only by the session index (the file on
 *   disk): when the index lists a session with the announced id, the
 *   placeholder drops and the real file-derived summary renders. The index
 *   polling mechanism is untouched — reconciliation rides the existing
 *   refresh.
 * - A boot failure (an error scoped to a supervisor provisional id, or to
 *   an announced id that never made it to disk) removes the placeholder —
 *   no ghost entries; the App toasts the failure verbatim.
 * - The placeholder row displays no unknowns: no name, no message count,
 *   no fabricated recency — the Sidebar renders its time slot as an honest
 *   "starting…" label instead of a relative time. The dispatch clock is a
 *   SORT key only (it places the card where the real card will land),
 *   never a displayed timestamp.
 *
 * The merge is a pure PROJECTION upstream of the sidebar's existing
 * pipeline: `groupSessions` / `timelineSessions` / the drag-reorder model
 * (ticket 84) keep their exact semantics — the placeholder is just one more
 * SessionSummary-shaped row in the list, grouped and sorted by the same
 * comparators.
 *
 * Pure: no I/O, no SDK imports, no time or randomness (ids and clocks are
 * passed in); inputs are never mutated. Table-tested at Seam-1.
 */
import { isProvisionalSessionId } from '../contract.ts'
import { truncateTitle } from './parse.ts'
import type { GroupedSessions } from './group.ts'
import type { SessionSummary } from './types.ts'

/** File-key marker of a placeholder row (`pending:<id>`): never a real
 * session path, so every `[data-file]` probe and key stays unambiguous. */
export const PENDING_FILE_PREFIX = 'pending:'

/** The title a session with no user message carries (the scanner's own
 * fallback in summarizeSession) — rebuild-path placeholders match it. */
const NO_MESSAGE_TITLE = 'New Task'

/** One optimistic New Task create in flight. */
export interface PendingCreate {
  /** Renderer-local synthetic id (`pending-create-<n>` — App-generated,
   * never a Pi session id, never colliding with the supervisor's
   * `pending-<integer>` provisional ids). */
  id: string
  /** The working directory the create was dispatched with (known). */
  cwd: string
  /** Projected title of the first message (known) — the exact title the
   * real card will carry, so reconciliation never re-renders the text. */
  title: string
  /** Dispatch wall-clock. SORT KEY ONLY (newest-first placement); the
   * Sidebar never renders it as a time. */
  dispatchedAt: number
  /** The real Pi session id once `session_created` announced it; null
   * while the host is still booting. */
  announcedSessionId: string | null
}

/** The title a placeholder card shows for a first message: the same
 * single-line projection the scanner will derive from that message, so the
 * placeholder → real transition keeps the text. Blank input (the rebuild
 * paths dispatch without a message) falls back to the scanner's own
 * `New Task` title. */
export function pendingTitle(text: string): string {
  return truncateTitle(text) || NO_MESSAGE_TITLE
}

/** Create one pending record from the dispatch-time knowns. */
export function makePendingCreate(id: string, cwd: string, text: string, dispatchedAt: number): PendingCreate {
  return { id, cwd, title: pendingTitle(text), dispatchedAt, announcedSessionId: null }
}

/** Project one pending into the SessionSummary shape the sidebar pipeline
 * consumes. Only shape compatibility — every unknown stays unknown
 * (messageCount 0, name null), and the clocks are sort keys, not claims. */
function projectPending(pending: PendingCreate): SessionSummary {
  return {
    file: `${PENDING_FILE_PREFIX}${pending.id}`,
    id: pending.id,
    cwd: pending.cwd,
    name: null,
    title: pending.title,
    startedAt: new Date(pending.dispatchedAt).toISOString(),
    modifiedAt: pending.dispatchedAt,
    createdAt: pending.dispatchedAt,
    messageCount: 0
  }
}

/**
 * The sidebar's session list: the file index PLUS the in-flight pending
 * rows. Pendings whose announced id has reached the index are dropped —
 * the real file-derived summary replaces them (对账). Existing grouping,
 * sorting and drag semantics downstream apply to the merged list untouched.
 */
export function mergePendingCreates(
  index: readonly SessionSummary[],
  pending: readonly PendingCreate[]
): SessionSummary[] {
  const confirmed = reconcilePending(index, pending)
  if (confirmed.length === 0) return [...index]
  return [...index, ...confirmed.map(projectPending)]
}

/**
 * `session_created` bookkeeping: stamp the announced real session id on the
 * OLDEST unannounced pending whose cwd matches the announcement (announcements
 * also arrive for resumes and forks — a cwd mismatch is never consumed).
 * An already-announced pending is never re-announced. Returns the SAME
 * reference when nothing matched.
 */
export function announcePending(
  pending: readonly PendingCreate[],
  sessionId: string,
  cwd: string
): readonly PendingCreate[] {
  const at = pending.findIndex((p) => p.announcedSessionId === null && p.cwd === cwd)
  if (at === -1) return pending
  const next = pending.slice()
  next[at] = { ...next[at]!, announcedSessionId: sessionId }
  return next
}

/**
 * The confirmation pass: drop every pending the index has confirmed (its
 * announced session id now renders as a real file-derived summary). Returns
 * the SAME reference when nothing is confirmed yet.
 */
export function reconcilePending(
  index: readonly SessionSummary[],
  pending: readonly PendingCreate[]
): readonly PendingCreate[] {
  const ids = new Set(index.map((s) => s.id))
  const kept = pending.filter((p) => p.announcedSessionId === null || !ids.has(p.announcedSessionId))
  return kept.length === pending.length ? pending : kept
}

/**
 * Boot-failure reconciliation: remove the placeholder the failure belongs
 * to and report which one died (the App toasts the event's own message).
 * Two failure shapes exist:
 * - a failure scoped to a supervisor PROVISIONAL id — the host died before
 *   announcing: consume the oldest still-booting pending;
 * - a failure scoped to a REAL id a pending announced — the session died
 *   before its file reached the index: consume that exact pending.
 * Anything else (a crash of an unrelated live session, a failed resume with
 * no create in flight) changes nothing — a real id that matches no announced
 * pending is never allowed to consume a booting one.
 */
export function dropFailedPending(
  pending: readonly PendingCreate[],
  failingSessionId: string
): { pending: readonly PendingCreate[]; dropped: PendingCreate | null } {
  const announcedAt = pending.findIndex((p) => p.announcedSessionId === failingSessionId)
  if (announcedAt !== -1) {
    return { pending: pending.filter((_, i) => i !== announcedAt), dropped: pending[announcedAt] ?? null }
  }
  if (!isProvisionalSessionId(failingSessionId)) return { pending, dropped: null }
  const bootingAt = pending.findIndex((p) => p.announcedSessionId === null)
  if (bootingAt !== -1) {
    return { pending: pending.filter((_, i) => i !== bootingAt), dropped: pending[bootingAt] ?? null }
  }
  return { pending, dropped: null }
}

/**
 * Ticket 106 × 84 coexistence: placeholders must never enter the stored
 * manual arrangement — their synthetic ids would linger as dead entries in
 * the persisted preference forever (the real id is different). The Sidebar
 * strips pending rows before a first-drag snapshot or a rendered-list
 * reconcile, so only real sessions are ever arranged. Pinned rows are
 * untouched (placeholders cannot be pinned — the row is inert while
 * pending).
 */
export function stripPendingGroups(
  grouped: GroupedSessions,
  pendingIds: ReadonlySet<string>
): GroupedSessions {
  const stripped = grouped.groups.map((group) =>
    group.sessions.some((s) => pendingIds.has(s.id))
      ? { ...group, sessions: group.sessions.filter((s) => !pendingIds.has(s.id)) }
      : group
  )
  const changed = stripped.some((group, i) => group !== grouped.groups[i])
  return changed ? { pinned: grouped.pinned, groups: stripped } : grouped
}
