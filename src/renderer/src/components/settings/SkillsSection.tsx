import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import {
  projectSkillRows,
  skillDeleteCopy,
  type SkillDeleteKind,
  type SkillRowView,
  type SkillsReport
} from '../../../../shared/skills-management'
import { FolderIcon, LoaderIcon, RefreshIcon, TrashIcon } from '../icons'

interface SkillsSectionProps {
  /** The working directory scoping the enumeration (the focused session's
   * cwd; null = the global face from the home directory). */
  cwd: string | null
}

type ConfirmState = { row: SkillRowView; kind: Exclude<SkillDeleteKind, null> } | null

/**
 * The Skills section (ticket 63): Pi's actual loading surface as one list —
 * every skill entry Pi discovers (user dir incl. symlinks, package-provided,
 * trusted project), each row with its source badge, path, and truthful
 * enable state. Actions: per-skill toggle (writes Pi's settings.json in
 * pi-config format), reveal in Finder, and delete — the latter scoped to
 * entries under ~/.pi/agent/skills with type-split confirmation copy (link
 * vs real directory); package rows show no delete control at all.
 */
export default function SkillsSection({ cwd }: SkillsSectionProps): JSX.Element {
  const [report, setReport] = useState<SkillsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  /** The last refresh request token — stale responses are ignored. */
  const requestRef = useRef(0)
  /** The in-flight refresh, kept OUT of the effect body so the boot fetch
   * never sets state synchronously in the effect (the lint's cascading-render
   * rule); setLoading happens inside the async continuation. */
  const refresh = useCallback(
    (force: boolean): void => {
      const token = requestRef.current + 1
      requestRef.current = token
      void Promise.resolve()
        .then(() => window.picode.settings.listSkills(cwd, force))
        .then((payload) => {
          if (requestRef.current === token) {
            setReport(payload)
            setLoading(false)
          }
        })
        .catch(() => {
          if (requestRef.current === token) {
            setReport({ cwd, scannedAt: Date.now(), rows: [], error: 'The skills list could not be loaded.' })
            setLoading(false)
          }
        })
    },
    [cwd]
  )

  useEffect(() => {
    refresh(false)
  }, [refresh])

  const rows: SkillRowView[] = report !== null ? projectSkillRows(report.rows) : []

  async function toggle(row: SkillRowView, enable: boolean): Promise<void> {
    setBusy(row.path)
    setConfirm(null)
    try {
      const outcome = await window.picode.settings.toggleSkill(row, enable)
      if (!outcome.ok) window.dispatchEvent(new CustomEvent('picode:skills-error', { detail: outcome.error }))
    } finally {
      setBusy(null)
      refresh(true)
    }
  }

  async function remove(row: SkillRowView): Promise<void> {
    setBusy(row.path)
    setConfirm(null)
    try {
      const outcome = await window.picode.settings.deleteSkillEntry(row.entryPath ?? row.path)
      if (!outcome.ok) window.dispatchEvent(new CustomEvent('picode:skills-error', { detail: outcome.error }))
    } finally {
      setBusy(null)
      refresh(true)
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <h1>Skills</h1>
        <p className="settings-page-subtitle">
          The skills Pi loads for {cwd === null ? 'your home directory' : 'this project'} — from your user directory,
          packages, and trusted projects.
        </p>
      </header>

      <section className="settings-card">
        <div className="settings-skills-toolbar">
          <span className="settings-skills-count">
            {rows.length} skill{rows.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="settings-skills-refresh"
            aria-label="Refresh skills"
            onClick={() => refresh(true)}
            disabled={loading}
          >
            {loading ? <LoaderIcon size={13} /> : <RefreshIcon size={13} />}
            Refresh
          </button>
        </div>

        {report?.error != null && (
          <p className="settings-skills-error" role="alert">
            {report.error}
          </p>
        )}

        {rows.length === 0 && !loading && (report?.error == null) && (
          <p className="settings-skills-empty">No skills discovered for this directory.</p>
        )}

        <ul className="settings-skills-list">
          {rows.map((row) => (
            <li key={row.path} className={row.broken ? 'skill-row skill-row-broken' : 'skill-row'} data-skill-name={row.name}>
              <div className="skill-row-main">
                <div className="skill-row-title">
                  <span className="skill-row-name">{row.name}</span>
                  <span className={`skill-badge skill-badge-${row.badge}`}>{row.badgeLabel}</span>
                  {row.broken && <span className="skill-badge skill-badge-broken">Broken link</span>}
                  {!row.enabled && !row.broken && <span className="skill-badge skill-badge-off">Disabled</span>}
                </div>
                {row.description !== null && row.description !== '' && (
                  <p className="skill-row-description">{row.description}</p>
                )}
                <span className="skill-row-path" title={row.path}>
                  {row.path}
                </span>
                {row.badge === 'package' && <span className="skill-row-package">from package {row.source}</span>}
              </div>

              <div className="skill-row-actions">
                <button
                  type="button"
                  className="skill-row-btn"
                  aria-label={`Reveal ${row.name} in Finder`}
                  onClick={() => void window.picode.settings.revealSkill(row.path)}
                >
                  <FolderIcon size={14} />
                </button>

                {row.deleteKind !== null && (
                  <button
                    type="button"
                    className="skill-row-btn skill-row-danger"
                    aria-label={`Delete ${row.name}`}
                    onClick={() =>
                      setConfirm(
                        row.deleteKind === null
                          ? null
                          : { row, kind: row.deleteKind as Exclude<SkillDeleteKind, null> }
                      )
                    }
                    disabled={busy === row.path}
                  >
                    <TrashIcon size={14} />
                  </button>
                )}

                <button
                  type="button"
                  role="switch"
                  aria-checked={row.enabled}
                  aria-label={`Enable ${row.name}`}
                  className={row.enabled ? 'skill-switch skill-switch-on' : 'skill-switch'}
                  disabled={busy === row.path || row.broken}
                  onClick={() => void toggle(row, !row.enabled)}
                >
                  <span className="skill-switch-knob" />
                </button>
              </div>

              {confirm !== null && confirm.row.path === row.path && (
                <div className="skill-confirm" role="alertdialog" aria-label={`Delete ${row.name}`}>
                  <p className="skill-confirm-copy">{skillDeleteCopy(confirm.kind, confirm.row.realPath)}</p>
                  <div className="skill-confirm-actions">
                    <button
                      type="button"
                      className="skill-confirm-cancel"
                      onClick={() => setConfirm(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="skill-confirm-delete"
                      onClick={() => void remove(confirm.row)}
                    >
                      {confirm.kind === 'link' ? 'Remove link' : 'Delete directory'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
