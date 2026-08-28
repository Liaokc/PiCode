import type { JSX } from 'react'
import { donutSlices } from '../../../shared/usage/charts'
import type { ModelUsageSlice } from '../../../shared/usage/aggregate'
import { formatTokenCount } from '../../../shared/usage/format'

interface DonutChartProps {
  slices: ModelUsageSlice[]
  /** Drill into every session that spent tokens on the picked model. */
  onPick: (model: string) => void
}

const VIEW = 180
const RADIUS = 68

/** Model-share donut with legend percentages (screenshot 09 lower card). */
export default function DonutChart({ slices, onPick }: DonutChartProps): JSX.Element {
  const arcs = donutSlices(slices, { cx: VIEW / 2, cy: VIEW / 2, r: RADIUS })

  return (
    <div className="donut-row">
      <svg className="donut-svg" viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label="Model usage share">
        {arcs.map((arc) =>
          arc.isFullCircle ? (
            <circle
              key={arc.model}
              cx={VIEW / 2}
              cy={VIEW / 2}
              r={RADIUS}
              stroke={arc.color}
              className="donut-arc donut-arc-click"
              onClick={() => onPick(arc.model)}
            />
          ) : (
            <path
              key={arc.model}
              d={arc.path}
              stroke={arc.color}
              className="donut-arc donut-arc-click"
              onClick={() => onPick(arc.model)}
            />
          )
        )}
      </svg>

      <div className="donut-legend">
        {slices.map((slice) => (
          <button
            key={slice.model}
            type="button"
            className="donut-legend-row"
            onClick={() => onPick(slice.model)}
            title={`Show sessions using ${slice.model}`}
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
