import type { Dispatch, JSX } from 'react'
import type { DockAction } from '../../../shared/dock-model'
import type { ShellUiAction, ShellUiState } from '../../../shared/layout-model'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PanelBottomIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PulseIcon
} from './icons'
import Tooltip from './Tooltip'
import { APP_NAME } from '../../../shared/brand'

interface TitleBarProps {
  ui: ShellUiState
  dispatch: Dispatch<ShellUiAction>
  /** Bottom dock dispatch (ticket 18): ⌘J terminal + ⌥⌘J bridge panels. */
  dispatchDock: Dispatch<DockAction>
}

/**
 * Frameless-window chrome: the whole strip drags the window, macOS traffic
 * lights float over the left edge (hiddenInset), and the app title stays
 * centered across the full window width (screenshots 02/03). The settings
 * shell drops the workspace toggles and retitles the window (screenshot 09).
 * The two dock buttons are sibling-panel toggles: each opens its panel in
 * the shared bottom dock, swaps it in while the other shows, or closes the
 * dock when its own panel is already showing.
 * Tooltips follow the R1 rule (ticket 22): a control with a shortcut shows
 * ONLY its keycaps — ticket 27 chords: ⌘B sidebar / ⌥⌘B side panel /
 * ⌘J terminal / ⌥⌘J bridge.
 */
export default function TitleBar({ ui, dispatch, dispatchDock }: TitleBarProps): JSX.Element {
  const settings = ui.view === 'settings'
  return (
    <header className="titlebar">
      {!settings && (
        <div className="titlebar-cluster titlebar-cluster-left">
          {/* R1: chord control → keycap-only tooltip (aria-label keeps the
              stateful description for assistive tech). */}
          <Tooltip shortcut="⌘B">
            <button
              type="button"
              className="tb-btn"
              aria-label={ui.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              onClick={() => dispatch({ type: 'toggle-sidebar' })}
            >
              <PanelLeftIcon />
            </button>
          </Tooltip>
          <button type="button" className="tb-btn tb-btn-disabled" aria-label="Back" disabled>
            <ChevronLeftIcon />
          </button>
          <button type="button" className="tb-btn tb-btn-disabled" aria-label="Forward" disabled>
            <ChevronRightIcon />
          </button>
        </div>
      )}

      <div className="titlebar-title">{settings ? 'Settings' : APP_NAME}</div>

      <div className="titlebar-cluster titlebar-cluster-right">
        {!settings && (
          <Tooltip shortcut="⌥⌘J">
            <button
              type="button"
              className="tb-btn"
              aria-label="Toggle agent bridge"
              onClick={() => dispatchDock({ type: 'toggle-bridge-panel' })}
            >
              <PulseIcon />
            </button>
          </Tooltip>
        )}
        {!settings && (
          <Tooltip shortcut="⌘J">
            <button
              type="button"
              className="tb-btn"
              aria-label="Toggle terminal"
              onClick={() => dispatchDock({ type: 'toggle-terminal-panel' })}
            >
              <PanelBottomIcon />
            </button>
          </Tooltip>
        )}
        {!settings && (
          <Tooltip shortcut="⌥⌘B">
            <button
              type="button"
              className="tb-btn"
              aria-label={ui.sidePanelOpen ? 'Close side panel' : 'Open side panel'}
              onClick={() => dispatch({ type: 'toggle-side-panel' })}
            >
              <PanelRightIcon />
            </button>
          </Tooltip>
        )}
      </div>
    </header>
  )
}
