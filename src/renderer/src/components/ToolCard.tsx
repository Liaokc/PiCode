import { useState, type JSX } from 'react'
import type { ToolEntry } from '../../../shared/chat-reducer'
import { toolSummary } from '../../../shared/tool-format'
import PreviewLinkChip from './PreviewLinkChip'
import { CheckIcon, ChevronDownIcon, CloseIcon, LoaderIcon } from './icons'

/** File-arg tools whose cards double as file-change cards (ticket 07): the
 * path argument deep-links into the File Preview tab. */
const FILE_PATH_TOOLS = new Set(['read', 'write', 'edit', 'ls'])

interface ToolCardProps {
  entry: ToolEntry
  /** Present when a preview target is available; the card then shows Open. */
  onOpenFile?: (path: string) => void
}

/**
 * Tool call card (screenshot 01: compact one-line tool row; ticket: name,
 * arguments, live status, expand/collapse, final states done/error).
 * The header is always visible; expanding reveals the raw arguments and the
 * (streaming or final) output. Failures render in an explicit error style.
 * File-arg cards carry an Open button (screenshot 04) that deep-links the
 * file into the side panel's Preview tab.
 */
export default function ToolCard({ entry, onOpenFile }: ToolCardProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const summary = toolSummary(entry.name, entry.args)
  const failed = entry.state === 'error'
  const rawPath = entry.args['path']
  const previewPath = typeof rawPath === 'string' && rawPath !== '' && FILE_PATH_TOOLS.has(entry.name) ? rawPath : null

  return (
    <div className={`tool-card tool-card-${entry.state}${open ? ' tool-card-open' : ''}`}>
      <button
        type="button"
        className="tool-card-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Tool ${entry.name} ${entry.state}`}
      >
        <StatusIcon state={entry.state} />
        <span className="tool-card-name">{entry.name}</span>
        {summary !== '' && (
          <>
            <span className="tool-card-sep">·</span>
            <span className="tool-card-summary">{summary}</span>
          </>
        )}
        <span className={`tool-card-state tool-card-state-${entry.state}`}>
          {entry.state === 'running' ? 'Running' : entry.state === 'done' ? 'Done' : 'Error'}
        </span>
        {previewPath !== null && onOpenFile && (
          <PreviewLinkChip path={previewPath} onOpen={onOpenFile} label={`Preview ${previewPath}`} className="tool-card-preview-link" />
        )}
        <ChevronDownIcon size={13} className="row-chevron" />
      </button>
      {open && (
        <div className="tool-card-body">
          {Object.keys(entry.args).length > 0 && (
            <div className="tool-card-section">
              <div className="tool-card-section-label">Arguments</div>
              <pre className="tool-card-pre">{JSON.stringify(entry.args, null, 2)}</pre>
            </div>
          )}
          <div className="tool-card-section">
            <div className="tool-card-section-label">{failed ? 'Error output' : 'Output'}</div>
            {entry.output === '' ? (
              <pre className="tool-card-pre tool-card-pre-empty">{entry.state === 'running' ? 'Working…' : 'No output'}</pre>
            ) : (
              <pre className={`tool-card-pre${failed ? ' tool-card-pre-error' : ''}`}>{entry.output}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusIcon({ state }: { state: ToolEntry['state'] }): JSX.Element {
  if (state === 'running') return <LoaderIcon size={13} className="tool-card-status-icon spin" />
  if (state === 'done') return <CheckIcon size={13} className="tool-card-status-icon tool-card-status-done" />
  return <CloseIcon size={13} className="tool-card-status-icon tool-card-status-error" />
}
