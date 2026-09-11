import type { JSX } from 'react'

/**
 * Packages section (ticket 63): a nav-slot placeholder only — the section's
 * functionality (installed packages, install/remove, per-package resource
 * toggles, project-level overrides) is ticket 64's delivery. The nav entry
 * exists so the settings window's structure is final from day one.
 */
export default function PackagesSection(): JSX.Element {
  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <h1>Packages</h1>
        <p className="settings-page-subtitle">Skills, prompts, themes and extensions delivered by Pi packages.</p>
      </header>
      <div className="settings-placeholder">
        <div className="settings-placeholder-title">Package management is on its way</div>
        <div className="settings-placeholder-body">
          Install, remove and toggle Pi packages here in an upcoming release. Until then, manage packages with the
          pi CLI (pi install / pi list).
        </div>
      </div>
    </div>
  )
}
