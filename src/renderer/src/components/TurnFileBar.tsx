import { useState, type JSX } from 'react'
import type { TurnFileChange } from '../../../shared/turn-files'
import { turnFileTotals } from '../../../shared/turn-files'
import PreviewLinkChip from './PreviewLinkChip'
import { BracesIcon, ChevronDownIcon, ChevronRightIcon, CodeIcon, FileTextIcon, ImageIcon } from './icons'

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

/** ZCode's changed-file rows color the icon by file type (the operator's
 * expanded-state reference frame). Approximated with the icon set on hand:
 * doc types blue, config braces yellow, python/sql families tinted, images
 * purple, everything else neutral. */
function fileIconFor(path: string): { Icon: (props: { size?: number; className?: string }) => JSX.Element; cls: string } {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  if (ext === 'md' || ext === 'markdown' || ext === 'txt') return { Icon: FileTextIcon, cls: 'tfb-icon-doc' }
  if (ext === 'json' || ext === 'yaml' || ext === 'yml' || ext === 'toml') return { Icon: BracesIcon, cls: 'tfb-icon-json' }
  if (ext === 'py') return { Icon: CodeIcon, cls: 'tfb-icon-py' }
  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') {
    return { Icon: CodeIcon, cls: 'tfb-icon-ts' }
  }
  if (ext === 'sql' || ext === 'hql' || ext === 'q') return { Icon: CodeIcon, cls: 'tfb-icon-sql' }
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif' || ext === 'webp' || ext === 'svg' || ext === 'bmp') {
    return { Icon: ImageIcon, cls: 'tfb-icon-img' }
  }
  return { Icon: CodeIcon, cls: 'tfb-icon-code' }
}

/** Per-file stat: "+new" for write-created rows, else the ± counts. Shared
 * with the turn-diff tab (same projection, one render rule). */
export function TurnFileStat({ change }: { change: TurnFileChange }): JSX.Element {
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
          <ChevronDownIcon size={14} className="turn-filebar-chevron" />
        ) : (
          <ChevronRightIcon size={14} className="turn-filebar-chevron" />
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
          {changes.map((change) => {
            const spec = fileIconFor(change.path)
            const Icon = spec.Icon
            return (
              <div key={change.path} role="listitem" className="turn-filebar-file">
                <Icon size={14} className={`turn-filebar-file-icon ${spec.cls}`} />
                <span className="turn-filebar-file-name">{leafOf(change.path)}</span>
                {/* Data reveal (CONTEXT.md tooltip rule): the full path rides a
                    native title — never the shortcut/description Tooltip. */}
                <span className="turn-filebar-file-path" title={change.path}>
                  {change.path}
                </span>
                <TurnFileStat change={change} />
                {onReviewTurn !== undefined && (
                  <button
                    type="button"
                    className="turn-filebar-act"
                    aria-label={`Review diff of ${change.path}`}
                    onClick={() => onReviewTurn(turnId)}
                  >
                    Review
                  </button>
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
            )
          })}
        </div>
      )}
    </div>
  )
}
