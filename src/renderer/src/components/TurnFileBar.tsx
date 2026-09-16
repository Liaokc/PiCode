import { useState, type JSX } from 'react'
import type { TurnFileChange } from '../../../shared/turn-files'
import { turnFileTotals } from '../../../shared/turn-files'
import PreviewLinkChip from './PreviewLinkChip'
import Tooltip from './Tooltip'
import { ChevronDownIcon, ChevronRightIcon, FileTextIcon } from './icons'

interface TurnFileBarProps {
  /** The owning turn's id — the Review button addresses the turn-diff tab. */
  turnId: string
  /** The turn's aggregated per-file changes (empty turns never mount the bar). */
  changes: readonly TurnFileChange[]
  /** Open the turn's diff in a side-panel tab (ticket 78). Omitted on
   * gate-less surfaces (Live Follow), which then render counts only. */
  onReviewTurn?: (turnId: string) => void
  /** The existing preview deep link (ticket 07) — the Open affordance. */
  onOpenFile?: (path: string) => void
}

function leafOf(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '')
  return segments[segments.length - 1] ?? path
}

/** Per-file stat: "+new" for write-created rows, else the ± counts. */
function FileStat({ change }: { change: TurnFileChange }): JSX.Element {
  if (change.added === null) {
    return <span className="file-stat file-stat-new">+new</span>
  }
  return (
    <span className="file-stat">
      {change.added > 0 && <span className="file-stat-add">+{change.added}</span>}
      {change.removed > 0 && <span className="file-stat-del">−{change.removed}</span>}
      {change.added === 0 && change.removed === 0 && <span className="file-stat-quiet">·</span>}
    </span>
  )
}

/**
 * The turn file bar (ticket 78): a collapsed "N files changed +X −Y" row at
 * the end of the turn's always-visible segment (below the answer), expanding
 * to one row per changed file — icon, name, path, ± counts (or "+new" for
 * write-created files) and the Review / Open affordances. Data is the pure
 * Seam-1 aggregation (turn-collapse `fileChanges`); a turn with no settled
 * edit/write never mounts the bar. There is deliberately NO undo here
 * (ticket 1.1 discipline stays: the bar is read-only).
 *
 * Collapsed by default; expansion is local view state (the transcript never
 * reflows underneath it). Review opens the side panel's turn-diff tab for
 * the whole turn; Open deep-links the file into the existing Preview tab.
 */
export default function TurnFileBar({ turnId, changes, onReviewTurn, onOpenFile }: TurnFileBarProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const totals = turnFileTotals(changes)
  const allNew = changes.length > 0 && changes.every((change) => change.added === null)
  return (
    <div className="turn-filebar" data-turn-filebar={turnId} data-expanded={expanded ? '' : undefined}>
      <button
        type="button"
        className="turn-filebar-header"
        aria-expanded={expanded}
        aria-controls={`turn-filebar-files-${turnId}`}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? (
          <ChevronDownIcon size={12} className="turn-filebar-chevron" />
        ) : (
          <ChevronRightIcon size={12} className="turn-filebar-chevron" />
        )}
        <span className="turn-filebar-summary">
          {totals.files} file{totals.files === 1 ? '' : 's'} changed
        </span>
        {totals.added > 0 && <span className="file-stat-add">+{totals.added}</span>}
        {totals.removed > 0 && <span className="file-stat-del">−{totals.removed}</span>}
        {totals.added === 0 && totals.removed === 0 && allNew && <span className="file-stat file-stat-new">+new</span>}
      </button>
      {expanded && (
        <div className="turn-filebar-files" role="list" id={`turn-filebar-files-${turnId}`} aria-label="Files changed in this turn">
          {changes.map((change) => (
            <div key={change.path} role="listitem" className="turn-filebar-file">
              <FileTextIcon size={13} className="turn-filebar-file-icon" />
              <span className="turn-filebar-file-name">{leafOf(change.path)}</span>
              {/* Data reveal (CONTEXT.md tooltip rule): the full path rides a
                  native title — never the shortcut/description Tooltip. */}
              <span className="turn-filebar-file-path" title={change.path}>
                {change.path}
              </span>
              <FileStat change={change} />
              {onReviewTurn !== undefined && (
                <Tooltip label="Review this turn's diff">
                  <button
                    type="button"
                    className="turn-filebar-act"
                    aria-label={`Review diff of ${change.path}`}
                    onClick={() => onReviewTurn(turnId)}
                  >
                    Review
                  </button>
                </Tooltip>
              )}
              {onOpenFile !== undefined && (
                <PreviewLinkChip
                  path={change.path}
                  onOpen={onOpenFile}
                  label={`Open ${change.path}`}
                  className="turn-filebar-open"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
