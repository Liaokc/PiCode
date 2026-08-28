import type { JSX } from 'react'

/**
 * Appearance settings (ticket 11): the theme picker is a placeholder by
 * design — only light ships in 1.0, and every color already lives in CSS
 * variables so a future dark theme lands without a refactor (user story 48).
 */
export default function AppearanceSection(): JSX.Element {
  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <h1>Appearance</h1>
        <p className="settings-page-subtitle">Theme and visual density.</p>
      </header>

      <section className="settings-card">
        <h2 className="settings-card-title">Theme</h2>
        <div className="settings-radio-group" role="radiogroup" aria-label="Theme">
          <button type="button" role="radio" aria-checked className="settings-radio settings-radio-checked" disabled>
            <span className="settings-radio-label">
              Light
              <span className="settings-soon-chip">Current</span>
            </span>
            <span className="settings-radio-hint">The ZCode-calibrated light theme.</span>
            <span className="settings-theme-swatch" aria-hidden="true">
              <i style={{ background: 'var(--bg-sidebar)' }} />
              <i style={{ background: 'var(--bg-main)' }} />
              <i style={{ background: 'var(--bg-card)' }} />
              <i style={{ background: 'var(--accent-orange)' }} />
            </span>
          </button>
          <button type="button" role="radio" aria-checked={false} className="settings-radio" disabled>
            <span className="settings-radio-label">
              Dark
              <span className="settings-soon-chip settings-soon-chip-muted">Coming soon</span>
            </span>
            <span className="settings-radio-hint">Planned for a future release.</span>
            <span className="settings-theme-swatch settings-theme-swatch-muted" aria-hidden="true">
              <i style={{ background: '#1e1e1c' }} />
              <i style={{ background: '#262624' }} />
              <i style={{ background: '#2e2e2b' }} />
              <i style={{ background: '#ec7931' }} />
            </span>
          </button>
        </div>
        <p className="settings-field-note">
          All colors are defined as CSS variables, so dark mode will arrive as a value swap — no interface changes.
        </p>
      </section>

      <section className="settings-card settings-card-readonly">
        <h2 className="settings-card-title">Editor</h2>
        <div className="settings-readonly-row">
          <span>Transcript density</span>
          <span className="settings-readonly-value">ZCode standard</span>
        </div>
        <div className="settings-readonly-row">
          <span>Markdown rendering</span>
          <span className="settings-readonly-value">On · highlighted code</span>
        </div>
      </section>
    </div>
  )
}
