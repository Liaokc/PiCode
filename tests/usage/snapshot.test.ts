import { describe, expect, it } from 'vitest'
import { foldSessionFile, buildUsageSnapshot } from '../../src/shared/usage/aggregate.ts'
import type { SessionFileUsage, SnapshotOptions } from '../../src/shared/usage/aggregate.ts'

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

// spans an hour of chat on its days
const userAt = (ts: string) =>
  JSON.stringify({ type: 'message', id: ts, parentId: null, timestamp: ts, message: { role: 'user', content: [], timestamp: 0 } })

function fileA(): SessionFileUsage {
  const text = [
    headerLine('s-abc'),
    userAt('2026-08-25T08:00:00.000Z'),
    assistant('a1', '2026-08-25T09:00:00.000Z', 100, 0.001, 'm1'),
    userAt('2026-08-26T08:00:00.000Z'),
    assistant('a2', '2026-08-26T09:00:00.000Z', 200, 0.002, 'm1'),
    ''
  ].join('\n')
  return foldSessionFile(text, { timeZone: 'UTC' })
}

function fileB(): SessionFileUsage {
  const text = [
    headerLine('s-def'),
    userAt('2026-08-26T10:00:00.000Z'),
    assistant('b1', '2026-08-26T12:00:00.000Z', 50, 0.0005, 'm2'),
    assistant('b2', '2026-08-27T09:00:00.000Z', 400, 0.004, 'm2'),
    assistant('b3', '2026-08-28T09:00:00.000Z', 10, 0.0001, 'm2'),
    ''
  ].join('\n')
  return foldSessionFile(text, { timeZone: 'UTC' })
}

const opts: SnapshotOptions = { timeZone: 'UTC', now: '2026-08-28T12:00:00.000Z' }

describe('buildUsageSnapshot', () => {
  const snapshot = buildUsageSnapshot([fileA(), fileB()], opts)

  it('totals tokens, cost, sessions and events across files', () => {
    expect(snapshot.totalTokens).toBe(100 + 200 + 50 + 400 + 10)
    expect(snapshot.totalCost).toEqual({ amountUsd: 0.0076, estimated: true })
    expect(snapshot.sessionCount).toBe(2)
    expect(snapshot.usageEventCount).toBe(5)
  })

  it('zero-fills daily rows from first active day through today, ascending', () => {
    expect(snapshot.daily.map((d) => d.date)).toEqual(['2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'])
    expect(snapshot.daily.map((d) => d.tokens)).toEqual([100, 250, 400, 10])
    expect(snapshot.daily[1].byModel).toEqual({ m1: 200, m2: 50 })
    expect(snapshot.daily[1].sessionCount).toBe(2)
    expect(snapshot.daily[1].cost).toEqual({ amountUsd: 0.0025, estimated: true })
  })

  it('picks the peak day', () => {
    expect(snapshot.peakDay).toEqual({ date: '2026-08-27', tokens: 400 })
  })

  it('finds the longest chat day from activity spans', () => {
    // day span merges across files: 08-26 spans 08:00 (file A) → 12:00 (file B) = 4h
    expect(snapshot.longestChatDay).toEqual({ date: '2026-08-26', durationMs: 4 * 3600_000 })
    expect(snapshot.daily[1].durationMs).toBe(4 * 3600_000)
  })

  it('computes current and longest streaks across consecutive active days', () => {
    // active 25,26,27,28 and today is 28 → current streak 4 including today
    expect(snapshot.currentStreak).toEqual({ days: 4, startDate: '2026-08-25', endDate: '2026-08-28', includesToday: true })
    expect(snapshot.longestStreak).toEqual({ days: 4, startDate: '2026-08-25', endDate: '2026-08-28', includesToday: true })
    expect(snapshot.activeDayCount).toBe(4)
    expect(snapshot.firstActiveDate).toBe('2026-08-25')
    expect(snapshot.lastActiveDate).toBe('2026-08-28')
  })

  it('breaks streaks on zero days', () => {
    const late = buildUsageSnapshot([fileA(), fileB()], { timeZone: 'UTC', now: '2026-08-30T12:00:00.000Z' })
    // today 08-30 inactive, yesterday 08-29 inactive → current streak is gone
    expect(late.currentStreak).toBeNull()
    expect(late.longestStreak).toEqual({ days: 4, startDate: '2026-08-25', endDate: '2026-08-28', includesToday: false })
    // daily zero-fills through today anyway
    expect(late.daily.map((d) => d.date)).toEqual([
      '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30'
    ])
    expect(late.daily[4].tokens).toBe(0)
  })

  it('ranks model totals by tokens with shares and estimate-marked costs', () => {
    expect(snapshot.modelTotals).toEqual([
      { model: 'm2', tokens: 460, cost: { amountUsd: 0.0046, estimated: true }, share: 460 / 760 },
      { model: 'm1', tokens: 300, cost: { amountUsd: 0.003, estimated: true }, share: 300 / 760 }
    ])
  })

  it('exposes per-session-per-day drill-down rows', () => {
    expect(snapshot.sessionDays).toEqual([
      { sessionId: 's-abc', date: '2026-08-25', tokens: 100, cost: { amountUsd: 0.001, estimated: true }, byModel: { m1: 100 } },
      { sessionId: 's-abc', date: '2026-08-26', tokens: 200, cost: { amountUsd: 0.002, estimated: true }, byModel: { m1: 200 } },
      { sessionId: 's-def', date: '2026-08-26', tokens: 50, cost: { amountUsd: 0.0005, estimated: true }, byModel: { m2: 50 } },
      { sessionId: 's-def', date: '2026-08-27', tokens: 400, cost: { amountUsd: 0.004, estimated: true }, byModel: { m2: 400 } },
      { sessionId: 's-def', date: '2026-08-28', tokens: 10, cost: { amountUsd: 0.0001, estimated: true }, byModel: { m2: 10 } }
    ])
  })

  it('stamps generation metadata', () => {
    expect(snapshot.generatedAt).toBe('2026-08-28T12:00:00.000Z')
    expect(snapshot.timeZone).toBe('UTC')
  })

  it('handles the empty store without null traps', () => {
    const empty = buildUsageSnapshot([], opts)
    expect(empty.totalTokens).toBe(0)
    expect(empty.totalCost).toEqual({ amountUsd: 0, estimated: true })
    expect(empty.sessionCount).toBe(0)
    expect(empty.daily).toEqual([])
    expect(empty.peakDay).toBeNull()
    expect(empty.longestChatDay).toBeNull()
    expect(empty.currentStreak).toBeNull()
    expect(empty.longestStreak).toBeNull()
    expect(empty.modelTotals).toEqual([])
    expect(empty.sessionDays).toEqual([])
  })
})
