import { useState, type JSX } from 'react'
import type { ThinkingPart } from '../../../shared/chat-reducer'
import { deriveThinkingDuration } from '../../../shared/thinking-duration'
import { useElapsedClock } from './use-elapsed-seconds'
import { ChevronDownIcon, ChevronRightIcon, SparklesIcon } from './icons'

/**
 * Collapsed thinking row (screenshot 01: "思考过程 · 持续了 29 秒"): one muted
 * row with the elapsed seconds; expanding reveals the flat reasoning text.
 *
 * Ticket 61: while the block streams, the seconds derive from the ENTRY-LEVEL
 * start timestamp in reducer state ((now − startedAt)) — folding the
 * container unmounts this row, and reopening continues from the same
 * timestamp instead of restarting. Once closed, the host-measured duration
 * from the contract freezes the label (freeze priority); a stamp-less part
 * falls back to the local tick clock (pre-61 behavior).
 *
 * The chevron speaks the Worked-container fold language (ticket 61): right
 * when collapsed, down when expanded — same swap as TurnContainer, live
 * Thinking and settled Thought alike.
 */
export default function ThinkingRow({ part }: { part: ThinkingPart }): JSX.Element {
  const [open, setOpen] = useState(false)
  const clock = useElapsedClock(part.streaming)
  const { timed, seconds } = deriveThinkingDuration(part, clock.nowMs, clock.tickSeconds)
  // Duration degrades gracefully (ticket 14): a block that never closed
  // cleanly — and every replayed block, whose duration the session file does
  // not record — renders without the ticking seconds, frozen as a plain row.
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
        {!empty &&
          (open ? (
            <ChevronDownIcon size={13} className="row-chevron" />
          ) : (
            <ChevronRightIcon size={13} className="row-chevron" />
          ))}
      </button>
      {open && !empty && <div className="thinking-row-body">{part.text}</div>}
    </div>
  )
}
