import { useEffect, useReducer, useRef, type JSX } from 'react'
import { PREVIEW_SOURCE_WINDOW_LINES, displayModeFor, previewCrumbs } from '../../../shared/preview/policy'
import type { PreviewDirectoryListing, PreviewResult } from '../../../shared/preview/types'
import type { PreviewSelection } from '../../../shared/preview/view-model'
import { initialPreviewTabState, previewTabReducer } from '../../../shared/preview/view-model'
import type { PreviewFileEntry } from '../../../shared/preview/types'
import CodeView from './CodeView'
import Markdown from './Markdown'
import Tooltip from './Tooltip'
import { ChevronRightIcon, CodeIcon, EyeIcon, FileTextIcon, FolderIcon, WrapTextIcon } from './icons'

/**
 * File Preview tab (ticket 07): markdown rendering + code highlighting with
 * breadcrumb path navigation (screenshots 04/08 right panel). The target is
 * owned by the App shell so transcript cards and the Review file tree can
 * deep-link into it; navigation inside the tab (crumbs, directory rows) asks
 * the App to retarget, keeping a single source of truth.
 */

interface PreviewTabProps {
  /** Current deep-link target; null shows the empty state. */
  target: PreviewSelection | null
  /** Retarget the tab (breadcrumb/directory navigation) — token-driven. */
  onNavigate: (cwd: string, path: string) => void
}

export default function PreviewTab({ target, onNavigate }: PreviewTabProps): JSX.Element {
  const [state, dispatch] = useReducer(previewTabReducer, undefined, initialPreviewTabState)
  const crumbsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (target === null) return
    let cancelled = false
    dispatch({ type: 'load-start', sel: target })
    void window.picode.preview
      .load(target.cwd, target.path)
      .then((result: PreviewResult) => {
        if (cancelled) return
        dispatch(result.ok ? { type: 'load-success', result } : { type: 'load-failure', result })
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({ type: 'load-failure', result: { ok: false, reason: 'failed', message: 'The preview failed to load.' } })
        }
      })
    return () => {
      cancelled = true
    }
  }, [target])

  // Keep the deepest crumb (the current location) in view.
  useEffect(() => {
    const el = crumbsRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [state.result, state.status])

  if (target === null) {
    return (
      <div className="review-empty">
        <FileTextIcon size={28} />
        <p className="review-empty-title">No file selected</p>
        <p className="review-empty-hint">Open a file from the transcript or the Review tab to preview it here.</p>
      </div>
    )
  }

  const location = currentLocation(state.result, state.sel, target.path)
  const isFile = state.status === 'ready' && state.result !== null && state.result.ok && state.result.kind === 'file'
  const crumbs = location.cwd === '' ? [] : previewCrumbs(location.cwd, location.path, isFile)
  // The wrap/truncate switch only means something when source is on screen.
  const sourceShowing =
    isFile && state.result !== null && state.result.ok && state.result.kind === 'file'
      ? state.result.file.kind !== 'markdown' || state.view === 'source'
      : false

  return (
    <div className="preview-view">
      <div className="preview-toolbar">
        <div ref={crumbsRef} className="preview-crumbs" role="navigation" aria-label="Breadcrumb path">
          {crumbs.map((crumb, index) => (
            <span key={crumb.path} className="preview-crumb-wrap">
              {index > 0 && <ChevronRightIcon size={10} className="preview-crumb-sep" />}
              {crumb.type === 'file' ? (
                <span className="preview-crumb preview-crumb-file">
                  <FileTextIcon size={12} />
                  {crumb.name}
                </span>
              ) : (
                <button
                  type="button"
                  className="preview-crumb"
                  title={crumb.path}
                  onClick={() => onNavigate(location.cwd, crumb.path)}
                >
                  {index === 0 && <FolderIcon size={12} />}
                  {crumb.name}
                </button>
              )}
            </span>
          ))}
        </div>
        {sourceShowing && (
          <Tooltip label="Wrap lines">
            <button
              type="button"
              className={state.wrapLines ? 'tb-btn preview-wrap-toggle preview-wrap-toggle-on' : 'tb-btn preview-wrap-toggle'}
              aria-pressed={state.wrapLines}
              aria-label={state.wrapLines ? 'Switch to truncated lines' : 'Switch to wrapped lines'}
              onClick={() => dispatch({ type: 'toggle-wrap-lines' })}
            >
              <WrapTextIcon size={14} />
            </button>
          </Tooltip>
        )}
        {state.status === 'ready' &&
          state.result !== null &&
          state.result.ok &&
          state.result.kind === 'file'
          && state.result.file.kind === 'markdown' && (
          <div className="review-segmented" role="tablist" aria-label="Preview mode">
            <button
              type="button"
              role="tab"
              aria-selected={state.view === 'rendered'}
              className={state.view === 'rendered' ? 'review-seg-active' : ''}
              onClick={() => dispatch({ type: 'set-view', view: 'rendered' })}
            >
              <EyeIcon size={12} />
              Rendered
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={state.view === 'source'}
              className={state.view === 'source' ? 'review-seg-active' : ''}
              onClick={() => dispatch({ type: 'set-view', view: 'source' })}
            >
              <CodeIcon size={12} />
              Source
            </button>
          </div>
        )}
      </div>

      {state.status === 'loading' && state.result === null && (
        <div className="review-empty">
          <p className="review-empty-hint">Loading…</p>
        </div>
      )}

      {state.status === 'error' && <PreviewFailure result={state.result} />}

      {state.status === 'ready' && state.result !== null && state.result.ok && state.result.kind === 'file' && (
        <PreviewFile
          file={state.result.file}
          view={state.view}
          wrap={state.wrapLines}
          visibleLines={state.visibleLines}
          onShowMore={() => dispatch({ type: 'show-more-lines' })}
        />
      )}

      {state.status === 'ready' && state.result !== null && state.result.ok && state.result.kind === 'directory' && (
        <PreviewListing listing={state.result.listing} onNavigate={onNavigate} truncated={state.result.listing.truncated} />
      )}
    </div>
  )
}

function currentLocation(
  result: PreviewResult | null,
  sel: PreviewSelection | null,
  fallbackPath: string
): { cwd: string; path: string } {
  if (result?.ok) {
    const cwd = result.kind === 'file' ? result.file.cwd : result.listing.cwd
    const path = result.kind === 'file' ? result.file.absolutePath : result.listing.absolutePath
    return { cwd, path }
  }
  // While loading or erroring, the selection still anchors the crumbs.
  if (sel !== null) return { cwd: sel.cwd, path: sel.path }
  return { cwd: '', path: fallbackPath }
}

function PreviewFailure({ result }: { result: PreviewResult | null }): JSX.Element | null {
  if (result === null || result.ok) return null
  const title =
    result.reason === 'not-found'
      ? 'File not found'
      : result.reason === 'too-large'
        ? 'File too large to preview'
        : result.reason === 'not-readable'
          ? 'Cannot read this path'
          : 'Preview failed'
  return (
    <div className="review-empty">
      <FileTextIcon size={28} />
      <p className="review-empty-title">{title}</p>
      <p className="review-empty-hint">{result.message}</p>
    </div>
  )
}

function PreviewFile({
  file,
  view,
  wrap,
  visibleLines,
  onShowMore
}: {
  file: PreviewFileEntry
  view: 'rendered' | 'source'
  wrap: boolean
  visibleLines: number
  onShowMore: () => void
}): JSX.Element {
  if (file.kind === 'binary' || file.text === null) {
    return (
      <div className="review-empty">
        <FileTextIcon size={28} />
        <p className="review-empty-title">Binary file</p>
        <p className="review-empty-hint">“{file.name}” is binary ({Math.max(1, Math.round(file.sizeBytes / 1024))} KB) — no text preview.</p>
      </div>
    )
  }

  const rendered = file.kind === 'markdown' && view === 'rendered' && displayModeFor(file) === 'markdown'
  const markdownFallback = file.kind === 'markdown' && displayModeFor(file) === 'source'
  const remainingLines = Math.min(PREVIEW_SOURCE_WINDOW_LINES, file.totalLines - visibleLines)

  return (
    <div className="preview-body">
      {markdownFallback && (
        <div className="preview-notice">
          Large markdown file — shown as source ({Math.round(file.sizeBytes / 1024)} KB).
        </div>
      )}
      {rendered ? (
        <div className="preview-md">
          {/* chrome={false}: block cards are a transcript affordance (ticket 16);
            the preview reader keeps its bare layout. */}
          <Markdown text={file.text} chrome={false} />
        </div>
      ) : (
        <CodeView text={file.text} name={file.name} visibleLines={visibleLines} totalLines={file.totalLines} wrap={wrap} />
      )}
      {!rendered && file.totalLines > visibleLines && (
        <button type="button" className="preview-show-more" onClick={onShowMore}>
          Show {remainingLines.toLocaleString('en-US')} more lines
        </button>
      )}
    </div>
  )
}

function PreviewListing({
  listing,
  onNavigate,
  truncated
}: {
  listing: PreviewDirectoryListing
  onNavigate: (cwd: string, path: string) => void
  truncated: boolean
}): JSX.Element {
  return (
    <div className="preview-body">
      {truncated && <div className="preview-notice">This folder has many entries — only the first ones are listed.</div>}
      <div className="preview-list" role="list" aria-label="Folder contents">
        {listing.entries.map((entry) => (
          <button
            key={entry.name}
            type="button"
            role="listitem"
            className="preview-list-row"
            onClick={() => onNavigate(listing.cwd, `${listing.absolutePath}/${entry.name}`)}
          >
            {entry.type === 'dir' ? <FolderIcon size={14} /> : <FileTextIcon size={14} />}
            <span className="preview-list-name">{entry.name}</span>
            <span className="preview-list-size">
              {entry.sizeBytes !== null ? `${Math.max(1, Math.round(entry.sizeBytes / 1024))} KB` : '—'}
            </span>
          </button>
        ))}
        {listing.entries.length === 0 && <div className="review-empty-hint preview-list-empty">Empty folder.</div>}
      </div>
    </div>
  )
}
