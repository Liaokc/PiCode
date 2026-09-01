import type { JSX, KeyboardEvent, MouseEvent } from 'react'
import { PulseIcon } from './icons'
import Tooltip from './Tooltip'

interface BridgeJumpChipProps {
  /** The bash tool call this card represents; the feed highlights it. */
  toolCallId: string
  /** Opens the bottom dock's Bridge panel scrolled to this command. */
  onShow: (toolCallId: string) => void
}

/**
 * Deep-link chip from a bash tool card into the Bridge panel (ticket 18
 * feedback): "watch this command in the Bridge". Renders as a span so it
 * can sit inside a card header button without nesting interactive
 * elements; click and keyboard (Enter/Space) both activate, and events
 * stop at the chip so the wrapping card does not toggle its own state.
 */
export default function BridgeJumpChip({ toolCallId, onShow }: BridgeJumpChipProps): JSX.Element {
  const label = 'Show in Agent Bridge'

  function activate(event: MouseEvent | KeyboardEvent): void {
    event.stopPropagation()
    onShow(toolCallId)
  }

  return (
    <Tooltip label={label}>
      <span role="button" tabIndex={0} className="tool-card-preview-link" aria-label={label} onClick={activate} onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') activate(event)
      }}>
        <PulseIcon size={12} />
        <span>Bridge</span>
      </span>
    </Tooltip>
  )
}
