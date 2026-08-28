import { describe, expect, it } from 'vitest'
import { buildUsageSnapshot, foldSessionFile, trendView } from '../../src/shared/usage/aggregate.ts'

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
  it('daily cells mirror the per-day tokens', () => {
    expect(twoFileSnapshot.heatmap.daily).toEqual([
      { date: '2026-08-25', tokens: 100 },
      { date: '2026-08-26', tokens: 250 },
      { date: '2026-08-27', tokens: 400 },
      { date: '2026-08-28', tokens: 10 }
    ])
  })

  it('weekly cells bucket days into Monday-start weeks', () => {
    // 2026-08-25..28 are Tue..Fri of the week starting Monday 2026-08-24
    expect(twoFileSnapshot.heatmap.weekly).toEqual([{ date: '2026-08-24', tokens: 760 }])
  })

  it('cumulative cells run upward day by day', () => {
    expect(twoFileSnapshot.heatmap.cumulative.map((c) => c.tokens)).toEqual([100, 350, 750, 760])
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
})
