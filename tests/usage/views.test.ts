import { describe, expect, it } from 'vitest'
import { buildUsageSnapshot, excludeZeroTokenModels, foldSessionFile, trendView, type ModelUsageSlice } from '../../src/shared/usage/aggregate.ts'

const headerLine = (id: string) =>
  JSON.stringify({ type: 'session', version: 3, id, timestamp: '2026-08-25T00:00:00.000Z', cwd: '/tmp/proj' })

const assistant = (id: string, ts: string, total: number, model: string) =>
  JSON.stringify({
    type: 'message',
    id,
    parentId: null,
    timestamp: ts,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: '…' }],
      model,
      usage: { input: total - 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: total, cost: { total: 0.001 } },
      stopReason: 'stop'
    }
  })

const twoFileSnapshot = buildUsageSnapshot(
  [
    foldSessionFile(
      [
        headerLine('s-abc'),
        assistant('a1', '2026-08-25T09:00:00.000Z', 100, 'm1'),
        assistant('a2', '2026-08-26T09:00:00.000Z', 200, 'm1'),
        ''
      ].join('\n'),
      { timeZone: 'UTC' }
    ),
    foldSessionFile(
      [
        headerLine('s-def'),
        assistant('b1', '2026-08-26T12:00:00.000Z', 50, 'm2'),
        assistant('b2', '2026-08-27T09:00:00.000Z', 400, 'm2'),
        assistant('b3', '2026-08-28T09:00:00.000Z', 10, 'm2'),
        ''
      ].join('\n'),
      { timeZone: 'UTC' }
    )
  ],
  { timeZone: 'UTC', now: '2026-08-28T12:00:00.000Z' }
)

describe('snapshot.heatmap', () => {
  it('daily cells mirror the per-day tokens and message counts', () => {
    expect(twoFileSnapshot.heatmap.daily).toEqual([
      { date: '2026-08-25', tokens: 100, messages: 1 },
      { date: '2026-08-26', tokens: 250, messages: 2 },
      { date: '2026-08-27', tokens: 400, messages: 1 },
      { date: '2026-08-28', tokens: 10, messages: 1 }
    ])
  })

  it('weekly cells bucket days into Monday-start weeks', () => {
    // 2026-08-25..28 are Tue..Fri of the week starting Monday 2026-08-24
    expect(twoFileSnapshot.heatmap.weekly).toEqual([{ date: '2026-08-24', tokens: 760, messages: 5 }])
  })

  it('cumulative cells run upward day by day', () => {
    expect(twoFileSnapshot.heatmap.cumulative.map((c) => c.tokens)).toEqual([100, 350, 750, 760])
    expect(twoFileSnapshot.heatmap.cumulative.map((c) => c.messages)).toEqual([1, 3, 4, 5])
  })

  it('is empty when there is no activity', () => {
    const empty = buildUsageSnapshot([], { timeZone: 'UTC', now: '2026-08-28T12:00:00.000Z' })
    expect(empty.heatmap.daily).toEqual([])
    expect(empty.heatmap.weekly).toEqual([])
    expect(empty.heatmap.cumulative).toEqual([])
  })
})

describe('trendView', () => {
  it('pads the front to a full range and emits one zero-filled series per model', () => {
    const view = trendView(twoFileSnapshot, 7)
    expect(view.rangeDays).toBe(7)
    expect(view.dates).toEqual([
      '2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'
    ])
    expect(view.series).toEqual([
      { model: 'm2', tokens: [0, 0, 0, 0, 50, 400, 10] },
      { model: 'm1', tokens: [0, 0, 0, 100, 200, 0, 0] }
    ])
  })

  it('slices the last N days and drops models inactive within the range', () => {
    // m1 active only on 08-21, m2 on 08-22..28 → the 7-day window drops m1 and 08-21
    const long = buildUsageSnapshot(
      [
        foldSessionFile(
          [headerLine('s-old'), assistant('a1', '2026-08-21T09:00:00.000Z', 999, 'm1'), ''].join('\n'),
          { timeZone: 'UTC' }
        ),
        foldSessionFile(
          [
            headerLine('s-new'),
            ...['2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'].map(
              (d, i) => assistant(`b${i}`, `${d}T09:00:00.000Z`, 10 + i, 'm2')
            ),
            ''
          ].join('\n'),
          { timeZone: 'UTC' }
        )
      ],
      { timeZone: 'UTC', now: '2026-08-28T12:00:00.000Z' }
    )
    const view = trendView(long, 7)
    expect(view.dates).toEqual([
      '2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'
    ])
    expect(view.series).toEqual([{ model: 'm2', tokens: [10, 11, 12, 13, 14, 15, 16] }])
  })

  it('returns an empty series over a full-length axis for an empty snapshot', () => {
    const empty = buildUsageSnapshot([], { timeZone: 'UTC', now: '2026-08-28T12:00:00.000Z' })
    const view = trendView(empty, 7)
    expect(view.dates).toHaveLength(7)
    expect(view.dates[6]).toBe('2026-08-28')
    expect(view.series).toEqual([])
  })

  it('drops a model whose events all carried zero tokens, in every range (ticket 124, R9)', () => {
    // The real failed-call shape: usage events exist (the model gets cells)
    // but every total is 0 — it must never reach a legend.
    const zeroModel = foldSessionFile(
      [
        headerLine('s-zero'),
        assistant('z1', '2026-08-27T09:00:00.000Z', 0, 'zero-model'),
        assistant('z2', '2026-08-28T09:00:00.000Z', 0, 'zero-model'),
        assistant('a1', '2026-08-28T10:00:00.000Z', 100, 'm1'),
        ''
      ].join('\n'),
      { timeZone: 'UTC' }
    )
    const snap = buildUsageSnapshot([zeroModel], { timeZone: 'UTC', now: '2026-08-28T12:00:00.000Z' })
    // the zero-token model still reaches the snapshot's model totals (it has cells)
    expect(snap.modelTotals.find((s) => s.model === 'zero-model')?.tokens).toBe(0)
    for (const range of [7, 30] as const) {
      expect(trendView(snap, range).series.map((s) => s.model)).toEqual(['m1'])
    }
  })

  it('re-projects when the range switches: a model quiet inside 7d stays in the 30d legend', () => {
    // m-quiet spent 20 days ago only; m-recent is active today. The 7-day
    // window drops m-quiet, the 30-day one keeps it — switching the Time
    // Range re-derives the legend from the range's own totals.
    const snap = buildUsageSnapshot(
      [
        foldSessionFile(
          [
            headerLine('s-quiet'),
            assistant('q1', '2026-08-08T09:00:00.000Z', 400, 'm-quiet'),
            ''
          ].join('\n'),
          { timeZone: 'UTC' }
        ),
        foldSessionFile(
          [headerLine('s-recent'), assistant('r1', '2026-08-28T09:00:00.000Z', 100, 'm-recent'), ''].join('\n'),
          { timeZone: 'UTC' }
        )
      ],
      { timeZone: 'UTC', now: '2026-08-28T12:00:00.000Z' }
    )
    expect(trendView(snap, 7).series.map((s) => s.model)).toEqual(['m-recent'])
    expect(trendView(snap, 30).series.map((s) => s.model)).toEqual(['m-quiet', 'm-recent'])
  })
})

describe('excludeZeroTokenModels (ticket 124, R9 — strict-zero chart filter)', () => {
  const slice = (model: string, tokens: number): ModelUsageSlice => ({
    model,
    tokens,
    cost: { amountUsd: 0, estimated: true },
    share: 0
  })

  it('drops strictly-zero models and keeps the rest in order', () => {
    expect(excludeZeroTokenModels([slice('a', 0), slice('b', 500), slice('c', 0), slice('d', 2_000)])).toEqual([
      slice('b', 500),
      slice('d', 2_000)
    ])
  })

  it('keeps tiny non-zero usage (Q3=A: used is used)', () => {
    expect(excludeZeroTokenModels([slice('tiny', 1), slice('zero', 0)])).toEqual([slice('tiny', 1)])
  })

  it('degrades to an empty projection when every model is zero — the empty chart state, not fabricated data', () => {
    expect(excludeZeroTokenModels([slice('a', 0), slice('b', 0)])).toEqual([])
  })

  it('passes an empty list through', () => {
    expect(excludeZeroTokenModels([])).toEqual([])
  })
})
