/**
 * Usage aggregation (Seam-2, pure). Folds parsed session-file usage events into
 * day × model cells and combines per-file folds into one chart-ready snapshot.
 *
 * Design notes:
 * - The fold unit is one session file; per-file folds combine by integer sums
 *   only (tokens, micro-USD), so re-aggregation is exactly idempotent.
 * - "Day" means the local calendar day of the entry timestamp under a time zone
 *   (defaults to the system zone).
 * - Sessions are append-only trees: usage on abandoned branches was really
 *   spent, so every usage-bearing entry in the file counts (ADR-0002).
 */
import { parseSessionFile } from './parse.ts'
import { addDays, mondayOf } from './dates.ts'
import type { EstimatedCost, SessionFileInfo, UsageEvent } from './types.ts'

export interface DayModelCell {
  tokens: number
  costMicros: number
  events: number
}

export interface ActivitySpan {
  firstTs: number
  lastTs: number
  messages: number
}

/** The aggregate of exactly one session file. */
export interface SessionFileUsage {
  header: SessionFileInfo | null
  eventCount: number
  /** Local day (YYYY-MM-DD) → normalized model id → cell. */
  days: Map<string, Map<string, DayModelCell>>
  /** Normalized model id → display spelling (first chronologically seen raw id). */
  modelDisplay: Map<string, ModelSpelling>
  /** Local day → chat activity span (message entries of any role). */
  activity: Map<string, ActivitySpan>
  skippedLines: number
  pendingTail: boolean
}

/** How one (normalized) model was first seen: its raw spelling and when. */
export interface ModelSpelling {
  /** Model id exactly as the session file recorded it. */
  raw: string
  /** Epoch ms of the earliest event carrying this normalized id. */
  firstTs: number
}

/**
 * Case-folded model identity (ticket 13): the grouping key for aggregation.
 * The same model reaches session files under different casings (local config
 * spelling vs gateway echo, e.g. GLM-5.3-flash vs glm-5.3-flash); folding on
 * the lowercase id keeps them in one group while the display keeps the first
 * raw spelling (see ModelSpelling).
 */
export function normalizeModelId(model: string): string {
  return model.toLowerCase()
}

/** True when `next` should replace `current` as the display spelling: the
 * chronologically first occurrence wins; identical timestamps fall back to
 * the lexicographically smaller raw id so the choice never depends on fold
 * order. */
export function isEarlierSpelling(current: ModelSpelling, next: ModelSpelling): boolean {
  return next.firstTs < current.firstTs || (next.firstTs === current.firstTs && next.raw < current.raw)
}

/** Merge a source display map into a target (single shared shape for per-file
 * folds, incremental store chunks, and the cross-file snapshot merge). */
export function mergeModelDisplay(target: Map<string, ModelSpelling>, source: Map<string, ModelSpelling>): void {
  for (const [key, spelling] of source) {
    const current = target.get(key)
    if (!current || isEarlierSpelling(current, spelling)) target.set(key, spelling)
  }
}

export interface FoldOptions {
  /** IANA time zone for day attribution; defaults to the system zone. */
  timeZone?: string
}

const COST_MICROS_PER_USD = 1_000_000

const dayKeyFormatters = new Map<string, Intl.DateTimeFormat>()

/** Local calendar day (YYYY-MM-DD) of an epoch-ms instant under a time zone. */
export function dayKeyFromMs(ms: number, timeZone?: string): string {
  const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  let fmt = dayKeyFormatters.get(tz)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    dayKeyFormatters.set(tz, fmt)
  }
  return fmt.format(ms)
}

function dayKeyOf(isoTimestamp: string, timeZone?: string): string | null {
  const ms = Date.parse(isoTimestamp)
  if (!Number.isFinite(ms)) return null
  return dayKeyFromMs(ms, timeZone)
}

function estimated(micros: number): EstimatedCost {
  return { amountUsd: micros / COST_MICROS_PER_USD, estimated: true }
}

function addToActivity(activity: Map<string, ActivitySpan>, timestamp: string, timeZone?: string): void {
  const ms = Date.parse(timestamp)
  if (!Number.isFinite(ms)) return
  const day = dayKeyFromMs(ms, timeZone)
  const span = activity.get(day)
  if (!span) {
    activity.set(day, { firstTs: ms, lastTs: ms, messages: 1 })
  } else {
    span.firstTs = Math.min(span.firstTs, ms)
    span.lastTs = Math.max(span.lastTs, ms)
    span.messages++
  }
}

function addEvent(days: Map<string, Map<string, DayModelCell>>, event: UsageEvent, timeZone?: string): void {
  const day = dayKeyOf(event.timestamp, timeZone)
  if (day === null) return
  let byModel = days.get(day)
  if (!byModel) {
    byModel = new Map()
    days.set(day, byModel)
  }
  const modelKey = normalizeModelId(event.model)
  const cell = byModel.get(modelKey) ?? { tokens: 0, costMicros: 0, events: 0 }
  cell.tokens += event.tokens.total
  cell.costMicros += event.costMicros
  cell.events += 1
  byModel.set(modelKey, cell)
}

// --- snapshot assembly -------------------------------------------------------

export interface DayUsage {
  date: string
  tokens: number
  cost: EstimatedCost
  byModel: Record<string, number>
  sessionCount: number
  /** Chat activity span for the day (first→last message entry), 0 when none. */
  durationMs: number
}

export interface ModelUsageSlice {
  model: string
  tokens: number
  cost: EstimatedCost
  /** 0..1 of totalTokens. */
  share: number
}

export interface SessionDayUsage {
  sessionId: string | null
  date: string
  tokens: number
  cost: EstimatedCost
  byModel: Record<string, number>
}

export interface StreakInfo {
  days: number
  startDate: string
  endDate: string
  /** True when the streak reaches today. */
  includesToday: boolean
}

export interface HeatCell {
  date: string
  tokens: number
}

export interface HeatmapView {
  /** One cell per day, ascending. */
  daily: HeatCell[]
  /** One cell per Monday-start week, ascending (date = week start). */
  weekly: HeatCell[]
  /** Running total through each day, ascending. */
  cumulative: HeatCell[]
}

/** Multi-line daily trend for the range switch (7/30 days). */
export interface TrendView {
  rangeDays: number
  /** Ascending local dates, exactly rangeDays entries, ending at the snapshot's today. */
  dates: string[]
  /** Parallel to dates; only models with tokens inside the range, desc by range total. */
  series: { model: string; tokens: number[] }[]
}

/** The chart-ready aggregation contract (Seam-2). */
export interface UsageSnapshot {
  generatedAt: string
  timeZone: string
  totalTokens: number
  totalCost: EstimatedCost
  sessionCount: number
  usageEventCount: number
  activeDayCount: number
  firstActiveDate: string | null
  lastActiveDate: string | null
  peakDay: { date: string; tokens: number } | null
  longestChatDay: { date: string; durationMs: number } | null
  currentStreak: StreakInfo | null
  longestStreak: StreakInfo | null
  /** Zero-filled local days, ascending, first activity through today. */
  daily: DayUsage[]
  heatmap: HeatmapView
  /** Descending by tokens (ties: model id ascending). */
  modelTotals: ModelUsageSlice[]
  /** Drill-down rows: which session spent what on which day. */
  sessionDays: SessionDayUsage[]
}

export interface SnapshotOptions {
  timeZone?: string
  /** ISO instant treated as "now"; defaults to the real clock. */
  now?: string
}

function consecutiveRunEnding(activeDays: Set<string>, endDate: string): { days: number; startDate: string } | null {
  if (!activeDays.has(endDate)) return null
  let days = 1
  let cursor = endDate
  while (activeDays.has(addDays(cursor, -1))) {
    cursor = addDays(cursor, -1)
    days++
  }
  return { days, startDate: cursor }
}

export function buildUsageSnapshot(files: Iterable<SessionFileUsage>, opts?: SnapshotOptions): UsageSnapshot {
  const timeZone = opts?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const nowIso = opts?.now ?? new Date().toISOString()
  const today = dayKeyFromMs(Date.parse(nowIso), timeZone)

  // merge day × model cells and day-level file counts
  const byDay = new Map<string, Map<string, DayModelCell>>()
  const filesPerDay = new Map<string, Set<string | null>>()
  const activityByDay = new Map<string, ActivitySpan>()
  const sessionRows: SessionDayUsage[] = []
  /** Normalized model id → display spelling, folded across all files. */
  const display = new Map<string, ModelSpelling>()
  let totalTokens = 0
  let totalCostMicros = 0
  let usageEventCount = 0
  const sessionIds = new Set<string | null>()

  for (const file of files) {
    mergeModelDisplay(display, file.modelDisplay)
    for (const [date, byModel] of file.days) {
      if (byModel.size === 0) continue
      let dayCells = byDay.get(date)
      if (!dayCells) {
        dayCells = new Map()
        byDay.set(date, dayCells)
      }
      const fileId = file.header?.id ?? null
      let perFile = filesPerDay.get(date)
      if (!perFile) {
        perFile = new Set()
        filesPerDay.set(date, perFile)
      }
      perFile.add(fileId)

      const rowByModel: Record<string, number> = {}
      let rowTokens = 0
      let rowCostMicros = 0
      for (const [model, cell] of byModel) {
        let merged = dayCells.get(model)
        if (!merged) {
          merged = { tokens: 0, costMicros: 0, events: 0 }
          dayCells.set(model, merged)
        }
        merged.tokens += cell.tokens
        merged.costMicros += cell.costMicros
        merged.events += cell.events
        rowByModel[model] = (rowByModel[model] ?? 0) + cell.tokens
        rowTokens += cell.tokens
        rowCostMicros += cell.costMicros
      }
      sessionIds.add(fileId)
      sessionRows.push({
        sessionId: fileId,
        date,
        tokens: rowTokens,
        cost: estimated(rowCostMicros),
        byModel: rowByModel
      })
    }

    for (const [date, span] of file.activity) {
      const merged = activityByDay.get(date)
      if (!merged) activityByDay.set(date, { ...span })
      else {
        merged.firstTs = Math.min(merged.firstTs, span.firstTs)
        merged.lastTs = Math.max(merged.lastTs, span.lastTs)
        merged.messages += span.messages
      }
    }
  }

  const displayName = (key: string): string => display.get(key)?.raw ?? key

  // Drill-down rows were accumulated under normalized keys; surface the
  // display spelling so every view (donut, trend, drill-down) joins on the
  // same strings.
  for (const row of sessionRows) {
    row.byModel = Object.fromEntries(Object.entries(row.byModel).map(([key, tokens]) => [displayName(key), tokens]))
  }

  for (const dayCells of byDay.values()) {
    for (const cell of dayCells.values()) {
      totalTokens += cell.tokens
      totalCostMicros += cell.costMicros
      usageEventCount += cell.events
    }
  }

  const sortedDays = [...byDay.keys()].sort()
  const spanStart = sortedDays.length > 0 ? (activityByDay.size > 0 ? [sortedDays[0], ...activityByDay.keys()].sort()[0] : sortedDays[0]) : null

  // daily rows, zero-filled from first day through today
  const daily: DayUsage[] = []
  if (spanStart !== null && spanStart <= today) {
    for (let date = spanStart; ; date = addDays(date, 1)) {
      const cells = byDay.get(date)
      let tokens = 0
      let costMicros = 0
      const byModel: Record<string, number> = {}
      if (cells) {
        for (const [model, cell] of cells) {
          tokens += cell.tokens
          costMicros += cell.costMicros
          byModel[displayName(model)] = cell.tokens
        }
      }
      const span = activityByDay.get(date)
      daily.push({
        date,
        tokens,
        cost: estimated(costMicros),
        byModel,
        sessionCount: filesPerDay.get(date)?.size ?? 0,
        durationMs: span ? span.lastTs - span.firstTs : 0
      })
      if (date === today) break
    }
  }

  // peak day (ties → earliest date)
  let peakDay: UsageSnapshot['peakDay'] = null
  for (const row of daily) {
    if (row.tokens > 0 && (peakDay === null || row.tokens > peakDay.tokens)) {
      peakDay = { date: row.date, tokens: row.tokens }
    }
  }

  // longest chat day (ties → earliest date)
  let longestChatDay: UsageSnapshot['longestChatDay'] = null
  for (const row of daily) {
    if (row.durationMs > 0 && (longestChatDay === null || row.durationMs > longestChatDay.durationMs)) {
      longestChatDay = { date: row.date, durationMs: row.durationMs }
    }
  }

  // streaks over active (tokens > 0) days
  const activeDays = new Set(daily.filter((d) => d.tokens > 0).map((d) => d.date))
  const activeDates = [...activeDays].sort()
  let currentStreak: StreakInfo | null = null
  if (activeDays.size > 0) {
    const lastActive = activeDates[activeDates.length - 1]
    // streak survives when today is inactive but yesterday was the last active day
    const anchor = lastActive === today ? today : addDays(today, -1) === lastActive ? lastActive : null
    if (anchor !== null) {
      const run = consecutiveRunEnding(activeDays, anchor)
      if (run) currentStreak = { days: run.days, startDate: run.startDate, endDate: anchor, includesToday: anchor === today }
    }
  }
  let longestStreak: StreakInfo | null = null
  {
    let cursorStart: string | null = null
    for (const date of activeDates) {
      const prevActive = cursorStart !== null && activeDays.has(addDays(date, -1))
      if (!prevActive) cursorStart = date
      const next = addDays(date, 1)
      const isRunEnd = !activeDays.has(next) || date === activeDates[activeDates.length - 1]
      if (isRunEnd && cursorStart !== null) {
        const days = diffDays(cursorStart, date) + 1
        if (longestStreak === null || days > longestStreak.days) {
          longestStreak = { days, startDate: cursorStart, endDate: date, includesToday: date === today }
        }
      }
    }
  }

  // model totals
  const byModelTotal = new Map<string, { tokens: number; costMicros: number }>()
  for (const cells of byDay.values()) {
    for (const [model, cell] of cells) {
      const acc = byModelTotal.get(model) ?? { tokens: 0, costMicros: 0 }
      acc.tokens += cell.tokens
      acc.costMicros += cell.costMicros
      byModelTotal.set(model, acc)
    }
  }
  const modelTotals: ModelUsageSlice[] = [...byModelTotal.entries()]
    .map(([model, acc]) => ({
      model: displayName(model),
      tokens: acc.tokens,
      cost: estimated(acc.costMicros),
      share: totalTokens > 0 ? acc.tokens / totalTokens : 0
    }))
    .sort((a, b) => b.tokens - a.tokens || a.model.localeCompare(b.model))

  // heatmap views
  const heatmap: HeatmapView = {
    daily: daily.map((d) => ({ date: d.date, tokens: d.tokens })),
    weekly: [],
    cumulative: []
  }
  {
    const weekly = new Map<string, number>()
    let running = 0
    for (const cell of heatmap.daily) {
      const week = mondayOf(cell.date)
      weekly.set(week, (weekly.get(week) ?? 0) + cell.tokens)
      running += cell.tokens
      heatmap.cumulative.push({ date: cell.date, tokens: running })
    }
    heatmap.weekly = [...weekly.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, tokens]) => ({ date, tokens }))
  }

  return {
    generatedAt: nowIso,
    timeZone,
    totalTokens,
    totalCost: estimated(totalCostMicros),
    sessionCount: sessionIds.size,
    usageEventCount,
    activeDayCount: activeDays.size,
    firstActiveDate: activeDates[0] ?? null,
    lastActiveDate: activeDates[activeDates.length - 1] ?? null,
    peakDay,
    longestChatDay,
    currentStreak,
    longestStreak,
    daily,
    heatmap,
    modelTotals,
    sessionDays: sessionRows.sort((a, b) => a.date.localeCompare(b.date) || String(a.sessionId).localeCompare(String(b.sessionId)))
  }
}

function diffDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/** Project a snapshot onto the last `rangeDays` days for the per-model trend chart. */
export function trendView(snapshot: UsageSnapshot, rangeDays: 7 | 30): TrendView {
  const today = dayKeyFromMs(Date.parse(snapshot.generatedAt), snapshot.timeZone)
  const dailyByDate = new Map(snapshot.daily.map((d) => [d.date, d]))

  const dates: string[] = []
  const filledDaily: (DayUsage | null)[] = []
  const windowStart = addDays(today, -(rangeDays - 1))
  const first = snapshot.daily.length > 0 && snapshot.daily[0].date > windowStart ? windowStart : snapshot.daily[0]?.date ?? windowStart
  for (let date = first; ; date = addDays(date, 1)) {
    dates.push(date)
    filledDaily.push(dailyByDate.get(date) ?? null)
    if (date === today) break
  }
  // keep at most the last rangeDays entries (the snapshot may span longer)
  while (dates.length > rangeDays) {
    dates.shift()
    filledDaily.shift()
  }

  const rangeTokensByModel = new Map<string, number>()
  for (const row of filledDaily) {
    if (!row) continue
    for (const [model, tokens] of Object.entries(row.byModel)) {
      rangeTokensByModel.set(model, (rangeTokensByModel.get(model) ?? 0) + tokens)
    }
  }
  const series = [...rangeTokensByModel.entries()]
    .filter(([, tokens]) => tokens > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([model]) => ({
      model,
      tokens: filledDaily.map((row) => row?.byModel[model] ?? 0)
    }))

  return { rangeDays, dates, series }
}

export function foldSessionFile(text: string, opts?: FoldOptions): SessionFileUsage {
  const parsed = parseSessionFile(text)
  const days = new Map<string, Map<string, DayModelCell>>()
  const modelDisplay = new Map<string, ModelSpelling>()
  const activity = new Map<string, ActivitySpan>()

  for (const ts of parsed.activityTimestamps) addToActivity(activity, ts, opts?.timeZone)
  for (const event of parsed.events) {
    addEvent(days, event, opts?.timeZone)
    // Display spelling tracks the same population as the cells: events whose
    // timestamp anchors them to a day (unparsable timestamps are skipped —
    // those events contribute no cells either).
    const firstTs = Date.parse(event.timestamp)
    if (!Number.isFinite(firstTs)) continue
    const modelKey = normalizeModelId(event.model)
    const candidate: ModelSpelling = { raw: event.model, firstTs }
    const current = modelDisplay.get(modelKey)
    if (!current || isEarlierSpelling(current, candidate)) modelDisplay.set(modelKey, candidate)
  }

  return {
    header: parsed.header,
    eventCount: parsed.events.length,
    days,
    modelDisplay,
    activity,
    skippedLines: parsed.skippedLines,
    pendingTail: parsed.pendingTail
  }
}

export { estimated as estimatedCostFromMicros }
