/**
 * Thinking-row duration derivation (ticket 61, spec R7): the displayed
 * seconds come from the ENTRY-LEVEL start timestamp recorded in reducer
 * state when the part began streaming — not from a component-local tick.
 * Folding the container unmounts the row; remounting derives from the SAME
 * timestamp, so the count continues instead of resetting (the
 * pi15-thinking-timer-reset defect: 7s became 3s across a fold/reopen).
 *
 * Decision table (all rows table-tested at Seam-1, spec: testing seam #1):
 *
 *   1. `durationMs` present → FROZEN host-measured label — authoritative
 *      the moment it lands (thinking_end), wins over everything (existing
 *      contract).
 *   2. streaming with a start stamp → (now − startedAt) derived, so a
 *      fold-close/reopen continues from the same timestamp instead of
 *      restarting.
 *   3. streaming without a stamp (or without a clock yet) → the caller's
 *      local tick clock (pre-61 behavior — absence falls back).
 *   4. settled without `durationMs` → untimed row: every replayed block
 *      (session files record no duration — ticket 14) and every block that
 *      never closed cleanly.
 *
 * Pure — no clock reads; the caller supplies `nowMs`.
 */

import type { ThinkingPart } from './chat-reducer'

export interface ThinkingDuration {
  /** Whether the row shows a "· Ns" duration at all. */
  timed: boolean
  /** Displayed seconds; null when untimed. */
  seconds: number | null
}

export function deriveThinkingDuration(part: ThinkingPart, nowMs: number | null, tickSeconds: number): ThinkingDuration {
  // Freeze priority: the host-measured duration is authoritative the moment
  // it lands (thinking_end), regardless of the streaming flag's state.
  if (part.durationMs !== null) {
    return { timed: true, seconds: Math.max(1, Math.round(part.durationMs / 1000)) }
  }
  if (part.streaming) {
    if (part.startedAtMs != null && nowMs !== null) {
      return { timed: true, seconds: Math.max(1, Math.floor((nowMs - part.startedAtMs) / 1000)) }
    }
    // No stamp (or no clock yet): pre-61 local tick fallback — absence
    // falls back to current behavior.
    return { timed: true, seconds: Math.max(tickSeconds, 1) }
  }
  // Ticket 14 degrade: replayed blocks (no recorded duration) and blocks
  // that never closed cleanly render as a plain untimed row.
  return { timed: false, seconds: null }
}
