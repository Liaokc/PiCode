import { describe, expect, it } from 'vitest'
import { foldSessionFile } from '../../src/shared/usage/aggregate.ts'
import type { SessionFileUsage } from '../../src/shared/usage/aggregate.ts'

const headerLine = JSON.stringify({
  type: 'session',
  version: 3,
  id: 's-abc',
  timestamp: '2026-08-25T08:00:00.000Z',
  cwd: '/tmp/proj'
})

const modelChange = (modelId: string, ts: string) =>
  JSON.stringify({ type: 'model_change', id: 'mc', parentId: null, timestamp: ts, provider: 'bella', modelId })

const message = (over: Record<string, unknown>) => JSON.stringify({ type: 'message', parentId: null, ...over })

const assistant = (id: string, ts: string, usage: Record<string, unknown> | undefined, model?: string) =>
  message({
    id,
    timestamp: ts,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: '…' }],
      ...(model ? { model } : { provider: 'bella' }),
      ...(usage ? { usage, stopReason: 'stop' } : { stopReason: 'error', errorMessage: 'overloaded' })
    }
  })

const usageOf = (input: number, output: number, total: number, totalUsd?: number) => ({
  input,
  output,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: total,
  ...(totalUsd === undefined ? {} : { cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: totalUsd } })
})

const compact = (id: string, ts: string, usage?: Record<string, unknown>) =>
  JSON.stringify({
    type: 'compaction',
    id,
    parentId: 'x',
    timestamp: ts,
    summary: '…',
    firstKeptEntryId: 'k1',
    tokensBefore: 150000,
    ...(usage ? { usage } : {})
  })

const branchSummary = (id: string, ts: string, usage: Record<string, unknown>) =>
  JSON.stringify({ type: 'branch_summary', id, parentId: 'x', timestamp: ts, fromId: 'k1', summary: '…', usage })

describe('foldSessionFile', () => {
  it('folds the normal flow into day × model cells (UTC default)', () => {
    const text = [
      headerLine,
      modelChange('GLM-5.3-flash', '2026-08-27T13:02:33.351Z'),
      message({ id: 'u1', timestamp: '2026-08-27T13:05:32.731Z', message: { role: 'user', content: [], timestamp: 0 } }),
      assistant('a1', '2026-08-27T13:05:38.520Z', usageOf(100, 10, 110, 0.001)),
      assistant('a2', '2026-08-27T13:06:20.000Z', usageOf(200, 20, 220, 0.002)),
      ''
    ].join('\n')

    const folded = foldSessionFile(text)
    expect(folded.header?.id).toBe('s-abc')
    expect(folded.eventCount).toBe(2)
    const day = folded.days.get('2026-08-27')
    expect(day).toBeDefined()
    const cell = day!.get('GLM-5.3-flash')!
    expect(cell.tokens).toBe(330)
    expect(cell.costMicros).toBe(3000) // 0.001 + 0.002 USD
    expect(cell.events).toBe(2)
  })

  it('attributes compaction and branch-summary usage to the model in effect', () => {
    const text = [
      headerLine,
      modelChange('GLM-5.2', '2026-08-20T09:00:00.000Z'),
      compact('c1', '2026-08-20T10:00:00.000Z', usageOf(120000, 800, 120800, 0.012)),
      branchSummary('b1', '2026-08-20T11:00:00.000Z', usageOf(5000, 500, 5500, 0.003)),
      ''
    ].join('\n')

    const folded = foldSessionFile(text)
    expect(folded.eventCount).toBe(2)
    const cell = folded.days.get('2026-08-20')!.get('GLM-5.2')!
    expect(cell.tokens).toBe(120800 + 5500)
    expect(cell.costMicros).toBe(15000)
  })

  it('ignores compaction entries without usage and assistant entries without usage', () => {
    const text = [
      headerLine,
      modelChange('GLM-5.2', '2026-08-20T09:00:00.000Z'),
      compact('c1', '2026-08-20T10:00:00.000Z'), // no usage field
      assistant('a1', '2026-08-20T10:05:00.000Z', undefined), // errored, no usage
      ''
    ].join('\n')

    const folded = foldSessionFile(text)
    expect(folded.eventCount).toBe(0)
    expect(folded.days.size).toBe(0)
    // the usage-less assistant message still counts as chat activity
    expect(folded.activity.get('2026-08-20')).toMatchObject({ messages: 1 })
  })

  it('falls back to the tracked model for assistant messages lacking a model field, else "unknown"', () => {
    const withTracker = [
      headerLine,
      modelChange('GLM-5.3-flash', '2026-08-21T09:00:00.000Z'),
      assistant('a1', '2026-08-21T10:00:00.000Z', usageOf(1, 1, 2, 0.0001)),
      ''
    ].join('\n')
    expect(foldSessionFile(withTracker).days.get('2026-08-21')!.has('GLM-5.3-flash')).toBe(true)

    const orphan = [
      headerLine,
      assistant('a1', '2026-08-21T10:00:00.000Z', usageOf(1, 1, 2, 0.0001)),
      ''
    ].join('\n')
    expect(foldSessionFile(orphan).days.get('2026-08-21')!.has('unknown')).toBe(true)
  })

  it('counts usage without an embedded cost at zero cost (still an estimate)', () => {
    const text = [headerLine, assistant('a1', '2026-08-22T10:00:00.000Z', usageOf(1, 1, 2), 'm1'), ''].join('\n')
    const folded = foldSessionFile(text)
    expect(folded.days.get('2026-08-22')!.get('m1')!.costMicros).toBe(0)
  })

  it('attributes days in the requested time zone, not UTC', () => {
    const text = [
      headerLine,
      assistant('a1', '2026-08-27T17:00:00.000Z', usageOf(1, 1, 2, 0.0001), 'm1'), // 17:00Z is 2026-08-28 in Shanghai
      ''
    ].join('\n')

    const shanghai: SessionFileUsage = foldSessionFile(text, { timeZone: 'Asia/Shanghai' })
    expect([...shanghai.days.keys()]).toEqual(['2026-08-28'])

    const utc = foldSessionFile(text, { timeZone: 'UTC' })
    expect([...utc.days.keys()]).toEqual(['2026-08-27'])
  })

  it('records per-day chat activity spans from message entries', () => {
    const text = [
      headerLine,
      message({ id: 'u1', timestamp: '2026-08-23T08:00:00.000Z', message: { role: 'user', content: [], timestamp: 0 } }),
      assistant('a1', '2026-08-23T08:25:10.000Z', usageOf(1, 1, 2, 0.0001), 'm1'),
      message({ id: 'u2', timestamp: '2026-08-23T09:00:00.000Z', message: { role: 'user', content: [], timestamp: 0 } }),
      assistant('a2', '2026-08-23T09:05:00.000Z', usageOf(1, 1, 2, 0.0001), 'm1'),
      ''
    ].join('\n')

    const folded = foldSessionFile(text)
    const activity = folded.activity.get('2026-08-23')!
    expect(activity.messages).toBe(4)
    expect(activity.lastTs - activity.firstTs).toBe((65 * 60 + 0) * 1000)
  })

  it('propagates parse diagnostics', () => {
    const text = 'not json\n' + headerLine + '\n{"trunc'
    const folded = foldSessionFile(text)
    expect(folded.skippedLines).toBe(1)
    expect(folded.pendingTail).toBe(true)
  })
})
