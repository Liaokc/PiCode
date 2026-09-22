/**
 * Tree wire shape (ticket 131): the flatten/rebuild pair around the
 * `session_tree` payload's IPC transport.
 *
 * Why a wire shape exists at all: the payload's natural form nests
 * `children` recursively — one object/array pair per session entry, so a
 * long session's tree is nested hundreds of levels deep. Electron's
 * main→renderer IPC serialization (V8 structured clone over Mojo) silently
 * drops messages whose object nesting exceeds its depth limit — measured
 * here between ~610 and ~810 levels (a 300-entry chain crosses IPC, a
 * 400-entry chain never reaches the renderer). The host→main hop is
 * JSON (depth-tolerant), so the loss is invisible: the host sends, the
 * supervisor relays, and the renderer's session registry never sees the
 * event — the History panel renders its honest empty state ("0 rows") for
 * the session's life. Deep sessions and forks of deep sessions (the fork
 * file is the root→leaf chain) both hit it.
 *
 * The fix: the payload crosses IPC FLAT — nodes in file order, each with a
 * `parentId` link instead of nested children (nesting depth is constant).
 * `sessionTreeToWire` runs host-side at the send seam;
 * `sessionTreeFromWire` runs renderer-side at the single wire consumer (the
 * session registry's fold) and restores the canonical nested
 * `SessionTreePayload` every display consumer already speaks. Both are
 * pure and table-tested (Seam-1).
 */

import type { SessionTreeNodeDTO, SessionTreePayload, SessionTreeWireNode, SessionTreeWirePayload } from './types.ts'

/** Flatten the canonical nested payload into the wire shape: a pre-order
 * (file order) node list with parent links. Depth of the produced object
 * is constant regardless of session length. Iterative, like the rebuild —
 * the nested source may itself be thousands of levels deep. */
export function sessionTreeToWire(tree: SessionTreePayload): SessionTreeWirePayload {
  const nodes: SessionTreeWireNode[] = []
  const pending: Array<{ node: SessionTreeNodeDTO; parentId: string | null }> = []
  for (let i = tree.nodes.length - 1; i >= 0; i--) pending.push({ node: tree.nodes[i], parentId: null })
  while (pending.length > 0) {
    const { node, parentId } = pending.pop() as { node: SessionTreeNodeDTO; parentId: string | null }
    const { children, ...rest } = node
    nodes.push({ ...rest, parentId })
    for (let i = children.length - 1; i >= 0; i--) pending.push({ node: children[i], parentId: node.id })
  }
  return { sessionId: tree.sessionId, leafId: tree.leafId, name: tree.name, nodes }
}

/** Rebuild the canonical nested payload from the wire shape: file-order
 * iteration, each node attaching under its parent — a parent that has not
 * appeared earlier (null, unknown, or later in the list) detaches the node
 * to a root, the same rule the nested builder applies to out-of-order
 * files. Iterative: the rebuilt tree may be hundreds of levels deep, so
 * the rebuild itself must never recurse per level. */
export function sessionTreeFromWire(wire: SessionTreeWirePayload): SessionTreePayload {
  const byId = new Map<string, SessionTreeNodeDTO>()
  const roots: SessionTreeNodeDTO[] = []
  for (const wireNode of wire.nodes) {
    const { parentId, ...rest } = wireNode
    const node: SessionTreeNodeDTO = { ...rest, children: [] }
    const parent = parentId !== null ? byId.get(parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
    byId.set(node.id, node)
  }
  return { sessionId: wire.sessionId, leafId: wire.leafId, name: wire.name, nodes: roots }
}
