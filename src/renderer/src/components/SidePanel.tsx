import type { JSX } from 'react'
import { PANEL_EMPTY_TABS, type SidePanelTab } from '../../../shared/layout-model'
import { FileTextIcon, TerminalSquareIcon } from './icons'

const TAB_ICONS: Record<SidePanelTab, JSX.Element> = {
  review: <FileTextIcon />,
  terminal: <TerminalSquareIcon />
}

const TAB_LABELS: Record<SidePanelTab, string> = {
  review: 'Review',
  terminal: 'Terminal'
}

/**
 * Side panel with its empty picker state, matching screenshot 03's
 * composition minus the browser tab (out of scope for PiCode 1.0).
 * Tab content itself ships in tickets 06–08.
 */
export default function SidePanel({ open }: { open: boolean }): JSX.Element | null {
  if (!open) return null

  return (
    <aside className="side-panel" style={{ width: 'var(--side-panel-w)' }}>
      <div className="panel-empty">
        <h2 className="panel-empty-title">Open a Tab</h2>
        <p className="panel-empty-hint">Choose which tab to open in the side panel.</p>
        <div className="panel-empty-cards">
          {PANEL_EMPTY_TABS.map((tab) => (
            <button key={tab} type="button" className="panel-tab-card" aria-label={`Open ${TAB_LABELS[tab]} tab`}>
              {TAB_ICONS[tab]}
              <span>{TAB_LABELS[tab]}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
