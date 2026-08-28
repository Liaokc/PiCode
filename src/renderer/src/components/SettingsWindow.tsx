import { useReducer, type Dispatch, type JSX } from 'react'
import {
  SETTINGS_NAV,
  SETTINGS_SECTION_LABELS,
  initialSettingsUiState,
  settingsUiReducer,
  type SettingsSection
} from '../../../shared/settings-model'
import type { ShellUiAction } from '../../../shared/layout-model'
import { useUsageSnapshot } from '../usage/use-usage-snapshot'
import UsagePage from '../usage/UsagePage'
import { BarChartIcon, ChevronLeftIcon, CubeIcon, PaletteIcon, SlidersIcon } from './icons'

interface SettingsWindowProps {
  /** Shell-level actions (back to workspace). */
  dispatchShell: Dispatch<ShellUiAction>
}

function SectionIcon({ section }: { section: SettingsSection }): JSX.Element {
  switch (section) {
    case 'general':
      return <SlidersIcon />
    case 'appearance':
      return <PaletteIcon />
    case 'models':
      return <CubeIcon />
    case 'usage':
      return <BarChartIcon />
  }
}

/**
 * Settings window shell (reference screenshot 09): a ZCode-style nav whose
 * groups are cropped to General / Appearance / Models / Data & Statistics.
 * Only the Usage section carries content in ticket 10; the rest placeholder.
 */
export default function SettingsWindow({ dispatchShell }: SettingsWindowProps): JSX.Element {
  const [ui, dispatch] = useReducer(settingsUiReducer, undefined, initialSettingsUiState)
  const { snapshot, error } = useUsageSnapshot()

  return (
    <div className="settings-shell">
      <nav className="settings-nav" aria-label="Settings">
        <button type="button" className="settings-back" onClick={() => dispatchShell({ type: 'back-to-workspace' })}>
          <ChevronLeftIcon size={14} />
          Back to Workspace
        </button>

        {SETTINGS_NAV.map((group) => (
          <section key={group.label} className="settings-group">
            <div className="settings-group-label">{group.label}</div>
            {group.sections.map((section) => (
              <button
                key={section}
                type="button"
                className={ui.section === section ? 'settings-item settings-item-active' : 'settings-item'}
                onClick={() => dispatch({ type: 'select-section', section })}
              >
                <SectionIcon section={section} />
                <span>{SETTINGS_SECTION_LABELS[section]}</span>
              </button>
            ))}
          </section>
        ))}
      </nav>

      <main className="settings-content">
        {ui.section === 'usage' ? (
          <UsagePage
            snapshot={snapshot}
            error={error}
            heatmapMode={ui.heatmapMode}
            trendRange={ui.trendRange}
            drillDown={ui.drillDown}
            dispatch={dispatch}
            onOpenTask={() => dispatchShell({ type: 'back-to-workspace' })}
          />
        ) : (
          <PlaceholderSection label={SETTINGS_SECTION_LABELS[ui.section]} />
        )}
      </main>
    </div>
  )
}

function PlaceholderSection({ label }: { label: string }): JSX.Element {
  return (
    <div className="settings-placeholder">
      <div className="settings-placeholder-title">{label}</div>
      <div className="settings-placeholder-body">This section is coming soon.</div>
    </div>
  )
}
