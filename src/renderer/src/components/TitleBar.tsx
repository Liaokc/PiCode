import type { Dispatch, JSX } from 'react'
import type { BridgeDockAction } from '../../../shared/bridge-dock-model'
import type { DockAction } from '../../../shared/dock-model'
import type { ShellUiAction, ShellUiState } from '../../../shared/layout-model'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  HelpCircleIcon,
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
  /** Bottom terminal dock toggle (ticket 18); ⌘J drives the same action. */
  dispatchDock: Dispatch<DockAction>
  /** Bottom bridge dock toggle (ticket 18 feedback); ⌘B drives the same. */
  dispatchBridge: Dispatch<BridgeDockAction>
}

/**
 * Frameless-window chrome: the whole strip drags the window, macOS traffic
 * lights float over the left edge (hiddenInset), and the app title stays
 * centered across the full window width (screenshots 02/03). The settings
 * shell drops the workspace toggles and retitles the window (screenshot 09).
 */
export default function TitleBar({ ui, dispatch, dispatchDock, dispatchBridge }: TitleBarProps): JSX.Element {
  const settings = ui.view === 'settings'
  return (
    <header className="titlebar">
      {!settings && (
        <div className="titlebar-cluster titlebar-cluster-left">
          <Tooltip label={ui.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}>
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
        <Tooltip label="Help">
          <button type="button" className="tb-btn" aria-label="Help">
            <HelpCircleIcon />
          </button>
        </Tooltip>
        {!settings && (
          <Tooltip shortcut="⌘B">
            <button
              type="button"
              className="tb-btn"
              aria-label="Toggle agent bridge"
              onClick={() => dispatchBridge({ type: 'toggle-bridge-dock' })}
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
              onClick={() => dispatchDock({ type: 'toggle-dock' })}
            >
              <PanelBottomIcon />
            </button>
          </Tooltip>
        )}
        {!settings && (
          <Tooltip label={ui.sidePanelOpen ? 'Close side panel' : 'Open side panel'}>
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
