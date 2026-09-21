import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX, type RefObject } from 'react'
import {
  BUBBLE_CLOSE_DELAY_MS,
  BUBBLE_OPEN_DELAY_MS,
  RAIL_FADE_MS,
  SCROLL_RETRY_FRAMES,
  SCROLL_TARGET_MARGIN_PX,
  VIEWPORT_PROBE_FRACTION,
  railAnchors,
  railAnchoredTurnId,
  railRenders,
  railShown,
  railTicks,
  type AnchorGeometry,
  type RailTick
} from '../../../shared/navigator-rail'
import type { TurnGroup } from '../../../shared/turn-collapse'

interface NavigatorRailProps {
  /** The grouped transcript — the same memoized groupTurns output the
   * transcript renders, so the rail never re-derives chat state. */
  turns: readonly TurnGroup[]
  /** The transcript's scroll container (ChatView owns it). */
  scrollRef: RefObject<HTMLDivElement | null>
}

/**
 * Turn Navigator (CONTEXT.md: 导航轨, ticket 46): the transcript's left-edge
 * tick rail — one tick per real user message. Hover previews the turn in a
 * right-popping bubble (user input + assistant reply), click smooth-scrolls
 * to the message. All decisions come from the Seam-1 pure model
 * (`shared/navigator-rail`); this component only measures the viewport,
 * renders the scored ticks and drives the DOM scroll.
 *
 * Performance red line (ticket 30 memo infrastructure): the rail owns its
 * hover/anchor state locally — hovering and clicking never re-render the
 * transcript. The anchored-tick measurement is rAF-throttled and only
 * reconciles the (memoized) tick rows when the anchored turn actually
 * changes.
 */
export default function NavigatorRail({ turns, scrollRef }: NavigatorRailProps): JSX.Element | null {
  const railRef = useRef<HTMLElement | null>(null)
  const columnRef = useRef<HTMLDivElement | null>(null)
  const [anchored, setAnchored] = useState<string | null>(null)
  const [wide, setWide] = useState<boolean>(() => railShown(window.innerWidth))
  // Hover-bubble state: which tick's bubble is mounted, whether it is in the
  // open (opaque) state, and the bubble's vertical anchor inside the rail.
  const [renderId, setRenderId] = useState<string | null>(null)
  const [bubbleOpen, setBubbleOpen] = useState(false)
  const [bubbleTop, setBubbleTop] = useState(0)
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const unmountTimer = useRef<number | null>(null)

  const anchors = useMemo(() => railAnchors(turns), [turns])
  const ticks = useMemo(() => railTicks(anchors, anchored), [anchors, anchored])

  // The viewport-anchored tick (Seam-1: railAnchoredTurnId — at the bottom
  // the newest turn anchors, live included; off it the probe rule follows
  // the reading position, ticket 120). rAF-throttled so a scroll burst costs
  // at most one measurement per frame, and a same-value setState never
  // reconciles anything.
  const measureAnchored = useCallback((): void => {
    const el = scrollRef.current
    if (el === null) return
    const containerTop = el.getBoundingClientRect().top
    const geometry: AnchorGeometry[] = []
    for (const node of el.querySelectorAll<HTMLElement>('[data-turn-id]')) {
      const id = node.dataset['turnId']
      if (id === undefined || id === '') continue
      geometry.push({ turnId: id, top: node.getBoundingClientRect().top - containerTop })
    }
    setAnchored(
      railAnchoredTurnId(anchors, geometry, el.clientHeight * VIEWPORT_PROBE_FRACTION, {
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
        clientHeight: el.clientHeight
      })
    )
  }, [scrollRef, anchors])

  useEffect(() => {
    const el = scrollRef.current
    if (el === null) return
    let queued = false
    const onScroll = (): void => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => {
        queued = false
        measureAnchored()
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    measureAnchored()
    return () => el.removeEventListener('scroll', onScroll)
  }, [measureAnchored, scrollRef])

  // New content / a session switch can move the anchor without a scroll
  // event (arrival pin, entries cleared) — re-measure after each commit.
  useEffect(() => {
    measureAnchored()
  }, [measureAnchored, turns])

  useEffect(() => {
    const onResize = (): void => setWide(railShown(window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Click → smooth-scroll the message to just below the top edge. DOM lookup
  // first; when the target is not mounted yet (defensive — no virtualization
  // at the current transcript scale), retry on animation frames, bounded.
  const jumpToTurn = useCallback(
    (turnId: string): void => {
      const el = scrollRef.current
      if (el === null) return
      const selector = `[data-turn-id="${CSS.escape(turnId)}"]`
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const smoothTo = (target: Element): void => {
        const delta = target.getBoundingClientRect().top - el.getBoundingClientRect().top
        el.scrollTo({
          top: Math.max(0, el.scrollTop + delta - SCROLL_TARGET_MARGIN_PX),
          behavior: reduced ? 'auto' : 'smooth'
        })
      }
      const found = el.querySelector(selector)
      if (found !== null) {
        smoothTo(found)
        return
      }
      let frames = 0
      const step = (): void => {
        const late = el.querySelector(selector)
        if (late !== null) {
          smoothTo(late)
          return
        }
        frames += 1
        if (frames < SCROLL_RETRY_FRAMES) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    },
    [scrollRef]
  )

  // Bubble open/close choreography (短延迟开合): enter opens after the open
  // delay; leaving closes after the shorter close delay, fading through the
  // rail transition before unmounting. Moving to another tick cancels the
  // pending close — the bubble glides to the new tick instead (微位移跟随).
  const handleTickEnter = useCallback((turnId: string): void => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    if (unmountTimer.current !== null) {
      window.clearTimeout(unmountTimer.current)
      unmountTimer.current = null
    }
    if (openTimer.current !== null) window.clearTimeout(openTimer.current)
    openTimer.current = window.setTimeout(() => {
      openTimer.current = null
      setRenderId(turnId)
      setBubbleOpen(true)
    }, BUBBLE_OPEN_DELAY_MS)
  }, [])

  const handleTickLeave = useCallback((): void => {
    if (openTimer.current !== null) {
      window.clearTimeout(openTimer.current)
      openTimer.current = null
    }
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      setBubbleOpen(false)
      unmountTimer.current = window.setTimeout(() => {
        unmountTimer.current = null
        setRenderId(null)
      }, RAIL_FADE_MS)
    }, BUBBLE_CLOSE_DELAY_MS)
  }, [])

  useEffect(
    () => () => {
      for (const timer of [openTimer, closeTimer, unmountTimer]) {
        if (timer.current !== null) window.clearTimeout(timer.current)
      }
    },
    []
  )

  // The bubble hangs off the rail (outside the independently scrolling tick
  // column, so the column's overflow never clips it); its vertical anchor is
  // the hovered slot's center, re-measured when the column scrolls under an
  // open bubble or the ticks re-layout.
  const updateBubbleTop = useCallback((): void => {
    const rail = railRef.current
    if (rail === null || renderId === null) return
    const slot = rail.querySelector(`[data-nav-tick="${CSS.escape(renderId)}"]`)
    if (slot === null) return
    const slotRect = slot.getBoundingClientRect()
    const railRect = rail.getBoundingClientRect()
    setBubbleTop(slotRect.top - railRect.top + slotRect.height / 2)
  }, [renderId])

  useLayoutEffect(() => {
    updateBubbleTop()
  }, [updateBubbleTop, ticks])

  useEffect(() => {
    const column = columnRef.current
    if (column === null) return
    column.addEventListener('scroll', updateBubbleTop, { passive: true })
    return () => column.removeEventListener('scroll', updateBubbleTop)
  }, [updateBubbleTop])

  if (!railRenders(anchors.length)) return null

  const bubbleAnchor = renderId === null ? null : (anchors.find((a) => a.turnId === renderId) ?? null)

  return (
    <nav ref={railRef} className={wide ? 'nav-rail' : 'nav-rail nav-rail-hidden'} aria-label="Turn navigator" inert={!wide}>
      <div className="nav-rail-ticks" ref={columnRef}>
        <div className="nav-rail-ticks-inner">
          {ticks.map((tick) => (
            <RailTickRow
              key={tick.anchor.turnId}
              tick={tick}
              onEnter={handleTickEnter}
              onLeave={handleTickLeave}
              onJump={jumpToTurn}
            />
          ))}
        </div>
      </div>
      {bubbleAnchor !== null && (
        <div className={bubbleOpen ? 'nav-bubble nav-bubble-open' : 'nav-bubble'} style={{ top: `${bubbleTop}px` }} role="tooltip">
          <div className="nav-bubble-user">{bubbleAnchor.userText}</div>
          {bubbleAnchor.replyText !== '' && <div className="nav-bubble-reply">{bubbleAnchor.replyText}</div>}
        </div>
      )}
    </nav>
  )
}

interface RailTickRowProps {
  tick: RailTick
  onEnter: (turnId: string) => void
  onLeave: () => void
  onJump: (turnId: string) => void
}

/** One tick row — memoized so hover/anchor changes reconcile only the rows
 * whose scored state changed (ticket 30 memo infrastructure). */
const RailTickRow = memo(function RailTickRow({ tick, onEnter, onLeave, onJump }: RailTickRowProps): JSX.Element {
  const firstLine = tick.anchor.userText.split('\n')[0] ?? ''
  const label = firstLine === '' ? 'Jump to this message' : `Jump to: ${firstLine}`
  return (
    <div
      className="nav-tick-slot"
      data-nav-tick={tick.anchor.turnId}
      onMouseEnter={() => onEnter(tick.anchor.turnId)}
      onMouseLeave={onLeave}
    >
      <button
        type="button"
        className={tick.tone === 'focus' ? 'nav-tick nav-tick-focus' : 'nav-tick'}
        style={{ opacity: tick.opacity }}
        aria-label={label}
        onClick={() => onJump(tick.anchor.turnId)}
      >
        <span className="nav-tick-bar" style={{ transform: `scaleX(${tick.scaleX})` }} />
      </button>
    </div>
  )
})
