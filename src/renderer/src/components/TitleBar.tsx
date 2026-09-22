import type { Dispatch, JSX } from 'react'
import type { DockAction } from '../../../shared/dock-model'
import type { ShellUiAction, ShellUiState } from '../../../shared/layout-model'
import {
  BotIcon,
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
  /** Ticket 136: the FOCUSED session's live subagent run count — the
   * subagents entry's badge (the sidebar's orange badge precedent), shown
   * only while the subagents sidebar is collapsed (an open sidebar shows
   * its own directory). Zero renders no badge. */
  subagentRunningCount?: number
  /** Ticket 136: the subagents entry's click — toggle the subagents
   * sidebar; the opening leg lands on the fixed directory tab (the badge's
   * promise: the count the directory's Running section will show). Absent
   * → the entry is not rendered. */
  onToggleSubagents?: () => void
}

/**
 * Frameless-window chrome: the whole strip drags the window, macOS traffic
 * lights float over the left edge (hiddenInset), and the app title stays
 * centered across the full window width (screenshots 02/03). The settings
 * shell drops the workspace toggles and retitles the window (screenshot 09).
 * The two dock buttons are sibling-panel toggles: each opens its panel in
 * the shared bottom dock, swaps it in while the other shows, or closes the
 * dock when its own panel is already showing.
 * Tooltip discipline (ticket 22): a control with a shortcut shows ONLY its
 * keycaps — ⌘B sidebar / ⌥⌘B side panel / ⌘J terminal / ⌥⌘J bridge; the
 * subagents entry has no chord, so it shows its short description.
 * Ticket 127 retired the settings gear (the ticket-63 UI face): the ⌘,
 * chord and the sidebar's bottom-left gear are the settings entries —
 * the shortcut and the visible button stay decoupled. Ticket 136 fills the
 * retired gear's slot with the subagents entry: always present, badge while
 * runs are live and the sidebar is collapsed, opening the subagents'
 * dedicated right sidebar.
 */
export default function TitleBar({ ui, dispatch, dispatchDock, subagentRunningCount = 0, onToggleSubagents }: TitleBarProps): JSX.Element {
  const settings = ui.view === 'settings'
  // The badge lives ONLY on the collapsed subagents sidebar (an open
  // sidebar shows its own directory — the count would be redundant); zero
  // runs, no badge.
  const subagentBadge = !ui.subagentPanelOpen && subagentRunningCount > 0 ? subagentRunningCount : null
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
        {!settings && (
          <Tooltip label="Subagents">
            <button
              type="button"
              className="tb-btn"
              data-testid="subagent-panel-toggle"
              data-subagent-count={subagentRunningCount}
              aria-label={
                subagentBadge !== null
                  ? `Open subagents — ${subagentBadge} running subagent${subagentBadge === 1 ? '' : 's'}`
                  : ui.subagentPanelOpen
                    ? 'Close subagents'
                    : 'Open subagents'
              }
              onClick={() => onToggleSubagents?.()}
            >
              <BotIcon />
              {subagentBadge !== null && (
                <span className="tb-btn-badge" aria-hidden="true" data-testid="subagent-badge">
                  {subagentBadge > 9 ? '9+' : subagentBadge}
                </span>
              )}
            </button>
          </Tooltip>
        )}
      </div>
    </header>
  )
}
