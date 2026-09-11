/**
 * Chart-ready view models for the Usage page (ticket 10). Pure geometry and
 * formatting on top of the Seam-2 aggregation contract (ADR-0002): every
 * function consumes a `UsageSnapshot` (or its cell types) and returns plain
 * data the SVG components render verbatim. No file access, no DOM.
 */
import type { HeatCell, ModelUsageSlice, TrendView, UsageSnapshot } from './aggregate.ts'
import { addDays, mondayOf } from './dates.ts'
import { formatDurationMs, formatMonthLabel, formatShortDate, formatStreakDays, formatTokenCount } from './format.ts'

export type { HeatCell, ModelUsageSlice, TrendView, UsageSnapshot }

// --- headline cards ----------------------------------------------------------

export interface StatCards {
  totalTokens: string
  peakDay: string | null
  longestChatDay: string | null
  currentStreak: string
  longestStreak: string
}

export function statCards(snapshot: UsageSnapshot): StatCards {
  return {
    totalTokens: formatTokenCount(snapshot.totalTokens),
    peakDay: snapshot.peakDay ? formatTokenCount(snapshot.peakDay.tokens) : null,
    longestChatDay: snapshot.longestChatDay ? formatDurationMs(snapshot.longestChatDay.durationMs) : null,
    currentStreak: formatStreakDays(snapshot.currentStreak?.days ?? 0),
    longestStreak: formatStreakDays(snapshot.longestStreak?.days ?? 0)
  }
}

// --- palette -------------------------------------------------------------------

/** Categorical palette, hues matched against the reference screenshot but
 * taken one Tailwind step lighter (400 vs 500) — the operator prefers a
 * pastel family on the light shell (2026-09-11, ticket-65 review). */
export const MODEL_PALETTE = [
  '#60a5fa', // blue
  '#4ade80', // green
  '#c084fc', // purple
  '#f87171', // red
  '#fb923c', // orange
  '#2dd4bf', // teal
  '#facc15', // yellow
  '#a78bfa', // violet
  '#f472b6', // pink
  '#94a3b8' // slate
] as const

export function modelColor(index: number): string {
  return MODEL_PALETTE[index % MODEL_PALETTE.length]
}

// --- heatmap -------------------------------------------------------------------

export type HeatmapMode = 'daily' | 'weekly' | 'cumulative'

export interface HeatSlot {
  date: string
  value: number
  level: 0 | 1 | 2 | 3 | 4
}

export interface HeatColumn {
  /** Monday of the column's week (also the single slot date in weekly mode). */
  start: string
  /** Short month label when the column opens a month (or is the first column). */
  monthLabel: string | null
  slots: HeatSlot[]
}

export interface HeatGrid {
  mode: HeatmapMode
  max: number
  columns: HeatColumn[]
}

function levelOf(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || max <= 0) return 0
  return Math.min(4, Math.ceil((value / max) * 4)) as 0 | 1 | 2 | 3 | 4
}

/** When the grid opens ≤1 week before a month boundary, columns 0 and 1 both
 * get labels one 18px column apart — they paint over each other (reference
 * 09 shows one label per month). The partial first week's label yields. */
function yieldCollidingFirstLabel(columns: HeatColumn[]): void {
  if (columns.length >= 2 && columns[0].monthLabel !== null && columns[1].monthLabel !== null) {
    columns[0].monthLabel = null
  }
}

/**
 * Lay heatmap cells out GitHub-style: columns are Monday-start weeks; daily and
 * cumulative modes fill seven weekday slots per column (padded to whole weeks),
 * weekly mode collapses each week into a single slot. Levels are 0–4 against
 * the maximum of the chosen mode, so toggling modes re-colors the same grid.
 */
export function heatmapGrid(cells: HeatCell[], mode: HeatmapMode): HeatGrid {
  if (cells.length === 0) return { mode, max: 0, columns: [] }

  const sorted = [...cells].sort((a, b) => a.date.localeCompare(b.date))

  if (mode === 'weekly') {
    const weekTotals = new Map<string, number>()
    for (const cell of sorted) {
      const week = mondayOf(cell.date)
      weekTotals.set(week, (weekTotals.get(week) ?? 0) + cell.tokens)
    }
    const weeks = [...weekTotals.keys()].sort()
    const max = Math.max(...weekTotals.values())
    const weeklyColumns = weeks.map((week, i) => ({
      start: week,
      monthLabel: i === 0 ? formatMonthLabel(week) : columnMonthLabel(week, addDays(week, 6)),
      slots: [{ date: week, value: weekTotals.get(week) ?? 0, level: levelOf(weekTotals.get(week) ?? 0, max) }]
    }))
    yieldCollidingFirstLabel(weeklyColumns)
    return {
      mode,
      max,
      columns: weeklyColumns
    }
  }

  // daily / cumulative: one column per Monday-start week, seven slots each
  const valueByDate = new Map<string, number>()
  let running = 0
  for (const cell of sorted) {
    const value = mode === 'cumulative' ? (running += cell.tokens) : cell.tokens
    valueByDate.set(cell.date, value)
  }
  const first = sorted[0].date
  const last = sorted[sorted.length - 1].date
  const gridStart = mondayOf(first)
  const gridEnd = addDays(mondayOf(last), 6)
  const max = Math.max(0, ...valueByDate.values())
  const lastValue = valueByDate.get(last) ?? 0

  const columns: HeatColumn[] = []
  for (let colStart = gridStart; colStart <= gridEnd; ) {
    const slots: HeatSlot[] = []
    for (let i = 0; i < 7; i++) {
      const date = addDays(colStart, i)
      let value = valueByDate.get(date)
      if (value === undefined) {
        // cumulative keeps standing after the last active day; daily falls to 0
        value = mode === 'cumulative' && date > last ? lastValue : 0
      }
      slots.push({ date, value, level: levelOf(value, max) })
    }
    const nextColStart = addDays(colStart, 7)
    columns.push({
      start: colStart,
      monthLabel: columns.length === 0 ? formatMonthLabel(colStart) : columnMonthLabel(colStart, addDays(colStart, 6)),
      slots
    })
    colStart = nextColStart
  }
  yieldCollidingFirstLabel(columns)
  return { mode, max, columns }
}

/**
 * Label for a ≤7-day column span: the month whose 1st falls inside it, the
 * span's own month when it starts on a 1st, else null.
 */
function columnMonthLabel(from: string, to: string): string | null {
  if (from.slice(0, 7) !== to.slice(0, 7)) return formatMonthLabel(to)
  if (from.endsWith('-01')) return formatMonthLabel(from)
  return null
}

// --- trend chart ----------------------------------------------------------------

export interface TrendPoint {
  x: number
  y: number
  value: number
}

export interface TrendSeries {
  model: string
  color: string
  points: TrendPoint[]
  path: string
}

export interface TrendGridline {
  y: number
  value: number
}

export interface TrendXtick {
  label: string
  x: number
}

export interface TrendPlotBand {
  /** SVG y of the scale maximum (curves may rise exactly this high). */
  top: number
  /** SVG y of value 0 — the zero baseline curves must never break. */
  baseline: number
}

export interface TrendChartGeometry {
  gridlines: TrendGridline[]
  xTicks: TrendXtick[]
  series: TrendSeries[]
  /** The y band the curves occupy; hover chrome (guide line) spans it. */
  band: TrendPlotBand
}

export interface TrendBox {
  width: number
  height: number
}

const TREND_PAD = { l: 12, r: 12, t: 14, b: 26 }

const round2 = (v: number): number => Math.round(v * 100) / 100

/** Smallest 1/1.2/1.5/2/2.5/3/4/5/6/8/10 × 10^k value ≥ v (≥1). */
export function niceCeil(v: number): number {
  if (v <= 0) return 1
  let magnitude = 1
  while (magnitude * 10 <= v) magnitude *= 10
  for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * magnitude >= v) return step * magnitude
  }
  return 10 * magnitude
}

/** Catmull-Rom → cubic Bézier with control points clamped into the plot
 * band. Raw control y values escape [top, baseline] whenever a segment runs
 * into a flat stretch beside a slope (c2y = p2.y − (p3.y − p1.y)/6 with p2 on
 * the baseline and p3 above p1 — the 1.3 R11 root cause at charts.ts:222),
 * and the curve overshoots past the zero baseline. Anchors already sit inside
 * the band, so clamping just the two control points pins every segment inside
 * it (Bézier convex-hull property) — a shape-preserving minimal fix. */
function smoothPath(points: TrendPoint[], band: TrendPlotBand): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${round2(points[0].x)} ${round2(points[0].y)}`
  const clampY = (y: number): number => Math.min(band.baseline, Math.max(band.top, y))
  let path = `M ${round2(points[0].x)} ${round2(points[0].y)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, points.length - 1)]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = clampY(p1.y + (p2.y - p0.y) / 6)
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = clampY(p2.y - (p3.y - p1.y) / 6)
    path += ` C ${round2(c1x)} ${round2(c1y)}, ${round2(c2x)} ${round2(c2y)}, ${round2(p2.x)} ${round2(p2.y)}`
  }
  return path
}

/** Nearest-day snap shared by the drill-down click and the hover chrome:
 * chart-space x → { index, x } where x is the snapped day's anchor coordinate
 * (the guide line and the intersection dots share it). */
export function trendSnapAt(x: number, count: number, width: number): { index: number; x: number } {
  const step = (width - TREND_PAD.l - TREND_PAD.r) / Math.max(1, count - 1)
  const index = Math.min(Math.max(0, count - 1), Math.max(0, Math.round((x - TREND_PAD.l) / step)))
  return { index, x: round2(TREND_PAD.l + index * step) }
}

export interface TrendHoverRow {
  model: string
  color: string
  tokens: number
}

export interface TrendHoverCard {
  date: string
  /** Nonzero models of the day, in series order (ZCode omits the zeros). */
  rows: TrendHoverRow[]
  total: number
}

/** White-card content for the hovered day index: date · per-model tokens ·
 * total. Null past the data (an empty view has no hover). */
export function trendHoverCard(view: TrendView, index: number): TrendHoverCard | null {
  const date = view.dates[index]
  if (date === undefined) return null
  let total = 0
  const rows: TrendHoverRow[] = []
  view.series.forEach((series, si) => {
    const tokens = series.tokens[index] ?? 0
    total += tokens
    if (tokens > 0) rows.push({ model: series.model, color: modelColor(si), tokens })
  })
  return { date, rows, total }
}

export interface DonutHoverCard {
  model: string
  color: string
  tokens: number
  share: number
}

/** White-card content for the hovered donut arc: model · tokens · share.
 * Null when no slice carries the model. */
export function donutHoverCard(slices: ModelUsageSlice[], model: string): DonutHoverCard | null {
  const index = slices.findIndex((slice) => slice.model === model)
  if (index < 0) return null
  const slice = slices[index]
  return { model: slice.model, color: modelColor(index), tokens: slice.tokens, share: slice.share }
}

/** Map a TrendView onto SVG coordinates inside the given box. */
export function trendChart(view: TrendView, box: TrendBox): TrendChartGeometry {
  const n = view.dates.length
  const band: TrendPlotBand = { top: TREND_PAD.t, baseline: box.height - TREND_PAD.b }
  if (n === 0) return { gridlines: [], xTicks: [], series: [], band }

  const innerW = box.width - TREND_PAD.l - TREND_PAD.r
  const innerH = box.height - TREND_PAD.t - TREND_PAD.b
  const xStep = n > 1 ? innerW / (n - 1) : 0
  const xAt = (i: number): number => TREND_PAD.l + i * xStep

  const maxValue = Math.max(0, ...view.series.flatMap((s) => s.tokens))
  const yMax = niceCeil(maxValue)
  const yAt = (v: number): number => box.height - TREND_PAD.b - (v / yMax) * innerH

  const gridlines: TrendGridline[] = [1, 2, 3, 4].map((i) => {
    const value = (yMax * i) / 4
    return { value, y: round2(yAt(value)) }
  })

  const step = view.rangeDays === 7 ? 3 : 5
  const indices: number[] = []
  for (let i = 0; i < n; i += step) indices.push(i)
  if (indices[indices.length - 1] !== n - 1) {
    if (n - 1 - indices[indices.length - 1] < 2) indices[indices.length - 1] = n - 1
    else indices.push(n - 1)
  }
  const xTicks: TrendXtick[] = indices.map((i) => ({ label: formatShortDate(view.dates[i]), x: round2(xAt(i)) }))

  const series: TrendSeries[] = view.series.map((s, si) => {
    const points = s.tokens.map((value, i) => ({ x: round2(xAt(i)), y: round2(yAt(value)), value }))
    return { model: s.model, color: modelColor(si), points, path: smoothPath(points, band) }
  })

  return { gridlines, xTicks, series, band }
}

// --- donut ------------------------------------------------------------------------

export interface DonutSlice {
  model: string
  color: string
  share: number
  startAngle: number
  endAngle: number
  isFullCircle: boolean
  /** Stroke arc path ('' when isFullCircle — render a circle instead). */
  path: string
}

export interface DonutBox {
  cx: number
  cy: number
  r: number
}

function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: round2(cx + r * Math.cos(rad)), y: round2(cy + r * Math.sin(rad)) }
}

/** Lay model shares out as clockwise stroke arcs starting at twelve o'clock. */
export function donutSlices(slices: ModelUsageSlice[], box: DonutBox): DonutSlice[] {
  let cursor = -90
  return slices.map((slice, i) => {
    const startAngle = cursor
    const endAngle = startAngle + slice.share * 360
    cursor = endAngle
    const span = endAngle - startAngle
    const isFullCircle = slice.share >= 0.99999
    let path = ''
    if (!isFullCircle && span > 0) {
      const from = polar(box.cx, box.cy, box.r, startAngle)
      const to = polar(box.cx, box.cy, box.r, endAngle)
      const largeArc = span > 180 ? 1 : 0
      path = `M ${from.x} ${from.y} A ${box.r} ${box.r} 0 ${largeArc} 1 ${to.x} ${to.y}`
    }
    return {
      model: slice.model,
      color: modelColor(i),
      share: slice.share,
      startAngle,
      endAngle,
      isFullCircle,
      path
    }
  })
}
