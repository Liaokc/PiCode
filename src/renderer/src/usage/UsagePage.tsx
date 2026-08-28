import type { Dispatch, JSX } from 'react'
import type { TrendRange, SettingsUiAction } from '../../../shared/settings-model'
import type { HeatmapMode, TrendView, UsageSnapshot } from '../../../shared/usage/charts'
import { modelColor, statCards } from '../../../shared/usage/charts'
import { trendView } from '../../../shared/usage/aggregate'
import { formatCostUsd } from '../../../shared/usage/format'
import HeatmapView from './HeatmapView'
import TrendChart from './TrendChart'
import DonutChart from './DonutChart'
import Segmented from './Segmented'
import DrillDownPanel from './DrillDownPanel'

interface UsagePageProps {
  snapshot: UsageSnapshot | null
  error: string | null
  heatmapMode: HeatmapMode
  trendRange: TrendRange
  drillDown: { date: string | null; dateTo: string | null; model: string | null } | null
  dispatch: Dispatch<SettingsUiAction>
  onOpenTask: () => void
}

const DONUT_SLICES = 6

/**
 * The Usage page (reference screenshot 09): five headline cards, the
 * GitHub-style token-activity heatmap with daily/weekly/cumulative toggles,
 * the 7/30-day per-model trend, the model-share donut, and the session
 * drill-down. Every figure comes from the aggregated snapshot.
 */
export default function UsagePage(props: UsagePageProps): JSX.Element {
  const { snapshot, error, heatmapMode, trendRange, drillDown, dispatch, onOpenTask } = props

  if (error) {
    return (
      <div className="usage-page">
        <UsageHeader snapshot={null} />
        <div className="usage-empty usage-error">Usage data is unavailable right now: {error}</div>
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="usage-page">
        <UsageHeader snapshot={null} />
        <div className="usage-empty">Loading usage…</div>
      </div>
    )
  }

  const cards = statCards(snapshot)
  // heatmapGrid always consumes the raw daily cells; weekly/cumulative are
  // transforms it applies itself (passing pre-cumulative cells would double-count).
  const heatCells = snapshot.heatmap.daily
  const trend = trendView(snapshot, trendRange)
  const donut = snapshot.modelTotals.slice(0, DONUT_SLICES)

  return (
    <div className="usage-page">
      <UsageHeader snapshot={snapshot} />

      <div className="stat-cards">
        <StatCard value={cards.totalTokens} label="Total Tokens" />
        <StatCard value={cards.peakDay ?? '—'} label="Peak Day Tokens" />
        <StatCard value={cards.longestChatDay ?? '—'} label="Longest Chat Day" />
        <StatCard value={cards.currentStreak} label="Current Streak" />
        <StatCard value={cards.longestStreak} label="Longest Streak" />
      </div>

      <section className="usage-card">
        <header className="usage-card-header">
          <h2>Token Activity</h2>
          <Segmented<HeatmapMode>
            ariaLabel="Heatmap mode"
            value={heatmapMode}
            onChange={(mode) => dispatch({ type: 'set-heatmap-mode', mode })}
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'cumulative', label: 'Cumulative' }
            ]}
          />
        </header>
        <HeatmapView
          cells={heatCells}
          mode={heatmapMode}
          onPick={(date, dateTo) => dispatch({ type: 'open-drilldown', date, dateTo, model: null })}
        />
      </section>

      <div className="range-row">
        <span className="range-label">Time Range</span>
        <Segmented<TrendRange>
          ariaLabel="Trend time range"
          value={trendRange}
          onChange={(rangeDays) => dispatch({ type: 'set-trend-range', rangeDays })}
          options={[
            { value: 7, label: 'Last 7 days' },
            { value: 30, label: 'Last 30 days' }
          ]}
        />
      </div>

      <section className="usage-card">
        <h2>Daily Token Trend</h2>
        <TrendLegend view={trend} />
        <TrendChart view={trend} onPick={(date) => dispatch({ type: 'open-drilldown', date, model: null })} />
      </section>

      <section className="usage-card">
        <h2>Model Usage</h2>
        {donut.length === 0 ? (
          <div className="usage-empty">No model usage yet.</div>
        ) : (
          <DonutChart slices={donut} onPick={(model) => dispatch({ type: 'open-drilldown', date: null, model })} />
        )}
      </section>

      {drillDown && <DrillDownPanel drillDown={drillDown} snapshot={snapshot} dispatch={dispatch} onOpenTask={onOpenTask} />}
    </div>
  )
}

function UsageHeader({ snapshot }: { snapshot: UsageSnapshot | null }): JSX.Element {
  return (
    <header className="usage-header">
      <h1>Usage</h1>
      <span className="usage-chip">App usage</span>
      <span className="usage-header-spacer" />
      {snapshot && (
        <span className="usage-cost" title="Aggregated from Pi session records">
          Estimated cost <strong>{formatCostUsd(snapshot.totalCost.amountUsd)}</strong> · estimated
        </span>
      )}
    </header>
  )
}

function StatCard({ value, label }: { value: string; label: string }): JSX.Element {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function TrendLegend({ view }: { view: TrendView }): JSX.Element | null {
  if (view.series.length === 0) return null
  return (
    <div className="trend-legend">
      {view.series.map((series, i) => (
        <span key={series.model} className="trend-legend-item">
          <span className="legend-dot" style={{ background: modelColor(i) }} />
          {series.model}
        </span>
      ))}
    </div>
  )
}
