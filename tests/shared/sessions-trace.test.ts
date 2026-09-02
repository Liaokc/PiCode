import { describe, expect, it } from 'vitest'
import {
  buildTracePayload,
  formatCallDuration,
  formatTraceTimestamp,
  formatTraceTokens,
  traceStats,
  type TraceBlock
} from '../../src/shared/sessions/trace'

/**
 * Table-driven fixtures for the call-trace payload builder (ticket 36). The
 * builder is a pure function over the session file text (host-side, no fs,
 * no SDK): entry = one model call, input section = user/tool-result blocks
 * since the previous assistant message, output section = thinking/assistant
 * text/tool-call blocks. Data-source truthfulness: the trace shows exactly
 * what Pi recorded — no synthetic title-generation calls, no system prompt
 * (the SDK's internal system prompt is never persisted).
 */

function line(entry: Record<string, unknown>): string {
  return JSON.stringify(entry)
}

function sessionLine(id: string, cwd = '/work/demo'): string {
  return line({ type: 'session', version: 3, id, timestamp: '2026-09-01T10:00:00.000Z', cwd })
}

function userMessage(id: string, parentId: string, timestamp: string, text: string): string {
  return line({
    type: 'message',
    id,
    parentId,
    timestamp,
    message: { role: 'user', content: [{ type: 'text', text }], timestamp: Date.parse(timestamp) }
  })
}

function assistantMessage(
  id: string,
  parentId: string,
  timestamp: string,
  options: {
    content?: Record<string, unknown>[]
    usage?: Record<string, unknown> | null
    model?: string
    messageTimestamp?: number
    stopReason?: string
  }
): string {
  const messageTimestamp = options.messageTimestamp ?? Date.parse(timestamp) - 4_830
  const message: Record<string, unknown> = {
    role: 'assistant',
    content: options.content ?? [],
    timestamp: messageTimestamp
  }
  if (options.model !== undefined) message.model = options.model
  if (options.usage !== undefined) message.usage = options.usage
  if (options.stopReason !== undefined) message.stopReason = options.stopReason
  return line({ type: 'message', id, parentId, timestamp, message })
}

function toolResultMessage(id: string, parentId: string, timestamp: string, callId: string, output: string): string {
  return line({
    type: 'message',
    id,
    parentId,
    timestamp,
    message: {
      role: 'toolResult',
      toolCallId: callId,
      toolName: 'bash',
      content: [{ type: 'text', text: output }],
      isError: false,
      timestamp: Date.parse(timestamp)
    }
  })
}

const FULL_USAGE = {
  input: 15_614,
  output: 435,
  cacheRead: 1_000,
  cacheWrite: 2_000,
  totalTokens: 19_049,
  cost: { total: 0.01 }
}

/** A thinking + text + toolCall assistant message (the canonical output mix). */
function fullAssistantContent(callId: string): Record<string, unknown>[] {
  return [
    { type: 'thinking', thinking: 'Inspect the layout first.', thinkingSignature: 'sig' },
    { type: 'text', text: 'Looking at the sidebar.' },
    { type: 'toolCall', id: callId, name: 'bash', arguments: { command: 'ls src' } }
  ]
}

describe('buildTracePayload', () => {
  it('groups one assistant message = one call with input/output sections and usage columns', () => {
    const text = [
      sessionLine('s1'),
      line({ type: 'model_change', id: 'mc1', parentId: null, timestamp: '2026-09-01T10:00:00.100Z', provider: 'bella', modelId: 'GLM-5.3' }),
      userMessage('u1', 'mc1', '2026-09-01T10:00:01.000Z', 'Explore the project'),
      assistantMessage('a1', 'u1', '2026-09-01T10:00:05.830Z', {
        content: fullAssistantContent('call-1'),
        usage: FULL_USAGE,
        model: 'GLM-5.3',
        stopReason: 'toolUse'
      }),
      toolResultMessage('t1', 'a1', '2026-09-01T10:00:07.000Z', 'call-1', 'src/\nREADME.md'),
      assistantMessage('a2', 't1', '2026-09-01T10:00:09.000Z', {
        content: [{ type: 'text', text: 'Two entries at the root.' }],
        usage: { input: 16_000, output: 20, totalTokens: 16_020 },
        model: 'GLM-5.3',
        messageTimestamp: Date.parse('2026-09-01T10:00:09.000Z') - 2_000,
        stopReason: 'stop'
      })
    ].join('\n')

    const payload = buildTracePayload(text, '/store/demo.jsonl')
    expect(payload).not.toBeNull()
    expect(payload?.file).toBe('/store/demo.jsonl')
    expect(payload?.title).toBe('Explore the project')
    expect(payload?.model).toBe('GLM-5.3')
    expect(payload?.calls).toHaveLength(2)

    const [call1, call2] = payload?.calls ?? []
    expect(call1?.index).toBe(1)
    expect(call1?.messageId).toBe('a1')
    expect(call1?.model).toBe('GLM-5.3')
    expect(call1?.usage).toEqual({ input: 15_614, output: 435, cacheRead: 1_000, cacheWrite: 2_000, total: 19_049 })
    // Duration: entry timestamp (completion) minus message timestamp (request).
    expect(call1?.durationMs).toBe(4_830)
    expect(call1?.timestamp).toBe('2026-09-01T10:00:05.830Z')

    expect(call1?.inputBlocks).toEqual([{ kind: 'user', text: 'Explore the project' }])
    expect(call1?.outputBlocks).toEqual([
      { kind: 'thinking', text: 'Inspect the layout first.' },
      { kind: 'assistant', text: 'Looking at the sidebar.' },
      { kind: 'tool-call', toolName: 'bash', callId: 'call-1', args: '{"command":"ls src"}' }
    ])

    // The tool result feeds the NEXT call's input section.
    expect(call2?.index).toBe(2)
    expect(call2?.inputBlocks).toEqual([
      { kind: 'tool-result', toolName: 'bash', callId: 'call-1', output: 'src/\nREADME.md', isError: false }
    ])
    expect(call2?.outputBlocks).toEqual([{ kind: 'assistant', text: 'Two entries at the root.' }])
    expect(call2?.usage).toEqual({ input: 16_000, output: 20, cacheRead: 0, cacheWrite: 0, total: 16_020 })
    expect(call2?.durationMs).toBe(2_000)
  })

  it('degrades to timestamp-only when the assistant message carries no usage', () => {
    const text = [
      sessionLine('s1'),
      userMessage('u1', null!, '2026-09-01T10:00:01.000Z', 'hello'),
      assistantMessage('a1', 'u1', '2026-09-01T10:00:03.000Z', {
        content: [{ type: 'text', text: 'hi' }],
        usage: null,
        model: 'GLM-5.3'
      })
    ].join('\n')

    const payload = buildTracePayload(text, '/store/demo.jsonl')
    const call = payload?.calls[0]
    expect(call?.usage).toBeNull()
    // Duration stays derivable from the file's own timestamps.
    expect(call?.durationMs).not.toBeNull()
    const stats = traceStats(payload!)
    expect(stats.totalTokens).toBeNull()
  })

  it('degrades the duration when timestamps are unusable', () => {
    const text = [
      sessionLine('s1'),
      line({
        type: 'message',
        id: 'a1',
        parentId: null,
        timestamp: 'not-a-timestamp',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }], timestamp: NaN, model: 'm' }
      })
    ].join('\n')

    const call = buildTracePayload(text, '/store/demo.jsonl')?.calls[0]
    expect(call?.durationMs).toBeNull()
    expect(call?.timestamp).toBe('not-a-timestamp')
  })

  it('ignores tool calls with malformed parts and keeps the block stream honest', () => {
    const text = [
      sessionLine('s1'),
      assistantMessage('a1', null!, '2026-09-01T10:00:02.000Z', {
        content: [
          { type: 'thinking', thinking: '   ' }, // whitespace-only thinking → not a block
          { type: 'unknown', text: 'junk' },
          { type: 'toolCall', id: '', name: 'bash' }, // missing id → skipped
          { type: 'text', text: 'still here' }
        ],
        usage: FULL_USAGE
      })
    ].join('\n')

    const call = buildTracePayload(text, '/store/demo.jsonl')?.calls[0]
    expect(call?.outputBlocks).toEqual([{ kind: 'assistant', text: 'still here' }])
  })

  it('maps TUI bash-mode entries to user blocks in the next call input (the LLM view)', () => {
    const text = [
      sessionLine('s1'),
      assistantMessage('a1', null!, '2026-09-01T10:00:02.000Z', {
        content: [{ type: 'text', text: 'before' }],
        usage: FULL_USAGE
      }),
      line({
        type: 'message',
        id: 'b1',
        parentId: 'a1',
        timestamp: '2026-09-01T10:00:03.000Z',
        message: { role: 'bashExecution', command: 'git status', output: 'clean', exitCode: 0 }
      }),
      assistantMessage('a2', 'b1', '2026-09-01T10:00:05.000Z', {
        content: [{ type: 'text', text: 'after' }],
        usage: FULL_USAGE
      })
    ].join('\n')

    const call2 = buildTracePayload(text, '/store/demo.jsonl')?.calls[1]
    expect(call2?.inputBlocks).toEqual([{ kind: 'user', text: 'Ran `git status`\n```\nclean\n```' }])
  })

  it('keeps compaction boundaries honest: the summary replaces the accumulated input', () => {
    const text = [
      sessionLine('s1'),
      userMessage('u1', null!, '2026-09-01T10:00:01.000Z', 'older context'),
      line({
        type: 'compaction',
        id: 'c1',
        parentId: 'u1',
        timestamp: '2026-09-01T10:01:00.000Z',
        summary: 'Summary of older context',
        usage: FULL_USAGE
      }),
      userMessage('u2', 'c1', '2026-09-01T10:02:00.000Z', 'fresh question'),
      assistantMessage('a1', 'u2', '2026-09-01T10:02:03.000Z', {
        content: [{ type: 'text', text: 'answer' }],
        usage: FULL_USAGE
      })
    ].join('\n')

    const call = buildTracePayload(text, '/store/demo.jsonl')?.calls[0]
    // The pre-compaction input is no longer what the model sees; the block
    // vocabulary has no summary block, so the builder clears the stale
    // accumulation at the boundary (documented behavior for this entry type).
    expect(call?.inputBlocks).toEqual([{ kind: 'user', text: 'fresh question' }])
  })

  it('lets model_change entries name the model when the message omits it', () => {
    const text = [
      sessionLine('s1'),
      line({ type: 'model_change', id: 'mc1', parentId: null, timestamp: '2026-09-01T10:00:00.100Z', provider: 'bella', modelId: 'GLM-5.3-flash' }),
      assistantMessage('a1', null!, '2026-09-01T10:00:02.000Z', { content: [{ type: 'text', text: 'x' }], usage: FULL_USAGE })
    ].join('\n')

    const payload = buildTracePayload(text, '/store/demo.jsonl')
    expect(payload?.calls[0]?.model).toBe('GLM-5.3-flash')
    expect(payload?.model).toBe('GLM-5.3-flash')
  })

  it('derives the title: session_info name wins over first user text', () => {
    const text = [
      sessionLine('s1'),
      userMessage('u1', null!, '2026-09-01T10:00:01.000Z', 'first user words'),
      line({ type: 'session_info', id: 'i1', parentId: 'u1', timestamp: '2026-09-01T10:00:02.000Z', name: 'Named session' }),
      assistantMessage('a1', 'u1', '2026-09-01T10:00:03.000Z', { content: [{ type: 'text', text: 'ok' }], usage: FULL_USAGE })
    ].join('\n')
    expect(buildTracePayload(text, '/store/demo.jsonl')?.title).toBe('Named session')
    expect(buildTracePayload(userMessage('u1', null!, '2026-09-01T10:00:01.000Z', 'first'), '/f.jsonl')).toBeNull()
  })

  it('returns null for non-session text and tolerates a half-written tail', () => {
    expect(buildTracePayload('', '/f.jsonl')).toBeNull()
    expect(buildTracePayload('{"type":"message"}', '/f.jsonl')).toBeNull()
    const good = [sessionLine('s1'), userMessage('u1', null!, '2026-09-01T10:00:01.000Z', 'hi')].join('\n')
    const tail = `${good}\n{"type":"message","id":"half`
    const payload = buildTracePayload(tail, '/f.jsonl')
    expect(payload?.calls).toHaveLength(0)
  })
})

describe('traceStats', () => {
  it('sums tokens across calls and reports the last model in effect', () => {
    const text = [
      sessionLine('s1'),
      userMessage('u1', null!, '2026-09-01T10:00:01.000Z', 'go'),
      assistantMessage('a1', 'u1', '2026-09-01T10:00:03.000Z', {
        content: [{ type: 'text', text: 'a' }],
        usage: { input: 100, output: 10, totalTokens: 110 },
        model: 'GLM-5.3'
      }),
      line({ type: 'model_change', id: 'mc', parentId: 'a1', timestamp: '2026-09-01T10:00:04.000Z', provider: 'bella', modelId: 'GLM-5.3-flash' }),
      assistantMessage('a2', 'a1', '2026-09-01T10:00:06.000Z', {
        content: [{ type: 'text', text: 'b' }],
        usage: { input: 200, output: 20, totalTokens: 220 },
        model: 'GLM-5.3-flash'
      })
    ].join('\n')

    const stats = traceStats(buildTracePayload(text, '/f.jsonl')!)
    expect(stats.calls).toBe(2)
    expect(stats.totalTokens).toBe(330)
    expect(stats.model).toBe('GLM-5.3-flash')
  })

  it('hides the token segment when no call carries usage, and the model when unknowable', () => {
    const text = [
      sessionLine('s1'),
      userMessage('u1', null!, '2026-09-01T10:00:01.000Z', 'go'),
      assistantMessage('a1', 'u1', '2026-09-01T10:00:03.000Z', { content: [{ type: 'text', text: 'a' }], usage: null })
    ].join('\n')

    const stats = traceStats(buildTracePayload(text, '/f.jsonl')!)
    expect(stats.calls).toBe(1)
    expect(stats.totalTokens).toBeNull()
    expect(stats.model).toBeNull()
  })
})

describe('trace formatters', () => {
  it('formats durations as precise seconds', () => {
    expect(formatCallDuration(4_830)).toBe('4.83s')
    expect(formatCallDuration(9_260)).toBe('9.26s')
    expect(formatCallDuration(0)).toBe('0.00s')
  })

  it('formats timestamps as en-US time-of-day under the given zone', () => {
    expect(formatTraceTimestamp('2026-09-01T14:23:20.000Z', 'UTC')).toBe('2:23:20 PM')
    expect(formatTraceTimestamp('garbage', 'UTC')).toBeNull()
  })

  it('formats token counts with thousands separators', () => {
    expect(formatTraceTokens(15_614)).toBe('15,614')
    expect(formatTraceTokens(435)).toBe('435')
  })
})

describe('block kinds (contract surface)', () => {
  it('covers the six block types', () => {
    const kinds: TraceBlock['kind'][] = [
      'system-prompt',
      'user',
      'thinking',
      'assistant',
      'tool-call',
      'tool-result'
    ]
    expect(kinds).toHaveLength(6)
  })
})
