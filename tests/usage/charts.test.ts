import { describe, expect, it } from 'vitest'
import {
  donutHoverCard,
  donutSlices,
  heatmapGrid,
  modelColor,
  niceCeil,
  statCards,
  trendChart,
  trendHoverCard,
  trendSnapAt,
  type ModelUsageSlice,
  type TrendView
} from '../../src/shared/usage/charts.ts'
import { addDays, mondayOf } from '../../src/shared/usage/dates.ts'
import { buildUsageSnapshot, foldSessionFile } from '../../src/shared/usage/aggregate.ts'

const headerLine = (id: string) =>
  JSON.stringify({ type: 'session', version: 3, id, timestamp: '2026-08-25T00:00:00.000Z', cwd: '/tmp/proj' })

const assistant = (id: string, ts: string, total: number, model: string) =>
  JSON.stringify({
    type: 'message',
    id,
    timestamp: ts,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: '…' }],
      model,
      usage: { input: total - 10, output: 10, totalTokens: total, cost: { total: 0.001 } }
    }
  })

// --- stat cards ---------------------------------------------------------------

const cardsSnapshot = buildUsageSnapshot(
  [
    foldSessionFile(
      [
        headerLine('s-1'),
        assistant('a1', '2026-08-25T09:00:00.000Z', 100, 'm1'),
        assistant('a2', '2026-08-26T09:00:00.000Z', 200, 'm1'),
        assistant('a3', '2026-08-27T09:00:00.000Z', 400, 'm2'),
        assistant('a4', '2026-08-27T09:35:00.000Z', 10, 'm2'),
        assistant('a5', '2026-08-28T09:00:00.000Z', 30, 'm2'),
        ''
      ].join('\n'),
      { timeZone: 'UTC' }
    )
  ],
  { timeZone: 'UTC', now: '2026-08-28T12:00:00.000Z' }
)

describe('statCards', () => {
  it('formats the five headline figures from the snapshot', () => {
    expect(statCards(cardsSnapshot)).toEqual({
      totalTokens: '740',
      peakDay: '410',
      longestChatDay: '35m',
      currentStreak: '4 days',
      longestStreak: '4 days'
    })
  })

  it('degrades gracefully on an empty snapshot', () => {
    const empty = buildUsageSnapshot([], { timeZone: 'UTC', now: '2026-08-28T12:00:00.000Z' })
    expect(statCards(empty)).toEqual({
      totalTokens: '0',
      peakDay: null,
      longestChatDay: null,
      currentStreak: '0 days',
      longestStreak: '0 days'
    })
  })
})

// --- heatmap grid ---------------------------------------------------------------

describe('heatmapGrid', () => {
  const cells = [
    { date: '2026-08-25', tokens: 100 },
    { date: '2026-08-26', tokens: 250 },
    { date: '2026-08-27', tokens: 400 },
    { date: '2026-08-28', tokens: 10 }
  ]

  it('aligns daily cells into Monday-start columns of seven slots', () => {
    const grid = heatmapGrid(cells, 'daily')
    expect(grid.max).toBe(400)
    expect(grid.columns).toHaveLength(1)
    const col = grid.columns[0]
    expect(col.start).toBe('2026-08-24')
    expect(col.monthLabel).toBe('Aug')
    expect(col.slots.map((s) => s.date)).toEqual([
      '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30'
    ])
    expect(col.slots.map((s) => s.value)).toEqual([0, 100, 250, 400, 10, 0, 0])
    expect(col.slots.map((s) => s.level)).toEqual([0, 1, 3, 4, 1, 0, 0])
  })

  it('spans multiple weeks and labels columns at month starts', () => {
    const grid = heatmapGrid(
      [
        { date: '2026-08-27', tokens: 100 },
        { date: '2026-09-02', tokens: 50 }
      ],
      'daily'
    )
    expect(grid.columns.map((c) => c.start)).toEqual(['2026-08-24', '2026-08-31'])
    // The grid opens one week before the Sep boundary; the partial Aug label
    // yields so the two adjacent labels can never paint over each other.
    expect(grid.columns.map((c) => c.monthLabel)).toEqual([null, 'Sep'])
    expect(grid.columns[1].slots.find((s) => s.date === '2026-09-02')?.value).toBe(50)
  })

// --- heatmap weekly: the current week reads as seven days (ticket 125) ---------

describe('heatmapGrid weekly — seven day cells for the current week', () => {
  /** Monday..Sunday containing the anchor (the last cell = "today"). */
  const weekDays = (anchor: string): string[] =>
    Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i))

  // Anchor day (the last cell — snapshot daily cells are zero-filled through
  // today) × expected Monday..Sunday sequence. Week start is Monday, the
  // same week language as the daily grid's columns.
  const anchorTable: Array<{ anchor: string; note: string }> = [
    { anchor: '2026-09-02', note: 'mid-week anchor (Wed)' },
    { anchor: '2026-08-31', note: 'Monday anchor — week opens on it' },
    { anchor: '2026-09-06', note: 'Sunday anchor — same week as the Monday before' },
    { anchor: '2026-12-28', note: 'year-start week spans Dec→Jan' },
    { anchor: '2027-01-01', note: 'New Year day inside the week' }
  ]

  it.each(anchorTable)('spans seven weekday cells for $note', ({ anchor }) => {
    const week = weekDays(anchor)
    const grid = heatmapGrid([{ date: '2026-08-01', tokens: 10 }, { date: anchor, tokens: 20 }], 'weekly')
    expect(grid.columns.map((c) => c.start)).toEqual(week)
    expect(grid.columns.every((c) => c.slots.length === 1 && c.slots[0].date === c.start)).toBe(true)
    // Only the anchor day carries tokens; every other day of the week still
    // renders (empty color) — including the days after the anchor.
    expect(grid.columns.map((c) => c.slots[0].value)).toEqual(week.map((d) => (d === anchor ? 20 : 0)))
    expect(grid.columns.map((c) => c.slots[0].level)).toEqual(week.map((d) => (d === anchor ? 4 : 0)))
    // A 30-day history shows ONLY the current week — week aggregation is gone.
    expect(grid.columns).toHaveLength(7)
  })

  it('levels the week against its own maximum', () => {
    const week = weekDays('2026-09-02') // Mon 08-31 .. Sun 09-06
    const grid = heatmapGrid(
      [
        { date: '2026-09-01', tokens: 100 },
        { date: '2026-09-02', tokens: 50 },
        { date: '2026-09-04', tokens: 10 }
      ],
      'weekly'
    )
    expect(grid.max).toBe(100)
    expect(grid.columns.map((c) => c.slots[0].level)).toEqual([
      0, // Mon 08-31 — no usage, empty color
      4, // Tue 09-01 — the week max
      2, // Wed 09-02 — 50/100
      0, // Thu 09-03
      1, // Fri 09-04 — 10/100
      0, // Sat 09-05
      0 // Sun 09-06
    ])
    // The tooltip data of a cell is its slot: the day + token pair.
    expect(grid.columns[1].slots[0]).toEqual({ date: week[1], value: 100, level: 4 })
  })

  it('renders an all-zero week as seven empty-color cells (never missing)', () => {
    // History exists (last week was active); the snapshot's daily cells are
    // zero-filled through today, and today carries no usage yet — the
    // current week's seven boxes still render, all at level 0.
    const grid = heatmapGrid(
      [
        { date: '2026-08-26', tokens: 400 },
        { date: '2026-08-27', tokens: 10 },
        { date: '2026-09-01', tokens: 0 }
      ],
      'weekly'
    )
    expect(grid.max).toBe(0)
    expect(grid.columns).toHaveLength(7)
    expect(grid.columns.every((c) => c.slots[0].value === 0 && c.slots[0].level === 0)).toBe(true)
  })

  it('labels the month-opening day and yields a colliding first label', () => {
    // Week Mon 2026-08-31 .. Sun 2026-09-06: Sep 1 opens a month on the
    // second day, so the first column's Aug label yields (the daily grid's
    // adjacent-label rule) and Sep 1 carries the label.
    const grid = heatmapGrid([{ date: '2026-09-01', tokens: 30 }], 'weekly')
    expect(grid.columns.map((c) => c.monthLabel)).toEqual([null, 'Sep', null, null, null, null, null])
  })

  it('labels the year-opening day across the Dec→Jan week', () => {
    // Week Mon 2025-12-29 .. Sun 2026-01-04: Jan 1 opens the year mid-week.
    const grid = heatmapGrid([{ date: '2025-12-30', tokens: 30 }, { date: '2026-01-02', tokens: 30 }], 'weekly')
    expect(grid.columns.map((c) => c.monthLabel)).toEqual(['Dec', null, null, 'Jan', null, null, null])
  })
})
  it('fills gap days with zero slots — a day without usage still gets its box', () => {
    // 2026-08-26 has no cell at all: it must still render as a level-0 slot.
    const grid = heatmapGrid(
      [
        { date: '2026-08-25', tokens: 100 },
        { date: '2026-08-27', tokens: 40 }
      ],
      'daily'
    )
    expect(grid.columns[0].slots.find((s) => s.date === '2026-08-26')).toEqual({
      date: '2026-08-26',
      value: 0,
      level: 0
    })
  })

  it('colors cumulative mode by the running total', () => {
    const grid = heatmapGrid(cells, 'cumulative')
    expect(grid.max).toBe(760)
    expect(grid.columns[0].slots.map((s) => s.value)).toEqual([0, 100, 350, 750, 760, 760, 760])
    expect(grid.columns[0].slots.map((s) => s.level)).toEqual([0, 1, 2, 4, 4, 4, 4])
  })

  it('handles an empty activity history', () => {
    expect(heatmapGrid([], 'daily').columns).toEqual([])
  })
})

// --- trend chart geometry ---------------------------------------------------------

const trendView: TrendView = {
  rangeDays: 7,
  dates: ['2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'],
  series: [
    { model: 'm2', tokens: [0, 0, 0, 0, 50, 400, 10] },
    { model: 'm1', tokens: [0, 0, 0, 100, 200, 0, 0] }
  ]
}

describe('trendChart', () => {
  const geo = trendChart(trendView, { width: 700, height: 280 })

  it('maps series onto the plot box with a nice-ceiling y scale', () => {
    expect(geo.series).toHaveLength(2)
    const m2 = geo.series[0]
    expect(m2.model).toBe('m2')
    expect(m2.color).toBe(modelColor(0))
    // x = 12 + i * 676/6 (2dp), y = 254 - v/400 * 240
    expect(m2.points[0]).toEqual({ x: 12, y: 254, value: 0 })
    expect(m2.points[4]).toEqual({ x: 462.67, y: 224, value: 50 })
    expect(m2.points[5]).toEqual({ x: 575.33, y: 14, value: 400 })
    expect(m2.points[6]).toEqual({ x: 688, y: 248, value: 10 })
    expect(m2.path.startsWith('M 12 254 C ')).toBe(true)
  })

  it('emits dotted gridlines up to the scale maximum', () => {
    expect(geo.gridlines.map((g) => g.y)).toEqual([194, 134, 74, 14])
    expect(geo.gridlines.map((g) => g.value)).toEqual([100, 200, 300, 400])
  })

  it('ticks the x axis at a fixed step plus the final day', () => {
    expect(geo.xTicks.map((t) => t.label)).toEqual(['Aug 22', 'Aug 25', 'Aug 28'])
    expect(geo.xTicks[2].x).toBe(688)
  })

  it('spreads seven labels over a 30-day axis', () => {
    const dates = Array.from({ length: 30 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`)
    const geo30 = trendChart({ rangeDays: 30, dates, series: [{ model: 'm', tokens: dates.map(() => 1) }] }, { width: 700, height: 280 })
    expect(geo30.xTicks.map((t) => t.label)).toEqual([
      'Aug 1', 'Aug 6', 'Aug 11', 'Aug 16', 'Aug 21', 'Aug 26', 'Aug 30'
    ])
  })

  it('renders a flat baseline for an all-zero range', () => {
    const flat = trendChart(
      { rangeDays: 7, dates: trendView.dates, series: [{ model: 'm', tokens: trendView.dates.map(() => 0) }] },
      { width: 700, height: 280 }
    )
    expect(flat.series[0].points.every((p) => p.y === 254)).toBe(true)
    expect(flat.series[0].path.startsWith('M 12 254')).toBe(true)
  })

  it('keeps the axis for an empty series list', () => {
    const bare = trendChart({ rangeDays: 7, dates: trendView.dates, series: [] }, { width: 700, height: 280 })
    expect(bare.series).toEqual([])
    expect(bare.xTicks).toHaveLength(3)
  })
})

describe('niceCeil', () => {
  it('snaps up to the nearest 1/1.2/1.5/2/2.5/3/4/5/6/8/10 step', () => {
    expect(niceCeil(0)).toBe(1)
    expect(niceCeil(400)).toBe(400)
    expect(niceCeil(512)).toBe(600)
    expect(niceCeil(1234)).toBe(1500)
    expect(niceCeil(9_000)).toBe(10_000)
  })
})

// --- donut -----------------------------------------------------------------------

describe('donutSlices', () => {
  it('lays arcs clockwise from twelve o’clock', () => {
    const slices = donutSlices(
      [
        { model: 'a', tokens: 750, cost: { amountUsd: 1, estimated: true }, share: 0.75 },
        { model: 'b', tokens: 250, cost: { amountUsd: 1, estimated: true }, share: 0.25 }
      ],
      { cx: 0, cy: 0, r: 10 }
    )
    expect(slices[0].color).toBe(modelColor(0))
    expect(slices[0].startAngle).toBe(-90)
    expect(slices[0].endAngle).toBe(180)
    expect(slices[0].path).toBe('M 0 -10 A 10 10 0 1 1 -10 0')
    expect(slices[1].startAngle).toBe(180)
    expect(slices[1].endAngle).toBe(270)
    expect(slices[1].path).toBe('M -10 0 A 10 10 0 0 1 0 -10')
  })

  it('flags a full-circle single model instead of an arc path', () => {
    const slices = donutSlices(
      [{ model: 'a', tokens: 10, cost: { amountUsd: 1, estimated: true }, share: 1 }],
      { cx: 0, cy: 0, r: 10 }
    )
    expect(slices[0].isFullCircle).toBe(true)
    expect(slices[0].path).toBe('')
  })
})

describe('modelColor', () => {
  it('walks the palette and wraps around', () => {
    expect(modelColor(0)).toBe(modelColor(10))
    expect(modelColor(1)).not.toBe(modelColor(0))
  })
})

// --- trend curve clamping (ticket 65, 1.3 R11) ------------------------------------

/** Every y coordinate in a chart path: the strict 'M x y C x y, x y, x y …'
 * grammar puts y at each odd position of the number stream. */
function pathYs(path: string): number[] {
  const nums = path
    .split(/[\s,]+/)
    .filter((tok) => /^-?\d+(\.\d+)?$/.test(tok))
    .map(Number)
  return nums.filter((_, i) => i % 2 === 1)
}

describe('trendChart curve clamping (control points stay in band)', () => {
  const BOX = { width: 700, height: 280 }
  const clampView = (tokens: number[], rangeDays: 7 | 30 = 7): TrendView => ({
    rangeDays,
    dates: tokens.map((_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`),
    series: [{ model: 'm', tokens }]
  })

  it('keeps a 0→peak→0 spike inside the plot band — the curve never breaks the baseline', () => {
    const geo = trendChart(clampView([0, 0, 0, 900, 0, 0, 0]), BOX)
    expect(geo.band).toEqual({ top: 14, baseline: 254 })
    const ys = pathYs(geo.series[0].path)
    expect(ys.length).toBeGreaterThan(0)
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(geo.band.top)
      expect(y).toBeLessThanOrEqual(geo.band.baseline)
    }
  })

  it('survives the valley after a peak (p2 on the baseline, p3 above p1 — charts.ts:222)', () => {
    const geo = trendChart(clampView([900, 0, 0, 500, 0]), BOX)
    for (const y of pathYs(geo.series[0].path)) {
      expect(y).toBeGreaterThanOrEqual(geo.band.top)
      expect(y).toBeLessThanOrEqual(geo.band.baseline)
    }
  })

  it('renders a flat zero series as a flat baseline line (no clamp wiggle)', () => {
    const geo = trendChart(clampView([0, 0, 0, 0, 0, 0, 0]), BOX)
    const ys = pathYs(geo.series[0].path)
    expect(ys.length).toBeGreaterThan(0)
    expect(ys.every((y) => y === 254)).toBe(true)
  })

  it('passes through the day anchors — clamping reshapes controls, not the data', () => {
    const geo = trendChart(clampView([0, 0, 0, 900, 0, 0, 0]), BOX)
    const path = geo.series[0].path
    expect(path.startsWith('M 12 254')).toBe(true)
    expect(path.endsWith(`688 ${geo.series[0].points[6].y}`)).toBe(true)
  })

  it('unifies 7-day and 30-day styling — identical y geometry for identical tokens', () => {
    const tokens7 = [0, 0, 0, 900, 0, 0, 0]
    const geo7 = trendChart(clampView(tokens7, 7), BOX)
    const geo30 = trendChart(clampView([...tokens7, ...new Array(23).fill(0)], 30), BOX)
    // y positions depend only on the values and the shared band — never on
    // the range, so both intervals speak the same visual language. The 30-day
    // path covers the same 7 shared days in its first M + 6 segments (18 ys);
    // its extra flat days may only add baseline-level ys.
    const ys7 = pathYs(geo7.series[0].path)
    const ys30 = pathYs(geo30.series[0].path)
    expect(ys30.slice(0, ys7.length)).toEqual(ys7)
    expect(ys30.slice(ys7.length).every((y) => y === geo30.band.baseline)).toBe(true)
  })
})

describe('trendSnapAt (shared drill-down click / hover nearest-day mapping)', () => {
  it('matches the drill-down click mapping it replaces', () => {
    const count = 7
    const step = (700 - 24) / (count - 1)
    for (let x = 0; x <= 700; x += 13) {
      const legacy = Math.min(count - 1, Math.max(0, Math.round((x - 12) / step)))
      expect(trendSnapAt(x, count, 700).index).toBe(legacy)
    }
  })

  it('snaps to the day anchors and clamps outside the padding', () => {
    expect(trendSnapAt(12, 7, 700)).toEqual({ index: 0, x: 12 })
    expect(trendSnapAt(688, 7, 700)).toEqual({ index: 6, x: 688 })
    expect(trendSnapAt(-80, 7, 700).index).toBe(0)
    expect(trendSnapAt(1_200, 7, 700).index).toBe(6)
    expect(trendSnapAt(340, 1, 700)).toEqual({ index: 0, x: 12 })
    expect(trendSnapAt(340, 0, 700).index).toBe(0)
  })
})

describe('trendHoverCard (hover seam: index → white-card content)', () => {
  it('derives date, per-model rows in series order, and the day total', () => {
    expect(trendHoverCard(trendView, 4)).toEqual({
      date: '2026-08-26',
      rows: [
        { model: 'm2', color: modelColor(0), tokens: 50 },
        { model: 'm1', color: modelColor(1), tokens: 200 }
      ],
      total: 250
    })
  })

  it('omits zero-token models from the card (ZCode form)', () => {
    expect(trendHoverCard(trendView, 5)).toEqual({
      date: '2026-08-27',
      rows: [{ model: 'm2', color: modelColor(0), tokens: 400 }],
      total: 400
    })
  })

  it('returns null past the data (empty view has no hover)', () => {
    expect(trendHoverCard({ rangeDays: 7, dates: [], series: [] }, 0)).toBeNull()
    expect(trendHoverCard(trendView, 7)).toBeNull()
  })
})

describe('donutHoverCard (hover seam: model → white-card content)', () => {
  const slices: ModelUsageSlice[] = [
    { model: 'a', tokens: 750, cost: { amountUsd: 1, estimated: true }, share: 0.75 },
    { model: 'b', tokens: 250, cost: { amountUsd: 1, estimated: true }, share: 0.25 }
  ]

  it('derives model, color, tokens, share for a hovered arc', () => {
    expect(donutHoverCard(slices, 'b')).toEqual({ model: 'b', color: modelColor(1), tokens: 250, share: 0.25 })
  })

  it('returns null for an unknown model', () => {
    expect(donutHoverCard(slices, 'zzz')).toBeNull()
  })
})
