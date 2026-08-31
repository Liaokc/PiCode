import { useEffect, useReducer, useState, type JSX } from 'react'
import type { ReviewFileEntry, ReviewSnapshot } from '../../../shared/review/types'
import { buildFileTree, flattenTree } from '../../../shared/review/tree'
import { initialReviewTabState, reviewTabReducer } from '../../../shared/review/view-model'
import DiffView from './DiffView'
import PreviewLinkChip from './PreviewLinkChip'
import Tooltip from './Tooltip'
import { ArrowRightIcon, FileTextIcon, FolderIcon, RefreshIcon } from './icons'

/**
 * Review tab (ticket 06): workspace-vs-HEAD diff for the active task's
 * directory. Read-only by contract — no commit/push controls exist here.
 * Snapshots come from the main process over the `review:load` IPC seam.
 */

interface ReviewTabProps {
  /** Active session working directory; null when no task is running. */
  cwd: string | null
  /** Deep-link a changed file into the File Preview tab (ticket 07). */
  onOpenFile?: (path: string) => void
}

function totalStat(files: ReviewFileEntry[]): { additions: number; deletions: number } {
  return files.reduce(
    (acc, file) => ({ additions: acc.additions + file.additions, deletions: acc.deletions + file.deletions }),
    { additions: 0, deletions: 0 }
  )
}

export default function ReviewTab({ cwd, onOpenFile }: ReviewTabProps): JSX.Element {
  const [state, dispatch] = useReducer(reviewTabReducer, undefined, initialReviewTabState)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (cwd === null) return
    let cancelled = false
    dispatch({ type: 'load-start' })
    void window.picode.review.load(cwd).then((result) => {
      if (cancelled) return
      dispatch(result.ok ? { type: 'load-success', result } : { type: 'load-failure', result })
    })
    return () => {
      cancelled = true
    }
  }, [cwd, refreshTick])

  if (cwd === null) {
    return (
      <div className="review-empty">
        <FileTextIcon size={28} />
        <p className="review-empty-title">No workspace yet</p>
        <p className="review-empty-hint">Start a task in a project folder to review its changes here.</p>
      </div>
    )
  }

  if (state.status === 'loading' && state.result === null) {
    return (
      <div className="review-empty">
        <p className="review-empty-hint">Loading diff…</p>
      </div>
    )
  }

  if (state.status === 'error' || (state.result !== null && !state.result.ok)) {
    const failure = state.result !== null && !state.result.ok ? state.result : null
    if (failure?.reason === 'not-a-git-repo') {
      return (
        <div className="review-empty">
          <p className="review-empty-title">Not a git repository</p>
          <p className="review-empty-hint">This folder has no repository, so there is no diff to review.</p>
        </div>
      )
    }
    return (
      <div className="review-empty">
        <p className="review-empty-title">Could not load the diff</p>
        <p className="review-empty-hint">{failure?.message ?? 'Something went wrong while reading the git status.'}</p>
      </div>
    )
  }

  const snapshot = state.result !== null && state.result.ok ? state.result.snapshot : null
  if (snapshot === null) {
    return (
      <div className="review-empty">
        <p className="review-empty-hint">Loading diff…</p>
      </div>
    )
  }

  if (snapshot.files.length === 0) {
    return (
      <div className="review-view">
        <ReviewToolbar
          snapshot={snapshot}
          mode={state.mode}
          onMode={(mode) => dispatch({ type: 'set-mode', mode })}
          onRefresh={() => setRefreshTick((t) => t + 1)}
          refreshing={state.status === 'loading'}
        />
        <div className="review-empty">
          <p className="review-empty-title">No changes</p>
          <p className="review-empty-hint">The workspace matches HEAD.</p>
        </div>
      </div>
    )
  }

  const selected = snapshot.files.find((file) => file.path === state.selectedPath) ?? snapshot.files[0]
  const treeRows = flattenTree(buildFileTree(snapshot.files.map((file) => file.path)))
  const statsByPath = new Map(snapshot.files.map((file) => [file.path, file]))

  return (
    <div className="review-view">
      <ReviewToolbar snapshot={snapshot} mode={state.mode} onMode={(mode) => dispatch({ type: 'set-mode', mode })} onRefresh={() => setRefreshTick((t) => t + 1)} refreshing={state.status === 'loading'} />
      <div className="review-body">
        <div className="review-tree" role="list" aria-label="Changed files">
          {treeRows.map(({ node, depth }) =>
            node.type === 'dir' ? (
              <div key={node.path} className="review-tree-dir" style={{ paddingLeft: 10 + depth * 14 }}>
                <FolderIcon size={13} />
                <span>{node.name}</span>
              </div>
            ) : (
              <button
                key={node.path}
                type="button"
                role="listitem"
                className={`review-tree-file${node.path === selected.path ? ' review-tree-file-active' : ''}`}
                style={{ paddingLeft: 10 + depth * 14 }}
                onClick={() => dispatch({ type: 'select-file', path: node.path })}
              >
                <FileTextIcon size={13} />
                <span className="review-tree-name">{node.name}</span>
                {onOpenFile && <PreviewLinkChip path={node.path} onOpen={onOpenFile} label={`Preview ${node.path}`} iconOnly className="review-tree-open" />}
                <FileStat file={statsByPath.get(node.path)} />
              </button>
            )
          )}
        </div>
        <div className="review-diff">
          <div className="review-diff-header">
            <span className="review-diff-path" title={selected.oldPath !== null ? `${selected.oldPath} → ${selected.path}` : selected.path}>
              {selected.oldPath !== null && (
                <>
                  <span className="review-diff-oldpath">{selected.oldPath}</span>
                  <ArrowRightIcon size={11} />
                </>
              )}
              {selected.path}
            </span>
            <FileStat file={selected} />
          </div>
          <DiffView key={`${selected.path}:${state.mode}`} file={selected} mode={state.mode} />
        </div>
      </div>
    </div>
  )
}

function FileStat({ file }: { file: ReviewFileEntry | undefined }): JSX.Element | null {
  if (!file) return null
  return (
    <span className="file-stat">
      {file.additions > 0 && <span className="file-stat-add">+{file.additions}</span>}
      {file.deletions > 0 && <span className="file-stat-del">−{file.deletions}</span>}
      {file.additions === 0 && file.deletions === 0 && <span className="file-stat-quiet">{file.binary ? 'binary' : '·'}</span>}
    </span>
  )
}

function ReviewToolbar({
  snapshot,
  mode,
  onMode,
  onRefresh,
  refreshing
}: {
  snapshot: ReviewSnapshot
  mode: 'unified' | 'split'
  onMode: (mode: 'unified' | 'split') => void
  onRefresh: () => void
  refreshing: boolean
}): JSX.Element {
  const totals = totalStat(snapshot.files)
  return (
    <div className="review-toolbar">
      <div className="review-summary">
        <span className="review-branch" title={snapshot.head ?? undefined}>{snapshot.branch ?? 'detached'}</span>
        <span className="review-total">
          {snapshot.files.length} file{snapshot.files.length === 1 ? '' : 's'} · <span className="file-stat-add">+{totals.additions}</span>{' '}
          <span className="file-stat-del">−{totals.deletions}</span>
        </span>
      </div>
      <div className="review-actions">
        <div className="review-segmented" role="tablist" aria-label="Diff layout">
          <button type="button" role="tab" aria-selected={mode === 'unified'} className={mode === 'unified' ? 'review-seg-active' : ''} onClick={() => onMode('unified')}>
            Unified
          </button>
          <button type="button" role="tab" aria-selected={mode === 'split'} className={mode === 'split' ? 'review-seg-active' : ''} onClick={() => onMode('split')}>
            Split
          </button>
        </div>
        <Tooltip label="Refresh diff">
          <button type="button" className="tb-btn review-refresh" aria-label="Refresh diff" onClick={onRefresh} disabled={refreshing}>
            <RefreshIcon />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
