import type { JSX } from 'react'
import type { TurnFileChange } from '../../../shared/turn-files'
import { parseTurnDiffRows, turnFileTotals } from '../../../shared/turn-files'
import { TurnFileStat } from './TurnFileBar'
import { FileTextIcon } from './icons'

interface TurnDiffTabProps {
  /** The reviewed turn's id (the tab identity's coordinate). */
  turnId: string
  /** The turn's aggregated changes, resolved against the ACTIVE session's
   * view state; null when the turn does not exist there (the tab outlived
   * its session focus). The body re-resolves on every render, so a live
   * turn's tab grows with it and a settled one renders its final state. */
  changes: readonly TurnFileChange[] | null
}

/** One diff line of the Pi display diff — same visual language as the
 * Review tab's DiffView rows (shared diff-line classes), but a single
 * gutter: the turn diff prints each row's own number, not git's two. */
function TurnDiffLine({ row }: { row: ReturnType<typeof parseTurnDiffRows>[number] }): JSX.Element {
  return (
    <div className={`diff-line diff-${row.kind}`}>
      {row.kind !== 'meta' && <span className="diff-gutter">{row.line}</span>}
      <span className="diff-sign">{row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : row.kind === 'context' ? ' ' : '·'}</span>
      <span className="diff-text">{row.text}</span>
    </div>
  )
}

/**
 * The turn-diff side-panel tab (ticket 78): renders the reviewed turn's
 * per-file diffs — the SAME diff renderer language as the Review tab, fed by
 * the turn's aggregated diff text (the Pi edit display diff, NOT a git
 * patch). Coexists with the Review tab (workspace-vs-HEAD): this one is
 * scoped to one turn's file changes. Write-created files show their "+new"
 * row without a diff section — the session result records no content for
 * them; edits whose result predates the diff projection degrade to a note.
 */
export default function TurnDiffTab({ turnId, changes }: TurnDiffTabProps): JSX.Element {
  if (changes === null) {
    return (
      <div className="review-empty turn-diff-empty">
        <p className="review-empty-title">Turn not in view</p>
        <p className="review-empty-hint">This turn belongs to a session that is not active right now.</p>
      </div>
    )
  }
  if (changes.length === 0) {
    return (
      <div className="review-empty turn-diff-empty">
        <p className="review-empty-title">No file changes</p>
        <p className="review-empty-hint">This turn made no file edits.</p>
      </div>
    )
  }
  const totals = turnFileTotals(changes)
  return (
    <div className="turn-diff-view" data-turn-diff={turnId}>
      <div className="turn-diff-toolbar">
        <span className="turn-diff-summary">
          {totals.files} file{totals.files === 1 ? '' : 's'} changed
        </span>
        {totals.added > 0 && <span className="file-stat-add">+{totals.added}</span>}
        {totals.removed > 0 && <span className="file-stat-del">−{totals.removed}</span>}
      </div>
      <div className="turn-diff-body">
        {changes.map((change) => {
          const rows = parseTurnDiffRows(change.diff)
          return (
            <section key={change.path} className="turn-diff-file" data-turn-diff-file={change.path}>
              <div className="turn-diff-file-header">
                <FileTextIcon size={13} />
                <span className="turn-diff-file-path" title={change.path}>
                  {change.path}
                </span>
                <TurnFileStat change={change} />
              </div>
              {rows.length > 0 ? (
                <div className="diff-scroll turn-diff-scroll">
                  <div className="diff-inner">
                    {rows.map((row, index) => (
                      <TurnDiffLine key={index} row={row} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="turn-diff-nodiff">
                  {change.added === null ? 'New file — the session records no content for writes.' : 'No diff text was recorded for this edit.'}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
