import { useRef, useState, type Dispatch, type JSX, type PointerEvent } from 'react'
import { PANEL_EMPTY_TABS } from '../../../shared/layout-model'
import type { ChatEntry } from '../../../shared/chat-reducer'
import type { TurnFileChange } from '../../../shared/turn-files'
import {
  clampPanelWidth,
  panelTabKey,
  panelTabLabel,
  samePanelTab,
  type PanelAction,
  type PanelState,
  type PanelTabId
} from '../../../shared/panel-model'
import ReviewTab from './ReviewTab'
import PreviewTab from './PreviewTab'
import TraceTab from './TraceTab'
import TurnDiffTab from './TurnDiffTab'
import SubagentsTab from './SubagentsTab'
import SubagentChatTab from './SubagentChatTab'
import PanelTabMenu, { panelTabGlyph } from './PanelTabMenu'
import Tooltip from './Tooltip'
import { ChevronDownIcon, CloseIcon, FileTextIcon, PlusIcon } from './icons'
import type { SubagentDirectoryRow } from '../../../shared/subagents/directory'

/** Ticket 99: how the panel resolves one open subagent-chat tab against the
 * session registry (the row context) and sends its steers. Ticket 101 adds
 * the stop flow's dispatch (async → the stop RPC; foreground → abort). */
export interface SubagentChatBridge {
  resolve: (tab: Extract<PanelTabId, { kind: 'subagent-chat' }>) => { sessionId: string; row: SubagentDirectoryRow | null } | null
  onSteer: (sessionId: string, asyncId: string, requestId: string, text: string) => void
  /** Stop one run: the conversation tab's head stop button → confirm → this. */
  onStop: (sessionId: string, row: SubagentDirectoryRow) => void
  /** Open one run's conversation tab (the directory row click). */
  onOpenChat: (row: SubagentDirectoryRow) => void
}

interface SidePanelProps {
  /** Open/closed shell state (⌥⌘B / titlebar toggle, ticket 27). The panel
   * stays mounted while closed (ticket 40): the prop drives the closed
   * end-state styling only. */
  open: boolean
  panel: PanelState
  dispatch: Dispatch<PanelAction>
  /** Working directory of the active task, feeding Review, Preview + Terminal. */
  workspaceCwd: string | null
  /** Open a path as its own deep link (open new tab / focus existing). */
  onPreviewNavigate: (cwd: string, path: string) => void
  /** Turn-diff tab resolver (ticket 78): the ACTIVE session view's file
   * changes for one turn, or null when the turn is not in view. The panel
   * re-resolves on every render so a live turn's tab grows with it. */
  resolveTurnChanges?: (turnId: string) => TurnFileChange[] | null
  /** Ticket 90: the FOCUSED session's subagent directory data — transcript
   * entries + the bridge's live run states. null while no session view is
   * focused (the tab renders its empty state). */
  subagentsDirectory?: { sessionId: string; entries: readonly ChatEntry[]; runs: Readonly<Record<string, import('../../../shared/subagents/types').SubagentRunState>>; stopping?: ReadonlySet<string> } | null
  /** Ticket 101: stop one running run (the directory row's stop button →
   * its confirm popover → the App's dispatch). Absent → no stop affordance. */
  onStopSubagent?: (row: SubagentDirectoryRow) => void
  /** Ticket 99: the subagent conversation tabs' resolver + steer sender +
   * the directory row click handler. */
  subagentChat?: SubagentChatBridge
}

/**
 * Side panel container (tickets 06–08, multi-tab revision ticket 31): a
 * draggable width, a per-file tab strip (every deep-linked file gets its own
 * tab; the call-trace slot rides the same framework), the ⌄ tab-management
 * dropdown, and the screenshot-03 "Open a Tab" picker whenever no tab
 * content is showing. Open tabs stay mounted (hidden with display:none)
 * while another tab is active — switching tabs must not kill Preview state.
 * Collapsing the panel lives in the titlebar toggle + ⌥⌘B (ticket 27).
 *
 * Drag width (ticket 30): pointermove NEVER dispatches. The raw drag width is
 * rAF-coalesced and written straight to the aside's style — zero React renders
 * during the drag, so a heavy transcript never re-renders mid-drag. The
 * reducer commit happens once, on pointerup; `clampPanelWidth` is shared with
 * the reducer so the live write and the commit can never disagree.
 *
 * Open/close motion (ticket 40): the panel STAYS MOUNTED while closed — the
 * closed end state (size 0 + opacity 0 + pointer-events/visibility) is
 * styled via [data-closed] and the open/close run is a width/opacity
 * transition of the App-projected variables. Content keeps its real width
 * inside the pinned wrapper (tabs, previews and the terminal stay put —
 * clip, never reflow); the drag writes both wrappers 1:1 and flips the
 * size transition off for the duration of the drag (ZCode resizing rule).
 */
export default function SidePanel({
  open,
  panel,
  dispatch,
  workspaceCwd,
  onPreviewNavigate,
  resolveTurnChanges,
  subagentsDirectory,
  onStopSubagent,
  subagentChat
}: SidePanelProps): JSX.Element {
  const drag = useRef<{ startX: number; startWidth: number; width: number; raf: number } | null>(null)
  const frameRef = useRef<HTMLElement | null>(null)
  const pinRef = useRef<HTMLDivElement | null>(null)
  /** The ⌄ tab-management dropdown (search + open + recently closed). */
  const [menuOpen, setMenuOpen] = useState(false)
  const menuAnchorRef = useRef<HTMLDivElement | null>(null)

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

  const showPicker = panel.pickerOpen || panel.openTabs.length === 0

  function tabBody(tab: PanelTabId): JSX.Element {
    switch (tab.kind) {
      case 'review':
        return (
          <ReviewTab
            cwd={workspaceCwd}
            onOpenFile={workspaceCwd !== null ? (path) => onPreviewNavigate(workspaceCwd, path) : undefined}
          />
        )
      case 'file':
        return (
          <PreviewTab
            cwd={tab.cwd}
            path={tab.path}
            // In-tab navigation (crumbs, directory rows) moves THIS tab to the
            // destination in place; only sidebar deep links open new tabs
            // (ticket 31 operator feedback).
            onNavigate={(cwd, path) => dispatch({ type: 'retarget-tab', from: tab, to: { kind: 'file', cwd, path } })}
          />
        )
      case 'trace':
        // The call-trace inspector (ticket 36): tab identity = session file;
        // closing rides the framework's recently-closed tracking.
        return <TraceTab sessionFile={tab.sessionFile} onClose={() => dispatch({ type: 'close-tab', tab, at: Date.now() })} />
      case 'turn-diff':
        // The turn-diff inspector (ticket 78): the reviewed turn's own file
        // changes, rendered in the Review tab's diff language. Identity =
        // turn id; the body resolves against the active session's view.
        return <TurnDiffTab turnId={tab.turnId} changes={resolveTurnChanges?.(tab.turnId) ?? null} />
      case 'subagents':
        // The subagent directory (ticket 90): the FOCUSED session's runs in
        // the ZCode subagentDirectory composition. Fixed identity — the
        // body re-projects when the focus changes (keyed remount).
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
        // One subagent's conversation (ticket 99, z17-subagent-chat): the
        // child transcript + steer composer. The resolver re-projects the
        // row on every render so live badge flips reach the tab; the tab
        // is keyed by its identity (session + call), never by the row's
        // state — closing other tabs or focus switches must not remount it.
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
    }
  }

  return (
    <aside ref={frameRef} className="side-panel" data-closed={open ? undefined : ''}>
      <div
        className="panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize side panel"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onDoubleClick={() => dispatch({ type: 'reset-width' })}
      />

      <div className="panel-clip">
        <div className="panel-pin" ref={pinRef}>
      <div className="panel-header">
        <div ref={menuAnchorRef} className="panel-menu-anchor">
          <Tooltip label="Manage tabs">
            <button
              type="button"
              className="tb-btn"
              aria-label="Manage tabs"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <ChevronDownIcon />
            </button>
          </Tooltip>
          {menuOpen && (
            <PanelTabMenu panel={panel} dispatch={dispatch} onClose={() => setMenuOpen(false)} anchorRef={menuAnchorRef} />
          )}
        </div>
        <div className="panel-tabs" role="tablist" aria-label="Side panel tabs">
          {panel.openTabs.map((tab) => {
            const active = panel.activeTab !== null && samePanelTab(tab, panel.activeTab) && !showPicker
            const label = panelTabLabel(tab)
            return (
              <div key={panelTabKey(tab)} className={`panel-tab${active ? ' panel-tab-active' : ''}`} data-panel-tab={panelTabKey(tab)}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className="panel-tab-label"
                  onClick={() => dispatch({ type: 'activate-tab', tab })}
                >
                  {panelTabGlyph(tab)}
                  <span>{label}</span>
                </button>
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
              </div>
            )
          })}
          <Tooltip label="Add a tab">
            <button
              type="button"
              className="tb-btn panel-add-tab"
              aria-label="Add a tab"
              onClick={() => dispatch({ type: 'show-picker' })}
            >
              <PlusIcon size={14} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="panel-content" role="tabpanel">
        {/* Open tab bodies stay mounted; the picker overlays them instead of
            replacing them — opening the picker must not kill Preview state. */}
        {panel.openTabs.map((tab) => (
          <div
            key={panelTabKey(tab)}
            className={`panel-tab-body${panel.activeTab !== null && samePanelTab(tab, panel.activeTab) ? '' : ' panel-tab-body-hidden'}`}
          >
            {tabBody(tab)}
          </div>
        ))}
        {showPicker && (
          <div className={`panel-empty${panel.openTabs.length > 0 ? ' panel-empty-overlay' : ''}`}>
            <h2 className="panel-empty-title">Open a Tab</h2>
            <p className="panel-empty-hint">Choose which tab to open in the side panel.</p>
            <div className="panel-empty-cards">
              {PANEL_EMPTY_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className="panel-tab-card"
                  aria-label={`Open ${tab === 'review' ? 'Review' : 'Subagents'} tab`}
                  onClick={() =>
                    dispatch({ type: 'open-tab', tab: tab === 'review' ? { kind: 'review' } : { kind: 'subagents' } })
                  }
                >
                  <FileTextIcon />
                  <span>{tab === 'review' ? 'Review' : 'Subagents'}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
        </div>
      </div>
    </aside>
  )
}
