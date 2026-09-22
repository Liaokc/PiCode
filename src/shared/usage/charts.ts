/**
 * Chart-ready view models for the Usage page (ticket 10). Pure geometry and
 * formatting on top of the Seam-2 aggregation contract (ADR-0002): every
 * function consumes a `UsageSnapshot` (or its cell types) and returns plain
 * data the SVG components render verbatim. No file access, no DOM.
 */
import type { HeatCell, ModelUsageSlice, TrendView, UsageSnapshot } from './aggregate.ts'
import { addDays, sundayOf } from './dates.ts'
import { formatDurationMs, formatLongDate, formatMonthLabel, formatShortDate, formatStreakDays, formatTokenCount } from './format.ts'

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
  messages: number
  level: 0 | 1 | 2 | 3 | 4
}

/** Column-level card aggregates: the week's and the term's running totals up
 * to the column's last visible day (its Saturday, clamped to the data end).
 * The weekly card reads the week pair, the cumulative card the term pair. */
export interface HeatColumnCard {
  date: string
  weekTokens: number
  weekMessages: number
  termTokens: number
  termMessages: number
}

export interface HeatColumn {
  /** First day of the column: its Sunday — contribution-graph weeks run
   * Sunday..Saturday, top row to bottom row (ticket 139, z19 frames). */
  start: string
  /** Short month label when the column opens a month (or is the first column). */
  monthLabel: string | null
  slots: HeatSlot[]
  card: HeatColumnCard
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

/** Coverage window: 52 whole weeks whose last column is the week containing
 * the data end (= today; the snapshot's daily cells are zero-filled through
 * today) — the z19 frames' one-year contribution grid. */
const HEAT_WEEK_COLUMNS = 52

/** When the grid opens ≤1 week before a month boundary, columns 0 and 1 both
 * get labels one column apart — they paint over each other. The partial
 * first week's label yields. */
function yieldCollidingFirstLabel(columns: HeatColumn[]): void {
  if (columns.length >= 2 && columns[0].monthLabel !== null && columns[1].monthLabel !== null) {
    columns[0].monthLabel = null
  }
}

/** One day's three folded series: the day's own totals, the week's
 * start-to-date totals (reset every Sunday), and the term's start-to-date
 * totals (never reset). All three fold in one ascending pass. */
interface HeatDaySeries {
  day: number
  dayMessages: number
  week: number
  weekMessages: number
  term: number
  termMessages: number
}

/** The mode table (ticket 139 Seam-1): which folded series a box renders.
 * Every mode shows the SAME 52×7 grid — one box per day, depth = usage — and
 * only the per-box series changes:
 *
 *   daily      — that day's own usage (z19-heatmap-daily-*)
 *   weekly     — the week's start through that day (z19-heatmap-weekly-*)
 *   cumulative — the term's start through that day (z19-heatmap-cumulative-*)
 *
 * Zero-usage days and the days after the data end inside the current week
 * render as level-0 empty-color boxes, never missing (ticket 125 carried). */
const HEAT_BOX_SERIES: Record<HeatmapMode, (series: HeatDaySeries) => number> = {
  daily: (series) => series.day,
  weekly: (series) => series.week,
  cumulative: (series) => series.term
}

/**
 * Lay the contribution grid out: 52 Sunday-start week columns × seven
 * weekday slots, ending at the data end's week. Levels are 0–4 against the
 * maximum of the chosen mode's box series, so toggling modes re-colors the
 * same grid.
 */
export function heatmapGrid(cells: HeatCell[], mode: HeatmapMode): HeatGrid {
  if (cells.length === 0) return { mode, max: 0, columns: [] }

  const sorted = [...cells].sort((a, b) => a.date.localeCompare(b.date))
  const today = sorted[sorted.length - 1].date
  const cellByDate = new Map(sorted.map((cell) => [cell.date, cell]))

  const gridEndWeek = sundayOf(today)
  const gridStartWeek = addDays(gridEndWeek, -(HEAT_WEEK_COLUMNS - 1) * 7)

  // Fold the three series in one ascending walk over the window. Days before
  // the window still count toward the term series (期初 = the very first
  // day, not the window's first day); days after the data end (the current
  // week's future) never fold — they stay empty in every mode.
  let termTokens = 0
  let termMessages = 0
  for (const cell of sorted) {
    if (cell.date < gridStartWeek) {
      termTokens += cell.tokens
      termMessages += cell.messages
    }
  }
  const byDate = new Map<string, HeatDaySeries>()
  let weekCursor: string | null = null
  let weekTokens = 0
  let weekMessages = 0
  for (let date = gridStartWeek; date <= today; ) {
    const sunday = sundayOf(date)
    if (sunday !== weekCursor) {
      // Week boundary: the weekly series restarts from zero every Sunday.
      weekCursor = sunday
      weekTokens = 0
      weekMessages = 0
    }
    const cell = cellByDate.get(date)
    // Gap days carry the week/term counters forward — a day without usage
    // adds nothing but never resets what came before it.
    weekTokens += cell?.tokens ?? 0
    weekMessages += cell?.messages ?? 0
    termTokens += cell?.tokens ?? 0
    termMessages += cell?.messages ?? 0
    byDate.set(date, {
      day: cell?.tokens ?? 0,
      dayMessages: cell?.messages ?? 0,
      week: weekTokens,
      weekMessages,
      term: termTokens,
      termMessages
    })
    date = addDays(date, 1)
  }

  const boxSeries = HEAT_BOX_SERIES[mode]

  const raw: { colStart: string; slots: HeatSlot[]; card: HeatColumnCard }[] = []
  let max = 0
  for (let i = 0; i < HEAT_WEEK_COLUMNS; i++) {
    const colStart = addDays(gridStartWeek, i * 7)
    const slots: HeatSlot[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(colStart, d)
      const series = byDate.get(date)
      const value = series ? boxSeries(series) : 0
      const messages = series?.dayMessages ?? 0
      max = Math.max(max, value)
      slots.push({ date, value, messages, level: 0 })
    }
    // The card describes the week through its last visible day: the column's
    // Saturday, clamped to the data end (the current week reads up to today).
    const saturday = addDays(colStart, 6)
    const cardDate = saturday <= today ? saturday : today
    const cardSeries = byDate.get(cardDate)
    raw.push({
      colStart,
      slots,
      card: {
        date: cardDate,
        weekTokens: cardSeries?.week ?? 0,
        weekMessages: cardSeries?.weekMessages ?? 0,
        termTokens: cardSeries?.term ?? 0,
        termMessages: cardSeries?.termMessages ?? 0
      }
    })
  }

  const columns: HeatColumn[] = raw.map(({ colStart, slots, card }, i) => ({
    start: colStart,
    monthLabel: i === 0 ? formatMonthLabel(colStart) : columnMonthLabel(colStart, addDays(colStart, 6)),
    slots: slots.map((slot) => ({ ...slot, level: levelOf(slot.value, max) })),
    card
  }))
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

// --- heatmap hover card ----------------------------------------------------------

/** White-card content for the heatmap hover (the trend/donut card family). */
export interface HeatCard {
  /** Line 1: the date, with the ' · This week' badge in weekly/cumulative. */
  title: string
  /** Line 2: 'N tokens · M messages'. */
  value: string
}

const heatCardValue = (tokens: number, messages: number): string =>
  `${formatTokenCount(tokens)} tokens · ${messages} ${messages === 1 ? 'message' : 'messages'}`

/** Card content per mode (ticket 139 Seam-1 table, z19 card shapes): daily
 * names the hovered day; weekly names the column week through its last
 * visible day ('当周'); cumulative reads '截至 <date> 当周累计' — the term's
 * total through the column week, current week included. */
const HEAT_CARDS: Record<HeatmapMode, (slot: HeatSlot, column: HeatColumn) => HeatCard> = {
  daily: (slot) => ({ title: formatLongDate(slot.date), value: heatCardValue(slot.value, slot.messages) }),
  weekly: (_slot, column) => ({
    title: `${formatLongDate(column.card.date)} · This week`,
    value: heatCardValue(column.card.weekTokens, column.card.weekMessages)
  }),
  cumulative: (_slot, column) => ({
    title: `Through ${formatLongDate(column.card.date)} · This week`,
    value: heatCardValue(column.card.termTokens, column.card.termMessages)
  })
}

export function heatCard(mode: HeatmapMode, slot: HeatSlot, column: HeatColumn): HeatCard {
  return HEAT_CARDS[mode](slot, column)
}

/** Card anchor per mode (ticket 139 Seam-1 table): daily floats at the
 * hovered box (z19-heatmap-daily-2); weekly/cumulative float at the column's
 * topmost box — '当周最上方方块' (z19-heatmap-weekly-2 / -cumulative-2). */
export const HEAT_CARD_ANCHORS_COLUMN: Record<HeatmapMode, boolean> = {
  daily: false,
  weekly: true,
  cumulative: true
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
