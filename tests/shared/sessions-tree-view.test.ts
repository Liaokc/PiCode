import { describe, expect, it } from 'vitest'
import { sessionTreeDisplayRows, type TreeDisplayRow } from '../../src/shared/sessions/tree-view'
import { buildSessionTree, parseSessionLines } from '../../src/shared/sessions/parse'
import type { SessionTreePayload } from '../../src/shared/sessions/types'

/**
 * Table-driven fixtures for the history-tree display model (ticket 43): a
 * fixture jsonl flows through the real parse (parseSessionLines →
 * buildSessionTree) into a SessionTreePayload, and the asserted surface is
 * the DISPLAY ROW SEQUENCE — the pure projection the TreePanel renders.
 * Same shape as the sessions-trace suite: fixture jsonl in, row sequence out.
 *
 * The display form mirrors the Pi TUI /tree frame (pitui13-tree): `user:` /
 * `assistant:` type labels, `[name: …]` tool rows derived from the assistant
 * message's toolCall blocks, noise entries (the `other` node kind) hidden
 * with their children promoted, branch-only connectors and rails, full leaf
 * path against one-level off-path branches, and the "current" marker.
 */

function line(entry: Record<string, unknown>): string {
  return JSON.stringify(entry)
}

function sessionLine(id: string, cwd = '/work/demo'): string {
  return line({ type: 'session', version: 3, id, timestamp: '2026-09-01T10:00:00.000Z', cwd })
}

function userMessage(id: string, parentId: string | null, timestamp: string, text: string): string {
  return line({
    type: 'message',
    id,
    parentId,
    timestamp,
    message: { role: 'user', content: [{ type: 'text', text }] }
  })
}

function assistantMessage(
  id: string,
  parentId: string | null,
  timestamp: string,
  content: Record<string, unknown>[],
  extra: Record<string, unknown> = {}
): string {
  return line({
    type: 'message',
    id,
    parentId,
    timestamp,
    message: { role: 'assistant', content, ...extra }
  })
}

function toolResultMessage(id: string, parentId: string, timestamp: string, callId: string): string {
  return line({
    type: 'message',
    id,
    parentId,
    timestamp,
    message: {
      role: 'toolResult',
      toolCallId: callId,
      toolName: 'bash',
      content: [{ type: 'text', text: 'src/gw.ts:41  if (hits > MAX) {' }],
      isError: false
    }
  })
}

/** Build the display rows for a fixture session (header + entries). */
function rowsFor(entryLines: string[]): TreeDisplayRow[] {
  const { header, entries } = parseSessionLines([sessionLine('s1'), ...entryLines].join('\n'))
  if (header === null) throw new Error('fixture lost its header')
  const { nodes, leafId } = buildSessionTree(entries)
  const payload: SessionTreePayload = { sessionId: header.id, leafId, name: null, nodes }
  return sessionTreeDisplayRows(payload)
}

/** Compact projection the table assertions read: depth/kind/label/text per row. */
const shape = (rows: TreeDisplayRow[]): string[] =>
  rows.map((r) => `${r.depth}|${r.kind}|${r.typeLabel ?? '·'}|${r.text}`)

describe('sessionTreeDisplayRows — straight session with tool traffic', () => {
  it('labels user/assistant rows, inserts [bash: …] tool rows, and flattens the single chain', () => {
    const rows = rowsFor([
      userMessage('u1', null, '2026-09-01T10:00:01.000Z', 'Audit the rate limit path'),
      assistantMessage(
        'a1',
        'u1',
        '2026-09-01T10:00:05.000Z',
        [
          { type: 'thinking', thinking: 'start at the middleware', thinkingSignature: 'sig' },
          { type: 'toolCall', id: 'call-1', name: 'bash', arguments: { command: 'rg -n "rate limit" src' } },
          { type: 'text', text: 'I will locate the rate limit handling first.' }
        ],
        { stopReason: 'toolUse' }
      ),
      toolResultMessage('tr1', 'a1', '2026-09-01T10:00:07.000Z', 'call-1'),
      assistantMessage(
        'a2',
        'tr1',
        '2026-09-01T10:00:09.000Z',
        [{ type: 'text', text: 'It is a sliding-window counter in middleware.ts.' }]
      )
    ])
    // The whole chain is single-child: every row sits at depth 0 — the flat
    // pitui13-tree look. Thinking never renders; the tool row derives from
    // the toolCall block (NOT the toolResult entry, which is noise).
    expect(shape(rows)).toEqual([
      '0|user|user|Audit the rate limit path',
      '0|assistant|assistant|I will locate the rate limit handling first.',
      '0|tool|·|[bash: rg -n "rate limit" src]',
      '0|assistant|assistant|It is a sliding-window counter in middleware.ts.'
    ])
    // Leaf-path + current marker: the last assistant row is the leaf.
    expect(rows.map((r) => r.onLeafPath)).toEqual([true, true, true, true])
    expect(rows.map((r) => r.isCurrentLeaf)).toEqual([false, false, false, true])
    // Click targets: tool rows act on their owning assistant entry.
    expect(rows.map((r) => r.entryId)).toEqual(['u1', 'a1', 'a1', 'a2'])
    expect(rows[2]?.key).toBe('a1#call-1')
    expect(rows[2]?.rails).toEqual([])
    expect(rows[2]?.showConnector).toBe(false)
  })

  it('hides the noise kinds transparently: model_change root promotes its children to roots', () => {
    const rows = rowsFor([
      line({ type: 'model_change', id: 'mc1', parentId: null, timestamp: '2026-09-01T10:00:00.100Z', provider: 'bella', modelId: 'GLM-5.3' }),
      userMessage('u1', 'mc1', '2026-09-01T10:00:01.000Z', 'hello again'),
      assistantMessage('a1', 'u1', '2026-09-01T10:00:02.000Z', [{ type: 'text', text: 'hi' }])
    ])
    // The (model_change) row is GONE; u1 renders as the root at depth 0.
    expect(shape(rows)).toEqual([
      '0|user|user|hello again',
      '0|assistant|assistant|hi'
    ])
    expect(rows.some((r) => r.text.includes('model_change'))).toBe(false)
  })

  it('hides toolResult echoes, bashExecution rows, label markers, and thinking_level_change', () => {
    const rows = rowsFor([
      userMessage('u1', null, '2026-09-01T10:00:01.000Z', 'run it'),
      assistantMessage(
        'a1',
        'u1',
        '2026-09-01T10:00:02.000Z',
        [{ type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'npm test' } }],
        { stopReason: 'toolUse' }
      ),
      toolResultMessage('tr1', 'a1', '2026-09-01T10:00:03.000Z', 'c1'),
      line({ type: 'message', id: 'bx1', parentId: 'tr1', timestamp: '2026-09-01T10:00:04.000Z', message: { role: 'bashExecution', command: 'git status', output: 'clean' } }),
      line({ type: 'thinking_level_change', id: 'tl1', parentId: 'bx1', timestamp: '2026-09-01T10:00:05.000Z', provider: 'bella', thinkingLevel: 'high' }),
      line({ type: 'label', id: 'l1', parentId: 'tl1', timestamp: '2026-09-01T10:00:06.000Z', targetId: 'u1', label: 'starting point' }),
      assistantMessage('a2', 'l1', '2026-09-01T10:00:07.000Z', [{ type: 'text', text: 'all green' }])
    ])
    // The toolResult ENTRY is noise (hidden) — but the tool ROW derived
    // from the assistant's toolCall block renders exactly once, so the
    // promoted chain (all the noise entries between) stays connected.
    expect(shape(rows)).toEqual([
      '0|user|user|run it',
      '0|assistant|assistant|(no content)',
      '0|tool|·|[bash: npm test]',
      '0|assistant|assistant|all green'
    ])
    // The label decoration rides the TARGET row, not a row of its own —
    // and derived tool rows never carry it either.
    expect(rows[0]?.label).toBe('starting point')
    expect(rows[1]?.label).toBeNull()
    expect(rows[2]?.label).toBeNull()
  })

  it('keeps info rows visible: session_info names, compaction and branch summaries', () => {
    const rows = rowsFor([
      line({ type: 'session_info', id: 'i1', parentId: null, timestamp: '2026-09-01T10:00:00.500Z', name: 'Named task' }),
      userMessage('u1', 'i1', '2026-09-01T10:00:01.000Z', 'go'),
      line({ type: 'compaction', id: 'cp1', parentId: 'u1', timestamp: '2026-09-01T10:01:00.000Z', summary: 'Summary of older context' }),
      assistantMessage('a1', 'cp1', '2026-09-01T10:02:00.000Z', [{ type: 'text', text: 'fresh answer' }])
    ])
    expect(shape(rows)).toEqual([
      '0|info|·|Named task',
      '0|user|user|go',
      '0|info|·|Summary of older context',
      '0|assistant|assistant|fresh answer'
    ])
  })
})

describe('sessionTreeDisplayRows — branch geometry (connectors only where the tree forks)', () => {
  it('indents at branch points, marks last children, rails past continuing rows, and collapses off-path depth', () => {
    const rows = rowsFor([
      userMessage('u1', null, '2026-09-01T10:00:01.000Z', 'branch me'),
      assistantMessage(
        'a1',
        'u1',
        '2026-09-01T10:00:02.000Z',
        [
          { type: 'toolCall', id: 'c1', name: 'read', arguments: { path: '/work/demo/src/gw.ts', offset: 40, limit: 10 } },
          { type: 'text', text: 'option one' }
        ],
        { stopReason: 'toolUse' }
      ),
      toolResultMessage('tr1', 'a1', '2026-09-01T10:00:03.000Z', 'c1'),
      assistantMessage('a1c', 'tr1', '2026-09-01T10:00:04.000Z', [{ type: 'text', text: 'off-path child' }]),
      assistantMessage('a1d', 'a1c', '2026-09-01T10:00:05.000Z', [{ type: 'text', text: 'off-path grandchild — collapsed' }]),
      assistantMessage('a2', 'u1', '2026-09-01T10:00:06.000Z', [{ type: 'text', text: 'option two' }]),
      assistantMessage('a2b', 'a2', '2026-09-01T10:00:07.000Z', [{ type: 'text', text: 'option two continued' }])
    ])
    // Branch: u1 has two visible children (a1, a2) → both indent +1 with
    // connectors, ├ for a1 (later sibling) and └ for a2 (last). a1's own
    // chain: tool row then the off-path child (ONE level), rail continuing
    // past a1; a1d stays collapsed (off-path depth). a2's chain keeps the
    // just-branched indent without a second connector.
    expect(shape(rows)).toEqual([
      '0|user|user|branch me',
      '1|assistant|assistant|option one',
      '1|tool|·|[read: /work/demo/src/gw.ts:40-49]',
      '2|assistant|assistant|off-path child',
      '1|assistant|assistant|option two',
      '2|assistant|assistant|option two continued'
    ])
    expect(rows.map((r) => r.showConnector)).toEqual([false, true, true, false, true, false])
    expect(rows.map((r) => r.isLastChild)).toEqual([true, false, false, true, true, true])
    // Rails: a1's children carry the rail (a1 has a later sibling); a2's
    // child keeps the column but blank — a2 is the last child, nothing
    // continues below its └ connector.
    expect(rows.map((r) => [...r.rails])).toEqual([[], [], [], [true], [], [false]])
    expect(rows.map((r) => r.onLeafPath)).toEqual([true, false, false, false, true, true])
    expect(rows.map((r) => r.isCurrentLeaf)).toEqual([false, false, false, false, false, true])
  })

  it('promotes children of a hidden mid-tree entry and counts them in the branch geometry', () => {
    const rows = rowsFor([
      userMessage('u1', null, '2026-09-01T10:00:01.000Z', 'fork point'),
      line({ type: 'model_change', id: 'mc1', parentId: 'u1', timestamp: '2026-09-01T10:00:02.000Z', provider: 'bella', modelId: 'GLM-5.3-flash' }),
      assistantMessage('a0', 'mc1', '2026-09-01T10:00:03.000Z', [{ type: 'text', text: 'promoted branch' }]),
      assistantMessage('a1', 'u1', '2026-09-01T10:00:04.000Z', [{ type: 'text', text: 'plain branch' }])
    ])
    // mc1 vanishes; its child a0 takes its sibling slot → u1 still branches
    // into [a0, a1] — connectors and depth honor the VISIBLE tree.
    expect(shape(rows)).toEqual([
      '0|user|user|fork point',
      '1|assistant|assistant|promoted branch',
      '1|assistant|assistant|plain branch'
    ])
    expect(rows.map((r) => r.showConnector)).toEqual([false, true, true])
    expect(rows.map((r) => r.isLastChild)).toEqual([true, false, true])
  })

  it('marks the nearest visible ancestor current when the leaf entry itself is noise', () => {
    // Mid-turn leaf: the file's last entry is the hidden toolResult.
    const { header, entries } = parseSessionLines(
      [
        sessionLine('s1'),
        userMessage('u1', null, '2026-09-01T10:00:01.000Z', 'go'),
        assistantMessage(
          'a1',
          'u1',
          '2026-09-01T10:00:02.000Z',
          [{ type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'npm test' } }],
          { stopReason: 'toolUse' }
        ),
        toolResultMessage('tr1', 'a1', '2026-09-01T10:00:03.000Z', 'c1')
      ].join('\n')
    )
    if (header === null) throw new Error('fixture lost its header')
    const { nodes } = buildSessionTree(entries)
    const rows2 = sessionTreeDisplayRows({ sessionId: header.id, leafId: 'tr1', name: null, nodes })
    // tr1 is hidden; the marker falls to the assistant row (the deepest
    // visible leaf-path row) — never onto a derived tool row.
    expect(rows2.map((r) => r.isCurrentLeaf)).toEqual([false, true, false])
  })
})

describe('sessionTreeDisplayRows — degraded assistant previews (the TUI forms)', () => {
  it('renders (aborted), the platform error text, and (no content)', () => {
    const rows = rowsFor([
      userMessage('u1', null, '2026-09-01T10:00:01.000Z', 'stop'),
      assistantMessage('a1', 'u1', '2026-09-01T10:00:02.000Z', [], { stopReason: 'aborted' }),
      assistantMessage('a2', 'a1', '2026-09-01T10:00:03.000Z', [], { errorMessage: 'provider exploded: rate limited' }),
      assistantMessage('a3', 'a2', '2026-09-01T10:00:04.000Z', [])
    ])
    expect(shape(rows)).toEqual([
      '0|user|user|stop',
      '0|assistant|assistant|(aborted)',
      '0|assistant|assistant|provider exploded: rate limited',
      '0|assistant|assistant|(no content)'
    ])
  })
})

describe('sessionTreeDisplayRows — empty payload', () => {
  it('renders no rows for a payload without nodes', () => {
    expect(sessionTreeDisplayRows({ sessionId: 's', leafId: null, name: null, nodes: [] })).toEqual([])
  })
})
