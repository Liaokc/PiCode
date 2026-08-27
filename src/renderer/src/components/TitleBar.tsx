import type { Dispatch, JSX } from 'react'
import type { ShellUiAction, ShellUiState } from '../../../shared/layout-model'
import { ChevronLeftIcon, ChevronRightIcon, HelpCircleIcon, PanelLeftIcon, PanelRightIcon } from './icons'
import { WINDOW_TITLE_BRAND } from '../brand'

interface TitleBarProps {
  ui: ShellUiState
  dispatch: Dispatch<ShellUiAction>
}

/**
 * Frameless-window chrome: the whole strip drags the window, macOS traffic
 * lights float over the left edge (hiddenInset), and the app title stays
 * centered across the full window width (screenshots 02/03).
 */
export default function TitleBar({ ui, dispatch }: TitleBarProps): JSX.Element {
  return (
    <header className="titlebar">
      <div className="titlebar-cluster titlebar-cluster-left">
        <button
          type="button"
          className="tb-btn"
          aria-label={ui.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          onClick={() => dispatch({ type: 'toggle-sidebar' })}
        >
          <PanelLeftIcon />
        </button>
        <button type="button" className="tb-btn tb-btn-disabled" aria-label="Back" disabled>
          <ChevronLeftIcon />
        </button>
        <button type="button" className="tb-btn tb-btn-disabled" aria-label="Forward" disabled>
          <ChevronRightIcon />
        </button>
      </div>

      <div className="titlebar-title">{WINDOW_TITLE_BRAND}</div>

      <div className="titlebar-cluster titlebar-cluster-right">
        <button type="button" className="tb-btn" aria-label="Help">
          <HelpCircleIcon />
        </button>
        <button
          type="button"
          className="tb-btn"
          aria-label={ui.sidePanelOpen ? 'Close side panel' : 'Open side panel'}
          onClick={() => dispatch({ type: 'toggle-side-panel' })}
        >
          <PanelRightIcon />
        </button>
      </div>
    </header>
  )
}
