import { describe, expect, it } from 'vitest'
import { buildSessionTree, type RawSessionEntry } from '../../src/shared/sessions/parse'
import { sessionTreeFromWire, sessionTreeToWire } from '../../src/shared/sessions/tree-wire'
import type { SessionTreeNodeDTO, SessionTreePayload, SessionTreeWireNode, SessionTreeWirePayload } from '../../src/shared/sessions/types'

/** message entry helper (the seed shape the smoke harnesses use). */
function messageEntry(id: string, parentId: string | null, role: 'user' | 'assistant', text: string): RawSessionEntry {
  return {
    type: 'message',
    id,
    parentId,
    timestamp: '2026-09-22T10:00:00.000Z',
    message: { role, content: [{ type: 'text', text }] }
  } as unknown as RawSessionEntry
}

/** A deep single chain: n alternating user/assistant entries, one root. */
function chainEntries(n: number): RawSessionEntry[] {
  const entries: RawSessionEntry[] = []
  let parent: string | null = null
  for (let i = 1; i <= n; i++) {
    const id = `c${i}`
    entries.push(messageEntry(id, parent, i % 2 === 1 ? 'user' : 'assistant', `entry ${i}`))
    parent = id
  }
  return entries
}

/** Nesting depth of a plain-object payload (arrays and objects both step). */
function objectDepth(value: unknown): number {
  if (typeof value !== 'object' || value === null) return 0
  let max = 0
  for (const child of Array.isArray(value) ? value : Object.values(value as Record<string, unknown>)) {
    max = Math.max(max, objectDepth(child))
  }
  return max + 1
}

describe('session tree wire shape (ticket 131)', () => {
  it('round-trips a nested payload through the wire unchanged', () => {
    const entries = [
      messageEntry('u1', null, 'user', 'first'),
      messageEntry('a1', 'u1', 'assistant', 'answer'),
      messageEntry('u2', 'a1', 'user', 'second'),
      // A second root: the tree is a forest.
      messageEntry('u3', null, 'user', 'other root'),
      messageEntry('a3', 'u3', 'assistant', 'other answer')
    ]
    const { nodes, leafId } = buildSessionTree(entries, '')
    const payload: SessionTreePayload = { sessionId: 's1', leafId, name: null, nodes }
    const rebuilt = sessionTreeFromWire(sessionTreeToWire(payload))
    expect(rebuilt).toEqual(payload)
  })

  it('wire nesting depth stays constant no matter how deep the session chain is', () => {
    // The regression this ticket fixes: the nested payload's depth grows
    // ~2 levels per entry and the renderer-side IPC serialization silently
    // drops such messages (measured threshold between a 300- and a
    // 400-entry chain). The wire shape must stay flat either way.
    for (const count of [1, 50, 600]) {
      const { nodes, leafId } = buildSessionTree(chainEntries(count), '')
      const wire = sessionTreeToWire({ sessionId: 's', leafId, name: null, nodes })
      expect(wire.nodes).toHaveLength(count)
      expect(objectDepth(wire)).toBeLessThanOrEqual(6)
      // And the nested original really is deep — the constraint is real.
      const nested: SessionTreePayload = { sessionId: 's', leafId, name: null, nodes }
      if (count > 1) expect(objectDepth(nested)).toBeGreaterThan(count)
    }
  })

  it('rebuilds deep chains without recursion limits and preserves file order', () => {
    const count = 600
    const { nodes, leafId } = buildSessionTree(chainEntries(count), '')
    const wire = sessionTreeToWire({ sessionId: 's', leafId, name: null, nodes })
    // The flat list is file-ordered pre-order.
    expect(wire.nodes.map((n) => n.id)).toEqual(chainEntries(count).map((e) => e.id))
    const rebuilt = sessionTreeFromWire(wire)
    // Walk the rebuilt chain root→leaf and count depth.
    let depth = 0
    let cursor: SessionTreeNodeDTO | undefined = rebuilt.nodes[0]
    while (cursor !== undefined) {
      depth += 1
      cursor = cursor.children[0]
    }
    expect(depth).toBe(count)
  })

  it('degrades honestly: a parent that appears after its child detaches the child to a root', () => {
    // Out-of-order file (the nested builder's own rule): the child lands at
    // a root because its parent is not yet known when it is attached.
    const wire: SessionTreeWirePayload = {
      sessionId: 's',
      leafId: 'child',
      name: null,
      nodes: [
        { ...baseWireNode('child', 'late-parent'), preview: 'child first' },
        { ...baseWireNode('late-parent', null), preview: 'parent later' },
        { ...baseWireNode('orphan', 'missing'), preview: 'unknown parent' }
      ]
    }
    const rebuilt = sessionTreeFromWire(wire)
    expect(rebuilt.nodes.map((n) => n.id).sort()).toEqual(['child', 'late-parent', 'orphan'])
    expect(rebuilt.nodes.every((n) => n.children.length === 0)).toBe(true)
  })

  it('the wire shape the host sends is flat nodes with parentId, never children', () => {
    // The host-side flatten and the fold-side rebuild agree on the same
    // wire node: parentId in, children out, every other field untouched.
    const entries = [messageEntry('u1', null, 'user', 'hi'), messageEntry('a1', 'u1', 'assistant', 'yo')]
    const { nodes, leafId } = buildSessionTree(entries, '')
    const wire = sessionTreeToWire({ sessionId: 's', leafId, name: 'named', nodes })
    for (const node of wire.nodes) {
      expect(node).not.toHaveProperty('children')
      expect(node.parentId === null || typeof node.parentId === 'string').toBe(true)
    }
    const rebuilt = sessionTreeFromWire(wire)
    expect(rebuilt.nodes[0]?.children[0]?.id).toBe('a1')
    expect(rebuilt.name).toBe('named')
  })
})

/** A wire node with every scalar field, for hand-built fixtures. */
function baseWireNode(id: string, parentId: string | null): SessionTreeWireNode {
  return { id, kind: 'user', label: null, name: null, preview: id, timestamp: '2026-09-22T10:00:00.000Z', parentId }
}
