import { useEffect, useMemo, useRef, type JSX } from 'react'
import type { SessionTreePayload } from '../../../shared/sessions/types'
import { sessionTreeDisplayRows, type TreeDisplayRow } from '../../../shared/sessions/tree-view'
import Tooltip from './Tooltip'
import { GitBranchIcon } from './icons'

interface TreePanelProps {
  tree: SessionTreePayload | null
  onNavigate: (entryId: string) => void
  onFork: (entryId: string) => void
  onClose: () => void
}

const kindClass = (row: TreeDisplayRow): string =>
  row.kind === 'user'
    ? 'tree-row-user'
    : row.kind === 'assistant'
      ? 'tree-row-assistant'
      : row.kind === 'tool'
        ? 'tree-row-tool'
        : 'tree-row-info'

/**
 * In-place tree navigation (user story 28, restyled by ticket 43 to the Pi
 * TUI /tree display form): type-labeled rows over the display model in
 * shared/sessions/tree-view.ts — a pure projection of the tree payload.
 * Click a row to move the leaf there (the file keeps every branch — nothing
 * is lost); the fork icon extracts that path into a new session file. The
 * TUI's keyboard features (search/label/copy/filters) are deliberately out
 * of scope (spec Q8).
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

  const rows = useMemo(() => (tree ? sessionTreeDisplayRows(tree) : []), [tree])

  return (
    <div ref={panelRef} className="tree-panel" role="dialog" aria-label="Session history">
      <div className="tree-panel-header">
        <GitBranchIcon size={13} />
        <span>Branch history</span>
        <span className="tree-panel-count">{rows.length} rows</span>
      </div>
      <div className="tree-scroll">
        {rows.length === 0 && <div className="sb-empty-hint">This session has no entries yet.</div>}
        {rows.map((row) => (
          <div
            key={row.key}
            className={
              'tree-row ' +
              kindClass(row) +
              (row.isCurrentLeaf ? ' tree-row-leaf' : '') +
              (row.onLeafPath ? '' : ' tree-row-aside')
            }
            onClick={() => onNavigate(row.entryId)}
          >
            {row.rails.map((rail, level) => (
              <span key={level} className={'tree-guide' + (rail ? ' tree-guide-on' : '')} />
            ))}
            {row.showConnector && (
              <span className={'tree-guide tree-guide-conn' + (row.isLastChild ? ' tree-guide-last' : '')} />
            )}
            {row.typeLabel !== null && <span className="tree-row-type">{row.typeLabel}:</span>}
            {row.label !== null && <span className="tree-row-label-chip">{row.label}</span>}
            <span className="tree-row-text">{row.text}</span>
            {row.isCurrentLeaf && <span className="tree-leaf-tag">current</span>}
            <Tooltip label="Fork from here">
              <button
                type="button"
                className="tree-fork-btn"
                aria-label="Fork a new session from this entry"
                onClick={(e) => {
                  e.stopPropagation()
                  onFork(row.entryId)
                }}
              >
                <GitBranchIcon size={12} />
              </button>
            </Tooltip>
          </div>
        ))}
      </div>
    </div>
  )
}
