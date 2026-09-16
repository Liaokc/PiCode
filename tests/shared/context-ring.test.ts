import { describe, expect, it } from 'vitest'
import {
  assistantUsageOfMessage,
  contextRingView,
  formatRingHitRate,
  formatRingPercent,
  formatRingTokens,
  lastAssistantUsage
} from '../../src/shared/context-ring'
import type { UsageTokens } from '../../src/shared/usage/types'

function usage(partial: Partial<UsageTokens>): UsageTokens {
  const input = partial.input ?? 0
  const output = partial.output ?? 0
  const cacheRead = partial.cacheRead ?? 0
  const cacheWrite = partial.cacheWrite ?? 0
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    total: partial.total ?? input + output + cacheRead + cacheWrite
  }
}

describe('contextRingView (ticket 77 seam)', () => {
  it('no usage at all → the grey idle ring with no hover data', () => {
    const view = contextRingView({ usage: null, contextWindow: 200_000 })
    expect(view.mode).toBe('idle')
    expect(view.fraction).toBe(0)
    expect(view.usage).toBeNull()
    expect(view.cacheHitRate).toBeNull()
  })

  it('a usage record whose total is zero counts as no usage (grey idle ring)', () => {
    const view = contextRingView({ usage: usage({ input: 0, output: 0 }), contextWindow: 200_000 })
    expect(view.mode).toBe('idle')
  })

  it('a non-finite or non-positive total counts as no usage', () => {
    expect(contextRingView({ usage: usage({ total: Number.NaN }), contextWindow: 200_000 }).mode).toBe('idle')
    expect(contextRingView({ usage: usage({ total: -5 }), contextWindow: 200_000 }).mode).toBe('idle')
  })

  it('usage without a usable context window → the grey no-window ring (no hover)', () => {
    for (const contextWindow of [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const view = contextRingView({
        usage: usage({ input: 100, output: 10, total: 110 }),
        contextWindow: contextWindow as number | null
      })
      expect(view.mode).toBe('no-window')
      expect(view.fraction).toBe(0)
      expect(view.cacheHitRate).toBeNull()
    }
  })

  it('ready ring: the whole quadruple counts toward the occupancy (ticket口径)', () => {
    const view = contextRingView({
      usage: usage({ input: 40_000, output: 2_000, cacheRead: 24_000, cacheWrite: 0 }),
      contextWindow: 200_000
    })
    expect(view.mode).toBe('ready')
    expect(view.used).toBe(66_000)
    expect(view.limit).toBe(200_000)
    expect(view.percent).toBeCloseTo(33)
    expect(view.fraction).toBeCloseTo(0.33)
  })

  it('cache hit rate = cacheRead / (input + cacheRead); null when the denominator is zero', () => {
    const view = contextRingView({
      usage: usage({ input: 40_000, output: 2_000, cacheRead: 24_000, cacheWrite: 0 }),
      contextWindow: 200_000
    })
    expect(view.cacheHitRate).toBeCloseTo(24_000 / 64_000)
    // output-only usage: nothing cached, nothing to read — no rate at all.
    const noCache = contextRingView({ usage: usage({ output: 500 }), contextWindow: 200_000 })
    expect(noCache.cacheHitRate).toBeNull()
    // pure cache read (input 0): the rate saturates at 100%.
    const pureRead = contextRingView({ usage: usage({ cacheRead: 5_000 }), contextWindow: 200_000 })
    expect(pureRead.cacheHitRate).toBe(1)
  })

  it('the arc fraction clamps at the full ring when usage overflows the window', () => {
    const view = contextRingView({ usage: usage({ input: 250_000 }), contextWindow: 200_000 })
    expect(view.mode).toBe('ready')
    expect(view.fraction).toBe(1)
    expect(view.percent).toBeCloseTo(125)
  })

  it('an unknown-window usage keeps its numbers but never renders a percentage', () => {
    const view = contextRingView({ usage: usage({ input: 40_000, output: 2_000 }), contextWindow: null })
    expect(view.mode).toBe('no-window')
    expect(view.used).toBe(42_000)
    expect(view.limit).toBe(0)
    expect(view.percent).toBe(0)
  })
})

describe('context ring formatters (ticket 77)', () => {
  it('tokens spell with en-US thousands separators (the trace column rule)', () => {
    expect(formatRingTokens(66_000)).toBe('66,000')
    expect(formatRingTokens(200_000)).toBe('200,000')
    expect(formatRingTokens(0)).toBe('0')
  })

  it('percentages carry one decimal, dropping a trailing .0', () => {
    expect(formatRingPercent(33)).toBe('33%')
    expect(formatRingPercent(8.23)).toBe('8.2%')
    expect(formatRingPercent(0)).toBe('0%')
    expect(formatRingPercent(125)).toBe('125%')
  })

  it('hit rates spell like percentages; null stays null (row hidden)', () => {
    expect(formatRingHitRate(0.375)).toBe('37.5%')
    expect(formatRingHitRate(1)).toBe('100%')
    expect(formatRingHitRate(0)).toBe('0%')
    expect(formatRingHitRate(null)).toBeNull()
  })
})

describe('assistantUsageOfMessage (ticket 77 host-side projection)', () => {
  it('projects a valid assistant message usage through the one normalizeTokens accounting', () => {
    const tokens = assistantUsageOfMessage({
      role: 'assistant',
      stopReason: 'stop',
      usage: { input: 10, output: 5, cacheRead: 3, cacheWrite: 2, totalTokens: 20 }
    })
    expect(tokens).toEqual({ input: 10, output: 5, cacheRead: 3, cacheWrite: 2, total: 20 })
  })

  it('falls back to the quadruple sum when the file records no totalTokens', () => {
    const tokens = assistantUsageOfMessage({
      role: 'assistant',
      stopReason: 'stop',
      usage: { input: 10, output: 5, cacheRead: 3, cacheWrite: 2, cacheWrite1h: 1 }
    })
    expect(tokens?.total).toBe(21)
  })

  it('aborted and errored messages carry no trustworthy usage (the TUI rule)', () => {
    expect(
      assistantUsageOfMessage({ role: 'assistant', stopReason: 'aborted', usage: { input: 10, totalTokens: 10 } })
    ).toBeUndefined()
    expect(
      assistantUsageOfMessage({ role: 'assistant', stopReason: 'error', usage: { input: 10, totalTokens: 10 } })
    ).toBeUndefined()
  })

  it('missing, empty, or non-assistant shapes degrade to undefined', () => {
    expect(assistantUsageOfMessage(undefined)).toBeUndefined()
    expect(assistantUsageOfMessage({ role: 'user', usage: { input: 1, totalTokens: 1 } })).toBeUndefined()
    expect(assistantUsageOfMessage({ role: 'assistant', stopReason: 'stop' })).toBeUndefined()
    expect(
      assistantUsageOfMessage({ role: 'assistant', stopReason: 'stop', usage: { input: 0, totalTokens: 0 } })
    ).toBeUndefined()
  })
})

describe('lastAssistantUsage (ticket 77 leaf-path walk)', () => {
  const USER = { type: 'message', id: 'u1', message: { role: 'user', content: 'hi' } }
  const ASSISTANT = (id: string, total: number): Record<string, unknown> => ({
    type: 'message',
    id,
    message: { role: 'assistant', stopReason: 'stop', usage: { input: total, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: total } }
  })

  it('walks backwards and returns the LAST valid assistant usage', () => {
    const found = lastAssistantUsage([USER, ASSISTANT('a1', 100), USER, ASSISTANT('a2', 300)])
    expect(found?.total).toBe(300)
  })

  it('skips tool results, compaction boundaries, and invalid assistant shapes', () => {
    const entries = [
      ASSISTANT('a1', 100),
      { type: 'message', id: 'r1', message: { role: 'toolResult', content: 'ok' } },
      { type: 'compaction', id: 'c1', summary: 'compact' },
      { type: 'message', id: 'a2', message: { role: 'assistant', stopReason: 'aborted', usage: { totalTokens: 9 } } },
      USER
    ]
    const found = lastAssistantUsage(entries)
    expect(found?.total).toBe(100)
  })

  it('compaction does NOT special-case the walk (ticket 77: pure projection)', () => {
    // After a compaction boundary with no assistant call after it, the last
    // usage still surfaces — the next assistant message naturally refreshes
    // it (零特判).
    const found = lastAssistantUsage([ASSISTANT('a1', 420), { type: 'compaction', id: 'c1' }])
    expect(found?.total).toBe(420)
  })

  it('no assistant usage anywhere → undefined (the grey idle ring)', () => {
    expect(lastAssistantUsage([USER, { type: 'model_change', id: 'm1', modelId: 'x' }])).toBeUndefined()
    expect(lastAssistantUsage([])).toBeUndefined()
  })
})
