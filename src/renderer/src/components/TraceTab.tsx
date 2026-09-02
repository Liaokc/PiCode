import { memo, useCallback, useEffect, useReducer, useRef, useState, type JSX } from 'react'
import {
  formatCallDuration,
  formatTraceTimestamp,
  formatTraceTokens,
  traceStats,
  type TraceBlock,
  type TraceBlockKind,
  type TraceCall,
  type TracePayload,
  type TraceStats
} from '../../../shared/sessions/trace'
import {
  formatMatchCount,
  initialTraceViewState,
  traceAllBlockKeys,
  traceBlockKey,
  traceBlockText,
  traceMatches,
  traceViewReducer,
  TRACE_BLOCK_KINDS,
  type TraceKindVisibility,
  type TraceSectionId
} from '../../../shared/sessions/trace-view'
import Tooltip from './Tooltip'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  CloseIcon,
  FolderIcon,
  FoldIcon,
  HistoryIcon,
  RefreshIcon,
  SearchIcon,
  SlidersIcon,
  UnfoldIcon
} from './icons'

/**
 * One session's call-trace tab (tickets 36/37): a read-only inspector that
 * lists every model call the session file records — entry = one model call,
 * with an input section (user / tool-result blocks since the previous
 * assistant message) and an output section (thinking / assistant text / tool
 * calls). The payload comes from the host's pure builder over the jsonl, so
 * the trace shows exactly what Pi recorded — no title-generation calls, no
 * system prompt (the SDK's internal system prompt is never persisted; the
 * block type exists for the six-type vocabulary only).
 *
 * Tool surfaces (ticket 37, ZCode reference .scratch/compare/z-trace-*.png):
 * - Live follow: the tab tails its file through the sessions family's
 *   trace-follow channel — the host re-derives the payload whenever the
 *   file changes size and pushes it (FollowView conventions: snapshot +
 *   tail in one request, tail stops when the tab unmounts). A running
 *   session's trace refreshes without any re-request.
 * - Search: header button opens the search bar — query input, match count
 *   (0/0 when empty), ↑↓ navigation with wrap-around, × closes. The
 *   current match's block highlights and scrolls into view.
 * - Block-type toggles: the sliders button opens the six-kind panel (all
 *   on by default); a hidden kind disappears from both the render and the
 *   search corpus.
 * - Expand-all ↔ collapse-all: blocks render expanded by default; the bulk
 *   toggle materializes/empties the collapsed set, per-block chevron
 *   amends it (state lives in the shared pure reducer, Seam-1 tested).
 *
 * Perf discipline (ticket 30): rows and blocks are memoized — a collapse or
 * kind toggle re-renders through cheap memo comparisons, a search navigation
 * re-renders only the two affected blocks. Long text still truncates in
 * place (Show more/less) inside expanded blocks. Refresh re-reads the file;
 * Open Containing Folder rides the read-only context-action IPC.
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
const BLOCK_KIND_LABELS: Record<TraceBlockKind, string> = {
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
  const [view, dispatchView] = useReducer(traceViewReducer, undefined, initialTraceViewState)
  // Bumped by the refresh button; the follow effect re-runs (unfollow +
  // refollow) and keeps the old payload on screen until the fresh one lands.
  const [reloadToken, setReloadToken] = useState(0)

  // Live follow (ticket 37): snapshot + tail registration in one request —
  // the FollowView convention. The tail stops when the tab unmounts (stop
  // conditions per FollowView: the view going away ends the follow). A tab
  // instance's file never changes (tab identity = file), but the effect
  // stays honest about its dependencies.
  useEffect(() => {
    let cancelled = false
    void window.picode.sessions.traceFollow(sessionFile).then((result) => {
      if (cancelled) return
      if (result === null) setStatus('error')
      else {
        setPayload(result)
        setStatus('ready')
      }
    })
    return () => {
      cancelled = true
      window.picode.sessions.untraceFollow(sessionFile)
    }
  }, [sessionFile, reloadToken])

  // Growth pushes (ticket 37): the host re-derived the payload after the
  // file changed size. Only THIS tab's file is consumed — several trace
  // tabs (or windows) can tail different files at once.
  useEffect(() => {
    return window.picode.sessions.onTraceUpdate((pushed) => {
      if (pushed.file !== sessionFile) return
      setPayload(pushed)
      setStatus('ready')
    })
  }, [sessionFile])

  // Search projection: document-order matches over the visible blocks, the
  // clamped current index, and the active block key that drives both the
  // highlight and the scroll-into-view.
  const matches = payload === null ? [] : traceMatches(payload.calls, view.visible, view.query)
  const clampedIndex = matches.length === 0 ? 0 : Math.min(view.matchIndex, matches.length - 1)
  const activeKey = view.searchOpen && matches.length > 0 ? matches[clampedIndex]!.key : null

  // Hit location (命中滚动定位): when navigation moves the active match,
  // bring its block into the center of the list viewport.
  useEffect(() => {
    if (activeKey === null) return
    document
      .querySelector(`[data-trace-block="${CSS.escape(activeKey)}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeKey])

  const onToggleBlock = useCallback((key: string): void => {
    dispatchView({ type: 'toggle-block', key })
  }, [])

  const collapseAll = useCallback((): void => {
    if (payload === null) return
    dispatchView({ type: 'collapse-all', keys: traceAllBlockKeys(payload.calls) })
  }, [payload])
  const expandAll = useCallback((): void => {
    dispatchView({ type: 'expand-all' })
  }, [])

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
  const searchOpen = view.searchOpen
  return (
    <div className="trace-view">
      <TraceHeader
        title={payload.title}
        stats={stats}
        onRefresh={() => setReloadToken((t) => t + 1)}
        onClose={onClose}
        sessionFile={sessionFile}
        view={view}
        onToggleSearch={() => dispatchView({ type: searchOpen ? 'close-search' : 'open-search' })}
        onToggleKind={(kind) => dispatchView({ type: 'toggle-kind', kind })}
        onCollapseAll={collapseAll}
        onExpandAll={expandAll}
      />
      {searchOpen && (
        <TraceSearchBar
          query={view.query}
          count={formatMatchCount(clampedIndex, matches.length)}
          onQuery={(query) => dispatchView({ type: 'set-query', query })}
          onNext={() => dispatchView({ type: 'next-match', total: matches.length })}
          onPrev={() => dispatchView({ type: 'prev-match', total: matches.length })}
          onClose={() => dispatchView({ type: 'close-search' })}
        />
      )}
      {payload.calls.length === 0 ? (
        <div className="review-empty">
          <HistoryIcon size={28} />
          <p className="review-empty-title">No model calls</p>
          <p className="review-empty-hint">This session file does not record any assistant messages yet.</p>
        </div>
      ) : (
        <div className="trace-list">
          {payload.calls.map((call) => (
            <TraceCallRow
              key={call.messageId}
              call={call}
              visible={view.visible}
              collapsedKeys={view.collapsed}
              activeKey={activeKey}
              onToggleBlock={onToggleBlock}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- header -----------------------------------------------------------------

function TraceHeader(props: {
  title: string
  stats: TraceStats | null
  onRefresh: () => void
  onClose: () => void
  sessionFile?: string
  /** Present only when the tab is interactive (payload on screen) — the
   * three ticket-37 buttons render from this slice of the view state. */
  view?: {
    searchOpen: boolean
    visible: TraceKindVisibility
    collapsed: ReadonlySet<string>
  }
  onToggleSearch?: () => void
  onToggleKind?: (kind: TraceBlockKind) => void
  onCollapseAll?: () => void
  onExpandAll?: () => void
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
        {props.view !== undefined && props.onToggleSearch !== undefined && (
          <Tooltip label="Search trace">
            <button
              type="button"
              className={`tb-btn${props.view.searchOpen ? ' tb-btn-active' : ''}`}
              aria-label="Search trace"
              aria-pressed={props.view.searchOpen}
              onClick={props.onToggleSearch}
            >
              <SearchIcon size={15} />
            </button>
          </Tooltip>
        )}
        {props.onToggleKind !== undefined && props.view !== undefined && (
          <TraceKindMenu visible={props.view.visible} onToggle={props.onToggleKind} />
        )}
        {props.onCollapseAll !== undefined && props.onExpandAll !== undefined && props.view !== undefined && (
          <Tooltip label={props.view.collapsed.size > 0 ? 'Expand all blocks' : 'Collapse all blocks'}>
            <button
              type="button"
              className="tb-btn"
              aria-label={props.view.collapsed.size > 0 ? 'Expand all blocks' : 'Collapse all blocks'}
              onClick={props.view.collapsed.size > 0 ? props.onExpandAll : props.onCollapseAll}
            >
              {props.view.collapsed.size > 0 ? <UnfoldIcon size={15} /> : <FoldIcon size={15} />}
            </button>
          </Tooltip>
        )}
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

// ---- search bar (z-trace-search.png) -----------------------------------------

function TraceSearchBar(props: {
  query: string
  count: string
  onQuery: (query: string) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  // Focus on mount (opening via the header button must land the caret in
  // the input without an extra click).
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  return (
    <div className="trace-search">
      <SearchIcon size={13} className="trace-search-glyph" />
      <input
        ref={inputRef}
        className="trace-search-input"
        type="text"
        placeholder="Search call trace content…"
        value={props.query}
        onChange={(event) => props.onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (event.shiftKey) props.onPrev()
            else props.onNext()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            props.onClose()
          }
        }}
        aria-label="Search call trace content"
      />
      <span className="trace-search-count">{props.count}</span>
      <Tooltip label="Previous match">
        <button type="button" className="tb-btn" aria-label="Previous match" onClick={props.onPrev}>
          <ArrowUpIcon size={13} />
        </button>
      </Tooltip>
      <Tooltip label="Next match">
        <button type="button" className="tb-btn" aria-label="Next match" onClick={props.onNext}>
          <ArrowDownIcon size={13} />
        </button>
      </Tooltip>
      <Tooltip label="Close search">
        <button type="button" className="tb-btn" aria-label="Close search" onClick={props.onClose}>
          <CloseIcon size={13} />
        </button>
      </Tooltip>
    </div>
  )
}

// ---- block-kind toggle popover (z-trace-block-toggles.png) -------------------

/** The sliders button + six-kind toggle panel. The panel wraps its own
 * anchor (outside mouse-down closes; a click on the anchor toggles through
 * the same contained subtree — PanelTabMenu's close-then-reopen guard). */
function TraceKindMenu({ visible, onToggle }: { visible: TraceKindVisibility; onToggle: (kind: TraceBlockKind) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(event: MouseEvent): void {
      if (rootRef.current instanceof Element && rootRef.current.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !event.defaultPrevented) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="trace-kind-menu-root" ref={rootRef}>
      <Tooltip label="Block types">
        <button
          type="button"
          className={`tb-btn${open ? ' tb-btn-active' : ''}`}
          aria-label="Block types"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <SlidersIcon size={15} />
        </button>
      </Tooltip>
      {open && (
        <div className="trace-kind-menu" role="group" aria-label="Block type visibility">
          {TRACE_BLOCK_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              role="switch"
              aria-checked={visible[kind]}
              className="trace-kind-row"
              onClick={() => onToggle(kind)}
            >
              <span className={`trace-kind trace-kind-${kind}`}>{BLOCK_KIND_LABELS[kind]}</span>
              <span className="trace-kind-switch" aria-hidden="true" data-on={visible[kind] ? 'true' : 'false'} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function leafOf(path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '')
  return segments[segments.length - 1] ?? path
}

// ---- call entries -----------------------------------------------------------

/** One model call, memoized: a payload refresh swaps identities wholesale,
 * while header/parent re-renders must not re-walk every entry (ticket 30).
 * Rendering projects the shared view state: kind visibility filters the
 * sections, the collapsed set folds blocks to one line, the active search
 * match highlights. Positional block indices are ORIGINAL indices — hiding
 * a kind must never renumber the remaining blocks (state would scramble). */
const TraceCallRow = memo(function TraceCallRow({
  call,
  visible,
  collapsedKeys,
  activeKey,
  onToggleBlock
}: {
  call: TraceCall
  visible: TraceKindVisibility
  collapsedKeys: ReadonlySet<string>
  activeKey: string | null
  onToggleBlock: (key: string) => void
}): JSX.Element {
  const statusLabel = call.stopReason !== null ? (STOP_REASON_LABELS[call.stopReason] ?? null) : null
  const time = formatTraceTimestamp(call.timestamp)
  const input = call.inputBlocks.map((block, index) => ({ block, index })).filter(({ block }) => visible[block.kind])
  const output = call.outputBlocks.map((block, index) => ({ block, index })).filter(({ block }) => visible[block.kind])
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
      {input.length > 0 && (
        <TraceSection messageId={call.messageId} section="input" label="Input" entries={input} collapsedKeys={collapsedKeys} activeKey={activeKey} onToggleBlock={onToggleBlock} />
      )}
      {output.length > 0 && (
        <TraceSection messageId={call.messageId} section="output" label="Output" entries={output} collapsedKeys={collapsedKeys} activeKey={activeKey} onToggleBlock={onToggleBlock} />
      )}
    </div>
  )
})

function TraceSection({
  messageId,
  section,
  label,
  entries,
  collapsedKeys,
  activeKey,
  onToggleBlock
}: {
  messageId: string
  section: TraceSectionId
  label: string
  entries: Array<{ block: TraceBlock; index: number }>
  collapsedKeys: ReadonlySet<string>
  activeKey: string | null
  onToggleBlock: (key: string) => void
}): JSX.Element {
  return (
    <div className="trace-section">
      <div className="trace-section-label">{label}</div>
      <div className="trace-section-blocks">
        {entries.map(({ block, index }) => {
          const key = traceBlockKey(messageId, section, index)
          return (
            <TraceBlockRow
              key={key}
              blockKey={key}
              block={block}
              collapsed={collapsedKeys.has(key)}
              active={activeKey === key}
              onToggle={onToggleBlock}
            />
          )
        })}
      </div>
    </div>
  )
}

/** One block, memoized: a search navigation re-renders only the two blocks
 * whose active flag flipped; a collapse re-renders through one prop change.
 * In-place truncation (Show more/less) is this component's LOCAL state —
 * ticket 36 semantics, untouched by view-state changes. */
const TraceBlockRow = memo(function TraceBlockRow({
  blockKey,
  block,
  collapsed,
  active,
  onToggle
}: {
  blockKey: string
  block: TraceBlock
  collapsed: boolean
  active: boolean
  onToggle: (key: string) => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const text = traceBlockText(block)
  const long = text.length > TRACE_BLOCK_PREVIEW_CHARS
  const shown = !collapsed && long && !expanded ? `${text.slice(0, TRACE_BLOCK_PREVIEW_CHARS)}…` : text
  const isTool = block.kind === 'tool-call' || block.kind === 'tool-result'
  const className = [
    'trace-block',
    `trace-block-${block.kind}`,
    collapsed ? 'trace-block-collapsed' : '',
    active ? 'trace-block-active' : ''
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={className} data-trace-block={blockKey}>
      <button
        type="button"
        className="trace-block-head"
        aria-expanded={!collapsed}
        aria-label={collapsed ? `Expand ${BLOCK_KIND_LABELS[block.kind]} block` : `Collapse ${BLOCK_KIND_LABELS[block.kind]} block`}
        onClick={() => onToggle(blockKey)}
      >
        <span className={`trace-kind trace-kind-${block.kind}`}>{BLOCK_KIND_LABELS[block.kind]}</span>
        {isTool && (
          <>
            <span className="trace-chip">{block.toolName || 'tool'}</span>
            <span className="trace-chip trace-chip-id" title={block.callId}>
              {block.callId}
            </span>
          </>
        )}
        <ChevronDownIcon size={12} className="trace-block-chevron" />
      </button>
      {text !== '' && <div className="trace-block-text">{shown}</div>}
      {long && !collapsed && (
        <div className="trace-block-foot">
          <button type="button" className="trace-block-expand" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </div>
      )}
    </div>
  )
})
