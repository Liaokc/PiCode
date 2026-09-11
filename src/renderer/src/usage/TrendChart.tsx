import { useState } from 'react'
import type { JSX, MouseEvent } from 'react'
import { trendChart, trendHoverCard, trendSnapAt, type TrendView } from '../../../shared/usage/charts'
import { formatShortDate, formatTokenCount } from '../../../shared/usage/format'

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
 * Hovering snaps to the nearest day (the same mapping the drill-down click
 * uses) and shows the ZCode-style chrome: a vertical guide line, a dot on
 * each line's intersection, and a white-card tooltip (date · per-model
 * tokens · total).
 */
export default function TrendChart({ view, onPick }: TrendChartProps): JSX.Element {
  const geo = trendChart(view, BOX)
  const [hoverX, setHoverX] = useState<number | null>(null)

  /** Pointer x in chart space (the responsive element scales the fixed viewBox). */
  const chartX = (event: MouseEvent<SVGSVGElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return Number.NaN
    return ((event.clientX - rect.left) / rect.width) * BOX.width
  }

  const handleMove = (event: MouseEvent<SVGSVGElement>): void => {
    const x = chartX(event)
    if (Number.isFinite(x)) setHoverX(x)
  }

  const handleClick = (event: MouseEvent<SVGSVGElement>): void => {
    const x = chartX(event)
    if (!Number.isFinite(x) || view.dates.length === 0) return
    onPick(view.dates[trendSnapAt(x, view.dates.length, BOX.width).index])
  }

  const snap = hoverX !== null && view.dates.length > 0 ? trendSnapAt(hoverX, view.dates.length, BOX.width) : null
  const card = snap ? trendHoverCard(view, snap.index) : null

  return (
    <div className="trend-wrap">
      <svg
        className="trend-svg"
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverX(null)}
        role="img"
        aria-label="Daily token trend per model"
      >
        {geo.gridlines.map((line) => (
          <line key={line.y} x1={12} x2={BOX.width - 12} y1={line.y} y2={line.y} className="trend-gridline" />
        ))}
        {geo.series.map((series) => (
          <path key={series.model} d={series.path} stroke={series.color} className="trend-line" />
        ))}
        {snap && card && (
          <g className="trend-hover" aria-hidden="true">
            <line className="trend-guide" x1={snap.x} x2={snap.x} y1={geo.band.top} y2={geo.band.baseline} />
            {geo.series.map((series) => {
              const point = series.points[snap.index]
              if (!point) return null
              return (
                <circle key={series.model} className="trend-hover-dot" cx={point.x} cy={point.y} r={4} fill={series.color} />
              )
            })}
          </g>
        )}
      </svg>
      {snap && card && (
        <div
          className="trend-tooltip"
          style={{
            left: `${(snap.x / BOX.width) * 100}%`,
            transform: snap.x > BOX.width / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)'
          }}
        >
          <div className="trend-tooltip-head">
            {formatShortDate(card.date)} · {formatTokenCount(card.total)} tokens
          </div>
          {card.rows.map((row) => (
            <div key={row.model} className="trend-tooltip-row">
              <span className="legend-dot" style={{ background: row.color }} />
              <span className="trend-tooltip-model">{row.model}</span>
              <span className="trend-tooltip-tokens">{formatTokenCount(row.tokens)} tokens</span>
            </div>
          ))}
        </div>
      )}
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
