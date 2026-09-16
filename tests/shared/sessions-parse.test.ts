import { describe, expect, it } from 'vitest'
import {
  buildSessionTree,
  extractTranscriptItems,
  makeSessionInfoLine,
  parseSessionLines,
  sniffSkillName,
  summarizeSession,
  toolCallSummary,
  truncateTitle
} from '../../src/shared/sessions/parse.ts'
import type { RawSessionEntry } from '../../src/shared/sessions/parse.ts'
import { UNFINISHED_TOOL_OUTPUT } from '../../src/shared/tool-format'

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

  it('carries the file birthtime through as createdAt, degrading to null (ticket 33)', () => {
    const raw = [headerLine(), messageLine('e1', null, 'user', text('hello'))].join('\n')
    // Purely additive: callers unaware of the field get a null createdAt.
    expect(summarizeSession(raw, '/s/f.jsonl', 5)?.createdAt).toBeNull()
    // The index service passes the stat() birthtime when the platform has one.
    expect(summarizeSession(raw, '/s/f.jsonl', 5, 1_756_000_000_000)?.createdAt).toBe(1_756_000_000_000)
    // A zero birthtime means "platform has none" — null, never 0.
    expect(summarizeSession(raw, '/s/f.jsonl', 5, 0)?.createdAt).toBeNull()
  })

  it('is null for files without a session header', () => {
    expect(summarizeSession('{"type":"message","id":"x","parentId":null,"timestamp":"","message":{"role":"user","content":"hi"}}\n', '/s/f.jsonl', 1)).toBeNull()
  })
})

describe('summarizeSession — title skips the skill-injection prologue (ticket 42)', () => {
  /** The exact prologue the Pi SDK injects for a skill-driven turn
   * (agent-session.js: `<skill name=… location=…>\n…body…\n</skill>`, the
   * user's own text riding after a blank line). Worktree sessions used to
   * title themselves `<skill name="implement" locat…`. */
  const prologue = (name: string, body: string): string =>
    `<skill name="${name}" location="/tmp/skills/${name}/SKILL.md">\nReferences are relative to /tmp/skills/${name}.\n\n${body}\n</skill>`

  it('titles the session with the text AFTER the skill block', () => {
    const raw = [
      headerLine(),
      messageLine('e1', null, 'user', text(`${prologue('implement', 'Implement the work described by the user.')}\n\n.scratch/picode-1-3/issues/42.md`))
    ].join('\n')
    expect(summarizeSession(raw, '/s/f.jsonl', 1)?.title).toBe('.scratch/picode-1-3/issues/42.md')
  })

  it('falls back to the skill name when the block is the whole message', () => {
    const raw = [headerLine(), messageLine('e1', null, 'user', text(prologue('implement', 'body text')))].join('\n')
    expect(summarizeSession(raw, '/s/f.jsonl', 1)?.title).toBe('implement')
  })

  it('falls back to the skill name when only whitespace follows the block', () => {
    const raw = [headerLine(), messageLine('e1', null, 'user', text(`${prologue('review', 'body')}\n\n   `))].join('\n')
    expect(summarizeSession(raw, '/s/f.jsonl', 1)?.title).toBe('review')
  })

  it('still truncates the post-skill text to the sidebar budget', () => {
    const long = 'y'.repeat(140)
    const raw = [headerLine(), messageLine('e1', null, 'user', text(`${prologue('implement', 'body')}\n\n${long}`))].join('\n')
    expect(summarizeSession(raw, '/s/f.jsonl', 1)?.title).toBe(`${long.slice(0, 80)}…`)
  })

  it('leaves non-skill messages untouched — the prologue must be the exact SDK shape', () => {
    const raw = [headerLine(), messageLine('e1', null, 'user', text('<skill name="implement" location="/tmp/x">never closed'))].join('\n')
    expect(summarizeSession(raw, '/s/f.jsonl', 1)?.title).toBe('<skill name="implement" location="/tmp/x">never closed')
    // A mid-message mention is not an invocation (the raw text passes
    // through; titles are single-line via truncateTitle).
    const mention = [headerLine(), messageLine('e1', null, 'user', text(`see ${prologue('x', 'b')} for context`))].join('\n')
    expect(summarizeSession(mention, '/s/f.jsonl', 1)?.title).toBe(
      truncateTitle(`see ${prologue('x', 'b')} for context`)
    )
  })

  it('a session_info rename still wins over the skill-derived title', () => {
    const raw = [
      headerLine(),
      messageLine('e1', null, 'user', text(`${prologue('implement', 'body')}\n\n.scratch/ticket.md`)),
      entryLine('e2', 'e1', { type: 'session_info', name: 'Chosen name' })
    ].join('\n')
    expect(summarizeSession(raw, '/s/f.jsonl', 1)?.title).toBe('Chosen name')
  })

  it('a later plain user message does not rescue a skill-block-only first message', () => {
    const raw = [
      headerLine(),
      messageLine('e1', null, 'user', text(prologue('implement', 'body'))),
      messageLine('e2', 'e1', 'user', text('plain follow-up'))
    ].join('\n')
    expect(summarizeSession(raw, '/s/f.jsonl', 1)?.title).toBe('implement')
  })
})

describe('extractTranscriptItems — structured replay (ticket 14)', () => {
  it('keeps user/assistant text in order and resolves tool calls with their final results', () => {
    const entries: RawSessionEntry[] = [
      { type: 'message', id: 'e1', parentId: null, timestamp: 't1', message: { role: 'user', content: text('plan the work') } },
      {
        type: 'message',
        id: 'e2',
        parentId: 'e1',
        timestamp: 't2',
        message: {
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'ls' } }]
        }
      },
      {
        type: 'message',
        id: 'e3',
        parentId: 'e2',
        timestamp: 't3',
        message: { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: text('ok'), isError: false }
      },
      { type: 'message', id: 'e4', parentId: 'e3', timestamp: 't4', message: { role: 'assistant', content: text('here is the plan') } }
    ]
    expect(extractTranscriptItems(entries)).toEqual([
      { role: 'user', id: 'e1', text: 'plan the work', timestamp: 't1', skillName: null },
      {
        role: 'assistant',
        id: 'e2',
        timestamp: 't2',
        text: '',
        parts: [{ kind: 'thinking', text: 'hmm', durationMs: null }]
      },
      { role: 'tool', id: 'c1', timestamp: 't2', name: 'bash', args: { command: 'ls' }, output: 'ok', isError: false },
      {
        role: 'assistant',
        id: 'e4',
        timestamp: 't4',
        text: 'here is the plan',
        parts: [{ kind: 'text', text: 'here is the plan' }]
      }
    ])
  })

  it('exposes the skill marker sniffed from injected <skill> text on user items', () => {
    const injected = '<skill name="implement" location="/Users/x/.pi/agent/skills/implement/SKILL.md">\nReferences are relative.\n</skill>\n\nship it'
    const entries: RawSessionEntry[] = [
      { type: 'message', id: 'e1', parentId: null, timestamp: 't1', message: { role: 'user', content: text(injected) } },
      { type: 'message', id: 'e2', parentId: 'e1', timestamp: 't2', message: { role: 'user', content: text('plain follow-up') } }
    ]
    const items = extractTranscriptItems(entries)
    expect(items[0]).toMatchObject({ role: 'user', skillName: 'implement' })
    expect(items[1]).toMatchObject({ role: 'user', skillName: null })
  })

  it('propagates isError and degrades a tool call whose result never reached the file (aborted turn)', () => {
    const entries: RawSessionEntry[] = [
      {
        type: 'message',
        id: 'e1',
        parentId: null,
        timestamp: 't1',
        message: { role: 'assistant', content: [{ type: 'toolCall', id: 'c-ok', name: 'bash', arguments: { command: 'echo hi' } }] }
      },
      { type: 'message', id: 'e2', parentId: 'e1', timestamp: 't2', message: { role: 'toolResult', toolCallId: 'c-ok', content: text('hi'), isError: true } },
      {
        type: 'message',
        id: 'e3',
        parentId: 'e2',
        timestamp: 't3',
        message: { role: 'assistant', content: [{ type: 'toolCall', id: 'c-lost', name: 'read', arguments: { path: '/a' } }] }
      }
    ]
    const items = extractTranscriptItems(entries)
    expect(items[0]).toMatchObject({ role: 'tool', id: 'c-ok', isError: true, output: 'hi' })
    expect(items[1]).toEqual({ role: 'tool', id: 'c-lost', timestamp: 't3', name: 'read', args: { path: '/a' }, output: UNFINISHED_TOOL_OUTPUT, isError: true })
  })

  it('drops toolResult echoes, TUI bash-mode traffic, and non-message entries from the replay', () => {
    const entries: RawSessionEntry[] = [
      { type: 'session_info', id: 'i1', parentId: null, timestamp: 't0', name: 'Renamed' },
      { type: 'message', id: 'e0', parentId: 'i1', timestamp: 't0', message: { role: 'bashExecution', command: 'cd /tmp', output: 'ok' } },
      { type: 'message', id: 'e1', parentId: 'e0', timestamp: 't1', message: { role: 'user', content: text('go') } },
      { type: 'message', id: 'orphan', parentId: 'e1', timestamp: 't2', message: { role: 'toolResult', toolCallId: 'ghost', content: text('stray') } },
      { type: 'message', id: 'e2', parentId: 'orphan', timestamp: 't3', message: { role: 'assistant', content: [] } }
    ]
    expect(extractTranscriptItems(entries)).toEqual([
      { role: 'user', id: 'e1', text: 'go', timestamp: 't1', skillName: null }
    ])
  })

  it('handles string content, joins text parts as paragraphs, and keeps content order', () => {
    const entries: RawSessionEntry[] = [
      { type: 'message', id: 'e1', parentId: null, timestamp: 't1', message: { role: 'user', content: 'plain string' } },
      {
        type: 'message',
        id: 'e2',
        parentId: 'e1',
        timestamp: 't2',
        message: {
          role: 'assistant',
          content: [...(text('a') as unknown[]), ...(text('b') as unknown[]), { type: 'thinking', thinking: 'late thought' }]
        }
      }
    ]
    const items = extractTranscriptItems(entries)
    const first = items[0]
    expect(first?.role).toBe('user')
    if (first?.role !== 'user') return
    expect(first.text).toBe('plain string')
    const assistant = items[1]
    expect(assistant?.role).toBe('assistant')
    if (assistant?.role !== 'assistant') return
    expect(assistant.text).toBe('a\n\nb')
    expect(assistant.parts).toEqual([
      { kind: 'text', text: 'a' },
      { kind: 'text', text: 'b' },
      { kind: 'thinking', text: 'late thought', durationMs: null }
    ])
  })

  it('serializes tool result images through the same text projection as the live path', () => {
    const entries: RawSessionEntry[] = [
      {
        type: 'message',
        id: 'e1',
        parentId: null,
        timestamp: 't1',
        message: { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'read', arguments: { path: '/img.png' } }] }
      },
      {
        type: 'message',
        id: 'e2',
        parentId: 'e1',
        timestamp: 't2',
        message: {
          role: 'toolResult',
          toolCallId: 'c1',
          content: [{ type: 'image', data: 'xxx', mimeType: 'image/png' }, { type: 'text', text: 'rendered' }]
        }
      }
    ]
    const items = extractTranscriptItems(entries)
    expect(items[0]).toMatchObject({ role: 'tool', id: 'c1', output: '[image]\nrendered', isError: false })
  })

  it('never emits items for empty user text or whitespace-only thinking', () => {
    const entries: RawSessionEntry[] = [
      { type: 'message', id: 'e1', parentId: null, timestamp: 't1', message: { role: 'user', content: [{ type: 'text', text: '   ' }] } },
      {
        type: 'message',
        id: 'e2',
        parentId: 'e1',
        timestamp: 't2',
        message: { role: 'assistant', content: [{ type: 'thinking', thinking: '', thinkingSignature: 'redacted' }] }
      }
    ]
    expect(extractTranscriptItems(entries)).toEqual([])
  })
})

describe('extractTranscriptItems — tool result diff text (ticket 78, additive projection)', () => {
  const DIFF = '+ 13   "old": false,\n- 12   "old": true,'

  function editRound(details: unknown): RawSessionEntry[] {
    return [
      {
        type: 'message',
        id: 'e1',
        parentId: null,
        timestamp: 't1',
        message: {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'c1', name: 'edit', arguments: { path: 'src/a.ts', edits: [] } }]
        }
      },
      {
        type: 'message',
        id: 'e2',
        parentId: 'e1',
        timestamp: 't2',
        message: {
          role: 'toolResult',
          toolCallId: 'c1',
          toolName: 'edit',
          content: text('Successfully replaced 1 block(s) in src/a.ts.'),
          isError: false,
          ...(details !== undefined ? { details } : {})
        }
      }
    ]
  }

  it('carries the edit result\u0027s details.diff as the item diff text', () => {
    const items = extractTranscriptItems(editRound({ diff: DIFF, patch: '--- a/x\n+++ b/x' }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ role: 'tool', name: 'edit', diff: DIFF })
  })

  it('omits the field entirely when the result has no details (old payloads stay valid)', () => {
    const items = extractTranscriptItems(editRound(undefined))
    expect(items).toHaveLength(1)
    expect((items[0] as { diff?: string }).diff).toBeUndefined()
  })

  it('a non-diff details shape never fabricates a diff field', () => {
    const items = extractTranscriptItems(editRound({ truncation: null }))
    expect((items[0] as { diff?: string }).diff).toBeUndefined()
  })
})

describe('sniffSkillName', () => {
  it('matches the exact injection shape the Pi SDK prepends to a turn message', () => {
    const injected = '<skill name="tdd" location="/x/SKILL.md">\nbody\n</skill>\n\nreal prompt'
    expect(sniffSkillName(injected)).toBe('tdd')
  })

  it('returns null for skill mentions that are not the injection prologue', () => {
    expect(sniffSkillName('please use the tdd skill')).toBeNull()
    expect(sniffSkillName('\n<skill name="tdd" location="/x">\nmid-message')).toBeNull()
    expect(sniffSkillName('')).toBeNull()
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

describe('buildSessionTree — tool calls ride the assistant node (ticket 43)', () => {
  it('attaches per-family summaries to assistant nodes and omits the field elsewhere', () => {
    const raw = [
      headerLine(),
      messageLine('u1', null, 'user', text('probe the tree')),
      messageLine('a1', 'u1', 'assistant', [
        { type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'rg -n rate src' } },
        { type: 'toolCall', id: 'c2', name: 'read', arguments: { path: '/work/src/gw.ts' } },
        { type: 'text', text: 'looking' }
      ]),
      messageLine('tr1', 'a1', 'toolResult', text('hit'))
    ].join('\n')
    const { nodes } = buildSessionTree(parseSessionLines(raw).entries)
    const u1 = nodes[0]
    const a1 = u1?.children[0]
    expect(a1?.toolCalls).toEqual([
      { id: 'c1', name: 'bash', summary: 'rg -n rate src' },
      { id: 'c2', name: 'read', summary: '/work/src/gw.ts' }
    ])
    expect(u1?.toolCalls).toBeUndefined()
    // The toolResult echo node is 'other' — the display expands tools from
    // the assistant's toolCall blocks, never from result entries.
    const tr1 = a1?.children[0]
    expect(tr1?.kind).toBe('other')
  })

  it('carries an empty toolCalls array on an assistant message without calls', () => {
    const raw = [
      headerLine(),
      messageLine('a1', null, 'assistant', text('plain reply'))
    ].join('\n')
    const { nodes } = buildSessionTree(parseSessionLines(raw).entries)
    expect(nodes[0]?.toolCalls).toEqual([])
  })

  it('degrades a text-less assistant preview like the TUI tree: aborted / error / no content', () => {
    const aborted = JSON.stringify({
      type: 'message', id: 'a1', parentId: null, timestamp: 't',
      message: { role: 'assistant', content: [{ type: 'toolCall', id: 'c', name: 'bash', arguments: {} }], stopReason: 'aborted' }
    })
    const errored = JSON.stringify({
      type: 'message', id: 'a2', parentId: null, timestamp: 't',
      message: { role: 'assistant', content: [], errorMessage: 'provider exploded after 30 retries' }
    })
    const empty = messageLine('a3', null, 'assistant', [{ type: 'thinking', thinking: 'only thoughts' }])
    const { nodes } = buildSessionTree(parseSessionLines([headerLine(), aborted, errored, empty].join('\n')).entries)
    expect(nodes.map((n) => n.preview)).toEqual(['(aborted)', 'provider exploded after 30 retries', '(no content)'])
  })
})

describe('toolCallSummary — the [name: …] args part (TUI tree port, ticket 43)', () => {
  const HOME = '/Users/demo'

  it('flattens and truncates bash commands at 50 chars', () => {
    expect(toolCallSummary('bash', { command: 'line one\n\ttwo' }, HOME)).toBe('line one two')
    const long = 'x'.repeat(60)
    expect(toolCallSummary('bash', { command: long }, HOME)).toBe(`${'x'.repeat(50)}...`)
    expect(toolCallSummary('bash', { command: 'y'.repeat(50) }, HOME)).toBe('y'.repeat(50))
    expect(toolCallSummary('bash', {}, HOME)).toBe('')
  })

  it('projects read/write/edit paths with home shortening and read line ranges', () => {
    expect(toolCallSummary('read', { path: `${HOME}/proj/src/gw.ts` }, HOME)).toBe('~/proj/src/gw.ts')
    expect(toolCallSummary('read', { path: '/etc/hosts', offset: 40, limit: 10 }, HOME)).toBe('/etc/hosts:40-49')
    expect(toolCallSummary('read', { file_path: '/a/b', offset: 7 }, HOME)).toBe('/a/b:7')
    expect(toolCallSummary('read', { path: '/a/b', limit: 5 }, HOME)).toBe('/a/b:1-5')
    expect(toolCallSummary('write', { path: `${HOME}/out.md` }, HOME)).toBe('~/out.md')
    expect(toolCallSummary('edit', { file_path: '/a/b.ts' }, HOME)).toBe('/a/b.ts')
  })

  it('formats grep/find/ls and falls back to trimmed JSON for unknown tools', () => {
    expect(toolCallSummary('grep', { pattern: 'rate limit', path: `${HOME}/src` }, HOME)).toBe('/rate limit/ in ~/src')
    expect(toolCallSummary('grep', { pattern: 'x' }, HOME)).toBe('/x/ in .')
    expect(toolCallSummary('find', { pattern: '*.ts', path: '/w' }, HOME)).toBe('*.ts in /w')
    expect(toolCallSummary('ls', { path: `${HOME}/src` }, HOME)).toBe('~/src')
    expect(toolCallSummary('ls', {}, HOME)).toBe('.')
    const args = { file: '/a.md', mode: 'w' }
    expect(toolCallSummary('todo_write', args, HOME)).toBe(JSON.stringify(args))
    const big = { blob: 'z'.repeat(50) }
    expect(toolCallSummary('custom', big, HOME)).toBe(`${JSON.stringify(big).slice(0, 40)}...`)
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
