/**
 * Deterministic usage fixture for the visual-QA pass (ticket 12). Builds the
 * Seam-2 snapshot through the REAL aggregation (`buildUsageSnapshot`), so the
 * charts consume exactly the shape production produces — only the inputs are
 * synthetic. Never used outside `PICODE_FAKE_USAGE=1` runs.
 *
 * Shape goals (reference screenshot 09): ~4 months of sparse history with a
 * dense recent cluster, an active current streak ending today, 4+ models for
 * the trend legend and donut, and drill-down rows with per-session detail.
 */
import { buildUsageSnapshot, dayKeyFromMs, isEarlierSpelling, normalizeModelId, type ActivitySpan, type DayModelCell, type ModelSpelling, type SessionFileUsage, type UsageSnapshot } from './aggregate.ts'

export const FAKE_USAGE_MODELS = ['GLM-5.2', 'GLM-5.3', 'kimi-k3', 'deepseek-v4-pro'] as const

/** Deterministic 0..1 from an integer seed (no Math.random anywhere). */
function unit(seed: number): number {
  let x = (seed | 0) * 2654435761
  x = (x ^ (x >>> 13)) * 1274126177
  return ((x ^ (x >>> 16)) >>> 0) / 0x1_0000_0000
}

/** History length (days ending today). */
const HISTORY_DAYS = 126
/** The recent dense cluster length — mirrors the reference's active tail. */
const CLUSTER_DAYS = 21
/** Consecutive active days ending today (current streak). */
const STREAK_DAYS = 5

interface Options {
  now?: string
  timeZone?: string
}

function foldFiles(opts: Required<Options>): SessionFileUsage[] {
  const todayMs = Date.parse(opts.now)
  const files: SessionFileUsage[] = []
  // Three sessions: one long-running (whole history), one mid (cluster), one
  // recent (streak window) — so drill-down rows split sensibly.
  const spans = [
    { id: 'fixture-season', startOffset: HISTORY_DAYS },
    { id: 'fixture-cluster', startOffset: CLUSTER_DAYS + 2 },
    { id: 'fixture-streak', startOffset: STREAK_DAYS }
  ]

  for (const span of spans) {
    const days = new Map<string, Map<string, DayModelCell>>()
    const modelDisplay = new Map<string, ModelSpelling>()
    const activity = new Map<string, ActivitySpan>()
    for (let back = span.startOffset; back >= 0; back--) {
      const dayMs = todayMs - back * 86_400_000
      const date = dayKeyFromMs(dayMs, opts.timeZone)
      const daySeed = back * 7 + span.startOffset
      // Sparse before the cluster, dense inside it, always on in the streak.
      const inCluster = back <= CLUSTER_DAYS
      const inStreak = back < STREAK_DAYS
      const roll = unit(daySeed)
      const active = inStreak || (inCluster && roll < 0.72) || (!inCluster && roll < 0.14)
      if (!active) continue

      const byModel = new Map<string, DayModelCell>()
      const modelCount = 1 + Math.floor(unit(daySeed + 1) * 3)
      for (let m = 0; m < modelCount; m++) {
        const model = FAKE_USAGE_MODELS[(daySeed + m * 3) % FAKE_USAGE_MODELS.length]
        const tokens = 40_000 + Math.floor(unit(daySeed + 10 + m) * 1_800_000)
        const cell = byModel.get(model) ?? { tokens: 0, costMicros: 0, events: 0 }
        cell.tokens += tokens
        // $2.50 per million tokens, in micro-USD — a stable fixture rate.
        cell.costMicros += Math.round((tokens / 1_000_000) * 2_500_000)
        cell.events += 1 + Math.floor(unit(daySeed + 20 + m) * 6)
        byModel.set(model, cell)
        // Fixture models are already distinct under case folding; the display
        // spelling is the raw id itself.
        const key = normalizeModelId(model)
        const spelling: ModelSpelling = { raw: model, firstTs: dayMs }
        const current = modelDisplay.get(key)
        if (!current || isEarlierSpelling(current, spelling)) modelDisplay.set(key, spelling)
      }
      days.set(date, byModel)

      // Chat activity: two sittings, afternoon one longer on the cluster days.
      const firstTs = dayMs - 7 * 3600_000
      const lastTs = dayMs + (inCluster ? 5 : 2) * 3600_000
      activity.set(date, { firstTs, lastTs, messages: 4 + Math.floor(unit(daySeed + 30) * 26) })
    }
    files.push({ header: { id: span.id, cwd: '/tmp/fixture-project', startedAt: opts.now }, eventCount: 0, days, modelDisplay, activity, skippedLines: 0, pendingTail: false })
  }
  return files
}

/** Build the deterministic fixture snapshot (today = `now`, system zone default). */
export function fakeUsageSnapshot(opts?: Options): UsageSnapshot {
  const resolved: Required<Options> = {
    now: opts?.now ?? new Date().toISOString(),
    timeZone: opts?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  }
  return buildUsageSnapshot(foldFiles(resolved), { timeZone: resolved.timeZone, now: resolved.now })
}
