/**
 * Sidebar drag-reorder operations (ticket 84): the pure seam the Sidebar's
 * drop path composes — snapshot the current arrangement into a
 * ManualSidebarOrder, then move one session (within its group) or one
 * project group. Rendering lives in group.ts; this module only ever EDITS
 * the stored structures, so both are table-testable without React.
 *
 * Two invariants drive the shapes:
 * - Reconcile-before-move: ids/cwds that render but are not stored yet
 *   (new sessions, restored archives, fresh projects) materialize at the
 *   tail IN RENDER ORDER before the move applies, so an anchor the user
 *   pointed at always resolves and a first drag on a stored-but-partial
 *   order never loses rows.
 * - Relationship anchors: a drop says "X right before Y" (Y null = at the
 *   end), never a numeric index — the same expressed relationship holds in
 *   whatever arrangement re-renders after the switch to Manual.
 *
 * Pure: no I/O, no time; inputs are never mutated.
 */
import type { GroupedSessions, ManualSidebarOrder } from './group.ts'

/** Capture the CURRENT rendered arrangement (the Sidebar's grouped result)
 * as the starting manual order. The pinned section is deliberately absent —
 * pins never drag, so they never enter the arrangement. */
export function snapshotManualOrder(grouped: GroupedSessions): ManualSidebarOrder {
  const sessions: Record<string, string[]> = {}
  for (const group of grouped.groups) sessions[group.cwd] = group.sessions.map((s) => s.id)
  return { sessions, groups: grouped.groups.map((g) => g.cwd) }
}

/** Move one session right before `beforeId` within its cwd's manual list
 * (`null` = at the end). `renderedIds` is the cwd's current render order —
 * rendered-but-unstored ids reconcile at the tail (see module doc) before
 * the move applies. Returns the SAME reference when nothing changes. */
export function moveSessionBefore(
  order: ManualSidebarOrder,
  cwd: string,
  sessionId: string,
  beforeId: string | null,
  renderedIds: readonly string[] = []
): ManualSidebarOrder {
  const stored = order.sessions[cwd] ?? []
  // Materialize rendered strangers (never the dragged id — the move places
  // it), then take the dragged id out.
  const reconciled = [...stored, ...renderedIds.filter((id) => id !== sessionId && !stored.includes(id))]
  const without = reconciled.filter((id) => id !== sessionId)
  const at = beforeId === null ? without.length : without.indexOf(beforeId)
  const next = at === -1 ? [...without, sessionId] : [...without.slice(0, at), sessionId, ...without.slice(at)]
  if (sameSequence(next, stored)) return order
  return { ...order, sessions: { ...order.sessions, [cwd]: next } }
}

/** Move one project group right before `beforeCwd` (`null` = at the end).
 * `renderedCwds` reconciles rendered-but-unstored groups at the tail, the
 * same contract as moveSessionBefore. Returns the SAME reference when
 * nothing changes. */
export function moveGroupBefore(
  order: ManualSidebarOrder,
  cwd: string,
  beforeCwd: string | null,
  renderedCwds: readonly string[] = []
): ManualSidebarOrder {
  const reconciled = [...order.groups, ...renderedCwds.filter((c) => c !== cwd && !order.groups.includes(c))]
  const without = reconciled.filter((c) => c !== cwd)
  let at = beforeCwd === null ? without.length : without.indexOf(beforeCwd)
  if (at === -1) at = without.length
  const next = [...without.slice(0, at), cwd, ...without.slice(at)]
  if (sameSequence(next, order.groups)) return order
  return { ...order, groups: next }
}

function sameSequence(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((entry, i) => entry === b[i])
}
