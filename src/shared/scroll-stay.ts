/**
 * Transcript scroll-stay model (ticket 45): the stick decision behind the
 * chat transcript's auto-scroll, converged into one pure function.
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
 * The same threshold drives the Jump-to-Latest button's visibility
 * (CONTEXT.md: 回底钮): scrolled away past it → the circular ↓ button fades
 * in above the composer; back within it → it fades out.
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
}

/** Content-growth input: did the transcript's rendered content change since
 * the last pass (new entries, streamed deltas, fold toggles)? */
export interface ContentGrowth {
  readonly grew: boolean
}

/**
 * The stick decision (Seam-1 decision table): pin to the bottom on the
 * user's own send, or follow growth while the reader is already pinned.
 * Growth with the reader scrolled away returns false — the Q12 behavior
 * change this ticket ships.
 */
export function shouldAutoScroll(state: ScrollState, growth: ContentGrowth, selfSent: boolean): boolean {
  return selfSent || (state.nearBottom && growth.grew)
}
