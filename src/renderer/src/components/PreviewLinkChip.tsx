import type { JSX, KeyboardEvent, MouseEvent } from 'react'
import { FileTextIcon } from './icons'
import Tooltip from './Tooltip'

interface PreviewLinkChipProps {
  /** Workspace-relative or absolute path to open in the Preview tab. */
  path: string
  onOpen: (path: string) => void
  /** Accessible label; also the visible text when `iconOnly` is false. */
  label: string
  iconOnly?: boolean
  className: string
}

/**
 * The one deep-link affordance into the side panel's File Preview tab
 * (ticket 07). Renders as a span so it can sit inside a card header button
 * without nesting interactive elements; click and keyboard (Enter/Space)
 * both activate, and events stop at the chip so the wrapping card does not
 * toggle its own state.
 */
export default function PreviewLinkChip({ path, onOpen, label, iconOnly = false, className }: PreviewLinkChipProps): JSX.Element {
  function activate(event: MouseEvent | KeyboardEvent): void {
    event.stopPropagation()
    onOpen(path)
  }

  return (
    <Tooltip label={iconOnly ? label : undefined}>
      <span
        role="button"
        tabIndex={0}
        className={className}
        aria-label={label}
        onClick={activate}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') activate(event)
        }}
      >
        <FileTextIcon size={12} />
        {!iconOnly && <span>Open</span>}
      </span>
    </Tooltip>
  )
}
