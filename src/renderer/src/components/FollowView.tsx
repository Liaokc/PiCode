import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { replayEntry } from '../../../shared/chat-reducer'
import { groupTurns } from '../../../shared/turn-collapse'
import type { TranscriptItem } from '../../../shared/sessions/types'
import TurnContainer from './TurnContainer'
import TurnFileBar from './TurnFileBar'
import AnswerBlock from './AnswerBlock'
import UserBubble from './UserBubble'

interface FollowViewProps {
  title: string
  items: TranscriptItem[]
  /** True while the source file is still growing (TUI actively writing). */
  live: boolean
  onStop: () => void
  /** Take over the quiet session (ticket 24): re-checks liveness at click
   * time — a still-running session is rejected with a toast, a quiet one
   * resumes through the existing Handoff chain. */
  onOpen: () => void
}

/**
 * Live Follow (read-only): streams the transcript of a session that is
 * running in another window (typically the pi TUI). This view has NO
 * composer — Live Follow is strictly zero-write on the PiCode side.
 *
 * Items arrive as the ticket-14 structured payload and map onto the same
 * entry shapes the live stream builds (replayEntry), then render through the
 * SAME turn architecture as the chat view (ticket 23): per-turn fold
 * containers + answer blocks. Since every followed turn is settled, all
 * containers start collapsed and expand locally — expansion never leaves
 * this view (no chat state, no writes). The fork affordance is omitted:
 * forking runs through the ACTIVE session's host, which a follow has none
 * of. Once the watched session goes quiet (>120s without a write), Open
 * appears as the way out: clicking it promotes the follow into a full
 * session (ticket 24) or is rejected when the other end woke up again in
 * the meantime.
 */
export default function FollowView({ title, items, live, onStop, onOpen }: FollowViewProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const entries = useMemo(() => items.map(replayEntry), [items])
  const turns = useMemo(() => groupTurns(entries, false), [entries])
  /** Follow-local fold state (UI-only; the chat reducer owns the live view's). */
  const [openTurns, setOpenTurns] = useState<ReadonlySet<string>>(new Set())
  /** Follow-local thinking-row expansion (ticket 129: the row is controlled;
   * a read-only follow has no registry session, so the set lives here —
   * view-scoped, like the fold state above). */
  const [openThinking, setOpenThinking] = useState<ReadonlySet<string>>(new Set())

  // Keep the newest content in view as the other side streams.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [items])

  function toggleTurn(turnId: string): void {
    setOpenTurns((prev) => {
      const next = new Set(prev)
      if (next.has(turnId)) next.delete(turnId)
      else next.add(turnId)
      return next
    })
  }

  function toggleThinking(key: string): void {
    setOpenThinking((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="chat-view">
      <div className="chat-topbar">
        <span className="chat-topbar-title" title={title}>
          {title}
        </span>
        <span className={live ? 'follow-badge follow-badge-live' : 'follow-badge'}>
          <span className="sb-live-dot" aria-hidden="true" />
          {live ? 'Live · read-only' : 'Read-only'}
        </span>
        {!live && (
          <button type="button" className="chat-topbar-btn follow-open-btn" onClick={onOpen}>
            Open
          </button>
        )}
        <button type="button" className="chat-topbar-btn" onClick={onStop}>
          Stop following
        </button>
      </div>
      <div ref={scrollRef} className="chat-scroll">
        <div className="chat-thread">
          {turns.length === 0 && <div className="follow-empty">Waiting for activity in this session…</div>}
          {turns.map((turn) => (
            <div key={turn.id}>
              {turn.user !== null && (
                /* Ticket 97: the same composite bubble as the chat view —
                   replayed entries project their image parts (ticket 79), so
                   the skill segment and the thumbnail strip render here too. */
                <UserBubble entry={turn.user} />
              )}
              {turn.hasContainer && (
                /* Ticket 55: same projection as the chat view, zero switches
                  — replayed pure-text turns own their "Worked" row too. */
                <TurnContainer
                  turn={turn}
                  open={openTurns.has(turn.id)}
                  onToggle={() => toggleTurn(turn.id)}
                  expandedThinking={openThinking}
                  onToggleThinking={toggleThinking}
                  /* Ticket 94: same deterministic fold-anchor rule as the
                     chat view — the follow scroller feeds the same hook. */
                  scrollRef={scrollRef}
                />
              )}
              {turn.answer !== null && (
                <AnswerBlock
                  turn={turn}
                  expandedThinking={openThinking}
                  onToggleThinking={toggleThinking}
                />
              )}
              {turn.fileChanges.length > 0 && (
                /* Ticket 78: the same bar projection as the chat view, counts
                   only — a read-only follow has neither the turn-diff panel
                   path nor a workspace to deep-link previews against.
                   Ticket 92: follow projects every turn settled
                   (groupTurns(entries, false)), so the settled-only bar rule
                   applies through the same model gate, unchanged. */
                <TurnFileBar turnId={turn.id} changes={turn.fileChanges} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
