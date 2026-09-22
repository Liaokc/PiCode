import { useRef, useState } from 'react'
import type { DragEvent, JSX } from 'react'
import type { ChatQueue } from '../../../shared/chat-reducer'
import { queueReorderTarget, type QueueKind } from '../../../shared/queue-mirror'
import { GripDotsIcon, PencilIcon, TrashIcon } from './icons'

/**
 * The queue panel (user story 21): pending Steer / Follow-up messages while
 * the agent runs. SDK queue state is authoritative — the panel is a pure
 * view of it.
 *
 * Ticket 135 (CONTEXT.md: 队列卡): the panel is its own rounded card
 * stacked directly ABOVE the composer — a chat-dock sibling, never inside
 * the composer's input card (the ZCode form; the composer's geometry is
 * invariant to the queue). The row rules are the ticket-128 delivery,
 * untouched. The handle drags a row WITHIN ITS OWN SEGMENT (steer rows
 * among steer rows, follow-up rows among follow-up rows — cross-segment
 * drops are refused at the dragover gate); 越上越先注入: the top row of
 * each segment injects first (steering into the current turn, follow-ups
 * after it — the timing semantics are untouched). Trash discards exactly
 * its own row (the host's dance); the global Clear is retired (the trash
 * replaces it) and there is no "inject now" button (Q6, reaffirmed by the
 * operator for this ticket). Reordering runs the host's additive
 * `reorder_queue_entry` op — the ticket-100 dance with a reorder mutation.
 *
 * Drag language (ticket 84's manual sort): the grip is the REAL handle, the
 * drop target derives from ONE event's half-row geometry (top/bottom), and
 * the indicator is a thin accent line at the target's edge.
 */
export default function QueuePanel({
  queue,
  onEdit,
  onRemove,
  onReorder
}: {
  queue: ChatQueue
  onEdit: (kind: QueueKind, index: number) => void
  onRemove: (kind: QueueKind, index: number) => void
  onReorder: (kind: QueueKind, from: number, to: number) => void
}): JSX.Element | null {
  /** The row being dragged (set at the grip's dragstart) — the same-kind
   * gate for the dragover/drop pair, so a foreign drag never lands here. */
  const dragRef = useRef<{ kind: QueueKind; index: number } | null>(null)
  /** The hovered drop edge (the thin accent line's anchor). */
  const [dropEdge, setDropEdge] = useState<{ kind: QueueKind; index: number; above: boolean } | null>(null)
  const count = queue.steering.length + queue.followUp.length
  if (count === 0) return null

  /** Per-row drag handlers (same group only — the cross-segment gate is
   * the dragover refuse, so the browser shows the not-allowed cursor and
   * the drop never lands). Both dragover and drop derive the target from
   * the event's geometry — the drop never reads the indicator state, so a
   * drop dispatched in the same task as its dragover (test drivers) lands
   * exactly like a real one. */
  function rowDrag(kind: QueueKind, index: number) {
    const sameSegment = (d: { kind: QueueKind; index: number } | null): boolean => d !== null && d.kind === kind
    return {
      onDragStart: (event: DragEvent<HTMLElement>) => {
        dragRef.current = { kind, index }
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', `${kind}:${index}`)
      },
      onDragEnd: () => {
        dragRef.current = null
        setDropEdge(null)
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!sameSegment(dragRef.current)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        const rect = event.currentTarget.getBoundingClientRect()
        setDropEdge({ kind, index, above: event.clientY < rect.top + rect.height / 2 })
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        const d = dragRef.current
        if (d === null || d.kind !== kind) return
        event.preventDefault()
        dragRef.current = null
        setDropEdge(null)
        const rect = event.currentTarget.getBoundingClientRect()
        const above = event.clientY < rect.top + rect.height / 2
        const to = queueReorderTarget(d.index, index, above)
        if (to === null) return // dropped on the dragged row itself
        onReorder(kind, d.index, to)
      }
    }
  }

  return (
    <div className="queue-panel" aria-label="Queued messages">
      <div className="queue-panel-items">
        {queue.steering.map((text, i) => (
          <QueueRow
            key={`s${i}`}
            kind="steering"
            index={i}
            text={text}
            dropEdge={dropEdge !== null && dropEdge.kind === 'steering' && dropEdge.index === i ? (dropEdge.above ? 'above' : 'below') : null}
            drag={rowDrag('steering', i)}
            onEdit={onEdit}
            onRemove={onRemove}
          />
        ))}
        {queue.followUp.map((text, i) => (
          <QueueRow
            key={`f${i}`}
            kind="followUp"
            index={i}
            text={text}
            dropEdge={dropEdge !== null && dropEdge.kind === 'followUp' && dropEdge.index === i ? (dropEdge.above ? 'above' : 'below') : null}
            drag={rowDrag('followUp', i)}
            onEdit={onEdit}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  )
}

function QueueRow({
  kind,
  index,
  text,
  dropEdge,
  drag,
  onEdit,
  onRemove
}: {
  kind: QueueKind
  index: number
  text: string
  dropEdge: 'above' | 'below' | null
  drag: {
    onDragStart: (event: DragEvent<HTMLElement>) => void
    onDragEnd: () => void
    onDragOver: (event: DragEvent<HTMLElement>) => void
    onDrop: (event: DragEvent<HTMLElement>) => void
  }
  onEdit: (kind: QueueKind, index: number) => void
  onRemove: (kind: QueueKind, index: number) => void
}): JSX.Element {
  return (
    <div
      className={[
        'queue-item',
        kind === 'steering' ? 'queue-item-steer' : 'queue-item-followup',
        dropEdge === 'above' ? 'queue-item-drop-above' : '',
        dropEdge === 'below' ? 'queue-item-drop-below' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={drag.onDragOver}
      onDrop={drag.onDrop}
    >
      {/* The grip is the REAL drag handle (ticket 84's form): dragging it
          reorders the row within its own segment. */}
      <span
        className="queue-item-grip"
        aria-label="Drag to reorder queued messages"
        draggable
        onDragStart={drag.onDragStart}
        onDragEnd={drag.onDragEnd}
      >
        <GripDotsIcon size={12} />
      </span>
      <span className="queue-item-tag">{kind === 'steering' ? 'Steer' : 'Follow-up'}</span>
      <span className="queue-item-text">{text}</span>
      {/* Ticket 128 P20: the inline actions stretch to the row body's full
          height — no more half-height action strip vs taller row. */}
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
          title="Discard from the queue"
          onClick={() => onRemove(kind, index)}
        >
          <TrashIcon size={12} />
        </button>
      </span>
    </div>
  )
}
