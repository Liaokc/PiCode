import { useEffect, useRef, type Dispatch, type JSX } from 'react'
import type { DockAction } from '../../../shared/dock-model'
import type { BridgeFeedEntry, BridgeFeedState } from '../../../shared/bridge/feed'
import { CloseIcon } from './icons'
import Tooltip from './Tooltip'

/**
 * Bridge panel (ticket 18 feedback): the Agent Bridge's card feed inside
 * the shared bottom dock frame (BottomDock.tsx) — a SIBLING of the terminal
 * panel, shown in the same position (⌘B swaps it in; the tool-card chip in
 * the transcript deep-links here). Renders the agent's bash commands as
 * cards: status mark, sanitized command, live output beneath. WRITE-ONLY by
 * construction — every byte on screen is a pure projection of Seam-1
 * contract events folded at the App level (shared/bridge/feed.ts); there is
 * no input path into any pty (ADR-0004).
 *
 * The panel is always mounted (display toggled by the frame) and the feed
 * state lives in the App shell, so hiding the dock or visiting settings
 * never loses projection history.
 */

interface BridgeDockProps {
  feed: BridgeFeedState
  /** Probe-resolved mono/Nerd-Font stack for command + output text. */
  fontStack: string
  /** Tool-call id to scroll to + flash (tool-card deep link); null = none. */
  highlight: string | null
  /** Clears the highlight once the feed has flashed it. */
  onHighlightDone: () => void
  dispatch: Dispatch<DockAction>
}

const MAX_RENDERED_LINES = 200

/** Last `max` lines of an output blob, with the earlier-lines count. */
function clampLines(output: string, max = MAX_RENDERED_LINES): { lines: string[]; omitted: number } {
  const lines = output.length === 0 ? [] : output.replace(/\n$/, '').split('\n')
  if (lines.length <= max) return { lines, omitted: 0 }
  return { lines: lines.slice(lines.length - max), omitted: lines.length - max }
}

function statusMark(status: BridgeFeedEntry['status']): { text: string; className: string } {
  switch (status) {
    case 'running':
      return { text: '●', className: 'bridge-entry-mark-running' }
    case 'done':
      return { text: '✓', className: 'bridge-entry-mark-done' }
    case 'failed':
      return { text: '✗', className: 'bridge-entry-mark-failed' }
    case 'interrupted':
      return { text: '·', className: 'bridge-entry-mark-interrupted' }
  }
}

export default function BridgeDock({ feed, fontStack, highlight, onHighlightDone, dispatch }: BridgeDockProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  /** Stick to the live tail unless the user scrolled up to read history. */
  const stickToTail = useRef(true)

  // The feed only ever appends/settles — re-stick on every fold while the
  // user hasn't scrolled away.
  useEffect(() => {
    const el = scrollRef.current
    if (el !== null && stickToTail.current) el.scrollTop = el.scrollHeight
  }, [feed])

  function onScroll(): void {
    const el = scrollRef.current
    if (el === null) return
    stickToTail.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  // Deep link (tool-card chip): scroll the requested command into view and
  // flash it; a missing id (session switched) is a silent no-op.
  useEffect(() => {
    if (highlight === null) return
    const el = scrollRef.current?.querySelector(`[data-tool-call-id="${highlight}"]`)
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'center' })
      el.classList.add('bridge-entry-flash')
      const timer = window.setTimeout(() => el.classList.remove('bridge-entry-flash'), 1800)
      onHighlightDone()
      return () => window.clearTimeout(timer)
    }
    onHighlightDone()
  }, [highlight, onHighlightDone])

  const running = feed.entries.some((entry) => entry.status === 'running')

  return (
    <>
      <header className="terminal-dock-header">
        <span className="terminal-dock-title">Agent Bridge</span>
        <span className="bridge-status">
          <span className={`bridge-dot${running ? ' bridge-dot-running' : ''}`} />
          {running ? 'Agent running' : 'Idle'}
        </span>
        <span className="terminal-dock-actions">
          <Tooltip label="Hide panel">
            <button type="button" className="tb-btn" aria-label="Hide panel" onClick={() => dispatch({ type: 'hide-dock' })}>
              <CloseIcon size={13} />
            </button>
          </Tooltip>
        </span>
      </header>

      <div className="bridge-feed" ref={scrollRef} onScroll={onScroll}>
        {feed.entries.length === 0 ? (
          <div className="bridge-empty">
            <p className="bridge-empty-title">No agent commands yet</p>
            <p className="bridge-empty-hint">
              Bash commands the agent runs — and their live output — stream here. Read-only: this feed never accepts
              input.
            </p>
          </div>
        ) : (
          feed.entries.map((entry) => {
            const mark = statusMark(entry.status)
            const { lines, omitted } = clampLines(entry.output)
            return (
              <article key={entry.toolCallId} data-tool-call-id={entry.toolCallId} className={`bridge-entry bridge-entry-${entry.status}`}>
                <div className="bridge-entry-head">
                  <span className={`bridge-entry-mark ${mark.className}`}>{mark.text}</span>
                  <span className="bridge-entry-cmd" style={{ fontFamily: fontStack }}>
                    {entry.command}
                  </span>
                  {entry.status === 'running' && <span className="bridge-entry-live">running…</span>}
                </div>
                {(omitted > 0 || lines.length > 0) && (
                  <pre className="bridge-entry-output" style={{ fontFamily: fontStack }}>
                    {omitted > 0 && <span className="bridge-output-omitted">… {omitted} earlier lines{'\n'}</span>}
                    {lines.join('\n')}
                  </pre>
                )}
              </article>
            )
          })
        )}
      </div>
    </>
  )
}
