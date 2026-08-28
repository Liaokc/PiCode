import { useRef, type Dispatch, type JSX, type PointerEvent } from 'react'
import { PANEL_EMPTY_TABS, type SidePanelTab } from '../../../shared/layout-model'
import type { PanelAction, PanelState } from '../../../shared/panel-model'
import type { PreviewSelection } from '../../../shared/preview/view-model'
import ReviewTab from './ReviewTab'
import PreviewTab from './PreviewTab'
import { ChevronDownIcon, CloseIcon, CodeIcon, FileTextIcon, PlusIcon, TerminalSquareIcon } from './icons'

const TAB_ICONS: Record<SidePanelTab, JSX.Element> = {
  review: <FileTextIcon />,
  terminal: <TerminalSquareIcon />,
  preview: <CodeIcon />
}

const TAB_LABELS: Record<SidePanelTab, string> = {
  review: 'Review',
  terminal: 'Terminal',
  preview: 'Preview'
}

interface SidePanelProps {
  /** Rendered only when the shell's panel zone is open (titlebar toggle). */
  open: boolean
  panel: PanelState
  dispatch: Dispatch<PanelAction>
  /** Collapse the whole panel (chevron in the strip, per screenshot 08). */
  onCollapse: () => void
  /** Working directory of the active task, feeding the Review tab. */
  reviewCwd: string | null
  /** Deep-link target for the File Preview tab (ticket 07); null = empty state. */
  previewTarget: PreviewSelection | null
  /** In-tab navigation (breadcrumbs, directory rows) retargets via the App shell. */
  onPreviewNavigate: (cwd: string, path: string) => void
}

/**
 * Side panel container (ticket 06 + 07): draggable width, a multi-tab strip,
 * and the screenshot-03 "Open a Tab" picker whenever no tab content is
 * showing. The Review and Preview tabs are live; the Terminal tab hosts its
 * placeholder until ticket 08 wires the PTY.
 *
 * Open tabs stay mounted (hidden with display:none) while another tab is
 * active, so Preview navigation state survives tab flips.
 */
export default function SidePanel({
  open,
  panel,
  dispatch,
  onCollapse,
  reviewCwd,
  previewTarget,
  onPreviewNavigate
}: SidePanelProps): JSX.Element | null {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)

  if (!open) return null

  function startResize(event: PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    drag.current = { startX: event.clientX, startWidth: panel.width }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveResize(event: PointerEvent<HTMLDivElement>): void {
    if (!drag.current) return
    dispatch({ type: 'set-width', width: drag.current.startWidth + (drag.current.startX - event.clientX) })
  }

  function endResize(event: PointerEvent<HTMLDivElement>): void {
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const showPicker = panel.pickerOpen || panel.openTabs.length === 0

  function tabBody(tab: SidePanelTab): JSX.Element {
    if (tab === 'review') return <ReviewTab cwd={reviewCwd} onOpenFile={reviewCwd !== null ? (path) => onPreviewNavigate(reviewCwd, path) : undefined} />
    if (tab === 'preview') return <PreviewTab target={previewTarget} onNavigate={onPreviewNavigate} />
    return (
      <div className="review-empty">
        <TerminalSquareIcon size={28} />
        <p className="review-empty-title">Terminal</p>
        <p className="review-empty-hint">The interactive terminal is not wired up yet.</p>
      </div>
    )
  }

  return (
    <aside className="side-panel" style={{ width: panel.width }}>
      <div
        className="panel-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize side panel"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onDoubleClick={() => dispatch({ type: 'reset-width' })}
      />

      <div className="panel-header">
        <button type="button" className="tb-btn" aria-label="Collapse side panel" onClick={onCollapse}>
          <ChevronDownIcon />
        </button>
        <div className="panel-tabs" role="tablist" aria-label="Side panel tabs">
          {panel.openTabs.map((tab) => {
            const active = tab === panel.activeTab && !showPicker
            return (
              <div key={tab} className={`panel-tab${active ? ' panel-tab-active' : ''}`}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className="panel-tab-label"
                  onClick={() => dispatch({ type: 'activate-tab', tab })}
                >
                  {TAB_ICONS[tab]}
                  <span>{TAB_LABELS[tab]}</span>
                </button>
                <button
                  type="button"
                  className="panel-tab-close"
                  aria-label={`Close ${TAB_LABELS[tab]} tab`}
                  onClick={() => dispatch({ type: 'close-tab', tab })}
                >
                  <CloseIcon size={11} />
                </button>
              </div>
            )
          })}
          <button
            type="button"
            className="tb-btn panel-add-tab"
            aria-label="Add a tab"
            onClick={() => dispatch({ type: 'show-picker' })}
          >
            <PlusIcon size={14} />
          </button>
        </div>
      </div>

      <div className="panel-content">
        {showPicker ? (
          <div className="panel-empty" role="tabpanel">
            <h2 className="panel-empty-title">Open a Tab</h2>
            <p className="panel-empty-hint">Choose which tab to open in the side panel.</p>
            <div className="panel-empty-cards">
              {PANEL_EMPTY_TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className="panel-tab-card"
                  aria-label={`Open ${TAB_LABELS[tab]} tab`}
                  onClick={() => dispatch({ type: 'open-tab', tab })}
                >
                  {TAB_ICONS[tab]}
                  <span>{TAB_LABELS[tab]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          panel.openTabs.map((tab) => (
            <div
              key={tab}
              className="panel-tab-body"
              role="tabpanel"
              aria-label={`${TAB_LABELS[tab]} tab`}
              style={{ display: tab === panel.activeTab ? undefined : 'none' }}
            >
              {tabBody(tab)}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
