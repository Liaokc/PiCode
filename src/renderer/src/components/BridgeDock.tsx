import { useEffect, useRef, type Dispatch, type JSX, type PointerEvent } from 'react'
import type { BridgeDockAction } from '../../../shared/bridge-dock-model'
import type { BridgeFeedEntry, BridgeFeedState } from '../../../shared/bridge/feed'
import { CloseIcon } from './icons'
import Tooltip from './Tooltip'

/**
 * Bridge Dock (ticket 18 feedback) — the Agent Bridge's own bottom dock,
 * independent of the terminal dock (⌘B / titlebar pulse toggle). Renders the
 * agent's bash commands as a feed of cards: status mark, sanitized command,
 * live output beneath. WRITE-ONLY by construction — every byte on screen is
 * a pure projection of Seam-1 contract events folded at the App level
 * (shared/bridge/feed.ts); there is no input path into any pty (ADR-0004).
 *
 * The dock is always mounted and hidden with display:none — the feed state
 * lives in the App shell, so hiding the panel or visiting settings never
 * loses projection history.
 */

interface BridgeDockProps {
  /** Panel visibility (⌘B / titlebar toggle); false hides but keeps folding. */
  open: boolean
  /** Panel height in px (drag handle dispatches set-bridge-height). */
  height: number
  /** Probe-resolved mono/Nerd-Font stack for command + output text. */
  fontStack: string
  feed: BridgeFeedState
  dispatch: Dispatch<BridgeDockAction>
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

export default function BridgeDock({ open, height, fontStack, feed, dispatch }: BridgeDockProps): JSX.Element {
  const drag = useRef<{ startY: number; startHeight: number } | null>(null)
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

  function startResize(event: PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    drag.current = { startY: event.clientY, startHeight: height }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveResize(event: PointerEvent<HTMLDivElement>): void {
    if (!drag.current) return
    dispatch({ type: 'set-bridge-height', height: drag.current.startHeight + (drag.current.startY - event.clientY) })
  }

  function endResize(event: PointerEvent<HTMLDivElement>): void {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const running = feed.entries.some((entry) => entry.status === 'running')

  return (
    <section className="terminal-dock bridge-dock" aria-label="Agent Bridge" style={{ height, display: open ? undefined : 'none' }}>
      <div
        className="terminal-dock-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize agent bridge panel"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onDoubleClick={() => dispatch({ type: 'reset-bridge-height' })}
      />

      <header className="terminal-dock-header">
        <span className="terminal-dock-title">Agent Bridge</span>
        <span className="bridge-status">
          <span className={`bridge-dot${running ? ' bridge-dot-running' : ''}`} />
          {running ? 'Agent running' : 'Idle'}
        </span>
        <span className="terminal-dock-actions">
          <Tooltip label="Hide agent bridge">
            <button
              type="button"
              className="tb-btn"
              aria-label="Hide agent bridge"
              onClick={() => dispatch({ type: 'hide-bridge-dock' })}
            >
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
              <article key={entry.toolCallId} className={`bridge-entry bridge-entry-${entry.status}`}>
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
    </section>
  )
}
