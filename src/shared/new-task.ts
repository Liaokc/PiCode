/**
 * New-task empty state (ticket 17): the default-project resolver behind the
 * project chip, plus the recent-workspace projection and the workspace search
 * for the chip's dropdown. Pure functions so the fallback chain is testable
 * headlessly (table-driven vitest) without Electron.
 *
 * The chip's default follows a fixed fallback chain — active session's
 * project → last used directory → most recent project — unless the user
 * pinned a fixed project in settings (which overrides everything).
 */
import type { NewTaskDefaultMode } from './preferences.ts'
import { projectLabel } from './sessions/group.ts'
import type { SessionSummary } from './sessions/types.ts'

/** Inputs of the new-task default-project resolution. */
export interface NewTaskProjectInput {
  /** Settings mode: follow recent activity or a fixed project. */
  mode: NewTaskDefaultMode
  /** The pinned project for 'fixed' mode; null = not chosen yet. */
  fixedProject: string | null
  /** The open session's project, or null when none is open. */
  activeSessionCwd: string | null
  /** Last directory a created/resumed session actually used. */
  lastUsedDirectory: string | null
  /** Recent workspace cwds, most recent first (see recentProjects). */
  recentProjects: readonly string[]
}

const isBlank = (value: string | null | undefined): boolean =>
  value === null || value === undefined || value.trim() === ''

/**
 * The project chip's default value. A pinned fixed project wins outright;
 * otherwise the chain applies: active session's project → last used
 * directory → first recent project. null = nothing known (the composer send
 * then degrades to the system folder picker).
 */
export function resolveNewTaskProject(input: NewTaskProjectInput): string | null {
  if (input.mode === 'fixed' && !isBlank(input.fixedProject)) return input.fixedProject!.trim()
  if (!isBlank(input.activeSessionCwd)) return input.activeSessionCwd!.trim()
  if (!isBlank(input.lastUsedDirectory)) return input.lastUsedDirectory!.trim()
  for (const project of input.recentProjects) {
    if (!isBlank(project)) return project.trim()
  }
  return null
}

/**
 * Distinct workspace cwds from the session index, ordered by each project's
 * most recent session — the chip dropdown's "recent workspaces" list.
 */
export function recentProjects(sessions: readonly SessionSummary[]): string[] {
  const latestByCwd = new Map<string, number>()
  for (const session of sessions) {
    const known = latestByCwd.get(session.cwd)
    if (known === undefined || session.modifiedAt > known) latestByCwd.set(session.cwd, session.modifiedAt)
  }
  return [...latestByCwd.entries()].sort((a, b) => b[1] - a[1]).map(([cwd]) => cwd)
}

/**
 * Case-insensitive workspace search for the dropdown: a workspace matches
 * when the query appears in its project label (directory basename) or its
 * full path. Blank queries keep everything.
 */
export function filterWorkspaces(projects: readonly string[], query: string): string[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...projects]
  return projects.filter(
    (cwd) => projectLabel(cwd).toLowerCase().includes(needle) || cwd.toLowerCase().includes(needle)
  )
}
