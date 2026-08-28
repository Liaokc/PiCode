import { describe, expect, it } from 'vitest'
import { toolResultText, toolSummary } from '../../src/shared/tool-format'

describe('toolResultText', () => {
  it('passes plain strings through', () => {
    expect(toolResultText('hello')).toBe('hello')
  })

  it('maps null/undefined to an empty string', () => {
    expect(toolResultText(null)).toBe('')
    expect(toolResultText(undefined)).toBe('')
  })

  it('joins text content arrays (tool result content shape)', () => {
    expect(
      toolResultText([
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' }
      ])
    ).toBe('first\nsecond')
  })

  it('unwraps objects carrying a content array', () => {
    expect(toolResultText({ content: [{ type: 'text', text: 'payload' }] })).toBe('payload')
  })

  it('marks image content with a placeholder instead of dumping bytes', () => {
    expect(toolResultText([{ type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' }])).toBe('[image]')
  })

  it('stringifies plain objects as pretty JSON', () => {
    expect(toolResultText({ ok: true, n: 2 })).toBe('{\n  "ok": true,\n  "n": 2\n}')
  })

  it('falls back to String() for values JSON cannot carry', () => {
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    expect(toolResultText(circular)).toBe('[object Object]')
  })

  it('truncates oversized output with an explicit marker', () => {
    const huge = 'x'.repeat(70_000)
    const out = toolResultText(huge)
    expect(out.length).toBeLessThan(70_000)
    expect(out).toMatch(/… \(output truncated\)$/)
    expect(out.startsWith('x'.repeat(100))).toBe(true)
  })
})

describe('toolSummary', () => {
  it('summarizes known tools from their primary argument', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['bash', { command: 'npm test' }, 'npm test'],
      ['read', { path: 'src/app.ts' }, 'src/app.ts'],
      ['write', { path: 'out.md', content: '…' }, 'out.md'],
      ['edit', { path: 'src/app.ts' }, 'src/app.ts'],
      ['ls', { path: '.' }, '.'],
      ['grep', { pattern: 'TODO', path: 'src' }, 'TODO in src'],
      ['grep', { pattern: 'TODO' }, 'TODO'],
      ['find', { pattern: '*.test.ts' }, '*.test.ts']
    ]
    for (const [name, args, expected] of cases) {
      expect(toolSummary(name, args)).toBe(expected)
    }
  })

  it('falls back to the first string argument for unknown tools', () => {
    expect(toolSummary('mcp__search', { query: 'pi sdk', limit: 5 })).toBe('pi sdk')
  })

  it('falls back to compact JSON when no string argument exists', () => {
    expect(toolSummary('mcp__calc', { a: 1, b: 2 })).toBe('{"a":1,"b":2}')
  })

  it('returns an empty summary for empty arguments', () => {
    expect(toolSummary('bash', {})).toBe('')
    expect(toolSummary('bash', { command: '' })).toBe('')
  })

  it('truncates long summaries', () => {
    const out = toolSummary('bash', { command: 'y'.repeat(300) })
    expect(out.length).toBeLessThanOrEqual(120)
    expect(out.endsWith('…')).toBe(true)
  })
})
