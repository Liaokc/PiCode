import { useCallback, useEffect, useReducer, useRef, type JSX } from 'react'
import {
  browserRows,
  fileBrowserReducer,
  fileIconKind,
  openBrowser,
  type FileIconKind
} from '../../../shared/file-browser'
import type { PreviewResult } from '../../../shared/preview/types'
import {
  BracesIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  CodeIcon,
  FileTextIcon,
  FilesListIcon,
  FolderIcon,
  GitBranchIcon,
  ImageIcon,
  PaletteIcon
} from './icons'

/**
 * Sidebar file browser (ticket 26): the mode the whole sidebar switches
 * into from a project group's "View files" hover action (ZCode form:
 * back button + project title bar + file tree). Directories lazy-load one
 * level at a time through the EXISTING preview directory-read channel —
 * every entry shows, hidden ones (.git, .idea, …) included. Clicking a
 * file deep-links the side panel's File Preview tab; "Back to tasks"
 * unmounts the browser, so no tree state survives the return.
 * File search is postponed (1.1, grilling R4-Q4).
 */

interface FileBrowserProps {
  /** Absolute workspace root of the browsed project. */
  cwd: string
  /** Group label for the title bar (the project name). */
  project: string
  /** Restore the task list. */
  onBack: () => void
  /** Open one workspace-relative path in the File Preview tab. */
  onOpenFile: (cwd: string, path: string) => void
}

function TypeIcon({ kind, size = 14 }: { kind: FileIconKind; size?: number }): JSX.Element {
  switch (kind) {
    case 'folder':
      return <FolderIcon size={size} className="fb-icon-folder" />
    case 'git':
      return <GitBranchIcon size={size} className="fb-icon-git" />
    case 'docs':
      return <FileTextIcon size={size} className="fb-icon-docs" />
    case 'image':
      return <ImageIcon size={size} className="fb-icon-image" />
    case 'style':
      return <PaletteIcon size={size} className="fb-icon-style" />
    case 'config':
      return <BracesIcon size={size} className="fb-icon-config" />
    case 'code':
      return <CodeIcon size={size} className="fb-icon-code" />
    default:
      return <FileTextIcon size={size} className="fb-icon-file" />
  }
}

export default function FileBrowser({ cwd, project, onBack, onOpenFile }: FileBrowserProps): JSX.Element {
  const [state, dispatch] = useReducer(fileBrowserReducer, undefined, () => openBrowser(cwd, project))
  /** Paths already fetched or in flight — the effect re-runs on every state
   * change while a listing loads; this keeps it to ONE request per listing
   * (cleared on failure so the retry action goes back to the network). */
  const requested = useRef(new Set<string>())

  // One loader for every in-flight listing (root on mount, a directory on
  // first expand). Each fetch resolves by LEAVING the loading set, so the
  // effect cannot loop; loaded children are cached for re-expansion.
  useEffect(() => {
    if (state === null) return
    for (const path of state.loading) {
      if (requested.current.has(path)) continue
      requested.current.add(path)
      // The preview channel refuses empty targets — the root goes as '.'.
      void window.picode.preview
        .load(cwd, path === '' ? '.' : path)
        .then((result: PreviewResult) => {
          if (result.ok && result.kind === 'directory') {
            dispatch({
              type: 'children-loaded',
              path,
              entries: result.listing.entries.map((entry) => ({ name: entry.name, type: entry.type }))
            })
          } else {
            requested.current.delete(path)
            dispatch({ type: 'children-failed', path })
          }
        })
        .catch(() => {
          requested.current.delete(path)
          dispatch({ type: 'children-failed', path })
        })
    }
  }, [state, cwd])

  const retry = useCallback((path: string) => dispatch({ type: 'retry', path }), [])

  // Unreachable in practice: "back" unmounts the browser (Sidebar), the
  // reducer's 'close' is never dispatched here — kept for the seam test.
  if (state === null) return <></>

  const rootLoading = state.loading.has('')
  const rootFailed = state.failed.has('')

  return (
    <div className="fb-browser" data-browser-cwd={cwd}>
      <div className="fb-back-bar">
        <button
          type="button"
          className="fb-back-btn"
          aria-label="Back to tasks"
          onClick={onBack}
        >
          <ChevronLeftIcon size={14} className="fb-back-caret" />
          <span>Back to tasks</span>
        </button>
      </div>
      <div className="fb-title-bar" title={cwd}>
        <FilesListIcon size={14} />
        <span className="fb-title-name">{project}</span>
      </div>
      <div className="sb-scroll fb-scroll" role="tree" aria-label={`${project} files`}>
        {rootLoading && <div className="fb-hint">Loading…</div>}
        {rootFailed && (
          <button type="button" className="fb-hint fb-hint-action" onClick={() => retry('')}>
            Could not read this folder. Click to retry.
          </button>
        )}
        {browserRows(state).map((row) => {
          const { node, depth, loading, failed } = row
          const expanded = state.expanded.has(node.path)
          const children = state.children[node.path] ?? []
          const emptyDir = node.type === 'dir' && expanded && !loading && !failed && children.length === 0
          return (
            <div key={node.path}>
              <button
                type="button"
                role="treeitem"
                aria-expanded={node.type === 'dir' ? expanded : undefined}
                className={failed ? 'fb-row fb-row-failed' : 'fb-row'}
                style={{ paddingLeft: `${10 + depth * 14}px` }}
                onClick={() => {
                  if (node.type === 'dir') dispatch({ type: 'toggle', path: node.path })
                  else onOpenFile(cwd, node.path)
                }}
              >
                <span className="fb-caret-slot">
                  {node.type === 'dir' && (
                    <ChevronDownIcon size={11} className={expanded ? 'fb-caret' : 'fb-caret fb-caret-closed'} />
                  )}
                </span>
                <TypeIcon kind={fileIconKind(node.name, node.type)} />
                <span className="fb-row-name">{node.name}</span>
              </button>
              {loading && <div className="fb-hint" style={{ paddingLeft: `${24 + depth * 14}px` }}>Loading…</div>}
              {failed && (
                <button
                  type="button"
                  className="fb-hint fb-hint-action"
                  style={{ paddingLeft: `${24 + depth * 14}px` }}
                  onClick={() => retry(node.path)}
                >
                  Could not read this folder. Click to retry.
                </button>
              )}
              {emptyDir && (
                <div className="fb-hint" style={{ paddingLeft: `${24 + depth * 14}px` }}>
                  Empty folder
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
