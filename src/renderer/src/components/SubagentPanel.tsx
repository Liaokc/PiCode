import { useRef, type Dispatch, type JSX, type PointerEvent } from 'react'
import type { ChatEntry } from '../../../shared/chat-reducer'
import {
  clampPanelWidth,
  panelTabKey,
  panelTabLabel,
  samePanelTab,
  type PanelAction,
  type PanelState,
  type PanelTabId
} from '../../../shared/panel-model'
import { SUBAGENT_PANEL_FIXED_TAB } from '../../../shared/subagent-panel-model'
import type { SubagentDirectoryRow } from '../../../shared/subagents/directory'
import SubagentsTab from './SubagentsTab'
import SubagentChatTab from './SubagentChatTab'
import Tooltip from './Tooltip'
import { BotIcon, CloseIcon, PulseIcon } from './icons'

/** Ticket 99 (hosted here since ticket 136): how the sidebar resolves one
 * open subagent-chat tab against the session registry (the row context) and
 * sends its steers. Ticket 101 adds the stop flow's dispatch (async → the
 * stop RPC; foreground → abort). The store and this bridge are unchanged —
 * only the host container moved out of the preview side panel. */
export interface SubagentChatBridge {
  resolve: (tab: Extract<PanelTabId, { kind: 'subagent-chat' }>) => { sessionId: string; row: SubagentDirectoryRow | null } | null
  onSteer: (sessionId: string, asyncId: string, requestId: string, text: string) => void
  /** Stop one run: the conversation tab's head stop button → confirm → this. */
  onStop: (sessionId: string, row: SubagentDirectoryRow) => void
  /** Open one run's conversation tab (the directory row click). */
  onOpenChat: (row: SubagentDirectoryRow) => void
}

interface SubagentPanelProps {
  /** Open/closed shell state (the titlebar entry, ticket 136). The pane
   * stays mounted while closed — the same [data-closed] end-state styling
   * as the side panel (ticket 40). */
  open: boolean
  panel: PanelState
  dispatch: Dispatch<PanelAction>
  /** Ticket 90: the FOCUSED session's subagent directory data — transcript
   * entries + the bridge's live run states. null while no session view is
   * focused (the fixed tab renders its empty state). */
  subagentsDirectory: { sessionId: string; entries: readonly ChatEntry[]; runs: Readonly<Record<string, import('../../../shared/subagents/types').SubagentRunState>>; stopping?: ReadonlySet<string> } | null
  /** Ticket 101: stop one running run (the directory row's stop button →
   * its confirm popover → the App's dispatch). Absent → no stop affordance. */
  onStopSubagent?: (row: SubagentDirectoryRow) => void
  /** Ticket 99: the subagent conversation tabs' resolver + steer sender +
   * the directory row click handler. */
  subagentChat?: SubagentChatBridge
}

/**
 * The subagents' dedicated right sidebar (ticket 136): the preview side
 * panel's geometry and visual language — the shared width system (the same
 * clamp/default, the same pane-motion open/close run, the same left-edge
 * resizer) and the same tab strip interactions — hosting the FIXED
 * Subagents directory tab (always present, never closed; the session's
 * runs including ended ones) plus one conversation tab per subagent run
 * (the ticket-99 link, unchanged). Opening it while the preview side panel
 * is open folds that panel and this sidebar inherits its width (the App's
 * swap plan); manually collapsing either pane never opens the other.
 *
 * The drag is the side panel's exact pattern (ticket 30): pointermove never
 * dispatches — the rAF-coalesced width is written straight to the aside's
 * style, one reducer commit lands on pointerup, and `clampPanelWidth` is
 * shared so the live write and the commit can never disagree.
 */
export default function SubagentPanel({
  open,
  panel,
  dispatch,
  subagentsDirectory,
  onStopSubagent,
  subagentChat
}: SubagentPanelProps): JSX.Element {
  const drag = useRef<{ startX: number; startWidth: number; width: number; raf: number } | null>(null)
  const frameRef = useRef<HTMLElement | null>(null)
  const pinRef = useRef<HTMLDivElement | null>(null)

  function startResize(event: PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    drag.current = { startX: event.clientX, startWidth: panel.width, width: panel.width, raf: 0 }
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
    d.width = clampPanelWidth(d.startWidth + (d.startX - event.clientX))
    if (d.raf !== 0) return
    d.raf = requestAnimationFrame(() => {
      d.raf = 0
      // Drag ended before this frame ran: the pointerup commit owns the DOM.
      if (drag.current !== d) return
      const px = `${d.width}px`
      if (frameRef.current) frameRef.current.style.width = px
      if (pinRef.current) pinRef.current.style.width = px
    })
  }

  function endResize(event: PointerEvent<HTMLDivElement>): void {
    const d = drag.current
    drag.current = null
    frameRef.current?.removeAttribute('data-resizing')
    if (d) {
      if (d.raf !== 0) cancelAnimationFrame(d.raf)
      // Single state commit per drag; the reducer clamps with the same
      // clampPanelWidth the DOM writes used, so nothing jumps.
      dispatch({ type: 'set-width', width: d.width })
    }
    // The committed width re-enters through the App-projected variables —
    // clear the drag's inline writes (the dispatch above flushes before the
    // next paint, so no intermediate frame shows the stale variable).
    if (frameRef.current) frameRef.current.style.width = ''
    if (pinRef.current) pinRef.current.style.width = ''
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function tabBody(tab: PanelTabId): JSX.Element | null {
    switch (tab.kind) {
      case 'subagents':
        // The fixed directory tab (ticket 90, hosted here since ticket 136):
        // the FOCUSED session's runs. Fixed identity — the body re-projects
        // when the focus changes (keyed remount).
        return subagentsDirectory != null ? (
          <SubagentsTab
            key={subagentsDirectory.sessionId}
            sessionId={subagentsDirectory.sessionId}
            entries={subagentsDirectory.entries}
            runs={subagentsDirectory.runs}
            stopping={subagentsDirectory.stopping}
            onOpenChat={subagentChat?.onOpenChat}
            onStop={onStopSubagent}
          />
        ) : (
          <div className="subagents-view subagents-view-idle">
            <p className="subagents-empty">No running subagents</p>
          </div>
        )
      case 'subagent-chat': {
        // One subagent's conversation (ticket 99): the child transcript +
        // steer composer, keyed by its identity (session + call), never by
        // the row's state — closing other tabs or focus switches must not
        // remount it.
        if (subagentChat === undefined) {
          return (
            <div className="subchat-view subchat-view-idle">
              <p className="subagents-empty">No subagent context</p>
            </div>
          )
        }
        const resolved = subagentChat.resolve(tab)
        return (
          <SubagentChatTab
            key={`${tab.sessionId}:${tab.callId}`}
            sessionId={tab.sessionId}
            row={resolved?.row ?? null}
            onSteer={subagentChat.onSteer}
            onStop={subagentChat.onStop}
          />
        )
      }
      // The preview panel's tab kinds never enter here (the guard reducer
      // drops them); a stray one renders nothing.
      default:
        return null
    }
  }

  return (
    <aside ref={frameRef} className="subagent-panel" data-closed={open ? undefined : ''}>
      <div
        className="panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize subagents panel"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onDoubleClick={() => dispatch({ type: 'reset-width' })}
      />

      <div className="panel-clip">
        <div className="panel-pin" ref={pinRef}>
          <div className="panel-header">
            <div className="panel-tabs" role="tablist" aria-label="Subagents panel tabs">
              {panel.openTabs.map((tab) => {
                const active = panel.activeTab !== null && samePanelTab(tab, panel.activeTab)
                const label = panelTabLabel(tab)
                const fixed = samePanelTab(tab, SUBAGENT_PANEL_FIXED_TAB)
                return (
                  <div key={panelTabKey(tab)} className={`panel-tab${active ? ' panel-tab-active' : ''}`} data-panel-tab={panelTabKey(tab)}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className="panel-tab-label"
                      onClick={() => dispatch({ type: 'activate-tab', tab })}
                    >
                      {/* Same glyph+label composition as the side panel's
                          strip, with the subagent semantics: the directory
                          tab carries the entry's bot glyph, conversation
                          tabs the live pulse. */}
                      {fixed ? <BotIcon size={12} /> : <PulseIcon size={12} />}
                      <span>{label}</span>
                    </button>
                    {/* The fixed directory tab has no × — it never closes
                        (ticket 136: the entry is always reachable). */}
                    {!fixed && (
                      <Tooltip label={`Close ${label} tab`}>
                        <button
                          type="button"
                          className="panel-tab-close"
                          aria-label={`Close ${label} tab`}
                          onClick={() => dispatch({ type: 'close-tab', tab, at: Date.now() })}
                        >
                          <CloseIcon size={11} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="panel-content" role="tabpanel">
            {panel.openTabs.map((tab) => (
              <div
                key={panelTabKey(tab)}
                className={`panel-tab-body${panel.activeTab !== null && samePanelTab(tab, panel.activeTab) ? '' : ' panel-tab-body-hidden'}`}
              >
                {tabBody(tab)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
