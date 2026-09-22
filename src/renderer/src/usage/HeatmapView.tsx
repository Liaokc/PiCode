import { useState } from 'react'
import type { JSX, MouseEvent } from 'react'
import {
  heatCard,
  heatmapGrid,
  HEAT_CARD_ANCHORS_COLUMN,
  type HeatCell,
  type HeatColumn,
  type HeatmapMode,
  type HeatSlot
} from '../../../shared/usage/charts'

interface HeatmapViewProps {
  cells: HeatCell[]
  mode: HeatmapMode
  /** Drill into the clicked cell's week column (its Sunday start). */
  onPick: (date: string, dateTo: string | null) => void
}

/** Hovered white-card state (trend/donut card family). The card + anchor are
 * captured with the mode and cells: a mode or data switch reshapes the grid
 * under a stationary pointer, so a mismatch voids the card at render time —
 * no effect, no cascading render. */
interface HeatHover {
  mode: HeatmapMode
  cells: HeatCell[]
  card: ReturnType<typeof heatCard>
  /** Card anchor relative to the positioned wrap: the hovered box's center x
   * and top y in daily mode; the column's topmost box in weekly/cumulative
   * (HEAT_CARD_ANCHORS_COLUMN — the card floats above the column). */
  x: number
  y: number
  /** weekly/cumulative: the anchored column's start — its boxes ring while
   * the card is up (z19-heatmap-weekly-2). */
  columnStart: string | null
}

/**
 * The Token Activity contribution grid (ticket 139): 52 whole weeks, weeks as
 * columns, days as rows (Sunday top … Saturday bottom), one box per day in
 * every mode — only the box's value changes per mode (daily / weekly /
 * cumulative). Zero-usage days and the days after the data end render as
 * empty-color boxes. Every box with activity is a drill-down entry point;
 * hovering pops the mode's white card (content + anchor per HEAT tables).
 */
export default function HeatmapView({ cells, mode, onPick }: HeatmapViewProps): JSX.Element {
  const grid = heatmapGrid(cells, mode)
  const [hover, setHover] = useState<HeatHover | null>(null)

  // A card captured under a different mode or data snapshot is stale — the
  // grid reshaped under a stationary pointer — so it voids at render time
  // and waits for the next real hover.
  const card = hover !== null && hover.mode === mode && hover.cells === cells ? hover : null

  if (grid.columns.length === 0) {
    return <div className="usage-empty">No activity recorded yet.</div>
  }

  const anchorsAtColumn = HEAT_CARD_ANCHORS_COLUMN[mode]

  const showHover = (slot: HeatSlot, column: HeatColumn, event: MouseEvent<HTMLElement>): void => {
    const wrap = event.currentTarget.closest('.heatmap-wrap')
    if (!wrap) return
    const wrapRect = wrap.getBoundingClientRect()
    if (anchorsAtColumn) {
      const colEl = event.currentTarget.closest('.heatmap-col')
      if (!colEl) return
      const colRect = colEl.getBoundingClientRect()
      setHover({
        mode,
        cells,
        card: heatCard(mode, slot, column),
        x: colRect.left + colRect.width / 2 - wrapRect.left,
        y: colRect.top - wrapRect.top,
        columnStart: column.start
      })
    } else {
      const cellRect = event.currentTarget.getBoundingClientRect()
      setHover({
        mode,
        cells,
        card: heatCard(mode, slot, column),
        x: cellRect.left + cellRect.width / 2 - wrapRect.left,
        y: cellRect.top - wrapRect.top,
        columnStart: null
      })
    }
  }

  const cellHover = (slot: HeatSlot, column: HeatColumn) => ({
    onMouseMove: (event: MouseEvent<HTMLElement>) => showHover(slot, column, event)
  })

  const cardFor = (slot: HeatSlot, column: HeatColumn): string => {
    const c = heatCard(mode, slot, column)
    return `${c.title}, ${c.value}`
  }

  return (
    <div className="heatmap-wrap" onMouseLeave={() => setHover(null)}>
      <div className="heatmap-scroll">
        <div className="heatmap">
          {grid.columns.map((col) => (
            <div
              className={`heatmap-col${card?.columnStart === col.start ? ' heatmap-col-hover' : ''}`}
              key={col.start}
            >
              {col.slots.map((slot) =>
                slot.value > 0 ? (
                  <button
                    key={slot.date}
                    type="button"
                    className={`heat heat-${slot.level}`}
                    data-date={slot.date}
                    aria-label={cardFor(slot, col)}
                    onClick={() => onPick(col.start, null)}
                    {...cellHover(slot, col)}
                  />
                ) : (
                  <div key={slot.date} className={`heat heat-${slot.level}`} data-date={slot.date} {...cellHover(slot, col)} />
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
      {card && (
        <div className="heat-tooltip" style={{ left: card.x, top: card.y }}>
          <div className="heat-card-title">{card.card.title}</div>
          <div className="heat-card-value">{card.card.value}</div>
        </div>
      )}
    </div>
  )
}
