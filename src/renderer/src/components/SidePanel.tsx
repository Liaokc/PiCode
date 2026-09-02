import { useRef, useState, type Dispatch, type JSX, type PointerEvent } from 'react'
import { PANEL_EMPTY_TABS } from '../../../shared/layout-model'
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
import PanelTabMenu, { panelTabGlyph } from './PanelTabMenu'
import Tooltip from './Tooltip'
import { ChevronDownIcon, CloseIcon, FileTextIcon, HistoryIcon, PlusIcon } from './icons'

interface SidePanelProps {
  /** Rendered only when the shell's panel zone is open (titlebar toggle). */
  open: boolean
  panel: PanelState
  dispatch: Dispatch<PanelAction>
  /** Working directory of the active task, feeding Review, Preview + Terminal. */
  workspaceCwd: string | null
  /** Open a path as its own deep link (open new tab / focus existing). */
  onPreviewNavigate: (cwd: string, path: string) => void
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
 */
export default function SidePanel({
  open,
  panel,
  dispatch,
  workspaceCwd,
  onPreviewNavigate
}: SidePanelProps): JSX.Element | null {
  const drag = useRef<{ startX: number; startWidth: number; width: number; raf: number } | null>(null)
  const frameRef = useRef<HTMLElement | null>(null)
  /** The ⌄ tab-management dropdown (search + open + recently closed). */
  const [menuOpen, setMenuOpen] = useState(false)
  const menuAnchorRef = useRef<HTMLDivElement | null>(null)

  if (!open) return null

  function startResize(event: PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    drag.current = { startX: event.clientX, startWidth: panel.width, width: panel.width, raf: 0 }
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
      if (frameRef.current) frameRef.current.style.width = `${d.width}px`
    })
  }

  function endResize(event: PointerEvent<HTMLDivElement>): void {
    const d = drag.current
    drag.current = null
    if (d) {
      if (d.raf !== 0) cancelAnimationFrame(d.raf)
      // Single state commit per drag; the reducer clamps with the same
      // clampPanelWidth the DOM writes used, so nothing jumps.
      dispatch({ type: 'set-width', width: d.width })
    }
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
        // The call-trace slot rides the tab framework now; its inspector
        // consumption lands with ticket 36.
        return (
          <div className="review-empty">
            <HistoryIcon size={28} />
            <p className="review-empty-title">Call trace</p>
            <p className="review-empty-hint">The call trace for this session will open here.</p>
          </div>
        )
    }
  }

  return (
    <aside ref={frameRef} className="side-panel" style={{ width: panel.width }}>
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
                  aria-label={`Open Review tab`}
                  onClick={() => dispatch({ type: 'open-tab', tab: { kind: 'review' } })}
                >
                  <FileTextIcon />
                  <span>Review</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
