import { useRef, type Dispatch, type JSX, type PointerEvent } from 'react'
import type { DockAction, DockState } from '../../../shared/dock-model'
import type { BridgeFeedState } from '../../../shared/bridge/feed'
import BridgeDock from './BridgeDock'
import TerminalDock from './TerminalDock'

/**
 * Bottom dock frame (ticket 18, sibling-panel revision): ONE full-width
 * dock under the chat hosting two SIBLING panels — the user shell (⌘J) and
 * the Agent Bridge feed (⌘B). The frame owns the shared geometry (height,
 * top-edge drag handle, visibility); `dock.panel` decides which sibling is
 * visible — pressing the other key swaps the content IN PLACE. Both panels
 * stay mounted, so a live shell survives switching and the Bridge feed
 * never loses history (it folds at the App level regardless).
 */

interface BottomDockProps {
  dock: DockState
  /** Active session working directory; null shows the terminal empty state. */
  workspaceCwd: string | null
  /** Active session display label for the terminal tab strip; null hides it. */
  sessionLabel: string | null
  /** Login shell display name (e.g. "fish") from the preload versions block. */
  shellName: string
  /** Probe-resolved mono/Nerd-Font stack shared by both panels. */
  fontStack: string
  bridgeFeed: BridgeFeedState
  /** Tool-call id to scroll to + flash in the bridge feed (deep link). */
  bridgeHighlight: string | null
  /** Clears the highlight once the feed has flashed it. */
  onBridgeHighlightDone: () => void
  dispatch: Dispatch<DockAction>
}

export default function BottomDock({
  dock,
  workspaceCwd,
  sessionLabel,
  shellName,
  fontStack,
  bridgeFeed,
  bridgeHighlight,
  onBridgeHighlightDone,
  dispatch
}: BottomDockProps): JSX.Element {
  const drag = useRef<{ startY: number; startHeight: number } | null>(null)

  function startResize(event: PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    drag.current = { startY: event.clientY, startHeight: dock.height }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveResize(event: PointerEvent<HTMLDivElement>): void {
    if (!drag.current) return
    // Dragging up grows the panel (dock hangs from the bottom edge).
    dispatch({ type: 'set-height', height: drag.current.startHeight + (drag.current.startY - event.clientY) })
  }

  function endResize(event: PointerEvent<HTMLDivElement>): void {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  // Panel visibility follows `dock.panel` alone: the frame owns overall
  // visibility (display:none when closed), and each sibling keeps its own
  // display state so a hidden frame never reports a visible sibling.
  const showingTerminal = dock.panel === 'terminal'

  return (
    <section
      className="terminal-dock"
      aria-label={dock.panel === 'terminal' ? 'Terminal' : 'Agent Bridge'}
      style={{ height: dock.height, display: dock.open ? undefined : 'none' }}
    >
      <div
        className="terminal-dock-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize bottom panel"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onDoubleClick={() => dispatch({ type: 'reset-height' })}
      />

      {/* Both siblings stay mounted; display:none keeps the shell alive and
          the feed folding while the other panel shows. */}
      <div className="dock-panel" style={{ display: showingTerminal ? 'flex' : 'none' }}>
        <TerminalDock
          tabOpen={dock.tabOpen}
          workspaceCwd={workspaceCwd}
          sessionLabel={sessionLabel}
          shellName={shellName}
          gen={dock.gen}
          fontStack={fontStack}
          dispatch={dispatch}
        />
      </div>
      <div className="dock-panel" style={{ display: showingTerminal ? 'none' : 'flex' }}>
        <BridgeDock feed={bridgeFeed} fontStack={fontStack} highlight={bridgeHighlight} onHighlightDone={onBridgeHighlightDone} dispatch={dispatch} />
      </div>
    </section>
  )
}
