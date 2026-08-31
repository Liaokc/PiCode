import { useState, type JSX } from 'react'
import type { ThinkingPart } from '../../../shared/chat-reducer'
import { useElapsedSeconds } from './use-elapsed-seconds'
import { ChevronDownIcon, SparklesIcon } from './icons'

/**
 * Collapsed thinking row (screenshot 01: "思考过程 · 持续了 29 秒"): one muted
 * row with the elapsed seconds; expanding reveals the flat reasoning text.
 * While the block streams, seconds tick locally; once closed the host-measured
 * duration from the contract freezes the label.
 */
export default function ThinkingRow({ part }: { part: ThinkingPart }): JSX.Element {
  const [open, setOpen] = useState(false)
  const tickSeconds = useElapsedSeconds(part.streaming)

  const seconds =
    part.streaming || part.durationMs === null ? Math.max(tickSeconds, 1) : Math.max(1, Math.round(part.durationMs / 1000))
  // Duration degrades gracefully (ticket 14): a block that never closed
  // cleanly — and every replayed block, whose duration the session file does
  // not record — renders without the ticking seconds, frozen as a plain row.
  const timed = part.streaming || part.durationMs !== null
  const empty = part.text.trim() === ''

  return (
    <div className={`thinking-row${open ? ' thinking-row-open' : ''}`}>
      <button
        type="button"
        className="thinking-row-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={empty ? 'Thinking (no reasoning text)' : undefined}
        disabled={empty}
      >
        <SparklesIcon size={13} className="thinking-row-icon" />
        <span className="thinking-row-label">{part.streaming ? 'Thinking' : 'Thought'}</span>
        {timed && (
          <>
            <span className="thinking-row-sep">·</span>
            <span className="thinking-row-duration">{seconds}s</span>
          </>
        )}
        {!empty && <ChevronDownIcon size={13} className="row-chevron" />}
      </button>
      {open && !empty && <div className="thinking-row-body">{part.text}</div>}
    </div>
  )
}
