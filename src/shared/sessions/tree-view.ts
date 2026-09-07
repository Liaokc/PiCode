/**
 * Display-row model of the history tree (ticket 43): the SessionTreePayload's
 * flat projection in the Pi TUI /tree display form (frame pitui13-tree),
 * restyled to the desktop's own chrome. Pure function — the component adds
 * palette, hover, and click handlers; nothing else.
 *
 * Row grammar (mirrors the TUI's tree flattener, desktop-simplified):
 *  - `user:` / `assistant:` type labels color the message rows; a preview-less
 *    assistant message degrades to (aborted) / its error text / (no content)
 *    in parse.ts.
 *  - Tool calls ride under their assistant message as `[name: summary]`
 *    monospace rows, derived from the message's toolCall blocks (parse.ts);
 *    clicking one acts on the owning assistant entry.
 *  - Noise entries — the `other` node kind (model_change, thinking_level_change,
 *    toolResult echoes, label markers, TUI bash-mode rows) — are hidden and
 *    TRANSPARENT: their children promote into the hidden entry's sibling slot
 *    at its depth, so a hidden model_change root never eats a level.
 *  - Connectors and rails appear only where the tree actually branches (a row
 *    with more than one visible child); single-child chains stay flush, the
 *    pitui13-tree look. The just-branched indent keeps one generation down
 *    single-child chains, exactly like the TUI.
 *  - The leaf path is fully expanded; off-path branches stay one level
 *    visible (the desktop's existing scannability policy).
 *  - The "current" marker sits on the deepest visible leaf-path row — the
 *    leaf entry itself when visible, else its nearest visible ancestor
 *    (mid-turn leaves are hidden toolResult entries). Derived tool rows
 *    never carry it.
 */

import type { SessionTreeNodeDTO, SessionTreePayload } from './types.ts'

/** Display vocabulary of one tree row. `info` covers session_info renames,
 * compaction and branch summaries; `tool` rows are derived (not entries). */
export type TreeRowKind = 'user' | 'assistant' | 'tool' | 'info'

/** One display row of the history tree. */
export interface TreeDisplayRow {
  /** Stable React key: the entry id, or `<entryId>#<toolCallId>` for
   * derived tool rows. */
  readonly key: string
  /** Entry a click acts on (navigate/fork): the row's own entry, or the
   * owning assistant message for derived tool rows. */
  readonly entryId: string
  readonly kind: TreeRowKind
  /** Colored type label ('user' / 'assistant'); tool and info rows render
   * bracket-form text instead (the TUI's [name: …] grammar). */
  readonly typeLabel: 'user' | 'assistant' | null
  /** Row text: message preview, bracketed tool summary, info preview. */
  readonly text: string
  /** Bookmark label ([label: x] in the TUI) — decorates the target row. */
  readonly label: string | null
  /** Indent depth (hidden noise entries are transparent — children promote
   * into their slot without adding a level). */
  readonly depth: number
  /** Per ancestor level < depth: does the guide rail continue (the
   * ancestor has a later visible sibling)? */
  readonly rails: readonly boolean[]
  /** Connector shape at the row's own level: last child (└) vs branch (├). */
  readonly isLastChild: boolean
  /** Whether the row renders a connector at all (only under branch points). */
  readonly showConnector: boolean
  /** On the root→leaf path (the leaf-path highlight). */
  readonly onLeafPath: boolean
  /** Carries the "current" tag. */
  readonly isCurrentLeaf: boolean
}

interface EffectiveChild {
  node: SessionTreeNodeDTO
  /** A hidden ancestor on the leaf path ORs visibility into this child. */
  viaHiddenOnPath: boolean
}

/** The payload's nodes as a display-row sequence. See the module docstring
 * for the grammar. */
export function sessionTreeDisplayRows(tree: SessionTreePayload): TreeDisplayRow[] {
  // Nodes whose subtree contains the leaf are exactly the root→leaf path.
  const leafPath = new Set<string>()
  const markSubtreeContaining = (nodes: readonly SessionTreeNodeDTO[]): boolean => {
    let any = false
    for (const node of nodes) {
      const childHit = markSubtreeContaining(node.children)
      if (childHit || node.id === tree.leafId) {
        leafPath.add(node.id)
        any = true
      }
    }
    return any
  }
  markSubtreeContaining(tree.nodes)

  const isNoise = (node: SessionTreeNodeDTO): boolean => node.kind === 'other'

  /** Sibling list with hidden entries spliced out; promoted children inherit
   * the hidden chain's leaf-path membership. */
  const effectiveChildren = (list: readonly SessionTreeNodeDTO[], viaHiddenOnPath: boolean): EffectiveChild[] => {
    const out: EffectiveChild[] = []
    for (const node of list) {
      const onPath = leafPath.has(node.id)
      if (isNoise(node)) out.push(...effectiveChildren(node.children, viaHiddenOnPath || onPath))
      else out.push({ node, viaHiddenOnPath })
    }
    return out
  }

  const rows: TreeDisplayRow[] = []

  const emit = (
    node: SessionTreeNodeDTO,
    depth: number,
    justBranched: boolean,
    rails: readonly boolean[],
    isLast: boolean,
    onPath: boolean
  ): void => {
    const kind: TreeRowKind =
      node.kind === 'user' ? 'user' : node.kind === 'assistant' ? 'assistant' : 'info'
    const common = {
      entryId: node.id,
      depth,
      rails,
      isLastChild: isLast,
      showConnector: justBranched,
      onLeafPath: onPath,
      isCurrentLeaf: false
    } as const
    rows.push({
      key: node.id,
      kind,
      typeLabel: node.kind === 'user' ? 'user' : node.kind === 'assistant' ? 'assistant' : null,
      text: node.preview,
      label: node.label,
      ...common
    })
    for (const call of node.toolCalls ?? []) {
      rows.push({
        key: `${node.id}#${call.id}`,
        kind: 'tool',
        typeLabel: null,
        text: `[${call.name}: ${call.summary}]`,
        label: null,
        ...common
      })
    }
  }

  /**
   * Pre-order walk emitting one row per visible node (plus its tool rows).
   * `parentOnPath` is the TUI's scannability policy: children render under
   * on-path parents; off-path branches stay one level visible. `justBranched`
   * says the rows of THIS list sit under a branch point (they show
   * connectors); `rails` are the continuation flags for this depth.
   */
  const walk = (
    list: readonly SessionTreeNodeDTO[],
    depth: number,
    parentOnPath: boolean,
    justBranched: boolean,
    rails: readonly boolean[]
  ): void => {
    const eff = effectiveChildren(list, false)
    eff.forEach(({ node, viaHiddenOnPath }, index) => {
      const onPath = leafPath.has(node.id)
      const isLast = index === eff.length - 1
      emit(node, depth, justBranched, rails, isLast, onPath)
      const childCount = effectiveChildren(node.children, false).length
      const childJustBranched = childCount > 1
      // Indent steps at branch points and stays one generation down
      // single-child chains (the TUI's just-branched rule).
      const childDepth = depth + (childJustBranched || justBranched ? 1 : 0)
      const childRails = justBranched ? [...rails, !isLast] : rails
      if (parentOnPath || viaHiddenOnPath || onPath) {
        walk(node.children, childDepth, onPath, childJustBranched, childRails)
      }
    })
  }
  walk(tree.nodes, 0, true, false, [])

  // Current marker: the deepest visible leaf-path row — the leaf itself when
  // its entry renders, else the nearest visible ancestor. Derived tool rows
  // are display-only and never carry it.
  let current: TreeDisplayRow | null = null
  for (const row of rows) {
    if (row.onLeafPath && row.kind !== 'tool' && (current === null || row.depth >= current.depth)) {
      current = row
    }
  }
  if (current !== null) {
    return rows.map((row) => (row === current ? { ...row, isCurrentLeaf: true } : row))
  }
  return rows
}
