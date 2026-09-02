import { memo, useEffect, useState, type JSX } from 'react'
import {
  formatCallDuration,
  formatTraceTimestamp,
  formatTraceTokens,
  traceStats,
  type TraceBlock,
  type TraceCall,
  type TracePayload
} from '../../../shared/sessions/trace'
import Tooltip from './Tooltip'
import { CloseIcon, FolderIcon, HistoryIcon, RefreshIcon } from './icons'

/**
 * One session's call-trace tab (ticket 36): a read-only inspector that lists
 * every model call the session file records — entry = one model call, with
 * an input section (user / tool-result blocks since the previous assistant
 * message) and an output section (thinking / assistant text / tool calls).
 * The payload comes from the host's pure builder over the jsonl (sessions
 * channel, ADR-0002 usage derivation), so the trace shows exactly what Pi
 * recorded — no title-generation calls, no system prompt (the SDK's internal
 * system prompt is never persisted; the block type exists for the six-type
 * vocabulary only).
 *
 * The list renders FULLY EXPANDED by default; long block text truncates in
 * place with a Show more/less toggle (local block state, memoized rows —
 * ticket 30's perf discipline: a toggle re-renders one block, never the
 * list). Entry collapse, block-type toggles, search, expand-all↔collapse-all
 * and live follow are ticket 37. Refresh re-reads the file; Open Containing
 * Folder rides the read-only context-action IPC.
 */

interface TraceTabProps {
  /** The session jsonl this tab inspects — the tab's identity. */
  sessionFile: string
  /** Close the tab (the panel framework records the recently closed entry). */
  onClose: () => void
}

type LoadStatus = 'loading' | 'ready' | 'error'

/** In-place truncation budget for one block's text (chars). */
const TRACE_BLOCK_PREVIEW_CHARS = 400

/** stopReason → status chip label. Unknown reasons render no chip. */
const STOP_REASON_LABELS: Record<string, string> = {
  stop: 'Completed',
  toolUse: 'Tool use',
  length: 'Length limit',
  aborted: 'Aborted',
  error: 'Error'
}

/** Block-kind → chip label (English UI copy; ZCode parity in meaning). */
const BLOCK_KIND_LABELS: Record<TraceBlock['kind'], string> = {
  'system-prompt': 'System prompt',
  user: 'User message',
  thinking: 'Thinking',
  assistant: 'Assistant message',
  'tool-call': 'Tool call',
  'tool-result': 'Tool result'
}

export default function TraceTab({ sessionFile, onClose }: TraceTabProps): JSX.Element {
  const [payload, setPayload] = useState<TracePayload | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  // Bumped by the refresh button; the load effect re-runs and keeps the old
  // payload on screen until the fresh one lands.
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    void window.picode.sessions.trace(sessionFile).then((result) => {
      if (cancelled) return
      if (result === null) {
        setStatus('error')
      } else {
        setPayload(result)
        setStatus('ready')
      }
    })
    return () => {
      cancelled = true
    }
  }, [sessionFile, reloadToken])

  if (status === 'error') {
    return (
      <div className="trace-view">
        <TraceHeader title={leafOf(sessionFile)} stats={null} onRefresh={() => setReloadToken((t) => t + 1)} onClose={onClose} />
        <div className="review-empty">
          <HistoryIcon size={28} />
          <p className="review-empty-title">Call trace unavailable</p>
          <p className="review-empty-hint">The session file could not be read as a Pi session.</p>
        </div>
      </div>
    )
  }

  if (payload === null) {
    return (
      <div className="trace-view">
        <TraceHeader title={leafOf(sessionFile)} stats={null} onRefresh={() => setReloadToken((t) => t + 1)} onClose={onClose} />
        <div className="review-empty">
          <HistoryIcon size={28} />
          <p className="review-empty-title">Loading call trace…</p>
        </div>
      </div>
    )
  }

  const stats = traceStats(payload)
  return (
    <div className="trace-view">
      <TraceHeader
        title={payload.title}
        stats={stats}
        onRefresh={() => setReloadToken((t) => t + 1)}
        onClose={onClose}
        sessionFile={sessionFile}
      />
      {payload.calls.length === 0 ? (
        <div className="review-empty">
          <HistoryIcon size={28} />
          <p className="review-empty-title">No model calls</p>
          <p className="review-empty-hint">This session file does not record any assistant messages yet.</p>
        </div>
      ) : (
        <div className="trace-list">
          {payload.calls.map((call) => (
            <TraceCallRow key={call.messageId} call={call} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- header -----------------------------------------------------------------

interface TraceHeaderStats {
  calls: number
  totalTokens: number | null
  model: string | null
}

function TraceHeader(props: {
  title: string
  stats: TraceHeaderStats | null
  onRefresh: () => void
  onClose: () => void
  sessionFile?: string
}): JSX.Element {
  const { title, stats, onRefresh, onClose, sessionFile } = props
  const reveal = (): void => {
    if (sessionFile !== undefined) {
      void window.picode.sessions.contextAction({ kind: 'reveal', file: sessionFile })
    }
  }
  return (
    <div className="trace-header">
      <div className="trace-header-main">
        <div className="trace-title" title={title}>
          {title}
        </div>
        {stats !== null && (
          <div className="trace-stats">
            <span>{stats.calls} calls</span>
            {stats.totalTokens !== null && (
              <>
                <span className="trace-stats-sep">·</span>
                <span>{formatTraceTokens(stats.totalTokens)} tok</span>
              </>
            )}
            {stats.model !== null && (
              <>
                <span className="trace-stats-sep">·</span>
                <span>{stats.model}</span>
              </>
            )}
          </div>
        )}
      </div>
      <div className="trace-header-actions">
        {sessionFile !== undefined && (
          <Tooltip label="Open containing folder">
            <button type="button" className="tb-btn" aria-label="Open containing folder" onClick={reveal}>
              <FolderIcon size={15} />
            </button>
          </Tooltip>
        )}
        <Tooltip label="Refresh trace">
          <button type="button" className="tb-btn" aria-label="Refresh trace" onClick={onRefresh}>
            <RefreshIcon size={15} />
          </button>
        </Tooltip>
        <Tooltip label="Close trace">
          <button type="button" className="tb-btn" aria-label="Close trace" onClick={onClose}>
            <CloseIcon size={15} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

function leafOf(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '')
  return segments[segments.length - 1] ?? path
}

// ---- call entries -----------------------------------------------------------

/** One model call, memoized: a payload refresh swaps identities wholesale,
 * while header/parent re-renders must not re-walk every entry (ticket 30). */
const TraceCallRow = memo(function TraceCallRow({ call }: { call: TraceCall }): JSX.Element {
  const statusLabel = call.stopReason !== null ? (STOP_REASON_LABELS[call.stopReason] ?? null) : null
  const time = formatTraceTimestamp(call.timestamp)
  return (
    <div className="trace-call" data-trace-entry={call.index}>
      <div className="trace-call-head">
        <span className="trace-call-index">{String(call.index).padStart(2, '0')}</span>
        {call.model !== null && <span className="trace-chip">{call.model}</span>}
        {statusLabel !== null && <span className="trace-chip">{statusLabel}</span>}
        <span className="trace-call-usage">
          {call.usage !== null && (
            <>
              <span>
                IN <span className="trace-num">{formatTraceTokens(call.usage.input)}</span>
              </span>
              <span className="trace-stats-sep">·</span>
              <span>
                OUT <span className="trace-num">{formatTraceTokens(call.usage.output)}</span>
              </span>
              <span className="trace-stats-sep">·</span>
            </>
          )}
          {call.durationMs !== null && (
            <>
              <span>{formatCallDuration(call.durationMs)}</span>
              <span className="trace-stats-sep">·</span>
            </>
          )}
          {time !== null && <span>{time}</span>}
        </span>
      </div>
      {call.inputBlocks.length > 0 && <TraceSection label="Input" blocks={call.inputBlocks} />}
      {call.outputBlocks.length > 0 && <TraceSection label="Output" blocks={call.outputBlocks} />}
    </div>
  )
})

function TraceSection({ label, blocks }: { label: string; blocks: TraceBlock[] }): JSX.Element {
  return (
    <div className="trace-section">
      <div className="trace-section-label">{label}</div>
      <div className="trace-section-blocks">
        {blocks.map((block, index) => (
          <TraceBlockRow key={blockKeyOf(block, index)} block={block} />
        ))}
      </div>
    </div>
  )
}

/** Stable-enough block key: tool blocks key on their call id (stable across
 * refreshes), text blocks on kind + position. */
function blockKeyOf(block: TraceBlock, index: number): string {
  if (block.kind === 'tool-call' || block.kind === 'tool-result') return `${block.kind}:${block.callId}`
  return `${block.kind}:${index}`
}

const TraceBlockRow = memo(function TraceBlockRow({ block }: { block: TraceBlock }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const text = blockTextOf(block)
  const long = text.length > TRACE_BLOCK_PREVIEW_CHARS
  const shown = long && !expanded ? `${text.slice(0, TRACE_BLOCK_PREVIEW_CHARS)}…` : text
  const isTool = block.kind === 'tool-call' || block.kind === 'tool-result'
  return (
    <div className={`trace-block trace-block-${block.kind}`}>
      <div className="trace-block-head">
        <span className={`trace-kind trace-kind-${block.kind}`}>{BLOCK_KIND_LABELS[block.kind]}</span>
        {isTool && (
          <>
            <span className="trace-chip">{block.toolName || 'tool'}</span>
            <span className="trace-chip trace-chip-id" title={block.callId}>
              {block.callId}
            </span>
          </>
        )}
      </div>
      {text !== '' && <div className="trace-block-text">{shown}</div>}
      {long && (
        <div className="trace-block-foot">
          <button type="button" className="trace-block-expand" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </div>
      )}
    </div>
  )
})

function blockTextOf(block: TraceBlock): string {
  switch (block.kind) {
    case 'system-prompt':
    case 'user':
    case 'thinking':
    case 'assistant':
      return block.text
    case 'tool-call':
      return block.args
    case 'tool-result':
      return block.output
  }
}
