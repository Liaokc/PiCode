/**
 * Transcript scroll-stay model (ticket 45, extended by ticket 75 and ticket
 * 93): the stick decision behind the chat transcript's auto-scroll,
 * converged into pure functions.
 *
 * Ticket 45 is a behavior change (spec Q12): the old rule — "the transcript
 * grew, so force the reader to the bottom" — yanked anyone who had scrolled
 * up to read while a run streamed. The decision is now table-driven
 * (Seam-1): the viewport pins to the bottom ONLY while the reader is
 * already near it (streaming follows a pinned reader) or when the user's
 * own agency asks for the bottom (their own send, or a Jump-to-Latest
 * click still traveling). Growth alone never moves a reader who scrolled
 * away.
 *
 * Ticket 75 adds direction awareness ("the wheel always wins"): a reader
 * INSIDE the stick band who wheeled up any amount was still yanked on the
 * next streaming delta — the in-band strong stick fought the wheel
 * frame-by-frame, and the text jittered violently. The decision table now
 * carries a reader-held-away latch (`heldAway`, the completion of the Q12
 * intent): an upward scroll gesture sets it; scrolling back into the bottom
 * band (回底), the user's own send or a Jump-to-Latest click clears it.
 * While it holds, content growth NEVER yanks — `nearBottom && grew` alone
 * no longer sticks. The 160px threshold keeps its remaining jobs: the
 * Jump-to-Latest button's visibility (CONTEXT.md: 回底钮), the latch's
 * restore arm, and the un-held follow gate.
 *
 * Ticket 93 completes the selfSent arm: the send pin is no longer consumed
 * by the first decision pass — it is an UNTIL-ARRIVAL LATCH (`nextSendLatch`).
 * Armed by every send path (idle send, steer, follow-up — and the queued
 * message's later injection rides the arming done at the original gesture,
 * since a queue update itself changes no entries), the latch keeps the
 * agency alive across passes: a late-arriving entry, multi-pass growth or a
 * viewport shift between the gesture and the landing all re-pin until the
 * view actually reaches the bottom. Two things clear it: ARRIVAL (the
 * viewport found on the bottom — the job is done, follow resumes under the
 * near-bottom rule) and TAKEOVER (any real upward scroll gesture — the
 * ticket-75 wheel law now also out-ranks the send pin itself: a wheel-up
 * between the send and the echo pass can no longer be overridden by
 * `selfSent`).
 */

/** Stick threshold carried over from the pre-ticket behavior (~160px). */
export const STICK_THRESHOLD_PX = 160

/** The three scroll-geometry numbers the decision reads. Satisfied by any
 * scroll container element (scrollHeight / scrollTop / clientHeight). */
export interface ScrollSnapshot {
  readonly scrollHeight: number
  readonly scrollTop: number
  readonly clientHeight: number
}

/** Distance (px) between the viewport's bottom edge and the content's bottom. */
export function distanceFromBottom(snapshot: ScrollSnapshot): number {
  return snapshot.scrollHeight - snapshot.scrollTop - snapshot.clientHeight
}

/** True while the viewport sits within the stick threshold of the bottom. */
export function isNearBottom(snapshot: ScrollSnapshot): boolean {
  return distanceFromBottom(snapshot) < STICK_THRESHOLD_PX
}

/** Scroll-state input: where the reader currently sits. */
export interface ScrollState {
  /** Within STICK_THRESHOLD_PX of the bottom. */
  readonly nearBottom: boolean
  /** Reader-held-away latch (ticket 75): an upward scroll gesture happened
   * and the bottom band has not been reached again since. */
  readonly heldAway: boolean
}

/** Content-growth input: did the transcript's rendered content change since
 * the last pass (new entries, streamed deltas, fold toggles)? */
export interface ContentGrowth {
  readonly grew: boolean
}

/**
 * The stick decision (Seam-1 decision table, all 16 combinations of
 * heldAway × nearBottom × grew × selfSent): pin to the bottom on the user's
 * own send; otherwise follow growth only while the reader is near the
 * bottom AND not holding the viewport away. A held-away reader is never
 * yanked by growth — the ticket-75 direction-aware completion of the Q12
 * law ("growth never moves a reader who scrolled away"), now covering the
 * in-band strong stick too. Ticket 93: `selfSent` is the SEND LATCH's armed
 * state (until-arrival, see nextSendLatch), not a one-pass flag — the
 * component keeps it armed across passes and the table semantics are
 * unchanged for every reachable row.
 */
export function shouldAutoScroll(state: ScrollState, growth: ContentGrowth, selfSent: boolean): boolean {
  if (selfSent) return true
  if (state.heldAway) return false
  return state.nearBottom && growth.grew
}

/**
 * The reader-held-away latch transition (ticket 75), driven by the scroll
 * stream the ChatView already listens to (zero extra renders):
 *
 * - any REAL upward movement sets the latch — the wheel always wins, one
 *   line or one page — but only while it leaves the reader off the absolute
 *   bottom, so a content-shrink clamp onto the bottom (fold while pinned)
 *   is not mistaken for a gesture;
 * - a movement that lands ON the absolute bottom clears the latch — a clamp
 *   is the content returning the reader to the bottom (回底), and no real
 *   gesture can move up while already sitting on it;
 * - a real downward movement back into the bottom band clears it too (回底
 *   restore — the same isNearBottom reading that drives the jump button);
 * - anything else (sub-pixel noise, downward strolls above the band, pure
 *   growth with no scrollTop movement) leaves the latch as it was.
 *
 * The agency clears — own send and Jump-to-Latest click — are outright
 * assignments at their call sites (no movement sample exists there).
 *
 * deltaPx: scrollTop delta since the previous sample; the ±1px hysteresis
 * absorbs fractional-scrollTop rounding. Reused by the stick effect with
 * the live delta, so a gesture whose scroll event has not delivered yet is
 * never coalesced away by a same-frame growth yank.
 */
export function nextHeldAway(current: boolean, deltaPx: number, viewport: ScrollSnapshot): boolean {
  if (deltaPx < -1) return distanceFromBottom(viewport) > 0
  if (deltaPx > 1 && isNearBottom(viewport)) return false
  return current
}

/** True while the viewport sits ON the bottom (distance 0, ±1px absorbing
 * fractional-scrollTop rounding). Ticket 93: the send latch's ARRIVAL arm —
 * deliberately stricter than the 160px stick band: arrival is where the pin
 * lands, not the follow gate; a reader parked anywhere inside the band but
 * off the bottom has NOT arrived, and the armed agency still asks. */
export function isAtBottom(snapshot: ScrollSnapshot): boolean {
  return distanceFromBottom(snapshot) < 1
}

/**
 * The send-latch transition (ticket 93), driven by the same scroll stream
 * the held-away latch rides (zero extra renders):
 *
 * - any REAL upward movement clears the latch — during the latch's travel
 *   the reader's wheel takes over immediately (the ticket-75 law extended
 *   to the send pin: the wheel always wins, and the agency must not
 *   out-rank a gesture that happened after it);
 * - a viewport found ON the bottom clears it — ARRIVAL: the pin's job is
 *   done (a manual scroll to the bottom, a bottom clamp, or the previous
 *   pass's own pin all read here); follow resumes under the ticket-45
 *   near-bottom rule;
 * - anything else (downward travel toward the bottom, sub-pixel noise,
 *   pure growth with no scrollTop movement) keeps the latch armed — a late
 *   entry, multi-pass growth or a viewport shift between the gesture and
 *   the landing all re-pin (到达底部才清).
 *
 * deltaPx: scrollTop delta since the previous sample; the ±1px hysteresis
 * matches nextHeldAway. The stick effect replays the live delta through
 * BOTH latches, so a gesture coalesced into a growth pass is never lost —
 * the armed latch and the held-away latch can therefore never coexist after
 * a transition (the same movement clears one and sets the other).
 */
export function nextSendLatch(current: boolean, deltaPx: number, viewport: ScrollSnapshot): boolean {
  if (deltaPx < -1) return false
  if (isAtBottom(viewport)) return false
  return current
}
