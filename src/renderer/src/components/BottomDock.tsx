import { useRef, type Dispatch, type JSX, type PointerEvent } from 'react'
import { clampDockHeight, type DockAction, type DockState } from '../../../shared/dock-model'
import type { BridgeFeedState } from '../../../shared/bridge/feed'
import BridgeDock from './BridgeDock'
import TerminalDock from './TerminalDock'

/**
 * Bottom dock frame (ticket 18, sibling-panel revision): ONE full-width
 * dock under the chat hosting two SIBLING panels — the user shell (⌘J) and
 * the Agent Bridge feed (⌥⌘J since ticket 27). The frame owns the shared
 * geometry (height, top-edge drag handle, visibility); `dock.panel` decides
 * which sibling is visible — pressing the other key swaps the content IN
 * PLACE. Both panels
 * stay mounted, so a live shell survives switching and the Bridge feed
 * never loses history (it folds at the App level regardless).
 *
 * Drag height (ticket 30): same pattern as the SidePanel — pointermove
 * never dispatches; the raw height is rAF-coalesced and written straight to
 * the section's style, and the reducer commits once on pointerup through the
 * shared `clampDockHeight`, so live write and commit always agree.
 *
 * Open/close motion (ticket 40): the frame STAYS MOUNTED (it already did —
 * the shell must survive ⌘J) but the closed state is no longer display:none:
 * the closed end state is height 0 + opacity 0 + pointer-events/visibility,
 * styled via [data-closed], and the open/close run is a height/opacity
 * transition of the App-projected variables. The content wrapper keeps the
 * dock's real height (never collapsed), so the TerminalDock root never
 * participates in a per-frame reflow — the xterm host holds its size while
 * the clip wrapper reveals it, and the ResizeObserver stays silent
 * mid-animation. The drag writes both wrappers 1:1 and flips the size
 * transition off for the duration of the drag (ZCode resizing rule).
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
  const drag = useRef<{ startY: number; startHeight: number; height: number; raf: number } | null>(null)
  const frameRef = useRef<HTMLElement | null>(null)
  const pinRef = useRef<HTMLDivElement | null>(null)

  function startResize(event: PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    drag.current = { startY: event.clientY, startHeight: dock.height, height: dock.height, raf: 0 }
    // Pane-motion drag rule (ticket 40): size transition off while dragging.
    frameRef.current?.setAttribute('data-resizing', '')
    // A vanished pointer (canceled mouse, synthetic event) must not kill the drag.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Moves still land while the button is held over the strip.
    }
  }

  function moveResize(event: PointerEvent<HTMLDivElement>): void {
    const d = drag.current
    if (!d) return
    // Dragging up grows the panel (dock hangs from the bottom edge).
    d.height = clampDockHeight(d.startHeight + (d.startY - event.clientY))
    if (d.raf !== 0) return
    d.raf = requestAnimationFrame(() => {
      d.raf = 0
      // Drag ended before this frame ran: the pointerup commit owns the DOM.
      if (drag.current !== d) return
      const px = `${d.height}px`
      if (frameRef.current) frameRef.current.style.height = px
      if (pinRef.current) pinRef.current.style.height = px
    })
  }

  function endResize(event: PointerEvent<HTMLDivElement>): void {
    const d = drag.current
    drag.current = null
    frameRef.current?.removeAttribute('data-resizing')
    if (d) {
      if (d.raf !== 0) cancelAnimationFrame(d.raf)
      // Single state commit per drag; the reducer clamps with the same
      // clampDockHeight the DOM writes used, so nothing jumps.
      dispatch({ type: 'set-height', height: d.height })
    }
    // The committed height re-enters through the App-projected variables —
    // clear the drag's inline writes (the dispatch above flushes before the
    // next paint, so no intermediate frame shows the stale variable).
    if (frameRef.current) frameRef.current.style.height = ''
    if (pinRef.current) pinRef.current.style.height = ''
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  // Panel visibility follows `dock.panel` alone: the frame owns overall
  // visibility (closed end state via [data-closed], ticket 40), and each
  // sibling keeps its own display state so a hidden frame never reports a
  // visible sibling.
  const showingTerminal = dock.panel === 'terminal'

  return (
    <section
      ref={frameRef}
      className="terminal-dock"
      aria-label={dock.panel === 'terminal' ? 'Terminal' : 'Agent Bridge'}
      data-closed={dock.open ? undefined : ''}
    >
      <div
        className="terminal-dock-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize bottom panel"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onDoubleClick={() => dispatch({ type: 'reset-height' })}
      />

      <div className="dock-clip">
        <div className="dock-pin" ref={pinRef}>
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
          focusSeq={dock.focusSeq}
        />
      </div>
      <div className="dock-panel" style={{ display: showingTerminal ? 'none' : 'flex' }}>
        <BridgeDock feed={bridgeFeed} fontStack={fontStack} highlight={bridgeHighlight} onHighlightDone={onBridgeHighlightDone} dispatch={dispatch} />
      </div>
        </div>
      </div>
    </section>
  )
}
