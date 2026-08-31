/**
 * Model-identity case folding (ticket 13). The same model can reach session
 * files with different letter casing — local config spelling vs gateway echo
 * (e.g. GLM-5.3-flash vs glm-5.3-flash). The aggregator must treat them as
 * ONE group (tokens/cost summed) while displaying the chronologically first
 * raw spelling. These tests pin the external Seam-2 snapshot contract.
 */
import { describe, expect, it } from 'vitest'
import { buildUsageSnapshot, foldSessionFile, normalizeModelId, trendView } from '../../src/shared/usage/aggregate.ts'
import type { SnapshotOptions } from '../../src/shared/usage/aggregate.ts'

const headerLine = (id: string) =>
  JSON.stringify({ type: 'session', version: 3, id, timestamp: '2026-08-25T00:00:00.000Z', cwd: '/tmp/proj' })

const assistant = (id: string, ts: string, total: number, totalUsd: number, model: string) =>
  JSON.stringify({
    type: 'message',
    id,
    parentId: null,
    timestamp: ts,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: '…' }],
      model,
      usage: { input: total - 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: total, cost: { total: totalUsd } },
      stopReason: 'stop'
    }
  })

const opts: SnapshotOptions = { timeZone: 'UTC', now: '2026-08-28T12:00:00.000Z' }

describe('normalizeModelId', () => {
  it('folds casing but keeps genuinely different models distinct', () => {
    expect(normalizeModelId('GLM-5.3-flash')).toBe('glm-5.3-flash')
    expect(normalizeModelId('GLM-5.3-flash')).toBe(normalizeModelId('glm-5.3-Flash'))
    expect(normalizeModelId('GLM-5.3-flash')).not.toBe(normalizeModelId('GLM-5.2'))
  })
})

describe('case-folded aggregation (ticket 13)', () => {
  it('folds two casings of one model inside one file into a single group with summed tokens/cost', () => {
    const fold = foldSessionFile(
      [
        headerLine('s-case'),
        assistant('a1', '2026-08-25T09:00:00.000Z', 1000, 0.02, 'GLM-5.3-flash'),
        assistant('a2', '2026-08-25T10:00:00.000Z', 500, 0.01, 'glm-5.3-flash'),
        ''
      ].join('\n'),
      { timeZone: 'UTC' }
    )
    const day = fold.days.get('2026-08-25')!
    expect(day.size).toBe(1)
    const cell = day.get(normalizeModelId('GLM-5.3-flash'))!
    expect(cell.tokens).toBe(1500)
    expect(cell.costMicros).toBe(30_000)
    expect(cell.events).toBe(2)
  })

  it('records the chronologically first raw spelling for display', () => {
    const fold = foldSessionFile(
      [
        headerLine('s-case'),
        assistant('a1', '2026-08-25T09:00:00.000Z', 1000, 0.02, 'GLM-5.3-flash'),
        assistant('a2', '2026-08-25T10:00:00.000Z', 500, 0.01, 'glm-5.3-flash'),
        ''
      ].join('\n'),
      { timeZone: 'UTC' }
    )
    expect(fold.modelDisplay.get(normalizeModelId('GLM-5.3-flash'))).toEqual({
      raw: 'GLM-5.3-flash',
      firstTs: Date.parse('2026-08-25T09:00:00.000Z')
    })
  })

  it('picks the display spelling by earliest timestamp, not file order', () => {
    const fold = foldSessionFile(
      [
        headerLine('s-order'),
        // lowercase appears first in the file, but the uppercase event is older
        assistant('a1', '2026-08-25T10:00:00.000Z', 100, 0.001, 'glm-5.3-flash'),
        assistant('a2', '2026-08-25T09:00:00.000Z', 200, 0.002, 'GLM-5.3-flash'),
        ''
      ].join('\n'),
      { timeZone: 'UTC' }
    )
    expect(fold.modelDisplay.get('glm-5.3-flash')!.raw).toBe('GLM-5.3-flash')
  })

  it('folds across files in the snapshot: one modelTotals entry, summed tokens/cost, first-seen spelling', () => {
    const first = foldSessionFile(
      [headerLine('s-1'), assistant('a1', '2026-08-25T09:00:00.000Z', 268_000, 32.93, 'GLM-5.3-flash'), ''].join('\n'),
      { timeZone: 'UTC' }
    )
    const second = foldSessionFile(
      [headerLine('s-2'), assistant('b1', '2026-08-26T09:00:00.000Z', 668, 0.194, 'glm-5.3-flash'), ''].join('\n'),
      { timeZone: 'UTC' }
    )
    const snap = buildUsageSnapshot([first, second], opts)
    expect(snap.modelTotals).toHaveLength(1)
    expect(snap.modelTotals[0].model).toBe('GLM-5.3-flash')
    expect(snap.modelTotals[0].tokens).toBe(268_668)
    expect(snap.modelTotals[0].cost).toEqual({ amountUsd: 33.124, estimated: true })
    // daily rows and drill-down rows join by the SAME display spelling
    expect(snap.daily[0].byModel).toEqual({ 'GLM-5.3-flash': 268_000 })
    expect(snap.daily[1].byModel).toEqual({ 'GLM-5.3-flash': 668 })
    expect(snap.sessionDays[0].byModel).toEqual({ 'GLM-5.3-flash': 268_000 })
    expect(snap.sessionDays[1].byModel).toEqual({ 'GLM-5.3-flash': 668 })
  })

  it('chooses the display spelling independently of file iteration order', () => {
    const first = foldSessionFile(
      [headerLine('s-1'), assistant('a1', '2026-08-25T09:00:00.000Z', 268_000, 32.93, 'GLM-5.3-flash'), ''].join('\n'),
      { timeZone: 'UTC' }
    )
    const second = foldSessionFile(
      [headerLine('s-2'), assistant('b1', '2026-08-26T09:00:00.000Z', 668, 0.194, 'glm-5.3-flash'), ''].join('\n'),
      { timeZone: 'UTC' }
    )
    const reversed = buildUsageSnapshot([second, first], opts)
    expect(reversed.modelTotals[0].model).toBe('GLM-5.3-flash')
  })

  it('collapses the trend view to one series line for folded models', () => {
    const first = foldSessionFile(
      [headerLine('s-1'), assistant('a1', '2026-08-25T09:00:00.000Z', 1000, 0.02, 'GLM-5.3-flash'), ''].join('\n'),
      { timeZone: 'UTC' }
    )
    const second = foldSessionFile(
      [headerLine('s-2'), assistant('b1', '2026-08-26T09:00:00.000Z', 500, 0.01, 'glm-5.3-flash'), ''].join('\n'),
      { timeZone: 'UTC' }
    )
    const snap = buildUsageSnapshot([first, second], opts)
    const trend = trendView(snap, 7)
    expect(trend.series).toHaveLength(1)
    expect(trend.series[0].model).toBe('GLM-5.3-flash')
    expect(trend.series[0].tokens).toEqual([0, 0, 0, 1000, 500, 0, 0])
  })

  it('keeps genuinely different models separate even with shared prefixes', () => {
    const fold = foldSessionFile(
      [
        headerLine('s-distinct'),
        assistant('a1', '2026-08-25T09:00:00.000Z', 100, 0.001, 'GLM-5.3'),
        assistant('a2', '2026-08-25T10:00:00.000Z', 200, 0.002, 'GLM-5.3-flash'),
        ''
      ].join('\n'),
      { timeZone: 'UTC' }
    )
    expect(fold.days.get('2026-08-25')!.size).toBe(2)
    const snap = buildUsageSnapshot([fold], opts)
    expect(snap.modelTotals.map((m) => m.model).sort()).toEqual(['GLM-5.3', 'GLM-5.3-flash'])
  })

  it('stays idempotent: rebuilding from the same folds yields identical output', () => {
    const first = foldSessionFile(
      [headerLine('s-1'), assistant('a1', '2026-08-25T09:00:00.000Z', 268_000, 32.93, 'GLM-5.3-flash'), ''].join('\n'),
      { timeZone: 'UTC' }
    )
    const second = foldSessionFile(
      [headerLine('s-2'), assistant('b1', '2026-08-26T09:00:00.000Z', 668, 0.194, 'glm-5.3-flash'), ''].join('\n'),
      { timeZone: 'UTC' }
    )
    const strip = (s: ReturnType<typeof buildUsageSnapshot>): string =>
      JSON.stringify(s, (key, value) => (key === 'generatedAt' ? undefined : value))
    expect(strip(buildUsageSnapshot([first, second], opts))).toBe(strip(buildUsageSnapshot([first, second], opts)))
  })
})
