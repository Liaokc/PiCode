import { useEffect, useRef, useState, type JSX } from 'react'
import { CheckIcon, CopyIcon, GitBranchIcon, PencilIcon } from './icons'

interface MessageActionsProps {
  text: string
  /** Entry id — the fork anchor. Fork is offered only when both are present. */
  entryId?: string
  /** Fork the session at this entry (host swaps to the new session in place). */
  onFork?: (entryId: string) => void
  /** 编辑重发 (ticket 79): edit & resend this message. User rows only — the
   * click prefills the composer with the message's original text + images
   * and moves the leaf to the message's parent (in-place branch on send).
   * Absent while the agent runs (agentRunning hides the affordance; the
   * agent_end settle brings it back) and on assistant rows. */
  onEdit?: () => void
  /** Timestamp after the buttons. The assistant row stamps one (screenshot
   * 04); the user bubble's row (ticket 44) is Copy-only and opts out. */
  showTime?: boolean
}

/**
 * Per-message action row (screenshot 04: copy control + timestamp under the
 * assistant reply; ticket 16 adds the fork affordance). The copy acts on the
 * message's plain text; fork branches a new session at this entry and the
 * host re-announces it, dropping the user straight into the branched session.
 * The timestamp is stamped once on mount — the contract stream carries no
 * clock, and the reducer stays time-free.
 */
export default function MessageActions({ text, entryId, onFork, onEdit, showTime = true }: MessageActionsProps): JSX.Element {
  const [copied, setCopied] = useState(false)
  const [time, setTime] = useState('')
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Async stamp: keep the effect itself side-effect-free (purity lint).
    // The user row (ticket 44) opts out of the timestamp entirely — but the
    // cleanup is registered either way so the copied-feedback timer can never
    // outlive the row.
    const stamp = showTime
      ? setTimeout(() => {
          const d = new Date()
          setTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
        }, 0)
      : null
    return () => {
      if (stamp !== null) clearTimeout(stamp)
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
    }
  }, [showTime])

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable — leave the row as-is.
    }
  }

  return (
    <div className="msg-actions">
      <button type="button" className="msg-action-btn" onClick={() => void handleCopy()} aria-label="Copy message">
        {copied ? <CheckIcon size={13} className="msg-action-copied" /> : <CopyIcon size={13} />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
      {onEdit !== undefined && (
        /* Self-labeled like Copy — a visible text label takes no tooltip
          (R3 disposition). AFTER Copy so the ticket-44 stage's first-button
          click stays the copy. */
        <button
          type="button"
          className="msg-action-btn"
          aria-label="Edit and resend this message"
          onClick={onEdit}
        >
          <PencilIcon size={13} />
          <span>Edit</span>
        </button>
      )}
      {entryId !== undefined && onFork !== undefined && (
        /* Self-labeled like Copy — per the tooltip disposition rules (R3) a
          visible text label takes no tooltip. */
        <button
          type="button"
          className="msg-action-btn"
          aria-label="Fork a new session from this message"
          onClick={() => onFork(entryId)}
        >
          <GitBranchIcon size={13} />
          <span>Fork</span>
        </button>
      )}
      {showTime && time !== '' && <span className="msg-actions-time">{time}</span>}
    </div>
  )
}
