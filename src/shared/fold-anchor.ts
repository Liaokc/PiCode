/**
 * Worked-container fold anchoring (ticket 94) — the deterministic rule the
 * transcript obeys around every Worked-container fold/unfold, converged into
 * a pure function of the scroll-stay family (ticket 45/75/93's neighbor):
 *
 * Before ticket 94 the browser's own overflow-anchor heuristic decided what
 * a fold toggle did to the reading position — sometimes the header stayed,
 * sometimes it jumped or slid up (the operator: 「折叠栏展开，究竟是否栏的
 * 顶端不动还是栏顶端上移，我觉得现在的交互有点怪」). The Q10 ruling replaces
 * the heuristic with ONE table:
 *
 * ① viewport NOT bottom-pinned → the toggled container's header stays on its
 *    viewport row (点击的那行永不跳): expanding grows the content downward
 *    below the header, collapsing pulls it upward into the header;
 * ② bottom-pinned → the bottom stays pinned (底不动): expanding keeps the
 *    bottom edge fixed and the header rides up by the body height (栏头按需
 *    上移); collapsing keeps it through the range clamp.
 *
 * The renderer disables the browser heuristic (`overflow-anchor: none` on
 * the transcript scroller) and applies this function's answer after each
 * open-flip commit, from two measured snapshots: one taken before the flip
 * (the header's row at click time, or the last committed/scroll-refreshed
 * state for programmatic flips) and one after the DOM change. Measuring the
 * header's actual drift (rather than deriving it) makes the correction
 * robust against clamping, same-frame growth above the header, and any
 * residual adjuster in one stroke.
 *
 * Whether the pre-toggle viewport counts as 吸底态 is the caller's call,
 * by flip kind:
 * - CLICK toggles test the strict isAtBottom (±1px, the ticket-93 arrival
 *   strictness — NOT the 160px follow band): inside the band but off the
 *   bottom, rule ① applies.
 * - PROGRAMMATIC flips (settle auto-fold, ticket-56 pending-approval
 *   force-open) test isNearBottom — the streaming stick band. While a run
 *   streams, the stick keeps a following reader inside the band and its own
 *   writes land up to one scroll event late; a reader the stick is holding
 *   IS bottom-pinned semantically, and the band absorbs that lag. A reader
 *   who scrolled away is outside the band and keeps rule ①.
 */

import type { ScrollSnapshot } from './scroll-stay'

/** Measured geometry around one fold/unfold transition: the scroll
 * container's snapshot (ScrollSnapshot) plus the toggled container header's
 * position relative to the scroll box's top edge (viewport-independent —
 * the window itself never moves between the two measurements). */
export interface FoldAnchorSnapshot extends ScrollSnapshot {
  readonly headerTop: number
}

/**
 * The absolute scrollTop to apply after a fold/unfold, from the before/after
 * measurements and the caller's pinned verdict:
 *
 * - pinned → the post-toggle bottom (`after.scrollHeight - after.clientHeight`,
 *   floored at 0);
 * - otherwise → undo the header's measured drift
 *   (`after.scrollTop + (after.headerTop - before.headerTop)`), clamped into
 *   the post-toggle scroll range — a restore that would scroll past the
 *   (possibly shrunk) bottom lands on the bottom instead, deterministically.
 */
export function foldAnchorScrollTop(before: FoldAnchorSnapshot, after: FoldAnchorSnapshot, pinned: boolean): number {
  const max = Math.max(0, after.scrollHeight - after.clientHeight)
  if (pinned) return max
  const restored = after.scrollTop + (after.headerTop - before.headerTop)
  return Math.min(Math.max(restored, 0), max)
}
