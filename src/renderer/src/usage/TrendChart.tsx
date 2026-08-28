import type { JSX, MouseEvent } from 'react'
import { trendChart, type TrendView } from '../../../shared/usage/charts'

interface TrendChartProps {
  view: TrendView
  /** Drill into the day nearest the click. */
  onPick: (date: string) => void
}

/** Internal SVG coordinate space; the element scales responsively. */
const BOX = { width: 700, height: 280 }

/**
 * Per-model multi-line daily token trend. Consumes a TrendView (aggregated
 * cache projection) and draws smoothed polylines with dotted gridlines.
 */
export default function TrendChart({ view, onPick }: TrendChartProps): JSX.Element {
  const geo = trendChart(view, BOX)

  const handleClick = (event: MouseEvent<SVGSVGElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || view.dates.length === 0) return
    const x = ((event.clientX - rect.left) / rect.width) * BOX.width
    const step = (BOX.width - 24) / Math.max(1, view.dates.length - 1)
    const index = Math.min(view.dates.length - 1, Math.max(0, Math.round((x - 12) / step)))
    onPick(view.dates[index])
  }

  return (
    <div className="trend-wrap">
      <svg
        className="trend-svg"
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        onClick={handleClick}
        role="img"
        aria-label="Daily token trend per model"
      >
        {geo.gridlines.map((line) => (
          <line key={line.y} x1={12} x2={BOX.width - 12} y1={line.y} y2={line.y} className="trend-gridline" />
        ))}
        {geo.series.map((series) => (
          <path key={series.model} d={series.path} stroke={series.color} className="trend-line" />
        ))}
      </svg>
      <div className="trend-x-axis" aria-hidden="true">
        {geo.xTicks.map((tick) => (
          <span key={tick.label} className="trend-x-label" style={{ left: `${(tick.x / BOX.width) * 100}%` }}>
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  )
}
