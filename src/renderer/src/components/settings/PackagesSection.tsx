import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import {
  PACKAGES_UNTRUSTED_BANNER,
  projectPackageRows,
  type PackageRowView,
  type PackagesReport,
  type ProjectTrustState
} from '../../../../shared/packages-management'
import { LoaderIcon, PlusIcon, RefreshIcon, TrashIcon } from '../icons'

/** The section scope: the global layer or the project layer (the bridge's
 * toggle scope; distinct from the package rows' user/project scope). */
type SectionScope = 'global' | 'project'

/**
 * The Packages section (ticket 64): Pi packages for the global layer
 * (~/.pi/agent/settings.json) and the project layer (the focused task's
 * cwd/.pi/settings.json) — the same list/install/remove/toggle vocabulary
 * `pi install` / `pi remove` use, one shared list component for both
 * scopes. The project card additionally shows the READ-ONLY trust state
 * (trust.json + the defaultProjectTrust derivation): an untrusted project
 * gets the honest banner — Pi is not loading its resources — and its
 * actions stay disabled. Trust decisions belong to Pi's /trust; PiCode
 * never writes trust.json.
 */

interface PackagesSectionProps {
  /** The working directory scoping the project layer (the focused
   * session's cwd; null = the global face only). */
  cwd: string | null
  /** Toast surface (failure toasts; App owns the stack). */
  onNotify: (message: string, level: 'info' | 'error') => void
}

const SECURITY_NOTE =
  'Packages run with full system access. Review source code before installing third-party packages.'

export default function PackagesSection({ cwd, onNotify }: PackagesSectionProps): JSX.Element {
  const [report, setReport] = useState<PackagesReport | null>(null)
  const [loading, setLoading] = useState(true)
  /** One-shot refresh with a stale-response guard (the skills pattern). */
  const requestRef = useRef(0)
  const refresh = useCallback(
    (force: boolean, dir: string | null): void => {
      const token = requestRef.current + 1
      requestRef.current = token
      // Everything async stays OUT of the effect body (the lint's
      // cascading-render rule): the setLoading ride happens inside the
      // promise chain.
      void Promise.resolve()
        .then(() => {
          setLoading(true)
          return window.picode.settings.listPackages(dir, force)
        })
        .then((payload) => {
          if (requestRef.current === token) {
            setReport(payload)
            setLoading(false)
          }
        })
        .catch(() => {
          if (requestRef.current === token) {
            setReport({
              cwd: dir,
              scannedAt: Date.now(),
              global: [],
              project: [],
              trust: null,
              error: 'The packages list could not be loaded.'
            })
            setLoading(false)
          }
        })
    },
    []
  )

  // Every mount force-refreshes (ticket 110): the per-dir cache in main has
  // no TTL and only PiCode's OWN ops clear it, so a cached mount would hide
  // packages another writer — the TUI's `pi install`, the same settings.json
  // landing zone — added since the last look. Mounting the section is a
  // fresh look; it must show the file truth, not the last snapshot.
  useEffect(() => {
    refresh(true, cwd)
  }, [refresh, cwd])

  /** A successful op/toggle changes the settings files the probe reads —
   * refresh so the list reflects the new truth. */
  const done = useCallback((): void => refresh(true, cwd), [refresh, cwd])

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <h1>Packages</h1>
        <p className="settings-page-subtitle">
          Extensions, skills, prompts and themes delivered by Pi packages — the same installs the pi CLI manages.
        </p>
      </header>

      {report?.error != null && (
        <p className="settings-skills-error" role="alert">
          {report.error}
        </p>
      )}

      <PackageList
        scope="global"
        requestCwd={cwd}
        rows={report === null ? [] : projectPackageRows(report.global)}
        loading={loading}
        title="Global packages"
        fileNote="~/.pi/agent/settings.json"
        onRefresh={() => refresh(true, cwd)}
        onDone={done}
        onNotify={onNotify}
      />

      <ProjectPackagesCard
        cwd={report?.cwd ?? null}
        rows={report === null ? [] : projectPackageRows(report.project)}
        trust={report?.trust ?? null}
        loading={loading}
        onRefresh={() => refresh(true, cwd)}
        onDone={done}
        onNotify={onNotify}
      />
    </div>
  )
}

// ---- the shared list (both scopes render through this) ----

interface PackageListProps {
  scope: SectionScope
  /** The cwd the project requests carry (null for the global scope). */
  requestCwd: string | null
  rows: PackageRowView[]
  loading: boolean
  title: string
  fileNote: string
  /** Extra context chip rendered in the header (trust state). */
  trustChip?: JSX.Element | null
  /** The untrusted banner line (project card only, when untrusted). */
  banner?: string | null
  /** Install/remove/toggle are disabled (untrusted project). */
  locked?: boolean
  onRefresh: () => void
  onDone: () => void
  onNotify: (message: string, level: 'info' | 'error') => void
}

function PackageList({
  scope,
  requestCwd,
  rows,
  loading,
  title,
  fileNote,
  trustChip,
  banner,
  locked = false,
  onRefresh,
  onDone,
  onNotify
}: PackageListProps): JSX.Element {
  const [source, setSource] = useState('')
  /** The op in flight (install/remove): its verb + the latest progress
   * message. null = idle. Local state — the relay only matters live. */
  const [op, setOp] = useState<{ verb: string; message: string | null } | null>(null)
  /** The row whose remove-confirm strip is open (source string). */
  const [confirmSource, setConfirmSource] = useState<string | null>(null)
  const [busySource, setBusySource] = useState<string | null>(null)
  const opRef = useRef(false)

  useEffect(() => {
    const off = window.picode.settings.onPackagesProgress((event) => {
      if (!opRef.current) return
      setOp((current) => (current === null ? current : { verb: current.verb, message: event.message ?? current.message }))
    })
    return () => {
      off()
    }
  }, [])

  function opStarted(verb: string, target: string): void {
    opRef.current = true
    setOp({ verb, message: `${verb} ${target}…` })
  }

  function opSettled(): void {
    opRef.current = false
    setOp(null)
    setBusySource(null)
    setConfirmSource(null)
    setSource('')
    onDone()
  }

  async function install(): Promise<void> {
    const trimmed = source.trim()
    if (trimmed === '' || op !== null || locked) return
    opStarted('Installing', trimmed)
    try {
      const outcome = await window.picode.settings.installPackage(trimmed, scope === 'project', requestCwd)
      if (!outcome.ok) onNotify(outcome.error, 'error')
      // Ticket 110, honest semantics: sessions load packages at startup —
      // the running ones (here and in the TUI, where /reload is the
      // equivalent) never hot-load. The toast says exactly that.
      else onNotify(`Installed ${trimmed}. Takes effect in new sessions.`, 'info')
    } catch {
      onNotify('The package operation failed before it could report.', 'error')
    } finally {
      opSettled()
    }
  }

  async function remove(row: PackageRowView): Promise<void> {
    if (op !== null || locked) return
    opStarted('Removing', row.source)
    try {
      const outcome = await window.picode.settings.removePackage(row.source, scope === 'project', requestCwd)
      if (!outcome.ok) onNotify(outcome.error, 'error')
      else onNotify(`Removed ${row.source}.`, 'info')
    } catch {
      onNotify('The package operation failed before it could report.', 'error')
    } finally {
      opSettled()
    }
  }

  async function toggle(row: PackageRowView, enable: boolean): Promise<void> {
    if (locked) return
    setBusySource(row.source)
    setConfirmSource(null)
    try {
      const outcome = await window.picode.settings.togglePackage(scope, row.source, enable, requestCwd)
      if (!outcome.ok) onNotify(outcome.error ?? 'The package toggle failed.', 'error')
    } finally {
      setBusySource(null)
      onDone()
    }
  }

  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <div>
          <h2 className="settings-card-head-title">{title}</h2>
          <span className="settings-card-head-note">{fileNote}</span>
        </div>
        <div className="settings-skills-toolbar">
          {trustChip}
          <span className="settings-skills-count">
            {rows.length} package{rows.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="settings-skills-refresh"
            aria-label={`Refresh ${title}`}
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? <LoaderIcon size={13} /> : <RefreshIcon size={13} />}
            Refresh
          </button>
        </div>
      </div>

      <div className="packages-install">
        <input
          type="text"
          className="packages-install-input"
          placeholder="npm:@scope/pkg, git:host/user/repo@v1, or /path/to/package"
          aria-label={`Package source to install for ${title}`}
          value={source}
          disabled={locked || op !== null}
          onChange={(event) => setSource(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void install()
          }}
        />
        <button
          type="button"
          className="packages-install-btn"
          disabled={locked || op !== null || source.trim() === ''}
          onClick={() => void install()}
        >
          <PlusIcon size={13} />
          Install
        </button>
      </div>
      {op !== null && (
        <p className="packages-op-progress" role="status">
          <LoaderIcon size={12} />
          {op.message ?? `${op.verb}…`}
        </p>
      )}
      <p className="packages-security-note">{SECURITY_NOTE}</p>

      {banner != null && (
        <p className="packages-untrusted-banner" role="alert">
          {banner}
        </p>
      )}

      {rows.length === 0 && !loading && (
        <p className="settings-skills-empty">
          {scope === 'global'
            ? 'No packages installed. Install one above, or with pi install in a terminal.'
            : 'No packages configured for this project.'}
        </p>
      )}

      <ul className="settings-skills-list">
        {rows.map((row) => {
          const confirmOpen = confirmSource === row.source
          return (
            <li key={`${row.scope}\u0000${row.source}`} className="skill-row" data-package-source={row.source}>
              <div className="skill-row-main">
                <div className="skill-row-title">
                  <span className="skill-row-name pkg-source">{row.source}</span>
                  <span className={`skill-badge skill-badge-${row.kind}`}>{row.badgeLabel}</span>
                  {row.disabled && <span className="skill-badge skill-badge-off">Disabled</span>}
                </div>
                {row.countsLabel !== null && <span className="packages-counts">{row.countsLabel}</span>}
                {row.statusNote !== null && <span className="packages-counts">{row.statusNote}</span>}
              </div>

              <div className="skill-row-actions">
                <button
                  type="button"
                  className="skill-row-btn skill-row-danger"
                  aria-label={`Remove ${row.source}`}
                  onClick={() => setConfirmSource(confirmOpen ? null : row.source)}
                  disabled={locked || op !== null || busySource === row.source}
                >
                  <TrashIcon size={14} />
                </button>

                <button
                  type="button"
                  role="switch"
                  aria-checked={!row.disabled}
                  aria-label={`Enable ${row.source}`}
                  className={row.disabled ? 'skill-switch' : 'skill-switch skill-switch-on'}
                  disabled={locked || op !== null || busySource === row.source}
                  onClick={() => void toggle(row, row.disabled)}
                >
                  <span className="skill-switch-knob" />
                </button>
              </div>

              {confirmOpen && (
                <div className="skill-confirm" role="alertdialog" aria-label={`Remove ${row.source}`}>
                  <p className="skill-confirm-copy">
                    {scope === 'project'
                      ? 'This removes the package from this project\'s .pi/settings.json — its entry and installed files under .pi/ are removed.'
                      : 'This removes the package from ~/.pi/agent/settings.json — its entry and installed files under ~/.pi/agent/ are removed.'}
                  </p>
                  <div className="skill-confirm-actions">
                    <button type="button" className="skill-confirm-cancel" onClick={() => setConfirmSource(null)}>
                      Cancel
                    </button>
                    <button type="button" className="skill-confirm-delete" onClick={() => void remove(row)}>
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ---- the project card (trust display + the same shared list) ----

interface ProjectPackagesCardProps {
  cwd: string | null
  rows: PackageRowView[]
  trust: ProjectTrustState | null
  loading: boolean
  onRefresh: () => void
  onDone: () => void
  onNotify: (message: string, level: 'info' | 'error') => void
}

function ProjectPackagesCard({
  cwd,
  rows,
  trust,
  loading,
  onRefresh,
  onDone,
  onNotify
}: ProjectPackagesCardProps): JSX.Element {
  // The cwd is the REPORT's scope (the probe echoes the request's cwd; the
  // deterministic fake fixture carries its own) — the card renders what
  // the report carries.
  if (cwd === null) {
    return (
      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <h2 className="settings-card-head-title">Project packages</h2>
            <span className="settings-card-head-note">.pi/settings.json</span>
          </div>
        </div>
        <p className="settings-skills-empty">Open a task to manage its project packages.</p>
      </section>
    )
  }
  const untrusted = trust !== null && !trust.trusted
  const banner = untrusted && (trust as ProjectTrustState).hasResources ? PACKAGES_UNTRUSTED_BANNER : null
  return (
    <PackageList
      scope="project"
      requestCwd={cwd}
      rows={rows}
      loading={loading}
      title="Project packages"
      fileNote=".pi/settings.json"
      locked={untrusted}
      onRefresh={onRefresh}
      onDone={onDone}
      onNotify={onNotify}
      banner={banner}
      trustChip={
        untrusted ? (
          <span className="skill-badge skill-badge-broken">Not trusted</span>
        ) : trust !== null && trust.trusted ? (
          <span className="skill-badge skill-badge-trusted">Trusted</span>
        ) : null
      }
    />
  )
}
