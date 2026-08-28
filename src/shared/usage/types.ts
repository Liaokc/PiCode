/**
 * Usage contract types (Seam-2). These are the stable shapes the charts and the
 * IPC layer consume — see spec.md "Usage 聚合器缝" and ADR-0002.
 *
 * Costs are always estimates (CONTEXT.md: 估算成本) and are accounted as integer
 * micro-USD internally so that incremental re-aggregation is exactly idempotent
 * (float sums would drift between one-shot and chunked folds).
 */

/** A cost figure that is, was, and always will be an estimate. */
export interface EstimatedCost {
  readonly amountUsd: number
  readonly estimated: true
}

/** One usage-bearing record extracted from a session file (assistant message, compaction, branch summary). */
export interface UsageEvent {
  kind: 'message' | 'compaction' | 'branch-summary'
  id: string | null
  /** ISO timestamp copied from the session entry. */
  timestamp: string
  /** Model id in effect when the tokens were spent (display key; see parse.ts). */
  model: string
  tokens: UsageTokens
  /** Integer micro-USD (1 USD = 1_000_000 micros). */
  costMicros: number
}

export interface UsageTokens {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  /** usage.totalTokens when present, else the component sum. */
  total: number
}

/** Header of a session jsonl file. */
export interface SessionFileInfo {
  id: string
  cwd: string
  startedAt: string
}
