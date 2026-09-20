import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { foldAnchorScrollTop, type FoldAnchorSnapshot } from '../../../shared/fold-anchor'
import { isAtBottom, isNearBottom } from '../../../shared/scroll-stay'

/**
 * One measured snapshot of the transcript scroll box plus the toggled
 * container header's position relative to the box's top edge. Window-relative
 * noise cancels: only the difference between two snapshots of the same
 * box/header pair is ever consumed.
 */
function readFoldSnapshot(scroll: HTMLElement, header: Element): FoldAnchorSnapshot | null {
  if (!scroll.isConnected || !header.isConnected) return null
  const boxTop = scroll.getBoundingClientRect().top
  const headerTop = header.getBoundingClientRect().top - boxTop
  return {
    scrollTop: scroll.scrollTop,
    clientHeight: scroll.clientHeight,
    scrollHeight: scroll.scrollHeight,
    headerTop
  }
}

/**
 * Ticket 94: deterministic fold anchoring around every open-flip of a
 * Worked container (Q10 ruling, scroll-stay family). The layout effect
 * watches the rendered-open state commit by commit; when it flips between
 * two consecutive commits it applies the shared pure rule
 * (foldAnchorScrollTop) — the header row is restored (① 视口不在底部：点击
 * 的那行永不跳) or the bottom stays pinned (② 吸底态：底不动，栏头按需上移)
 * — BEFORE the browser paints, so the toggle never shows an unanchored
 * frame.
 *
 * The "before" half of the measurement pair comes from two sources:
 *
 * - CLICK TOGGLES → `capture()` (returned; the header's onClick runs it
 *   before scheduling the toggle) reads the viewport state SYNCHRONOUSLY at
 *   click time. This is exact — scrollTop reads back already-clamped, and
 *   no async scroll event has to have delivered — so a reader who scrolls
 *   to the bottom and clicks within the same frames still reads as pinned.
 * - PROGRAMMATIC FLIPS (settle auto-fold, ticket-56 pending-approval
 *   force-open) → the last commit's cached snapshot, kept fresh on the
 *   scroll stream by the passive listener below (scrolling never renders,
 *   so the commit-time cache alone would lag the scroller). The verdict is
 *   the isNearBottom stick band: while a run streams, the stick holds a
 *   following reader inside the band and its own pin writes land up to one
 *   scroll event late — a reader the stick is holding IS 吸底 semantically,
 *   and the band absorbs that lag.
 *
 * Click-driven and programmatic flips flow through the same flip detection
 * and the same pure rule — one law, no special cases. The correction itself
 * rides the existing scroll stream (a scroll event fires like any other
 * programmatic scroll), so the two latches see it under the established
 * semantics: a correction landing on the bottom reads as 回底, never as an
 * upward gesture.
 */
export function useFoldAnchor(
  scrollRef: RefObject<HTMLDivElement | null> | undefined,
  headerRef: RefObject<HTMLButtonElement | null>,
  open: boolean
): () => void {
  // The previous commit's { rendered-open, measured snapshot }. Null until
  // the first commit — a container mounting already-open has no "before"
  // row to preserve, and mounting is not a flip.
  const last = useRef<{ open: boolean; snapshot: FoldAnchorSnapshot | null } | null>(null)
  // A click-time capture (set by capture(), consumed by the flip commit).
  const clickCapture = useRef<FoldAnchorSnapshot | null>(null)

  useLayoutEffect(() => {
    const scroll = scrollRef?.current ?? null
    const header = headerRef.current
    const prev = last.current
    const snapshot = scroll !== null && header !== null ? readFoldSnapshot(scroll, header) : null
    const clicked = clickCapture.current
    clickCapture.current = null
    last.current = { open, snapshot }
    if (prev === null || prev.open === open || snapshot === null || scroll === null) return
    const before = clicked ?? prev.snapshot
    if (before === null) return
    // 吸底 verdict per flip kind (see the header comment): clicks read the
    // exact state they captured; programmatic flips read the stick band.
    const pinned = clicked !== null ? isAtBottom(before) : isNearBottom(before)
    const target = foldAnchorScrollTop(before, snapshot, pinned)
    if (target !== snapshot.scrollTop) scroll.scrollTop = target
  })

  // Cache freshness for the programmatic-flip path: rewrite the ref only —
  // zero renders. The correction's own write flows back through here (a
  // scroll event like any other), keeping the pair consistent for the next
  // flip.
  useEffect(() => {
    const scroll = scrollRef?.current ?? null
    const header = headerRef.current
    if (scroll === null || header === null) return
    const refresh = (): void => {
      const snapshot = readFoldSnapshot(scroll, header)
      if (snapshot !== null && last.current !== null) {
        last.current = { open: last.current.open, snapshot }
      }
    }
    scroll.addEventListener('scroll', refresh, { passive: true })
    return () => scroll.removeEventListener('scroll', refresh)
  }, [scrollRef])

  // The click-time half: read at onClick, before the toggle's state change
  // flushes — the DOM is exactly what the user saw when they clicked.
  const capture = useCallback((): void => {
    const scroll = scrollRef?.current ?? null
    const header = headerRef.current
    if (scroll === null || header === null) return
    const snapshot = readFoldSnapshot(scroll, header)
    if (snapshot !== null) clickCapture.current = snapshot
  }, [scrollRef])

  return capture
}
