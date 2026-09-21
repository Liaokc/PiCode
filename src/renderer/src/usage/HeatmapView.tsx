import { useEffect, useState } from 'react'
import type { JSX, MouseEvent } from 'react'
import { heatmapGrid, type HeatCell, type HeatSlot, type HeatmapMode } from '../../../shared/usage/charts'
import { formatShortDate, formatTokenCount } from '../../../shared/usage/format'

interface HeatmapViewProps {
  cells: HeatCell[]
  mode: HeatmapMode
  /** Drill into the clicked day (weekly cells are days of the current week;
   * daily/cumulative cells drill from their column's Monday — unchanged). */
  onPick: (date: string, dateTo: string | null) => void
}

/** Hovered-cell white card: the day's tokens + date (trend/donut family). */
interface HeatHover {
  slot: HeatSlot
  /** Hovered cell's center x and top y, relative to the positioned wrap. */
  x: number
  y: number
  /** Anchor the card left of the cell when it sits in the wrap's right half
   * (the trend tooltip's edge flip — the page clips past the card). */
  flipLeft: boolean
}

const labelFor = (slot: { value: number; date: string }): string =>
  `${formatTokenCount(slot.value)} tokens · ${formatShortDate(slot.date)}`

/**
 * GitHub-style activity grid rendered from aggregated cells only. Weekly mode
 * reads as the current week's seven days (ticket 125); every cell with
 * activity is a drill-down entry point, and hovering any cell — zero-usage
 * days included — pops the white-card tooltip the trend and donut charts use.
 */
export default function HeatmapView({ cells, mode, onPick }: HeatmapViewProps): JSX.Element {
  const grid = heatmapGrid(cells, mode)
  const [hover, setHover] = useState<HeatHover | null>(null)

  // A mode or data switch reshapes the grid under a stationary pointer —
  // drop the stale card until the next real hover.
  useEffect(() => {
    setHover(null)
  }, [mode, cells])

  if (grid.columns.length === 0) {
    return <div className="usage-empty">No activity recorded yet.</div>
  }

  const showHover = (slot: HeatSlot, event: MouseEvent<HTMLElement>): void => {
    const wrap = event.currentTarget.closest('.heatmap-wrap')
    if (!wrap) return
    const cellRect = event.currentTarget.getBoundingClientRect()
    const wrapRect = wrap.getBoundingClientRect()
    const x = cellRect.left + cellRect.width / 2 - wrapRect.left
    setHover({
      slot,
      x,
      y: cellRect.top - wrapRect.top,
      flipLeft: x > wrapRect.width / 2
    })
  }

  const cellHover = (slot: HeatSlot) => ({
    onMouseMove: (event: MouseEvent<HTMLElement>) => showHover(slot, event),
    onMouseLeave: () => setHover(null)
  })

  return (
    <div className="heatmap-wrap">
      <div className="heatmap-scroll">
        <div className={mode === 'weekly' ? 'heatmap heatmap-weekly' : 'heatmap'}>
          {grid.columns.map((col) => (
            <div className="heatmap-col" key={col.start}>
              {col.slots.map((slot) =>
                slot.value > 0 ? (
                  <button
                    key={slot.date}
                    type="button"
                    className={`heat heat-${slot.level}`}
                    data-date={slot.date}
                    aria-label={labelFor(slot)}
                    onClick={() => onPick(col.start, null)}
                    {...cellHover(slot)}
                  />
                ) : (
                  <div key={slot.date} className={`heat heat-${slot.level}`} data-date={slot.date} {...cellHover(slot)} />
                )
              )}
            </div>
          ))}
        </div>
        <div className="heatmap-months" aria-hidden="true">
          {grid.columns.map((col) => (
            <span key={col.start} className="heatmap-month">
              {col.monthLabel ?? ''}
            </span>
          ))}
        </div>
      </div>
      {hover && (
        <div
          className="heat-tooltip"
          style={{
            left: hover.x,
            top: hover.y,
            transform: hover.flipLeft
              ? 'translate(calc(-100% - 12px), calc(-100% - 8px))'
              : 'translate(12px, calc(-100% - 8px))'
          }}
        >
          {labelFor(hover.slot)}
        </div>
      )}
    </div>
  )
}
