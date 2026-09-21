/**
 * Turn-header duration derivation (ticket 108, spec R29+R30): the
 * "Working · Ns" / "Worked · Ns" seconds come from ENTRY-LEVEL wall-clock
 * stamps carried by the turn's entries — not from a component-local tick.
 * The container header unmounts on every session switch (ADR-0006: the
 * background view doesn't render, switching back remounts it) and its body
 * unmounts on fold — a tick counter resets on each remount (the
 * pi17-working-7s defect: the count restarted from 1s after switching
 * sessions, and the settled row lost its duration with it). Deriving from
 * the turn's stamps makes every remount read the SAME anchor, so the count
 * continues — the ticket-61 thinking-row caliber migrated to the container
 * header.
 *
 * Stamps (ADR-0002 data source, additive entry projection):
 *   - user entry → `startedAtMs`: the echo's renderer receipt (live) or the
 *     recorded session-file timestamp (replay) — the turn's opening entry;
 *   - tool entry → `startedAtMs`: the tool_start receipt (live) or the
 *     recorded call timestamp (replay) — carried since ticket 90;
 *   - assistant entry → `endedAtMs`: the message_end receipt (live) or the
 *     recorded message timestamp (replay) — the message's completion;
 *   - approval entries record no stamp (they convert into tool cards in
 *     place — the tool's own stamp takes over).
 *
 * Decision table (all rows table-tested at Seam-1, spec: testing seam #1):
 *
 *   Anchor + span — `turnStamps` (groupTurns folds one call per turn):
 *   1. entries carry stamps → the FIRST stamped entry is the turn's start
 *      anchor (the boundary user message when stamped — it opens the turn;
 *      else the first stamped work entry, the head-turn / pre-108 shape),
 *      the LAST stamped entry is its end.
 *   2. no stamps at all → both null (无锚点防御) — nothing is invented; the
 *      view falls back to its local tick (ticket 61 discipline).
 *
 *   Live "Working · Ns" — `deriveWorkingSeconds`:
 *   3. anchor + clock → floor((now − anchor)/1000), clamped ≥ 1 (the row
 *      shows 1s from the first frame, like the tick it replaces).
 *   4. no anchor (or no clock yet) → the local tick fallback.
 *
 *   Settled "Worked · Ns" — `deriveWorkedSeconds`:
 *   5. start+end stamps → floor((end − start)/1000), clamped ≥ 1. Includes
 *      every REPLAYED turn — session files always record entry timestamps,
 *      so the ticket-14 "replays carry no duration" premise is retired by
 *      this ticket — and every in-view settled turn.
 *   6. stamps missing (aborted tail without message_end, pre-108 payloads)
 *      → the local tick fallback while the turn streamed in this view; null
 *      (untimed row) when the tick never ran either (stampless remount).
 *
 * Pure — no clock reads; the caller supplies `nowMs`.
 */

import type { ChatEntry } from './chat-reducer'

/** The entry's wall-clock stamp, or null when the entry recorded none
 * (approval entries never do; the others only on un-stamped harness
 * events / pre-108 payloads). */
export function entryStampMs(entry: ChatEntry): number | null {
  switch (entry.role) {
    case 'user':
      return entry.startedAtMs ?? null
    case 'assistant':
      return entry.endedAtMs ?? null
    case 'tool':
      return entry.startedAtMs ?? null
    case 'approval':
      return null
  }
}

export interface TurnStamps {
  /** The turn's start anchor: the FIRST stamped entry's ts (the boundary
   * user message when stamped — it opens the turn; else the first stamped
   * work entry). Null when the turn recorded no stamps. */
  startedAtMs: number | null
  /** The turn's end: the LAST stamped entry's ts. Null alongside a null
   * start when the turn recorded no stamps (an unstamped tail entry simply
   * can't extend the span — nothing about it is invented). */
  endedAtMs: number | null
}

/** Fold one turn's entries into its wall-clock span (the R29 anchor
 * selection + the R30 first→last span in one pure pass). Entries arrive in
 * transcript order; the user message is the turn's first entry. */
export function turnStamps(entries: readonly ChatEntry[]): TurnStamps {
  let startedAtMs: number | null = null
  let endedAtMs: number | null = null
  for (const entry of entries) {
    const stamp = entryStampMs(entry)
    if (stamp === null) continue
    if (startedAtMs === null) startedAtMs = stamp
    endedAtMs = stamp
  }
  return { startedAtMs, endedAtMs }
}

/** R29: the live header's seconds. Anchor-derived so switches and folds
 * (any unmount/remount) continue from the same anchor; the local tick is
 * the fallback for stamp-less shapes (ticket 61 discipline). Live rows are
 * always timed — the count shows 1s from the first frame. */
export function deriveWorkingSeconds(startedAtMs: number | null, nowMs: number | null, tickSeconds: number): number {
  if (startedAtMs !== null && nowMs !== null) {
    return Math.max(1, Math.floor((nowMs - startedAtMs) / 1000))
  }
  return Math.max(tickSeconds, 1)
}

/** R30: the settled header's seconds — the first→last entry-stamp span.
 * Returns null when untimed: no stamps and no in-view tick to fall back
 * on (a replayed pre-timestamp payload, a stampless turn remounted after a
 * session switch). */
export function deriveWorkedSeconds(startedAtMs: number | null, endedAtMs: number | null, tickSeconds: number): number | null {
  if (startedAtMs !== null && endedAtMs !== null) {
    return Math.max(1, Math.floor((endedAtMs - startedAtMs) / 1000))
  }
  // The tick fallback only has a story while the turn streamed in this
  // view (the hook retains its count once inactive); a stampless turn seen
  // after a remount has neither — the honest state is the untimed row.
  return tickSeconds > 0 ? Math.max(tickSeconds, 1) : null
}
