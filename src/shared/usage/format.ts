/**
 * English display formatters for the Usage page (ticket 10). Pure string
 * functions so chart labels are testable in Node. All date formatting is
 * pinned to UTC so labels are deterministic regardless of host time zone —
 * the underlying day keys are already local-day-attributed by the aggregator.
 */
import type { EstimatedCost } from './types.ts'

const twoDecimals = (value: number): string => {
  const fixed = value.toFixed(2)
  return fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed.replace(/0$/, '')
}

/** 21_300_000_000 → '21.3B', 230_000_000 → '230M', 4_200 → '4.2K'. */
export function formatTokenCount(count: number): string {
  const abs = Math.abs(count)
  if (abs >= 1e9) return `${twoDecimals(count / 1e9)}B`
  if (abs >= 1e6) return `${twoDecimals(count / 1e6)}M`
  if (abs >= 1e3) {
    const thousands = count / 1e3
    // rounding must not produce a bogus '1000K'
    if (Math.abs(thousands) >= 999.995) return `${twoDecimals(count / 1e6)}M`
    return `${twoDecimals(thousands)}K`
  }
  return String(count)
}

/** 6h 40m for hour-plus spans; '14m' below an hour; '45s' below a minute. */
export function formatDurationMs(ms: number): string {
  if (ms >= 3_600_000) {
    const hours = Math.floor(ms / 3_600_000)
    const minutes = Math.floor((ms % 3_600_000) / 60_000)
    return `${hours}h ${minutes}m`
  }
  if (ms >= 60_000) return `${Math.floor(ms / 60_000)}m`
  if (ms >= 1_000) return `${Math.floor(ms / 1_000)}s`
  return '0s'
}

/** '4 days' / '1 day'. */
export function formatStreakDays(days: number): string {
  return days === 1 ? '1 day' : `${days} days`
}

/** '$0.0499' under a dollar (estimate-grade detail), '$12.35' above. */
export function formatCostUsd(usd: number): string {
  return usd < 1 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`
}

/** Every cost that reaches the UI must say so (CONTEXT.md: 估算成本). */
export function estimatedCostText(cost: EstimatedCost): string {
  return `${formatCostUsd(cost.amountUsd)} estimated`
}

/** 'YYYY-MM-DD' → 'Aug 26' (UTC-pinned, en-US). Invalid input falls back to the raw string. */
export function formatShortDate(date: string): string {
  const ms = Date.parse(`${date}T12:00:00.000Z`)
  if (!Number.isFinite(ms)) return date
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(ms)
}

/** 'YYYY-MM-DD' → 'Aug 26, 2026'. */
export function formatLongDate(date: string): string {
  const ms = Date.parse(`${date}T12:00:00.000Z`)
  if (!Number.isFinite(ms)) return date
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(ms)
}

/** 'YYYY-MM-DD' → 'Aug' — month label for heatmap columns. */
export function formatMonthLabel(date: string): string {
  const ms = Date.parse(`${date}T12:00:00.000Z`)
  if (!Number.isFinite(ms)) return date
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(ms)
}
