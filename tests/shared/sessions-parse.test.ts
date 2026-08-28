import { describe, expect, it } from 'vitest'
import {
  buildSessionTree,
  extractTranscriptItems,
  makeSessionInfoLine,
  parseSessionLines,
  summarizeSession
} from '../../src/shared/sessions/parse.ts'
import type { RawSessionEntry } from '../../src/shared/sessions/parse.ts'

/**
 * Fixtures mirror the real Pi session jsonl shapes (v3, append-only tree
 * entries with id/parentId; see ~/.pi/agent/sessions/<encoded-cwd>/*.jsonl).
 */

function headerLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'session',
    version: 3,
    id: 'aaaa1111-1111-1111-1111-111111111111',
    timestamp: '2026-08-27T13:02:33.302Z',
    cwd: '/Users/liaokechen/PiCode',
    ...overrides
  })
}

function messageLine(id: string, parentId: string | null, role: string, content: unknown, timestamp = '2026-08-27T13:05:32.731Z'): string {
  return JSON.stringify({ type: 'message', id, parentId, timestamp, message: { role, content } })
}

function entryLine(id: string, parentId: string | null, extra: Record<string, unknown>, timestamp = '2026-08-27T13:06:00.000Z'): string {
  return JSON.stringify({ type: extra['type'], id, parentId, timestamp, ...extra })
}

const text = (t: string): unknown => [{ type: 'text', text: t }]

describe('parseSessionLines', () => {
  it('splits the header from tree entries', () => {
    const raw = [headerLine(), messageLine('e1', null, 'user', text('hello'))].join('\n')
    const parsed = parseSessionLines(raw)
    expect(parsed.header?.id).toBe('aaaa1111-1111-1111-1111-111111111111')
    expect(parsed.header?.cwd).toBe('/Users/liaokechen/PiCode')
    expect(parsed.entries).toHaveLength(1)
    expect(parsed.entries[0]?.id).toBe('e1')
  })

  it('ignores malformed interior lines but never throws on a half-written tail', () => {
    const raw = [
      headerLine(),
      '{oops',
      messageLine('e1', null, 'user', text('hello')),
      '{"type":"message","id":"e2"', // trailing half line (append-only writer caught mid-write)
      ''
    ].join('\n')
    const parsed = parseSessionLines(raw)
    expect(parsed.entries.map((e) => e.id)).toEqual(['e1'])
  })

  it('returns an empty result for garbage input', () => {
    expect(parseSessionLines('not a session at all').header).toBeNull()
    expect(parseSessionLines('not a session at all').entries).toEqual([])
  })
})

describe('summarizeSession', () => {
  it('derives title from the latest session_info name', () => {
    const raw = [
      headerLine(),
      messageLine('e1', null, 'user', text('fix the redirect loop')),
      entryLine('e2', 'e1', { type: 'session_info', name: 'Login redirect hunt' })
    ].join('\n')
    const summary = summarizeSession(raw, '/s/2026.jsonl', 1756300000000)
    expect(summary?.name).toBe('Login redirect hunt')
    expect(summary?.title).toBe('Login redirect hunt')
  })

  it('falls back to the first user message text and truncates it', () => {
    const long = 'x'.repeat(140)
    const raw = [headerLine(), messageLine('e1', null, 'user', text(long))].join('\n')
    const summary = summarizeSession(raw, '/s/2026.jsonl', 1756300000000)
    expect(summary?.name).toBeNull()
    expect(summary?.title).toBe(`${long.slice(0, 80)}…`)
  })

  it('prefers the first user text part and skips assistant/system-ish messages', () => {
    const raw = [
      headerLine(),
      messageLine('e0', null, 'bashExecution', 'cd /tmp'),
      messageLine('e1', 'e0', 'assistant', text('I will help')),
      messageLine('e2', 'e1', 'user', [{ type: 'image', data: '...' }, { type: 'text', text: 'what is this?' }])
    ].join('\n')
    expect(summarizeSession(raw, '/s/f.jsonl', 1)?.title).toBe('what is this?')
  })

  it('reports counts, cwd, timestamps, and falls back to a neutral title', () => {
    const raw = [
      headerLine({ timestamp: '2026-08-27T13:02:33.302Z' }),
      messageLine('e1', null, 'user', text('hello')),
      messageLine('e2', 'e1', 'assistant', text('hi there'))
    ].join('\n')
    const summary = summarizeSession(raw, '/s/f.jsonl', 1756300000000)
    expect(summary).toMatchObject({
      file: '/s/f.jsonl',
      id: 'aaaa1111-1111-1111-1111-111111111111',
      cwd: '/Users/liaokechen/PiCode',
      messageCount: 2,
      startedAt: '2026-08-27T13:02:33.302Z',
      modifiedAt: 1756300000000,
      title: 'hello'
    })
  })

  it('is null for files without a session header', () => {
    expect(summarizeSession('{"type":"message","id":"x","parentId":null,"timestamp":"","message":{"role":"user","content":"hi"}}\n', '/s/f.jsonl', 1)).toBeNull()
  })
})

describe('extractTranscriptItems', () => {
  it('keeps user and assistant text in order, dropping thinking and tool traffic', () => {
    const entries: RawSessionEntry[] = [
      { type: 'message', id: 'e1', parentId: null, timestamp: 't1', message: { role: 'user', content: text('plan the work') } },
      { type: 'message', id: 'e2', parentId: 'e1', timestamp: 't2', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'toolCall', id: 'c1', name: 'bash', arguments: {} }] } },
      { type: 'message', id: 'e3', parentId: 'e2', timestamp: 't3', message: { role: 'toolResult', content: text('ok') } },
      { type: 'message', id: 'e4', parentId: 'e3', timestamp: 't4', message: { role: 'assistant', content: text('here is the plan') } }
    ]
    expect(extractTranscriptItems(entries)).toEqual([
      { id: 'e1', role: 'user', text: 'plan the work', timestamp: 't1' },
      { id: 'e4', role: 'assistant', text: 'here is the plan', timestamp: 't4' }
    ])
  })

  it('handles string content and joins multiple text parts', () => {
    const entries: RawSessionEntry[] = [
      { type: 'message', id: 'e1', parentId: null, timestamp: 't1', message: { role: 'user', content: 'plain string' } },
      { type: 'message', id: 'e2', parentId: 'e1', timestamp: 't2', message: { role: 'assistant', content: [...(text('a') as unknown[]), ...(text('b') as unknown[])] } }
    ]
    const items = extractTranscriptItems(entries)
    expect(items[0]?.text).toBe('plain string')
    expect(items[1]?.text).toBe('ab')
  })
})

describe('buildSessionTree', () => {
  it('nests entries under their parents and reports the file-order leaf', () => {
    const raw = [
      headerLine(),
      entryLine('m1', null, { type: 'model_change', provider: 'p', modelId: 'm' }),
      messageLine('u1', 'm1', 'user', text('branch me')),
      messageLine('a1', 'u1', 'assistant', text('branch A')),
      messageLine('a2', 'u1', 'assistant', text('branch B'))
    ].join('\n')
    const { nodes, leafId } = buildSessionTree(parseSessionLines(raw).entries)
    expect(leafId).toBe('a2')
    expect(nodes).toHaveLength(1) // single root: m1
    const u1 = nodes[0]?.children[0]
    expect(u1?.id).toBe('u1')
    expect(u1?.children.map((c) => c.id)).toEqual(['a1', 'a2'])
  })

  it('resolves labels from label entries and exposes previews', () => {
    const raw = [
      headerLine(),
      messageLine('u1', null, 'user', text('explore alternatives')),
      messageLine('a1', 'u1', 'assistant', text('option one')),
      entryLine('l1', 'a1', { type: 'label', targetId: 'u1', label: 'starting point' })
    ].join('\n')
    const { nodes } = buildSessionTree(parseSessionLines(raw).entries)
    const u1 = nodes[0]
    expect(u1?.label).toBe('starting point')
    expect(u1?.preview).toBe('explore alternatives')
    expect(u1?.kind).toBe('user')
  })

  it('classifies non-message entries and uses the latest label when relabeled', () => {
    const entries: RawSessionEntry[] = [
      { type: 'session_info', id: 'i1', parentId: null, timestamp: 't0', name: 'Renamed task' },
      { type: 'message', id: 'u1', parentId: 'i1', timestamp: 't1', message: { role: 'user', content: text('go') } },
      { type: 'label', id: 'l1', parentId: 'u1', timestamp: 't2', targetId: 'u1', label: 'first' },
      { type: 'label', id: 'l2', parentId: 'u1', timestamp: 't3', targetId: 'u1', label: 'second' }
    ]
    const { nodes } = buildSessionTree(entries)
    expect(nodes[0]?.kind).toBe('session-info')
    expect(nodes[0]?.name).toBe('Renamed task')
    expect(nodes[0]?.children[0]?.label).toBe('second')
  })
})

describe('makeSessionInfoLine', () => {
  it('emits a session_info entry chained to the current leaf', () => {
    const line = makeSessionInfoLine({ id: 'abcd1234', parentId: 'e9', name: 'Fresh name', timestamp: '2026-08-28T00:00:00.000Z' })
    const parsed = JSON.parse(line) as Record<string, unknown>
    expect(parsed).toMatchObject({ type: 'session_info', id: 'abcd1234', parentId: 'e9', name: 'Fresh name' })
    expect(line.endsWith('\n')).toBe(true)
  })

  it('strips newlines from names like the SDK does', () => {
    const line = makeSessionInfoLine({ id: 'x', parentId: null, name: 'two\nlines\r\nhere', timestamp: 't' })
    expect((JSON.parse(line) as { name: string }).name).toBe('two lines here')
  })
})
