import { describe, expect, it } from 'vitest'
import { fakeUsageSnapshot, FAKE_USAGE_MODELS } from '../../src/shared/usage/fixture'
import { trendView } from '../../src/shared/usage/aggregate'

describe('fakeUsageSnapshot (visual-QA fixture, Seam-2 shape)', () => {
  const NOW = '2026-08-27T10:00:00.000Z'

  it('is deterministic for a fixed now', () => {
    const a = fakeUsageSnapshot({ now: NOW, timeZone: 'UTC' })
    const b = fakeUsageSnapshot({ now: NOW, timeZone: 'UTC' })
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b))
  })

  it('keeps the aggregate contract: totals, shares, and cost labeling', () => {
    const snap = fakeUsageSnapshot({ now: NOW, timeZone: 'UTC' })
    expect(snap.totalTokens).toBeGreaterThan(0)
    expect(snap.modelTotals.length).toBeGreaterThanOrEqual(FAKE_USAGE_MODELS.length)
    const shareSum = snap.modelTotals.reduce((n, s) => n + s.share, 0)
    expect(shareSum).toBeCloseTo(1, 6)
    const tokensSum = snap.modelTotals.reduce((n, s) => n + s.tokens, 0)
    expect(tokensSum).toBe(snap.totalTokens)
    // Estimated Cost red line: every cost figure is explicitly an estimate.
    expect(snap.totalCost.estimated).toBe(true)
    for (const slice of snap.modelTotals) expect(slice.cost.estimated).toBe(true)
  })

  it('ends today with an active current streak (reference 09 look)', () => {
    const snap = fakeUsageSnapshot({ now: NOW, timeZone: 'UTC' })
    expect(snap.lastActiveDate).toBe('2026-08-27')
    expect(snap.currentStreak).not.toBeNull()
    expect(snap.currentStreak?.includesToday).toBe(true)
    expect((snap.longestStreak?.days ?? 0) >= (snap.currentStreak?.days ?? 0)).toBe(true)
    expect(snap.peakDay).not.toBeNull()
    expect(snap.longestChatDay).not.toBeNull()
  })

  it('spans enough history for a full heatmap and both trend ranges', () => {
    const snap = fakeUsageSnapshot({ now: NOW, timeZone: 'UTC' })
    expect(snap.heatmap.daily.length).toBeGreaterThanOrEqual(90)
    expect(snap.heatmap.daily.at(-1)?.date).toBe('2026-08-27')
    for (const range of [7, 30] as const) {
      const view = trendView(snap, range)
      expect(view.dates.length).toBe(range)
      expect(view.dates.at(-1)).toBe('2026-08-27')
      expect(view.series.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('carries drill-down rows and session counts', () => {
    const snap = fakeUsageSnapshot({ now: NOW, timeZone: 'UTC' })
    expect(snap.sessionCount).toBeGreaterThanOrEqual(3)
    expect(snap.sessionDays.length).toBeGreaterThanOrEqual(snap.sessionCount)
    for (const row of snap.sessionDays) {
      expect(row.tokens).toBeGreaterThan(0)
      expect(row.cost.estimated).toBe(true)
    }
  })
})
