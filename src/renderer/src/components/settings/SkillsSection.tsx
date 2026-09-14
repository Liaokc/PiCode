import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import {
  filterSkillRows,
  partitionSkillRows,
  projectSkillRows,
  skillDeleteCopy,
  type SkillDeleteKind,
  type SkillRowView,
  type SkillsReport
} from '../../../../shared/skills-management'
import type { KnownProject } from '../../../../shared/sessions/group'
import type { ProjectTrustState } from '../../../../shared/packages-management'
import { FolderIcon, LoaderIcon, RefreshIcon, TrashIcon } from '../icons'

/**
 * The Skills section (ticket 63, restructured by ticket 67): Pi's actual
 * loading surface split across TWO cards — Global skills (user dir incl.
 * symlinks + package-provided; load everywhere) and Project skills
 * (scope-project rows, grouped BY PROJECT across the session index's
 * known projects). The split is a display projection; every row keeps its
 * source badge, per-skill pi-config toggle, Finder reveal, and the
 * strictly-scoped delete. Two search entries: one skill query filters
 * rows in BOTH cards; one project query filters the project groups.
 * Per-project probes reuse the cached settings:skills IPC, fired in small
 * batches with results rendering progressively; the main side fs-filters
 * the project list to plausible candidates (hasProjectTrustResources).
 */

interface SkillsSectionProps {
  /** The focused session's cwd (null = the home directory's global face). */
  cwd: string | null
}

const SKILL_SEARCH_PLACEHOLDER = 'Search skills by name, description, or path…'
const PROJECT_SEARCH_PLACEHOLDER = 'Search projects by name or path…'
/** How many project probes run concurrently (forks are real processes). */
const SCAN_BATCH = 4

type ConfirmState = { row: SkillRowView; kind: Exclude<SkillDeleteKind, null> } | null

/** One project's scan result in the Project card. */
interface ProjectGroup {
  project: KnownProject
  report: SkillsReport | null
  /** True while its probe is in flight (first pass). */
  loading: boolean
  /** True = this project owns the focused session's cwd. */
  focused: boolean
}

export default function SkillsSection({ cwd }: SkillsSectionProps): JSX.Element {
  // ---- the global face (null-cwd enumeration; user + package rows) ----
  const [globalReport, setGlobalReport] = useState<SkillsReport | null>(null)
  const [globalLoading, setGlobalLoading] = useState(true)
  // ---- the project scan (per-cwd reports, progressive) ----
  const [projects, setProjects] = useState<KnownProject[] | null>(null)
  const [projectGroups, setProjectGroups] = useState<Map<string, ProjectGroup>>(new Map())
  const [projectsLoading, setProjectsLoading] = useState(true)
  // ---- the two search entries ----
  const [skillQuery, setSkillQuery] = useState('')
  const [projectQuery, setProjectQuery] = useState('')

  const globalRequestRef = useRef(0)
  const scanRequestRef = useRef(0)

  const refreshGlobal = useCallback((force: boolean): void => {
    const token = globalRequestRef.current + 1
    globalRequestRef.current = token
    void Promise.resolve()
      .then(() => {
        setGlobalLoading(true)
        return window.picode.settings.listSkills(null, force)
      })
      .then((payload) => {
        if (globalRequestRef.current === token) {
          setGlobalReport(payload)
          setGlobalLoading(false)
        }
      })
      .catch(() => {
        if (globalRequestRef.current === token) {
          setGlobalReport({ cwd: null, scannedAt: Date.now(), rows: [], error: 'The skills list could not be loaded.' })
          setGlobalLoading(false)
        }
      })
  }, [])

  useEffect(() => {
    refreshGlobal(false)
  }, [refreshGlobal])

  /** The known-project list (main fs-pre-filters to plausible candidates),
   * then a batched progressive scan: each project's cached enumeration
   * lands as its own group. Batches bound the fork concurrency. */
  const scanProjects = useCallback((force: boolean): void => {
    const token = scanRequestRef.current + 1
    scanRequestRef.current = token
    void Promise.resolve()
      .then(() => {
        setProjectsLoading(true)
        return window.picode.settings.listProjects()
      })
      .then(async (list) => {
        if (scanRequestRef.current !== token) return
        setProjects(list)
        for (let i = 0; i < list.length; i += SCAN_BATCH) {
          if (scanRequestRef.current !== token) return
          const batch = list.slice(i, i + SCAN_BATCH)
          setProjectGroups((current) => {
            const next = new Map(current)
            for (const project of batch) {
              next.set(project.cwd, {
                project,
                report: next.get(project.cwd)?.report ?? null,
                loading: true,
                focused: project.cwd === cwd
              })
            }
            return next
          })
          await Promise.all(
            batch.map(async (project) => {
              try {
                const report = await window.picode.settings.listSkills(project.cwd, force)
                if (scanRequestRef.current !== token) return
                setProjectGroups((current) => {
                  const next = new Map(current)
                  next.set(project.cwd, {
                    project,
                    report,
                    loading: false,
                    focused: project.cwd === cwd
                  })
                  return next
                })
              } catch {
                if (scanRequestRef.current !== token) return
                setProjectGroups((current) => {
                  const next = new Map(current)
                  next.set(project.cwd, {
                    project,
                    report: { cwd: project.cwd, scannedAt: Date.now(), rows: [], error: 'The skills list could not be loaded.' },
                    loading: false,
                    focused: project.cwd === cwd
                  })
                  return next
                })
              }
            })
          )
        }
        if (scanRequestRef.current === token) setProjectsLoading(false)
      })
      .catch(() => {
        if (scanRequestRef.current === token) {
          setProjects([])
          setProjectsLoading(false)
        }
      })
  }, [cwd])

  useEffect(() => {
    scanProjects(false)
  }, [scanProjects])

  /** Any successful toggle/delete changes the settings files the probes
   * read — refresh everything so the lists reflect the new truth. */
  const refreshAll = useCallback((): void => {
    refreshGlobal(true)
    scanProjects(true)
  }, [refreshGlobal, scanProjects])

  const globalRowsAll: SkillRowView[] = globalReport === null ? [] : projectSkillRows(globalReport.rows)
  const { global: globalRows } = partitionSkillRows(globalRowsAll)
  const visibleGlobalRows = filterSkillRows(globalRows, skillQuery)

  // The focused project's rows ride its own scan entry when present.
  const groups = [...projectGroups.values()]
    .filter((group) => group.report !== null || group.loading)
    .sort((a, b) => Number(b.focused) - Number(a.focused) || a.project.name.localeCompare(b.project.name))
  const projectQueryTrimmed = projectQuery.trim().toLowerCase()
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      rows: group.report === null ? [] : partitionSkillRows(projectSkillRows(group.report.rows)).project
    }))
    .filter((group) => {
      if (projectQueryTrimmed !== '') {
        return (
          group.project.name.toLowerCase().includes(projectQueryTrimmed) ||
          group.project.cwd.toLowerCase().includes(projectQueryTrimmed)
        )
      }
      return group.rows.length > 0
    })
  const resolvedCount = groups.filter((group) => !group.loading).length
  const emptyCount = resolvedCount - visibleGroups.filter((group) => group.rows.length > 0 && projectQueryTrimmed === '').length

  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <h1>Skills</h1>
        <p className="settings-page-subtitle">
          The skills Pi loads — global skills everywhere, project skills for each project's directory.
        </p>
      </header>

      <div className="settings-skill-search">
        <input
          type="text"
          className="settings-skill-search-input"
          placeholder={SKILL_SEARCH_PLACEHOLDER}
          aria-label="Search skills"
          value={skillQuery}
          onChange={(event) => setSkillQuery(event.target.value)}
        />
      </div>

      {globalReport?.error != null && (
        <p className="settings-skills-error" role="alert">
          {globalReport.error}
        </p>
      )}

      <SkillCard
        title="Global skills"
        fileNote="~/.pi/agent/skills · packages"
        rows={visibleGlobalRows}
        loading={globalLoading}
        totalRows={globalRows.length}
        emptyCopy="No global skills discovered."
        onRefresh={() => refreshGlobal(true)}
        onNotifySkill={setSkillQuery}
      />

      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <h2 className="settings-card-head-title">Project skills</h2>
            <span className="settings-card-head-note">.pi per project</span>
          </div>
          <div className="settings-skills-toolbar">
            <input
              type="text"
              className="settings-project-search-input"
              placeholder={PROJECT_SEARCH_PLACEHOLDER}
              aria-label="Search projects"
              value={projectQuery}
              onChange={(event) => setProjectQuery(event.target.value)}
            />
            <button
              type="button"
              className="settings-skills-refresh"
              aria-label="Refresh project skills"
              onClick={() => scanProjects(true)}
              disabled={projectsLoading}
            >
              {projectsLoading ? <LoaderIcon size={13} /> : <RefreshIcon size={13} />}
              Refresh
            </button>
          </div>
        </div>

        {projects === null && projectsLoading && <p className="settings-skills-empty">Loading projects…</p>}
        {projects !== null && projects.length === 0 && (
          <p className="settings-skills-empty">No projects with .pi resources found in your session history.</p>
        )}
        {projects !== null && projects.length > 0 && visibleGroups.length === 0 && projectQueryTrimmed !== '' && (
          <p className="settings-skills-empty">No projects match “{projectQuery.trim()}”.</p>
        )}
        {projects !== null && projects.length > 0 && visibleGroups.length === 0 && projectQueryTrimmed === '' && !projectsLoading && (
          <p className="settings-skills-empty">No project skills discovered across your projects.</p>
        )}

        {visibleGroups.map((group) => (
          <ProjectGroupBlock
            key={group.project.cwd}
            group={group}
            skillQuery={skillQuery}
            onRefreshAll={refreshAll}
          />
        ))}

        {projectQueryTrimmed === '' && emptyCount > 0 && (
          <p className="settings-skills-empty settings-projects-summary">
            {emptyCount} project{emptyCount === 1 ? '' : 's'} without project skills.
          </p>
        )}
      </section>
    </div>
  )
}

// ---- one project group (header + its project-scope rows) ----

interface ProjectGroupBlockProps {
  group: ProjectGroup & { rows: SkillRowView[] }
  skillQuery: string
  onRefreshAll: () => void
}

function ProjectGroupBlock({ group, skillQuery, onRefreshAll }: ProjectGroupBlockProps): JSX.Element | null {
  const rows = filterSkillRows(group.rows, skillQuery)
  if (skillQuery.trim() !== '' && rows.length === 0) return null
  return (
    <div className="project-skill-group" data-project-cwd={group.project.cwd}>
      <div className="project-skill-group-head">
        <div className="project-skill-group-title">
          <span className="project-skill-group-name">{group.project.name}</span>
          {group.focused && <span className="skill-badge skill-badge-project">Focused</span>}
          <TrustChip trust={group.report?.trust ?? null} />
        </div>
        <span className="project-skill-group-path" title={group.project.cwd}>
          {group.project.cwd}
        </span>
      </div>
      {group.loading && (
        <p className="settings-skills-empty">
          <LoaderIcon size={12} /> Scanning…
        </p>
      )}
      {!group.loading && group.report?.error != null && (
        <p className="settings-skills-error" role="alert">
          {group.report.error}
        </p>
      )}
      {!group.loading && group.report !== null && rows.length === 0 && (
        <p className="settings-skills-empty">
          {skillQuery.trim() !== '' ? 'No skills match the search.' : 'No project skills for this project.'}
        </p>
      )}
      {rows.length > 0 && <SkillRows rows={rows} onRefreshAll={onRefreshAll} />}
    </div>
  )
}

function TrustChip({ trust }: { trust: ProjectTrustState | null }): JSX.Element | null {
  if (trust === null) return null
  if (!trust.trusted) return <span className="skill-badge skill-badge-broken">Not trusted</span>
  return <span className="skill-badge skill-badge-trusted">Trusted</span>
}

// ---- the shared card frame (Global card) ----

interface SkillCardProps {
  title: string
  fileNote: string
  rows: SkillRowView[]
  loading: boolean
  totalRows: number
  emptyCopy: string
  onRefresh: () => void
  onNotifySkill: (query: string) => void
}

function SkillCard({ title, fileNote, rows, loading, totalRows, emptyCopy, onRefresh }: SkillCardProps): JSX.Element {
  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <div>
          <h2 className="settings-card-head-title">{title}</h2>
          <span className="settings-card-head-note">{fileNote}</span>
        </div>
        <div className="settings-skills-toolbar">
          <span className="settings-skills-count">
            {rows.length} skill{rows.length === 1 ? '' : 's'}
            {rows.length !== totalRows ? ` of ${totalRows}` : ''}
          </span>
          <button type="button" className="settings-skills-refresh" aria-label={`Refresh ${title}`} onClick={onRefresh} disabled={loading}>
            {loading ? <LoaderIcon size={13} /> : <RefreshIcon size={13} />}
            Refresh
          </button>
        </div>
      </div>
      {rows.length === 0 && !loading && <p className="settings-skills-empty">{emptyCopy}</p>}
      {rows.length > 0 && <SkillRows rows={rows} onRefreshAll={onRefresh} />}
    </section>
  )
}

// ---- the shared row list (both cards render rows through this) ----

interface SkillRowsProps {
  rows: SkillRowView[]
  onRefreshAll: () => void
}

function SkillRows({ rows, onRefreshAll }: SkillRowsProps): JSX.Element {
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)

  async function toggle(row: SkillRowView, enable: boolean): Promise<void> {
    setBusy(row.path)
    setConfirm(null)
    try {
      const outcome = await window.picode.settings.toggleSkill(row, enable)
      if (!outcome.ok) window.dispatchEvent(new CustomEvent('picode:skills-error', { detail: outcome.error }))
    } finally {
      setBusy(null)
      onRefreshAll()
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
      onRefreshAll()
    }
  }

  return (
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
  )
}
