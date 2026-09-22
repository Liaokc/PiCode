import { describe, expect, it } from 'vitest'
import {
  donutHoverCard,
  donutSlices,
  heatCard,
  heatmapGrid,
  HEAT_CARD_ANCHORS_COLUMN,
  modelColor,
  niceCeil,
  statCards,
  trendChart,
  trendHoverCard,
  trendSnapAt,
  type ModelUsageSlice,
  type TrendView
} from '../../src/shared/usage/charts.ts'
import { addDays } from '../../src/shared/usage/dates.ts'
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

// --- heatmap grid: the 52×7 contribution window (ticket 139) -------------------

describe('heatmapGrid — the 52×7 contribution window', () => {
  // 2026-08-25..28 are Tue..Fri; their Sunday-start week is 2026-08-23..29.
  const cells = [
    { date: '2026-08-25', tokens: 100, messages: 3 },
    { date: '2026-08-26', tokens: 250, messages: 4 },
    { date: '2026-08-27', tokens: 400, messages: 5 },
    { date: '2026-08-28', tokens: 10, messages: 1 }
  ]

  it('covers exactly 52 Sunday-start weeks ending at the data end', () => {
    const grid = heatmapGrid(cells, 'daily')
    expect(grid.columns).toHaveLength(52)
    expect(grid.columns[0].start).toBe('2025-08-31') // 51 weeks before Sun 2026-08-23
    expect(grid.columns[51].start).toBe('2026-08-23')
    expect(grid.columns.every((c) => c.slots.length === 7)).toBe(true)
  })

  it('lays seven Sunday..Saturday slots per column; the data days land on their weekday rows', () => {
    const grid = heatmapGrid(cells, 'daily')
    const last = grid.columns[51]
    expect(last.slots.map((s) => s.date)).toEqual([
      '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29'
    ])
    expect(last.slots.map((s) => s.value)).toEqual([0, 0, 100, 250, 400, 10, 0])
    expect(last.slots.map((s) => s.level)).toEqual([0, 0, 1, 3, 4, 1, 0])
    expect(grid.max).toBe(400)
  })

  it('carries message counts on every slot', () => {
    const grid = heatmapGrid(cells, 'daily')
    const last = grid.columns[51]
    expect(last.slots.map((s) => s.messages)).toEqual([0, 0, 3, 4, 5, 1, 0])
  })

  it('renders the pre-history weeks as empty-color boxes, never missing', () => {
    const grid = heatmapGrid(cells, 'daily')
    const first = grid.columns[0]
    expect(first.slots.every((s) => s.value === 0 && s.level === 0)).toBe(true)
  })

  it('leaves the days after the data end empty in every mode', () => {
    // Fri 08-28 is the data end; Sat 08-29 (and any later current-week day)
    // must stay level-0 even though the week/term series could project.
    for (const mode of ['daily', 'weekly', 'cumulative'] as const) {
      const grid = heatmapGrid(cells, mode)
      const sat = grid.columns[51].slots[6]
      expect(sat).toEqual({ date: '2026-08-29', value: 0, messages: 0, level: 0 })
    }
  })
})

// --- heatmap weekly: the box reads the week's start through that day ------------

describe('heatmapGrid weekly — week-start-to-day boxes', () => {
  const cells = [
    { date: '2026-08-20', tokens: 500, messages: 2 }, // Thu of the week Sun 08-16..Sat 08-22
    { date: '2026-08-25', tokens: 100, messages: 3 },
    { date: '2026-08-27', tokens: 400, messages: 5 },
    { date: '2026-08-28', tokens: 10, messages: 1 }
  ]

  it('accumulates within the week and resets at the next Sunday', () => {
    const grid = heatmapGrid(cells, 'weekly')
    // Prior week (Sun 08-16): the Thursday spike carries through Fri/Sat —
    // past days keep the week-to-date figure.
    expect(grid.columns[50].slots.map((s) => s.value)).toEqual([0, 0, 0, 0, 500, 500, 500])
    // Current week (Sun 08-23): the counter restarted — Mon 100, Wed 500+…
    expect(grid.columns[51].slots.map((s) => s.value)).toEqual([0, 0, 100, 100, 500, 510, 0])
  })

  it('is monotone non-decreasing down every column through its last active day', () => {
    const grid = heatmapGrid(cells, 'weekly')
    for (const col of grid.columns) {
      const values = col.slots.map((s) => s.value)
      // Trailing future days (after the data end) are exempt — they render
      // empty; the week-to-date prefix itself never dips.
      let lastActive = values.length - 1
      while (lastActive >= 0 && values[lastActive] === 0) lastActive--
      for (let i = 1; i <= lastActive; i++) {
        expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
      }
    }
  })

  it('levels the week against the largest week-to-date figure', () => {
    const grid = heatmapGrid(cells, 'weekly')
    expect(grid.max).toBe(510)
    expect(grid.columns[51].slots.map((s) => s.level)).toEqual([0, 0, 1, 1, 4, 4, 0])
  })

  it('handles the year-start week (Dec→Jan) without leaking across the boundary', () => {
    const grid = heatmapGrid(
      [
        { date: '2025-12-30', tokens: 30, messages: 1 },
        { date: '2026-01-02', tokens: 20, messages: 1 }
      ],
      'weekly'
    )
    const weekCol = grid.columns[51] // Sun 2025-12-28 .. Sat 2026-01-03
    // Sat 01-03 is past the data end (Fri 01-02) — empty.
    expect(weekCol.slots.map((s) => s.value)).toEqual([0, 0, 30, 30, 30, 50, 0])
    expect(weekCol.monthLabel).toBe('Jan')
  })
})

// --- heatmap cumulative: the box reads the term's start through that day --------

describe('heatmapGrid cumulative — term-start-to-day boxes', () => {
  const cells = [
    { date: '2026-08-20', tokens: 500, messages: 2 },
    { date: '2026-08-25', tokens: 100, messages: 3 },
    { date: '2026-08-27', tokens: 400, messages: 5 },
    { date: '2026-08-28', tokens: 10, messages: 1 }
  ]

  it('never resets: the running total crosses week boundaries', () => {
    const grid = heatmapGrid(cells, 'cumulative')
    expect(grid.columns[50].slots.map((s) => s.value)).toEqual([0, 0, 0, 0, 500, 500, 500])
    expect(grid.columns[51].slots.map((s) => s.value)).toEqual([500, 500, 600, 600, 1000, 1010, 0])
    expect(grid.max).toBe(1010)
  })

  it('is monotone across the whole grid in time order (the cumulative signature)', () => {
    const grid = heatmapGrid(cells, 'cumulative')
    const flat = grid.columns.flatMap((col) => col.slots.map((s) => s.value))
    for (let i = 1; i < flat.length; i++) {
      if (flat[i] > 0) expect(flat[i]).toBeGreaterThanOrEqual(flat[i - 1] ?? 0)
    }
  })

  it('carries the pre-window total into the first visible column', () => {
    // A term that started 400 days ago: the window clips the early weeks but
    // the cumulative boxes at the window's left edge already stand at the
    // carried total (期初 = the very first day, not the window's first day).
    const early = addDays('2026-08-28', -400)
    const grid = heatmapGrid([{ date: early, tokens: 900, messages: 1 }, ...cells], 'cumulative')
    expect(grid.columns).toHaveLength(52)
    const firstWeekTotals = grid.columns[0].slots.map((s) => s.value)
    expect(firstWeekTotals[6]).toBeGreaterThan(0) // the carried total stands
    expect(grid.columns[51].slots[5].value).toBe(900 + 1010) // + the visible term
  })
})

// --- heatmap month labels -------------------------------------------------------

describe('heatmapGrid month labels', () => {
  const cells = [{ date: '2026-08-27', tokens: 100, messages: 1 }]

  it('labels the column where a month opens, once per month', () => {
    const grid = heatmapGrid(cells, 'daily')
    const labeled = grid.columns
      .map((c, i) => ({ label: c.monthLabel, i }))
      .filter((c) => c.label !== null)
    // Window Sun 2025-08-31 .. Sat 2026-08-29: the forced first-column label
    // covers Aug 2025 (Sep 1 opens inside column 0's span), so 12 labels
    // remain — one per month opening from Oct 2025 through Aug 2026.
    expect(labeled.map((c) => c.label)).toEqual([
      'Aug', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'
    ])
    // The Oct 2025 opening (Wed Oct 1) sits on the column Sun 09-28..Sat 10-04.
    expect(labeled[1]).toEqual({ label: 'Oct', i: 4 })
  })

  it('yields the first label when column 1 opens a month too', () => {
    // Data end Sun 2026-10-11: the window opens Sun 2025-10-19 (forced 'Oct')
    // and column 1 spans Oct 26 → Nov 1, so both adjacent columns claim a
    // label — column 0's yields and Nov carries.
    const grid = heatmapGrid([{ date: '2026-10-11', tokens: 10, messages: 1 }], 'daily')
    expect(grid.columns[0].monthLabel).toBeNull()
    expect(grid.columns[1].monthLabel).toBe('Nov')
  })
})

// --- heatmap hover card: content + anchor tables (ticket 139) ------------------

describe('heatCard — three-mode content table', () => {
  // Week Sun 2026-08-23 .. Sat 2026-08-29, data end Thu 08-28.
  const grid = heatmapGrid(
    [
      { date: '2026-08-25', tokens: 100, messages: 3 },
      { date: '2026-08-27', tokens: 400, messages: 5 },
      { date: '2026-08-28', tokens: 10, messages: 1 }
    ],
    'daily'
  )
  const col = grid.columns[51]
  const wed = col.slots[4] // 2026-08-27

  it('daily names the hovered day with its own totals', () => {
    expect(heatCard('daily', wed, col)).toEqual({
      title: 'Aug 27, 2026',
      value: '400 tokens · 5 messages'
    })
  })

  it('weekly names the week through its last visible day with week-to-date totals', () => {
    // Saturday 08-29 is past the data end (Thu 08-28), so the card clamps to it.
    expect(heatCard('weekly', wed, col)).toEqual({
      title: 'Aug 28, 2026 · This week',
      value: '510 tokens · 9 messages'
    })
  })

  it('cumulative reads 期初 through the column week, current week included', () => {
    expect(heatCard('cumulative', wed, col)).toEqual({
      title: 'Through Aug 28, 2026 · This week',
      value: '510 tokens · 9 messages'
    })
  })

  it('a completed past week cards its full Saturday', () => {
    const prior = grid.columns[50]
    expect(prior.card.date).toBe('2026-08-22')
    expect(heatCard('weekly', prior.slots[0], prior).title).toBe('Aug 22, 2026 · This week')
  })

  it('pluralizes the message count', () => {
    const grid1 = heatmapGrid([{ date: '2026-08-27', tokens: 5, messages: 1 }], 'daily')
    expect(heatCard('daily', grid1.columns[51].slots[4], grid1.columns[51]).value).toBe('5 tokens · 1 message')
  })
})

describe('HEAT_CARD_ANCHORS_COLUMN — three-mode anchor table', () => {
  it('anchors daily at the hovered box and weekly/cumulative at the column top', () => {
    expect(HEAT_CARD_ANCHORS_COLUMN).toEqual({ daily: false, weekly: true, cumulative: true })
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
