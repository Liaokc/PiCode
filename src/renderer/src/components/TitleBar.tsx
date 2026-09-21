import type { Dispatch, JSX } from 'react'
import type { DockAction } from '../../../shared/dock-model'
import type { ShellUiAction, ShellUiState } from '../../../shared/layout-model'
import {
  GearIcon,
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
  /** Ticket 101: the FOCUSED session's live subagent run count — the
   * collapsed side panel's toggle badge (the sidebar's orange badge
   * precedent). Zero renders no badge. */
  subagentRunningCount?: number
  /** Ticket 101: the badge click's open action — the panel opens straight
   * onto the Subagents directory tab (the badge's promise: the count the
   * directory will show). Absent → the toggle behaves as before. */
  onOpenSubagents?: () => void
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
 * keycaps — ⌘B sidebar / ⌥⌘B side panel / ⌘J terminal / ⌥⌘J bridge /
 * ⌘, settings (ticket 63: the gear toggles the settings window, open from
 * the workspace and close from it — the ⌘, chord does the same).
 */
export default function TitleBar({ ui, dispatch, dispatchDock, subagentRunningCount = 0, onOpenSubagents }: TitleBarProps): JSX.Element {
  const settings = ui.view === 'settings'
  // The badge lives ONLY on the collapsed panel (an open panel shows its
  // own directory — the count would be redundant); zero runs, no badge.
  const panelBadge = !ui.sidePanelOpen && subagentRunningCount > 0 ? subagentRunningCount : null
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
              aria-label={
                panelBadge !== null
                  ? `Open side panel — ${panelBadge} running subagent${panelBadge === 1 ? '' : 's'}`
                  : ui.sidePanelOpen
                    ? 'Close side panel'
                    : 'Open side panel'
              }
              data-subagent-count={subagentRunningCount}
              onClick={() => {
                // Ticket 101: a badge click is a promise — the panel opens
                // STRAIGHT onto the Subagents directory tab, whose Running
                // section is exactly what the count counted. Every other
                // click stays the plain toggle.
                if (panelBadge !== null && onOpenSubagents !== undefined) onOpenSubagents()
                else dispatch({ type: 'toggle-side-panel' })
              }}
            >
              <PanelRightIcon />
              {panelBadge !== null && (
                <span className="tb-btn-badge" aria-hidden="true" data-testid="panel-badge">
                  {panelBadge > 9 ? '9+' : panelBadge}
                </span>
              )}
            </button>
          </Tooltip>
        )}
        {/* Ticket 63: the settings-window gear — toggle, not just open. */}
        <Tooltip shortcut="⌘,">
          <button
            type="button"
            className={settings ? 'tb-btn tb-btn-active' : 'tb-btn'}
            aria-label={settings ? 'Close settings' : 'Open settings'}
            aria-pressed={settings}
            onClick={() => dispatch({ type: 'toggle-settings' })}
          >
            <GearIcon />
          </button>
        </Tooltip>
      </div>
    </header>
  )
}
