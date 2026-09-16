import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import {
  RING_CLOSE_DELAY_MS,
  RING_FADE_MS,
  RING_OPEN_DELAY_MS,
  contextRingView,
  formatRingHitRate,
  formatRingPercent,
  formatRingTokens,
  type ContextRingInput
} from '../../../shared/context-ring'

/** SVG ring geometry: a 15px box, 2px stroke, radius 6.5 (the ZCode ring's
 * small footprint at the model chip's left; the constants live beside the
 * arc math so the dasharray stays exact). */
const RING_BOX = 15
const RING_RADIUS = 6.5
const RING_CENTER = RING_BOX / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

/**
 * The context ring (ticket 77, CONTEXT.md: 上下文圆环): the composer model
 * chip's left-hand occupancy ring. Every decision comes from the Seam-1 pure
 * model (`shared/context-ring`): the grey idle ring when no valid usage is
 * known, the grey no-window ring when the window is unknown (both WITHOUT
 * hover — no invented data), and the arc + hover data popover when ready.
 *
 * The popover is deliberately NOT the Tooltip component (CONTEXT.md: data
 * reveals don't ride it) — it is the pi16-context-ring-hover data card:
 * percent + used/limit, the IN/OUT/cacheRead/cacheWrite quadruple, and the
 * cache hit rate. The ZCode category breakdown is NOT reproducible from the
 * session file (数据源如实) and is left out by the ticket.
 */
export default function ContextRing({ input }: { input: ContextRingInput }): JSX.Element {
  const view = contextRingView(input)
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const unmountTimer = useRef<number | null>(null)

  useEffect(
    () => () => {
      for (const timer of [openTimer, closeTimer, unmountTimer]) {
        if (timer.current !== null) window.clearTimeout(timer.current)
      }
    },
    []
  )

  /** Hover opens the data popover — ready rings only (无 usage 灰环无 hover). */
  const handleEnter = useCallback(() => {
    if (view.mode !== 'ready') return
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
      setMounted(true)
      setOpen(true)
    }, RING_OPEN_DELAY_MS)
  }, [view.mode])

  const handleLeave = useCallback(() => {
    if (openTimer.current !== null) {
      window.clearTimeout(openTimer.current)
      openTimer.current = null
    }
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      setOpen(false)
      unmountTimer.current = window.setTimeout(() => {
        unmountTimer.current = null
        setMounted(false)
      }, RING_FADE_MS)
    }, RING_CLOSE_DELAY_MS)
  }, [])

  const usage = view.usage
  const summary =
    view.mode === 'ready' && usage !== null
      ? `Context usage ${formatRingPercent(view.percent)} — ${formatRingTokens(view.used)} of ${formatRingTokens(view.limit)} tokens`
      : 'Context usage unknown'

  return (
    <span className="ctx-ring-wrap">
      <span
        className={`ctx-ring ctx-ring-${view.mode}`}
        data-ring-mode={view.mode}
        data-ring-fraction={view.fraction.toFixed(4)}
        role="img"
        aria-label={summary}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <svg width={RING_BOX} height={RING_BOX} viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}>
          <circle className="ctx-ring-track" cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS} fill="none" strokeWidth="2" />
          {view.mode === 'ready' && usage !== null && (
            <circle
              className="ctx-ring-arc"
              cx={RING_CENTER}
              cy={RING_CENTER}
              r={RING_RADIUS}
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={`${view.fraction * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
              transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
            />
          )}
        </svg>
      </span>
      {mounted && view.mode === 'ready' && usage !== null && (
        /* The data popover (pi16-context-ring-hover): percent + used/limit on
           the header row, the ZCode progress bar, the token quadruple, and
           the cache hit rate behind the divider. Hovering IT holds it open. */
        <div className={open ? 'ctx-ring-pop ctx-ring-pop-open' : 'ctx-ring-pop'} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
          <div className="ctx-ring-pop-head">
            <span className="ctx-ring-pop-title">Context window</span>
            <span className="ctx-ring-pop-total">
              {formatRingTokens(view.used)} / {formatRingTokens(view.limit)} ({formatRingPercent(view.percent)})
            </span>
          </div>
          <div className="ctx-ring-pop-bar" role="img" aria-label={`Context window ${formatRingPercent(view.percent)} used`}>
            <span className="ctx-ring-pop-bar-fill" style={{ width: `${view.fraction * 100}%` }} />
          </div>
          <dl className="ctx-ring-pop-rows">
            <div className="ctx-ring-pop-row">
              <dt>IN</dt>
              <dd>{formatRingTokens(usage.input)}</dd>
            </div>
            <div className="ctx-ring-pop-row">
              <dt>OUT</dt>
              <dd>{formatRingTokens(usage.output)}</dd>
            </div>
            <div className="ctx-ring-pop-row">
              <dt>cacheRead</dt>
              <dd>{formatRingTokens(usage.cacheRead)}</dd>
            </div>
            <div className="ctx-ring-pop-row">
              <dt>cacheWrite</dt>
              <dd>{formatRingTokens(usage.cacheWrite)}</dd>
            </div>
          </dl>
          {formatRingHitRate(view.cacheHitRate) !== null && (
            <div className="ctx-ring-pop-hit">
              <span className="ctx-ring-pop-hit-label">Cache hit rate</span>
              <span className="ctx-ring-pop-hit-value">{formatRingHitRate(view.cacheHitRate)}</span>
            </div>
          )}
        </div>
      )}
    </span>
  )
}
