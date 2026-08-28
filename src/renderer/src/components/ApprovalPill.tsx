import { useState, type JSX } from 'react'
import type { ApprovalEntry } from '../../../shared/chat-reducer'
import { CloseIcon, ShieldCheckIcon } from './icons'

/**
 * The inline approval pill (user story 15 / screenshot 08): the gate asks
 * before a tool call runs. Approve, Approve-and-remember (same tool skips the
 * ask for this Access Mode tier), or Deny with a reason fed back to the agent.
 */
export default function ApprovalPill({
  entry,
  onApprove,
  onDeny
}: {
  entry: ApprovalEntry
  onApprove: (toolCallId: string, remember: boolean) => void
  onDeny: (toolCallId: string, reason: string) => void
}): JSX.Element {
  const [denying, setDenying] = useState(false)
  const [reason, setReason] = useState('')

  if (entry.state === 'approved') {
    return (
      <div className="approval-pill approval-pill-approved" data-tool={entry.toolName}>
        <span className="approval-pill-head">
          <ShieldCheckIcon size={14} />
          <span className="approval-pill-title">
            {entry.toolName} <span className="approval-pill-verb">approved</span>
          </span>
        </span>
      </div>
    )
  }

  if (entry.state === 'denied') {
    return (
      <div className="approval-pill approval-pill-denied" data-tool={entry.toolName}>
        <span className="approval-pill-head">
          <CloseIcon size={13} />
          <span className="approval-pill-title">
            {entry.toolName} <span className="approval-pill-verb">denied</span>
          </span>
        </span>
        {entry.reason !== null && <div className="approval-pill-reason">{entry.reason}</div>}
      </div>
    )
  }

  function submitDeny(): void {
    const trimmed = reason.trim()
    if (trimmed === '') return
    onDeny(entry.id, trimmed)
    setDenying(false)
  }

  return (
    <div className="approval-pill approval-pill-pending" data-tool={entry.toolName}>
      <div className="approval-pill-head">
        <ShieldCheckIcon size={14} />
        <span className="approval-pill-title">
          Approve <code className="approval-pill-tool">{entry.toolName}</code>?
        </span>
        <ArgsPreview args={entry.args} />
      </div>
      {denying ? (
        <div className="approval-pill-deny">
          <input
            className="approval-pill-reason-input"
            placeholder="Why refuse? (sent back to the agent)"
            value={reason}
            autoFocus
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitDeny()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setDenying(false)
              }
            }}
          />
          <button type="button" className="approval-btn approval-btn-danger" disabled={reason.trim() === ''} onClick={submitDeny}>
            Deny
          </button>
          <button type="button" className="approval-btn" onClick={() => setDenying(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="approval-pill-actions">
          <button type="button" className="approval-btn approval-btn-primary" onClick={() => onApprove(entry.id, false)}>
            Approve
          </button>
          <button type="button" className="approval-btn" onClick={() => onApprove(entry.id, true)}>
            Approve &amp; Remember
          </button>
          <button type="button" className="approval-btn approval-btn-danger" onClick={() => setDenying(true)}>
            Deny…
          </button>
        </div>
      )}
    </div>
  )
}

/** One-line summary of the tool arguments awaiting approval. */
function ArgsPreview({ args }: { args: Record<string, unknown> }): JSX.Element | null {
  const parts = Object.entries(args)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? truncate(value, 60) : truncate(JSON.stringify(value), 60)}`)
  if (parts.length === 0) return null
  return <span className="approval-pill-args">{parts.join(' · ')}</span>
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}
