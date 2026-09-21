import { useRef, type JSX } from 'react'
import { useConfirmDismiss } from './use-confirm-dismiss'
import { StopIcon } from './icons'

/**
 * The subagent stop flow's shared affordances (ticket 101): the square stop
 * button that opens the confirmation, and the confirm popover itself.
 *
 * The confirmation is the operator's decision point — ZCode's directory card
 * terminates directly, PiCode asks first. Both gestures that dismiss the
 * popover (Esc, a pointer outside it) CANCEL; only the Stop button confirms.
 * The copy carries the irreversible-stop semantics honestly: no undo, no
 * "are you sure" nesting, one decision.
 */

export interface StopConfirmLabels {
  /** The popover's question line (names the run). */
  question: string
  /** The consequence line (async vs foreground differ). */
  consequence: string
}

/** The popover copy for one stop target: async runs stop through pi-subagents'
 * stop control channel; foreground children die with their parent's turn. */
export function stopConfirmLabels(title: string, foreground: boolean): StopConfirmLabels {
  return foreground
    ? {
        question: `Stop "${title}"?`,
        consequence: 'This subagent runs in its parent’s turn — stopping aborts that turn and disposes the child. This cannot be undone.'
      }
    : {
        question: `Stop "${title}"?`,
        consequence: 'The subagent stops where it is and its run is recorded as stopped. This cannot be undone.'
      }
}

/** The square stop button (ZCode's directory-card stop affordance): a compact
 * icon-only button that opens the confirm popover. `active` marks the row
 * whose popover is open (the button rests while its own confirm shows). */
export function StopButton({
  label,
  active,
  onBegin
}: {
  label: string
  active: boolean
  onBegin: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      className={active ? 'subagent-stop-btn subagent-stop-btn-active' : 'subagent-stop-btn'}
      aria-label={label}
      title={label}
      onClick={(event) => {
        // The row (or tab head) underneath may be clickable — the stop
        // gesture must never trigger it.
        event.stopPropagation()
        onBegin()
      }}
    >
      <StopIcon size={11} />
    </button>
  )
}

/** The confirm popover. Anchors to its (position:relative) parent row; Esc
 * and outside-pointerdown both cancel. */
export function StopConfirmPopover({
  labels,
  confirmLabel = 'Stop run',
  onConfirm,
  onCancel
}: {
  labels: StopConfirmLabels
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)
  useConfirmDismiss(true, ref, onCancel)
  return (
    <div ref={ref} className="subagent-stop-confirm" role="alertdialog" aria-label={labels.question}>
      <p className="subagent-stop-confirm-question">{labels.question}</p>
      <p className="subagent-stop-confirm-copy">{labels.consequence}</p>
      <div className="subagent-stop-confirm-actions">
        <button type="button" className="subagent-stop-confirm-cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="subagent-stop-confirm-stop"
          onClick={(event) => {
            event.stopPropagation()
            onConfirm()
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}
