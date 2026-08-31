import type { JSX } from 'react'
import type { ChatQueue } from '../../../shared/chat-reducer'
import { CloseIcon } from './icons'

/**
 * The queue panel (user story 21): pending Steer / Follow-up messages while
 * the agent runs, cleared through the host's clear_queue. SDK queue state is
 * authoritative — the panel is a pure view of it.
 */
export default function QueuePanel({ queue, onClear }: { queue: ChatQueue; onClear: () => void }): JSX.Element | null {
  const count = queue.steering.length + queue.followUp.length
  if (count === 0) return null
  return (
    <div className="queue-panel" aria-label="Queued messages">
      <div className="queue-panel-items">
        {queue.steering.map((text, i) => (
          <div key={`s${i}`} className="queue-item queue-item-steer">
            <span className="queue-item-tag">Steer</span>
            <span className="queue-item-text">{text}</span>
          </div>
        ))}
        {queue.followUp.map((text, i) => (
          <div key={`f${i}`} className="queue-item queue-item-followup">
            <span className="queue-item-tag">Follow-up</span>
            <span className="queue-item-text">{text}</span>
          </div>
        ))}
      </div>
      <button type="button" className="queue-panel-clear" onClick={onClear} aria-label="Clear queued messages">
        <CloseIcon size={11} />
        Clear
      </button>
    </div>
  )
}
