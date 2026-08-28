import type { JSX } from 'react'
import type { AppPreferences, NewTaskDirectoryPreference } from '../../../../shared/preferences'

interface GeneralSectionProps {
  preferences: AppPreferences
  lastUsedDirectory: string | null
  onSetPreferences: (patch: Partial<AppPreferences>) => void
}

const DIRECTORY_OPTIONS: Array<{ value: NewTaskDirectoryPreference; label: string; hint: string }> = [
  { value: 'ask', label: 'Ask every time', hint: 'PiCode opens the folder picker for each new task.' },
  { value: 'last-used', label: 'Reuse last folder', hint: 'New tasks start in the most recent working directory.' }
]

/** General settings (ticket 11): startup preferences for new tasks. */
export default function GeneralSection({ preferences, lastUsedDirectory, onSetPreferences }: GeneralSectionProps): JSX.Element {
  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <h1>General</h1>
        <p className="settings-page-subtitle">Startup preferences applied to new tasks.</p>
      </header>

      <section className="settings-card">
        <h2 className="settings-card-title">New Tasks</h2>

        <div className="settings-field">
          <div className="settings-field-label">Working directory</div>
          <div className="settings-radio-group" role="radiogroup" aria-label="Working directory for new tasks">
            {DIRECTORY_OPTIONS.map((option) => (
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
          <p className="settings-field-note">
            {lastUsedDirectory
              ? (
                <>
                  Last used folder: <code className="settings-inline-code">{lastUsedDirectory}</code>
                </>
              )
              : 'No folder used yet — pick one when you start your first task.'}
          </p>
        </div>
      </section>
    </div>
  )
}
