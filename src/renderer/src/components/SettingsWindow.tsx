import { useReducer, type Dispatch, type JSX } from 'react'
import {
  SETTINGS_NAV,
  SETTINGS_SECTION_LABELS,
  initialSettingsUiState,
  settingsUiReducer,
  type SettingsSection
} from '../../../shared/settings-model'
import type { AuthProbeReport } from '../../../shared/auth-status'
import type { AppPreferences } from '../../../shared/preferences'
import type { ShellUiAction } from '../../../shared/layout-model'
import { useUsageSnapshot } from '../usage/use-usage-snapshot'
import UsagePage from '../usage/UsagePage'
import GeneralSection from './settings/GeneralSection'
import AppearanceSection from './settings/AppearanceSection'
import ModelsSection from './settings/ModelsSection'
import { BarChartIcon, BoxesIcon, ChevronLeftIcon, CubeIcon, PaletteIcon, SlidersIcon, SparklesIcon } from './icons'
import SkillsSection from './settings/SkillsSection'
import PackagesSection from './settings/PackagesSection'

interface SettingsWindowProps {
  /** Shell-level actions (back to workspace). */
  dispatchShell: Dispatch<ShellUiAction>
  /** PiCode preferences + last used directory (App owns the snapshot). */
  preferences: AppPreferences
  lastUsedDirectory: string | null
  /** Read-only auth probe report (null = not scanned yet). */
  auth: AuthProbeReport | null
  authScanning: boolean
  onSetPreferences: (patch: Partial<AppPreferences>) => void
  onRefreshAuth: () => void
  /** Ticket 63: the cwd scoping the Skills enumeration — the focused
   * session's workspace; null = the home directory's global face. */
  skillsCwd: string | null
}

function SectionIcon({ section }: { section: SettingsSection }): JSX.Element {
  switch (section) {
    case 'general':
      return <SlidersIcon />
    case 'appearance':
      return <PaletteIcon />
    case 'models':
      return <CubeIcon />
    case 'skills':
      return <SparklesIcon />
    case 'packages':
      return <BoxesIcon />
    case 'usage':
      return <BarChartIcon />
  }
}

/**
 * Settings window shell (reference screenshot 09): a ZCode-style nav whose
 * groups are cropped to General / Appearance / Models / Data & Statistics.
 * Ticket 11 fills General (startup preferences), Appearance (theme variable
 * placeholder), and Models (defaults + read-only provider sign-in status);
 * Usage keeps its ticket-10 page.
 */
export default function SettingsWindow({
  dispatchShell,
  preferences,
  lastUsedDirectory,
  auth,
  authScanning,
  onSetPreferences,
  onRefreshAuth,
  skillsCwd
}: SettingsWindowProps): JSX.Element {
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
        {ui.section === 'general' && (
          <GeneralSection
            preferences={preferences}
            lastUsedDirectory={lastUsedDirectory}
            onSetPreferences={onSetPreferences}
          />
        )}
        {ui.section === 'appearance' && <AppearanceSection />}
        {ui.section === 'models' && (
          <ModelsSection
            preferences={preferences}
            auth={auth}
            authScanning={authScanning}
            onSetPreferences={onSetPreferences}
            onRefreshAuth={onRefreshAuth}
          />
        )}
        {ui.section === 'skills' && <SkillsSection cwd={skillsCwd} />}
        {ui.section === 'packages' && <PackagesSection />}
        {ui.section === 'usage' && (
          <UsagePage
            snapshot={snapshot}
            error={error}
            heatmapMode={ui.heatmapMode}
            trendRange={ui.trendRange}
            drillDown={ui.drillDown}
            dispatch={dispatch}
            onOpenTask={() => dispatchShell({ type: 'back-to-workspace' })}
          />
        )}
      </main>
    </div>
  )
}
