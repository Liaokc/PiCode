import { useState } from 'react'
import type { JSX, MouseEvent } from 'react'
import { donutHoverCard, donutSlices, type DonutHoverCard } from '../../../shared/usage/charts'
import type { ModelUsageSlice } from '../../../shared/usage/aggregate'
import { formatTokenCount } from '../../../shared/usage/format'

interface DonutChartProps {
  slices: ModelUsageSlice[]
  /** Drill into every session that spent tokens on the picked model. */
  onPick: (model: string) => void
}

const VIEW = 180
const RADIUS = 68

/**
 * Model-share donut with legend percentages (screenshot 09 lower card).
 * Hovering an arc pops the ZCode-style white-card tooltip (model · tokens ·
 * share); the click drill-down is unchanged.
 */
export default function DonutChart({ slices, onPick }: DonutChartProps): JSX.Element {
  const arcs = donutSlices(slices, { cx: VIEW / 2, cy: VIEW / 2, r: RADIUS })
  const [hover, setHover] = useState<{ card: DonutHoverCard; x: number; y: number } | null>(null)

  /** Pointer position in the fixed 180px SVG space, plus the hovered arc. */
  const handleMove = (event: MouseEvent<SVGSVGElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) {
      setHover(null)
      return
    }
    const model = event.target instanceof Element ? event.target.closest('[data-model]')?.getAttribute('data-model') : null
    const card = model ? donutHoverCard(slices, model) : null
    if (!card) {
      setHover(null)
      return
    }
    setHover({
      card,
      x: ((event.clientX - rect.left) / rect.width) * VIEW,
      y: ((event.clientY - rect.top) / rect.height) * VIEW
    })
  }

  return (
    <div className="donut-row">
      <div className="donut-wrap">
        <svg
          className="donut-svg"
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Model usage share"
        >
          {arcs.map((arc) =>
            arc.isFullCircle ? (
              <circle
                key={arc.model}
                cx={VIEW / 2}
                cy={VIEW / 2}
                r={RADIUS}
                stroke={arc.color}
                className="donut-arc donut-arc-click"
                data-model={arc.model}
                onClick={() => onPick(arc.model)}
              />
            ) : (
              <path
                key={arc.model}
                d={arc.path}
                stroke={arc.color}
                className="donut-arc donut-arc-click"
                data-model={arc.model}
                onClick={() => onPick(arc.model)}
              />
            )
          )}
        </svg>
        {hover && (
          <div
            className="donut-tooltip"
            style={{
              left: hover.x + 14,
              top: hover.y - 14,
              transform: hover.x > VIEW / 2 ? 'translateX(-100%)' : undefined
            }}
          >
            <div className="donut-tooltip-head">
              <span className="legend-dot" style={{ background: hover.card.color }} />
              {hover.card.model}
            </div>
            <div className="donut-tooltip-row">
              <span className="donut-tooltip-tokens">{formatTokenCount(hover.card.tokens)} tokens</span>
              <span className="donut-tooltip-share">{Math.round(hover.card.share * 100)}%</span>
            </div>
          </div>
        )}
      </div>

      <div className="donut-legend">
        {slices.map((slice) => (
          <button
            key={slice.model}
            type="button"
            className="donut-legend-row"
            onClick={() => onPick(slice.model)}
          >
            <span className="legend-dot" style={{ background: arcs.find((a) => a.model === slice.model)?.color }} />
            <span className="donut-legend-name">
              <span className="donut-legend-model">{slice.model}</span>
              <span className="donut-legend-tokens">{formatTokenCount(slice.tokens)} tokens</span>
            </span>
            <span className="donut-legend-share">{Math.round(slice.share * 100)}%</span>
          </button>
        ))}
      </div>
    </div>
  )
}
