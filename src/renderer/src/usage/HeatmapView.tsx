import type { JSX } from 'react'
import { heatmapGrid, type HeatCell, type HeatmapMode } from '../../../shared/usage/charts'
import { formatShortDate, formatTokenCount } from '../../../shared/usage/format'
import { addDays } from '../../../shared/usage/dates'

interface HeatmapViewProps {
  cells: HeatCell[]
  mode: HeatmapMode
  /** Drill into the clicked day (or week span in weekly mode). */
  onPick: (date: string, dateTo: string | null) => void
}

/**
 * GitHub-style activity grid rendered from aggregated cells only. Every cell
 * with activity is a drill-down entry point.
 */
export default function HeatmapView({ cells, mode, onPick }: HeatmapViewProps): JSX.Element {
  const grid = heatmapGrid(cells, mode)

  if (grid.columns.length === 0) {
    return <div className="usage-empty">No activity recorded yet.</div>
  }

  const titleFor = (slot: { value: number; date: string }): string =>
    `${formatTokenCount(slot.value)} tokens · ${formatShortDate(slot.date)}`

  return (
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
                  title={titleFor(slot)}
                  aria-label={titleFor(slot)}
                  onClick={() => onPick(col.start, mode === 'weekly' ? addDays(col.start, 6) : null)}
                />
              ) : (
                <div key={slot.date} className={`heat heat-${slot.level}`} title={titleFor(slot)} />
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
  )
}
