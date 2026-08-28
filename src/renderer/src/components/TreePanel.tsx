import { useEffect, useMemo, useRef, type JSX } from 'react'
import type { SessionTreeNodeDTO, SessionTreePayload } from '../../../shared/sessions/types'
import { GitBranchIcon } from './icons'

interface TreePanelProps {
  tree: SessionTreePayload | null
  onNavigate: (entryId: string) => void
  onFork: (entryId: string) => void
  onClose: () => void
}

interface FlatNode {
  node: SessionTreeNodeDTO
  depth: number
  onLeafPath: boolean
}

/** Depth-first flattening: leaf path fully expanded, off-path branches one level visible. */
function flatten(nodes: SessionTreeNodeDTO[], leafPath: ReadonlySet<string>): FlatNode[] {
  const out: FlatNode[] = []
  const walk = (list: SessionTreeNodeDTO[], depth: number, parentOnPath: boolean): void => {
    for (const node of list) {
      const onPath = leafPath.has(node.id)
      out.push({ node, depth, onLeafPath: onPath })
      // Children of on-path nodes render (so sibling branches are reachable);
      // deeper off-path descendants collapse to keep the list scannable.
      if ((parentOnPath || onPath) && node.children.length > 0) walk(node.children, depth + 1, onPath)
    }
  }
  walk(nodes, 0, true)
  return out
}

/**
 * In-place tree navigation (user story 28): the session's entry tree as an
 * indented list. Click a row to move the leaf there (the file keeps every
 * branch — nothing is lost); the fork icon extracts that path into a new
 * session file.
 */
export default function TreePanel({ tree, onNavigate, onFork, onClose }: TreePanelProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(event: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose()
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const rows = useMemo(() => {
    if (!tree) return []
    const leafPath = new Set<string>()
    // Nodes whose subtree contains the leaf are exactly the root→leaf path.
    const markSubtreeContaining = (nodes: SessionTreeNodeDTO[]): boolean => {
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
    return flatten(tree.nodes, leafPath)
  }, [tree])

  const kindClass = (node: SessionTreeNodeDTO): string =>
    node.kind === 'user' ? 'tree-row-user' : node.kind === 'assistant' ? 'tree-row-assistant' : 'tree-row-info'

  return (
    <div ref={panelRef} className="tree-panel" role="dialog" aria-label="Session history">
      <div className="tree-panel-header">
        <GitBranchIcon size={13} />
        <span>Branch history</span>
        <span className="tree-panel-count">{rows.length} entries</span>
      </div>
      <div className="tree-scroll">
        {rows.length === 0 && <div className="sb-empty-hint">This session has no entries yet.</div>}
        {rows.map(({ node, depth, onLeafPath }) => (
          <div
            key={node.id}
            className={
              'tree-row ' + kindClass(node) + (node.id === tree?.leafId ? ' tree-row-leaf' : '') + (onLeafPath ? '' : ' tree-row-aside')
            }
            style={{ paddingLeft: 10 + depth * 16 }}
            onClick={() => onNavigate(node.id)}
            title="Continue from this entry"
          >
            <span className="tree-row-label">
              {node.label ?? (node.kind === 'session-info' && node.name ? node.name : null) ?? node.preview}
            </span>
            <button
              type="button"
              className="tree-fork-btn"
              aria-label="Fork a new session from this entry"
              title="Fork from here"
              onClick={(e) => {
                e.stopPropagation()
                onFork(node.id)
              }}
            >
              <GitBranchIcon size={12} />
            </button>
            {node.id === tree?.leafId && <span className="tree-leaf-tag">current</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
