/**
 * Context-ring model (ticket 77): the Seam-1 pure model behind the small ring
 * at the composer model chip's LEFT (ZCode context ring, same type — see
 * .scratch/compare/pi16-context-ring*.png). The renderer component
 (`ContextRing`) renders exactly what this module derives; every decision
 * lives here so it stays table-testable.
 *
 * Occupancy口径 (calibrated against the Pi TUI in the same scenario):
 *   numerator   = the most recent assistant message's usage with ALL FOUR
 *                 components counted — input + output + cacheRead +
 *                 cacheWrite. `UsageTokens.total` IS that number by the one
 *                 ADR-0002 accounting (usage.totalTokens when the file
 *                 records it — for SDK-written usage always — and the
 *                 normalizeTokens fallback otherwise; that fallback adds the
 *                 cacheWrite1h subset on top of the quadruple, the one
 *                 micro-divergence from the TUI's own fallback, degenerate
 *                 in practice). The TUI's calculateContextTokens applies the
 *                 same totalTokens-first rule, so at rest the ring's
 *                 numerator equals the TUI context readout.
 *   denominator = the current model's contextWindow (pi-ai Model field,
 *                 contract-pushed additively on ModelRef — ticket 77).
 *
 * Validity rule (the TUI's own): a message whose stopReason is aborted or
 * error carries no trustworthy usage, and an all-zero total is no usage at
 * all. The host applies this rule ONCE (assistantUsageOfMessage) on both the
 * live path (held message_end) and the replay path (leaf-path walk), so the
 * renderer receives only valid usage records — the ring is a pure projection.
 *
 * Degradations (数据源如实):
 *   - no valid usage yet          → 'idle'      grey ring, NO hover;
 *   - usage but no usable window  → 'no-window' grey ring, NO hover (a
 *     percentage without a denominator would be invented data);
 *   - otherwise                   → 'ready'     arc + hover data popover
 *     (NOT the Tooltip component — CONTEXT.md: data reveals don't ride it).
 *
 * Compaction needs NO special case: the projection always shows the latest
 * valid usage; after a compaction the next assistant message refreshes it
 * naturally (ticket 77: 零特判 — a deliberate deviation from the SDK's own
 * getContextUsage, which blanks the readout until post-compaction usage
 * exists; the operator ruled the ring honest-last-known instead).
 */

import { normalizeTokens } from './usage/parse'
import type { UsageTokens } from './usage/types'

// ---- hover popover choreography (the navigator-rail bubble's short delays) ----

/** Delay before the data popover opens on hover (ms). */
export const RING_OPEN_DELAY_MS = 120
/** Delay after leave before the popover closes (ms). */
export const RING_CLOSE_DELAY_MS = 80
/** The popover's fade-out duration; unmount happens after it (ms). */
export const RING_FADE_MS = 130

// ---- view model ----

export type ContextRingMode = 'idle' | 'no-window' | 'ready'

/** The ring's raw inputs, as the session registry holds them. */
export interface ContextRingInput {
  /** The most recent VALID assistant usage (the host projects it); null =
   * none known for this session yet. */
  usage: UsageTokens | null
  /** The current model's context window in tokens; null = unknown (legacy
   * payload or the field's honest absence). */
  contextWindow: number | null
}

/** One rendered ring state: the mode decides grey-vs-arc and hover rights;
 * the numbers feed the popover (ready only). Pure — the decision table. */
export interface ContextRingView {
  mode: ContextRingMode
  /** 0..1 clamped arc fraction (ready only; 0 otherwise). */
  fraction: number
  /** used / limit × 100, unrounded (ready only; 0 otherwise). */
  percent: number
  /** The numerator: the usage total (all four components). */
  used: number
  /** The denominator: the context window; 0 when unknown. */
  limit: number
  /** The usage record behind the popover (ready only). */
  usage: UsageTokens | null
  /** cacheRead / (input + cacheRead), 0..1; null when the denominator is
   * zero or the ring is not ready. */
  cacheHitRate: number | null
}

function usableWindow(contextWindow: number | null | undefined): contextWindow is number {
  return typeof contextWindow === 'number' && Number.isFinite(contextWindow) && contextWindow > 0
}

function usableUsage(usage: UsageTokens | null): usage is UsageTokens {
  return usage !== null && Number.isFinite(usage.total) && usage.total > 0
}

/** The one projection from (usage, window) to the rendered ring state. */
export function contextRingView(input: ContextRingInput): ContextRingView {
  const usage = usableUsage(input.usage) ? input.usage : null
  if (usage === null) {
    return { mode: 'idle', fraction: 0, percent: 0, used: 0, limit: 0, usage: null, cacheHitRate: null }
  }
  if (!usableWindow(input.contextWindow)) {
    return { mode: 'no-window', fraction: 0, percent: 0, used: usage.total, limit: 0, usage: null, cacheHitRate: null }
  }
  const limit = input.contextWindow
  const fraction = Math.min(1, Math.max(0, usage.total / limit))
  const denominator = usage.input + usage.cacheRead
  return {
    mode: 'ready',
    fraction,
    percent: (usage.total / limit) * 100,
    used: usage.total,
    limit,
    usage,
    cacheHitRate: denominator > 0 ? usage.cacheRead / denominator : null
  }
}

// ---- display formatters ----

/** '66,000' — en-US thousands separators, the trace usage column's spelling. */
export function formatRingTokens(count: number): string {
  return Math.max(0, Math.round(count)).toLocaleString('en-US')
}

/** One-decimal percent spelling, trailing .0 dropped (the ZCode hover look). */
function formatPercentNumber(value: number): string {
  const fixed = value.toFixed(1)
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed
}

/** '8.2%' — the hover header's occupancy percentage. */
export function formatRingPercent(percent: number): string {
  return `${formatPercentNumber(percent)}%`
}

/** '37.5%' for a 0..1 rate; null passes through null (the row hides). */
export function formatRingHitRate(rate: number | null): string | null {
  return rate === null ? null : `${formatPercentNumber(rate * 100)}%`
}

// ---- host-side projection (the validity rule, applied exactly once) ----

/** The usage of one raw assistant message under the TUI-calibrated validity
 * rule: assistant role, a stopReason that is neither aborted nor error, a
 * usage object, and a positive total. Undefined = the message carries no
 * trustworthy usage (the ring keeps its previous value). Pure — feeds both
 * the live message_end hold and the replay leaf-path walk. */
export function assistantUsageOfMessage(message: unknown): UsageTokens | undefined {
  if (typeof message !== 'object' || message === null) return undefined
  const record = message as Record<string, unknown>
  if (record['role'] !== 'assistant') return undefined
  if (record['stopReason'] === 'aborted' || record['stopReason'] === 'error') return undefined
  if (typeof record['usage'] !== 'object' || record['usage'] === null) return undefined
  const tokens = normalizeTokens(record['usage'] as Record<string, unknown>)
  if (!(tokens.total > 0)) return undefined
  return tokens
}

/** Walk session entries BACKWARDS (the leaf path, file order) to the most
 * recent valid assistant usage. Compaction/branch-summary boundaries are NOT
 * special-cased (ticket 77: pure projection — the latest usage is the
 * honest last-known occupancy until the next assistant message lands). */
export function lastAssistantUsage(entries: readonly unknown[]): UsageTokens | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    if (record['type'] !== 'message') continue
    const usage = assistantUsageOfMessage(record['message'])
    if (usage !== undefined) return usage
  }
  return undefined
}
