import { useState, type JSX } from 'react'
import { toggleHiddenGroup, type AppPreferences, type NewTaskDefaultMode } from '../../../../shared/preferences'
import { projectLabel } from '../../../../shared/sessions/group'

interface GeneralSectionProps {
  preferences: AppPreferences
  lastUsedDirectory: string | null
  onSetPreferences: (patch: Partial<AppPreferences>) => void
}

const DEFAULT_PROJECT_OPTIONS: Array<{ value: NewTaskDefaultMode; label: string; hint: string }> = [
  {
    value: 'last-used',
    label: 'Follow recent activity',
    hint: 'The new-task chip defaults to the open session\u2019s project, then the last used one.'
  },
  {
    value: 'fixed',
    label: 'Fixed project',
    hint: 'New tasks always start in the chosen project.'
  }
]

/** General settings (ticket 11): startup preferences for new tasks. The
 * retired ask/last-used pair (ticket 17) is now a "New task default project"
 * selector — the project chip owns per-task project choice. The sidebar card
 * (ticket 19) recovers project groups hidden from the sidebar: hiding is a
 * local preference, so the session files stay untouched and restoring just
 * drops the cwd from the hidden list. */
export default function GeneralSection({ preferences, lastUsedDirectory, onSetPreferences }: GeneralSectionProps): JSX.Element {
  const [picking, setPicking] = useState(false)

  async function chooseFixedProject(): Promise<void> {
    setPicking(true)
    try {
      const picked = await window.picode.chat.pickWorkingDirectory()
      if (picked) onSetPreferences({ newTaskDirectory: 'fixed', newTaskFixedProject: picked })
    } finally {
      setPicking(false)
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <h1>General</h1>
        <p className="settings-page-subtitle">Startup preferences applied to new tasks.</p>
      </header>

      <section className="settings-card">
        <h2 className="settings-card-title">New Tasks</h2>

        <div className="settings-field">
          <div className="settings-field-label">New task default project</div>
          <div className="settings-radio-group" role="radiogroup" aria-label="New task default project">
            {DEFAULT_PROJECT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={preferences.newTaskDirectory === option.value}
                className={
                  preferences.newTaskDirectory === option.value
                    ? 'settings-radio settings-radio-checked'
                    : 'settings-radio'
                }
                onClick={() => onSetPreferences({ newTaskDirectory: option.value })}
              >
                <span className="settings-radio-label">{option.label}</span>
                <span className="settings-radio-hint">{option.hint}</span>
              </button>
            ))}
          </div>
          {preferences.newTaskDirectory === 'fixed' && (
            <div className="settings-fixed-project">
              <code className="settings-inline-code">
                {preferences.newTaskFixedProject ?? 'No project chosen yet'}
              </code>
              <button type="button" className="settings-fixed-pick" disabled={picking} onClick={() => void chooseFixedProject()}>
                Choose folder…
              </button>
            </div>
          )}
          <p className="settings-field-note">
            {lastUsedDirectory
              ? (
                <>
                  Last used folder: <code className="settings-inline-code">{lastUsedDirectory}</code>
                </>
              )
              : 'No folder used yet — the chip falls back to your recent projects.'}
          </p>
        </div>
      </section>

      <section className="settings-card">
        <h2 className="settings-card-title">Sidebar</h2>
        <div className="settings-field">
          <div className="settings-field-label">Hidden projects</div>
          <p className="settings-field-note">
            Project groups you removed from the sidebar. Hiding is local — sessions are never deleted, and hidden
            tasks stay searchable (⌘K) and visible in the Groups all-tasks view.
          </p>
          {preferences.hiddenGroups.length === 0 ? (
            <p className="settings-field-note">No hidden projects.</p>
          ) : (
            <ul className="settings-hidden-list">
              {preferences.hiddenGroups.map((cwd) => (
                <li key={cwd} className="settings-hidden-row">
                  <div className="settings-hidden-meta">
                    <span className="settings-hidden-name">{projectLabel(cwd)}</span>
                    <code className="settings-inline-code">{cwd}</code>
                  </div>
                  <button
                    type="button"
                    className="settings-fixed-pick"
                    onClick={() => onSetPreferences({ hiddenGroups: toggleHiddenGroup(preferences.hiddenGroups, cwd, false) })}
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
