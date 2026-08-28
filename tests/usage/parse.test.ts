import { describe, expect, it } from 'vitest'
import { parseSessionFile } from '../../src/shared/usage/parse.ts'

/**
 * Fixtures mirror the real Pi session jsonl shapes (see ADR-0002:
 * session files under ~/.pi/agent/sessions/<escaped-cwd>/*.jsonl).
 */

const headerLine = JSON.stringify({
  type: 'session',
  version: 3,
  id: '01a04350-a356-77b4-adf4-9502c537e7e1',
  timestamp: '2026-08-27T13:02:33.302Z',
  cwd: '/Users/liaokechen/PiCode'
})

const modelChangeLine = JSON.stringify({
  type: 'model_change',
  id: 'bff3feba',
  parentId: null,
  timestamp: '2026-08-27T13:02:33.351Z',
  provider: 'bella',
  modelId: 'GLM-5.3-flash'
})

const userLine = JSON.stringify({
  type: 'message',
  id: '910a4f3f',
  parentId: '011b7e8e',
  timestamp: '2026-08-27T13:05:32.731Z',
  message: { role: 'user', content: [{ type: 'text', text: 'pi 中怎么复制东西？' }], timestamp: 1787835932729 }
})

const assistantLine = JSON.stringify({
  type: 'message',
  id: '001e3921',
  parentId: '910a4f3f',
  timestamp: '2026-08-27T13:05:38.520Z',
  message: {
    role: 'assistant',
    content: [{ type: 'thinking', thinking: '…', thinkingSignature: '6f2d' }],
    api: 'anthropic-messages',
    provider: 'bella',
    model: 'GLM-5.3-flash',
    usage: {
      input: 3956,
      output: 180,
      cacheRead: 128,
      cacheWrite: 0,
      totalTokens: 4264,
      cost: { input: 0.0015824, output: 0.000252, cacheRead: 0.00001472, cacheWrite: 0, total: 0.00184912 },
      cacheWrite1h: 0
    },
    stopReason: 'toolUse',
    timestamp: 1787835938508
  }
})

const toolResultLine = JSON.stringify({
  type: 'message',
  id: '84cf5371',
  parentId: '001e3921',
  timestamp: '2026-08-27T13:05:38.542Z',
  message: {
    role: 'toolResult',
    toolCallId: 'call_201ed21f96f0416cbe8c9f13',
    toolName: 'bash',
    content: [{ type: 'text', text: 'keybindings.md\n…' }],
    isError: false,
    timestamp: 1787835938542
  }
})

const finalAssistantLine = JSON.stringify({
  type: 'message',
  id: 'a5f0',
  parentId: '84cf5371',
  timestamp: '2026-08-27T13:06:20.000Z',
  message: {
    role: 'assistant',
    content: [{ type: 'text', text: 'Use ctrl+o …' }],
    api: 'anthropic-messages',
    provider: 'bella',
    model: 'GLM-5.3-flash',
    usage: {
      input: 3809,
      output: 574,
      cacheRead: 4032,
      cacheWrite: 0,
      totalTokens: 8415,
      cost: { input: 0.0015236, output: 0.0008036, cacheRead: 0.00046368, cacheWrite: 0, total: 0.00279088 },
      cacheWrite1h: 0
    },
    stopReason: 'stop',
    timestamp: 1787835980000
  }
})

const normalFlow = [headerLine, modelChangeLine, userLine, assistantLine, toolResultLine, finalAssistantLine, '']
  .join('\n')

describe('parseSessionFile — normal flow', () => {
  const parsed = parseSessionFile(normalFlow)

  it('exposes the session header', () => {
    expect(parsed.header).toEqual({
      id: '01a04350-a356-77b4-adf4-9502c537e7e1',
      cwd: '/Users/liaokechen/PiCode',
      startedAt: '2026-08-27T13:02:33.302Z'
    })
  })

  it('extracts one usage event per assistant message', () => {
    expect(parsed.events).toHaveLength(2)
    expect(parsed.events[0]).toMatchObject({
      kind: 'message',
      id: '001e3921',
      timestamp: '2026-08-27T13:05:38.520Z',
      model: 'GLM-5.3-flash',
      tokens: { input: 3956, output: 180, cacheRead: 128, cacheWrite: 0, total: 4264 }
    })
    // cost is carried as integer micro-USD: 0.00184912 USD → 1849 micros
    expect(parsed.events[0].costMicros).toBe(1849)
    expect(parsed.events[1]).toMatchObject({
      kind: 'message',
      id: 'a5f0',
      model: 'GLM-5.3-flash',
      tokens: { total: 8415 }
    })
    expect(parsed.events[1].costMicros).toBe(2791)
  })

  it('records an activity timestamp for every message entry regardless of role', () => {
    expect(parsed.activityTimestamps).toEqual([
      '2026-08-27T13:05:32.731Z',
      '2026-08-27T13:05:38.520Z',
      '2026-08-27T13:05:38.542Z',
      '2026-08-27T13:06:20.000Z'
    ])
  })

  it('flags nothing skipped and no pending tail on a clean file', () => {
    expect(parsed.skippedLines).toBe(0)
    expect(parsed.pendingTail).toBe(false)
  })
})

describe('parseSessionFile — truncated half line', () => {
  const truncated = normalFlow + '\n{"type":"message","id":"9c1","parentId":"a5f0","timestamp":"2026-08-27T13:0'

  it('ignores an incomplete trailing line without throwing', () => {
    const parsed = parseSessionFile(truncated)
    expect(parsed.events).toHaveLength(2)
    expect(parsed.pendingTail).toBe(true)
    // a half-written line is not a malformed line — it is pending until completed
    expect(parsed.skippedLines).toBe(0)
  })

  it('yields the same events as the complete file once the tail completes', () => {
    const completed = parseSessionFile(normalFlow)
    const parsed = parseSessionFile(truncated)
    expect(parsed.events).toEqual(completed.events)
    expect(parsed.activityTimestamps).toEqual(completed.activityTimestamps)
  })
})

describe('parseSessionFile — malformed and unknown lines', () => {
  const messy = [
    headerLine,
    'this is not json at all',
    modelChangeLine,
    JSON.stringify({ type: 'something_new_from_an_extension', id: 'x', parentId: null, timestamp: '2026-08-27T13:03:00.000Z' }),
    userLine,
    '{"broken json',
    assistantLine,
    ''
  ].join('\n')

  it('skips malformed lines but keeps parsing the rest', () => {
    const parsed = parseSessionFile(messy)
    expect(parsed.events).toHaveLength(1)
    expect(parsed.activityTimestamps).toEqual(['2026-08-27T13:05:32.731Z', '2026-08-27T13:05:38.520Z'])
    expect(parsed.skippedLines).toBe(2)
    expect(parsed.pendingTail).toBe(false)
  })
})
