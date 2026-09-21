import type { Dispatch, JSX } from 'react'
import type { DrillDownSelection, SettingsUiAction } from '../../../shared/settings-model'
import type { UsageSnapshot } from '../../../shared/usage/aggregate'
import { estimatedCostText, formatCostUsd, formatLongDate, formatTokenCount } from '../../../shared/usage/format'
import { CloseIcon } from '../components/icons'

interface DrillDownPanelProps {
  drillDown: DrillDownSelection
  snapshot: UsageSnapshot
  dispatch: Dispatch<SettingsUiAction>
}

interface Row {
  sessionId: string | null
  date: string
  tokens: number
  costUsd: number
}

/**
 * Session-level drill-down for any picked data point (day, week span, or
 * model). Lists the underlying session×day rows from the aggregated cache;
 * rows are pure display (the Open task jump was retired with ticket 124,
 * R15 — the settings Back button already returns to the workspace).
 */
export default function DrillDownPanel({ drillDown, snapshot, dispatch }: DrillDownPanelProps): JSX.Element {
  const rows: Row[] = snapshot.sessionDays
    .filter((row) => {
      if (drillDown.date && (row.date < drillDown.date || (drillDown.dateTo !== null && row.date > drillDown.dateTo))) return false
      if (drillDown.model !== null && !(row.byModel[drillDown.model] > 0)) return false
      return true
    })
    .map((row) => ({
      sessionId: row.sessionId,
      date: row.date,
      tokens: drillDown.model !== null ? (row.byModel[drillDown.model] ?? 0) : row.tokens,
      costUsd: row.cost.amountUsd
    }))

  const totalTokens = rows.reduce((sum, row) => sum + row.tokens, 0)
  const totalCostUsd = rows.reduce((sum, row) => sum + row.costUsd, 0)
  const modelScoped = drillDown.model !== null

  const title = modelScoped ? drillDown.model : 'Sessions'
  const subtitle = !drillDown.date
    ? 'All time'
    : drillDown.dateTo
      ? `${formatLongDate(drillDown.date)} – ${formatLongDate(drillDown.dateTo)}`
      : formatLongDate(drillDown.date)

  return (
    <aside className="drilldown" aria-label="Session detail">
      <header className="dd-header">
        <div>
          <div className="dd-title">{title}</div>
          <div className="dd-subtitle">{subtitle}</div>
        </div>
        <button type="button" className="dd-close" aria-label="Close detail" onClick={() => dispatch({ type: 'close-drilldown' })}>
          <CloseIcon />
        </button>
      </header>

      {rows.length === 0 ? (
        <div className="usage-empty">No sessions recorded.</div>
      ) : (
        <div className="dd-rows">
          <div className="dd-row dd-row-head">
            <span>Session</span>
            <span className="dd-right">Tokens</span>
            {!modelScoped && <span className="dd-right">Cost</span>}
          </div>
          {rows.map((row, i) => (
            <div key={`${row.sessionId ?? 'none'}-${row.date}-${i}`} className="dd-row">
              <span className="dd-session" title={row.sessionId ?? undefined}>
                {row.sessionId ? row.sessionId.slice(0, 8) : '(no id)'}
              </span>
              <span className="dd-right dd-tokens">{formatTokenCount(row.tokens)}</span>
              {!modelScoped && <span className="dd-right dd-cost">{formatCostUsd(row.costUsd)} est.</span>}
            </div>
          ))}
        </div>
      )}

      <footer className="dd-footer">
        <span>
          {rows.length} session{rows.length === 1 ? '' : 's'} · {formatTokenCount(totalTokens)} tokens
        </span>
        {!modelScoped && rows.length > 0 && <span>{estimatedCostText({ amountUsd: totalCostUsd, estimated: true })}</span>}
      </footer>
    </aside>
  )
}
