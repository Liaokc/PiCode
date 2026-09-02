/**
 * Pi session jsonl parsing (Seam-2, pure). Turns the raw text of one session
 * file into a normalized usage event stream. Knows the file format so the
 * aggregation layer stays format-agnostic.
 *
 * Tolerance rules (append-only writes, ADR-0002):
 * - A trailing line that does not parse is treated as a half-written tail
 *   (`pendingTail`) and excluded, never thrown on.
 * - Malformed lines that DO end with a newline are counted in `skippedLines`
 *   and skipped; parsing continues.
 * - Unknown but valid JSON entry types (extensions etc.) are ignored silently.
 */
import type { SessionFileInfo, UsageEvent, UsageTokens } from './types.ts'

export interface ParsedSessionFile {
  header: SessionFileInfo | null
  /** Usage-bearing records in file order. */
  events: UsageEvent[]
  /** ISO timestamps of every message entry (any role), file order — drives chat-day duration. */
  activityTimestamps: string[]
  /** Malformed lines (newline-terminated) that were skipped. */
  skippedLines: number
  /** True when the final line failed to parse — likely truncated mid-write. */
  pendingTail: boolean
}

const COST_MICROS_PER_USD = 1_000_000

/** Round a USD cost to integer micro-USD (estimate-grade precision, exact arithmetic). */
export function costToMicros(usd: unknown): number {
  if (typeof usd !== 'number' || !Number.isFinite(usd)) return 0
  return Math.round(usd * COST_MICROS_PER_USD)
}

/** Normalized token accounting for one usage object (same projection the
 * usage page consumes — one accounting for both ADR-0002 consumers).
 * Exported for the call-trace builder (ticket 36). */
export function normalizeTokens(usage: Record<string, unknown>): UsageTokens {
  const num = (key: string): number => {
    const v = usage[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  const input = num('input')
  const output = num('output')
  const cacheRead = num('cacheRead')
  const cacheWrite = num('cacheWrite')
  const cacheWrite1h = num('cacheWrite1h')
  const total = num('totalTokens') || input + output + cacheRead + cacheWrite + cacheWrite1h
  return { input, output, cacheRead, cacheWrite, total }
}

function extractCostMicros(usage: Record<string, unknown>): number {
  const cost = usage['cost']
  if (typeof cost !== 'object' || cost === null) return 0
  return costToMicros((cost as Record<string, unknown>)['total'])
}
interface RawEntry {
  type?: unknown
  id?: unknown
  timestamp?: unknown
  cwd?: unknown
  message?: unknown
  usage?: unknown
  modelId?: unknown
}

export function parseSessionFile(text: string): ParsedSessionFile {
  let header: SessionFileInfo | null = null
  const events: UsageEvent[] = []
  const activityTimestamps: string[] = []
  let skippedLines = 0
  let pendingTail = false

  const lines = text.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop() // trailing newline

  // Model in effect, tracked from model_change entries (used when an event
  // itself carries no model — compaction/branch summaries).
  let currentModel: string | null = null

  const parseLine = (line: string, isLast: boolean): void => {
    if (line.trim() === '') return
    let entry: RawEntry
    try {
      entry = JSON.parse(line) as RawEntry
    } catch {
      if (isLast) pendingTail = true
      else skippedLines++
      return
    }
    if (typeof entry !== 'object' || entry === null || typeof entry.type !== 'string') {
      if (isLast) pendingTail = true
      else skippedLines++
      return
    }

    switch (entry.type) {
      case 'session': {
        const id = typeof entry.id === 'string' ? entry.id : ''
        if (id) {
          header = {
            id,
            cwd: typeof entry.cwd === 'string' ? entry.cwd : '',
            startedAt: typeof entry.timestamp === 'string' ? entry.timestamp : ''
          }
        }
        return
      }
      case 'model_change': {
        if (typeof entry.modelId === 'string') currentModel = entry.modelId
        return
      }
      case 'message': {
        if (typeof entry.timestamp === 'string') activityTimestamps.push(entry.timestamp)
        const message = entry.message
        if (typeof message !== 'object' || message === null) return
        const msg = message as Record<string, unknown>
        if (msg['role'] !== 'assistant' || typeof msg['usage'] !== 'object' || msg['usage'] === null) return
        const usage = msg['usage'] as Record<string, unknown>
        const model = typeof msg['model'] === 'string' ? msg['model'] : (currentModel ?? 'unknown')
        events.push({
          kind: 'message',
          id: typeof entry.id === 'string' ? entry.id : null,
          timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : '',
          model,
          tokens: normalizeTokens(usage),
          costMicros: extractCostMicros(usage)
        })
        return
      }
      case 'compaction':
      case 'branch_summary': {
        const usage = entry.usage
        if (typeof usage !== 'object' || usage === null) return
        const u = usage as Record<string, unknown>
        events.push({
          kind: entry.type === 'compaction' ? 'compaction' : 'branch-summary',
          id: typeof entry.id === 'string' ? entry.id : null,
          timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : '',
          model: currentModel ?? 'unknown',
          tokens: normalizeTokens(u),
          costMicros: extractCostMicros(u)
        })
        return
      }
      default:
        return // extension/custom entries carry no usage
    }
  }

  for (let i = 0; i < lines.length; i++) parseLine(lines[i], i === lines.length - 1)

  return { header, events, activityTimestamps, skippedLines, pendingTail }
}
