import type { JSX } from 'react'
import type { ChatQueue } from '../../../shared/chat-reducer'
import type { QueueKind } from '../../../shared/queue-mirror'
import { CloseIcon, PencilIcon } from './icons'

/**
 * The queue panel (user story 21): pending Steer / Follow-up messages while
 * the agent runs, cleared through the host's clear_queue. SDK queue state is
 * authoritative — the panel is a pure view of it.
 *
 * Ticket 100 (队列面板修缮): every row also carries the inline actions —
 * Edit (the host's edit_queue_entry dance removes the entry and the composer
 * is prefilled with its original text + images) and × (remove_queue_entry,
 * no prefill). The global Clear stays.
 */
export default function QueuePanel({
  queue,
  onClear,
  onEdit,
  onRemove
}: {
  queue: ChatQueue
  onClear: () => void
  onEdit: (kind: QueueKind, index: number) => void
  onRemove: (kind: QueueKind, index: number) => void
}): JSX.Element | null {
  const count = queue.steering.length + queue.followUp.length
  if (count === 0) return null
  return (
    <div className="queue-panel" aria-label="Queued messages">
      <div className="queue-panel-items">
        {queue.steering.map((text, i) => (
          <QueueRow key={`s${i}`} kind="steering" index={i} text={text} onEdit={onEdit} onRemove={onRemove} />
        ))}
        {queue.followUp.map((text, i) => (
          <QueueRow key={`f${i}`} kind="followUp" index={i} text={text} onEdit={onEdit} onRemove={onRemove} />
        ))}
      </div>
      <button type="button" className="queue-panel-clear" onClick={onClear} aria-label="Clear queued messages">
        <CloseIcon size={11} />
        Clear
      </button>
    </div>
  )
}

function QueueRow({
  kind,
  index,
  text,
  onEdit,
  onRemove
}: {
  kind: QueueKind
  index: number
  text: string
  onEdit: (kind: QueueKind, index: number) => void
  onRemove: (kind: QueueKind, index: number) => void
}): JSX.Element {
  return (
    <div className={`queue-item queue-item-${kind === 'steering' ? 'steer' : 'followup'}`}>
      <span className="queue-item-tag">{kind === 'steering' ? 'Steer' : 'Follow-up'}</span>
      <span className="queue-item-text">{text}</span>
      <span className="queue-item-actions">
        <button
          type="button"
          className="queue-item-action"
          aria-label="Edit queued message"
          title="Edit — back into the composer"
          onClick={() => onEdit(kind, index)}
        >
          <PencilIcon size={11} />
        </button>
        <button
          type="button"
          className="queue-item-action"
          aria-label="Remove queued message"
          title="Remove from the queue"
          onClick={() => onRemove(kind, index)}
        >
          <CloseIcon size={10} />
        </button>
      </span>
    </div>
  )
}
