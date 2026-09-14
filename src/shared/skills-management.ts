/**
 * Skills-management model (ticket 63): the Skills section of the settings
 * window. The list mirrors Pi's ACTUAL loading surface — every skill entry
 * Pi discovers (user dir incl. symlinks, package-provided, trusted project)
 * with its current enabled state — plus the pure derivations that turn a
 * toggle into a `pi config`-format settings change and a delete into a
 * strictly-scoped filesystem action.
 *
 * Data safety line (ticket 63, Q3/Q5): deletes only ever touch the ENTRY
 * under `~/.pi/agent/skills` — a symlink is unlinked, a real directory is
 * removed — while symlink TARGETS (the `~/.agents/skills` / `~/.cc-switch/
 * skills` SSOT directories) are never read-write-recursed into. Package
 * skills are not deletable at all (they follow their package). The pure
 * helpers here (containment, delete kind, confirm copy, settings-change
 * derivation) are the table-tested half; `src/main/settings/skills-service`
 * re-validates at action time with the real filesystem.
 *
 * Pure module: no node builtins, no SDK imports (Seam-1 guardrail) — the
 * probe reports rows over IPC and the renderer/main consume the projections.
 */

import type { ProjectTrustState } from './packages-management'

// ---- probe report shapes (additive member of AuthProbeReport, ticket 63) ----

/** Where Pi discovered a skill. `scope` mirrors the SDK's SourceScope. */
export type SkillScope = 'user' | 'project' | 'temporary'

/** `package` = delivered by a configured package; `top-level` = user dir,
 * project dir, or a settings.skills path entry. */
export type SkillOrigin = 'package' | 'top-level'

/** The row's source badge (ticket 63 Q10=A: user dir / package / project). */
export type SkillSourceBadge = 'user' | 'package' | 'project'

/** lstat classification of the ENTRY under ~/.pi/agent/skills — the thing a
 * delete would remove. null for rows outside that directory. */
export type SkillEntryKind = 'symlink' | 'real-dir' | 'real-file' | null

/** One skill row of the probe's enumeration (Pi's loading-surface universe). */
export interface SkillCatalogRow {
  /** SKILL.md path (through any symlink — Pi loads through the link); for
   * broken rows the link path itself (no SKILL.md exists behind it). */
  path: string
  /** The entry under ~/.pi/agent/skills when the row lives there (the
   * deletable thing — a link or a real directory/file); null otherwise. */
  entryPath: string | null
  entryKind: SkillEntryKind
  /** Real location of the skill content for live ~/.pi/agent/skills links
   * (the SSOT directory the link points at); null otherwise. */
  realPath: string | null
  name: string
  description: string | null
  /** Whether Pi actually loads this skill right now (the loaded face). */
  enabled: boolean
  scope: SkillScope
  origin: SkillOrigin
  /** metadata.source verbatim: "auto", "local", or the package source. */
  source: string
  /** metadata.baseDir when present — the anchor pi-config patterns are
   * relative to. */
  baseDir: string | null
  /** True = dangling link (target gone). Marked in the list, never silently
   * hidden; not toggleable. */
  broken: boolean
}

/** What the probe (host-family child) reports for the Skills section. */
export interface SkillsReport {
  /** The working directory the enumeration was scoped to (null = home). */
  cwd: string | null
  scannedAt: number
  rows: SkillCatalogRow[]
  error: string | null
  /** Ticket 67 (additive): the probed cwd's read-only project trust state
   * (saved decision + defaultProjectTrust derivation; null without a
   * project scope). Rides the probe report that already computes it for
   * the Packages section — the Project-skills group headers surface it
   * honestly (rows of an untrusted project are NOT loaded by Pi).
   * Reports from older probes omit the field. */
  trust?: ProjectTrustState | null
}

// ---- structural guard (probe child → main, same family as auth-status) ----

const SKILL_SCOPES = new Set(['user', 'project', 'temporary'])
const SKILL_ORIGINS = new Set(['package', 'top-level'])
const SKILL_ENTRY_KINDS = new Set(['symlink', 'real-dir', 'real-file'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Structural guard for one skills row arriving over IPC (probe → main). */
export function isSkillCatalogRow(value: unknown): value is SkillCatalogRow {
  if (!isRecord(value)) return false
  const scope = value['scope']
  const origin = value['origin']
  const entryKind = value['entryKind']
  return (
    typeof value['path'] === 'string' &&
    (value['entryPath'] === null || typeof value['entryPath'] === 'string') &&
    (entryKind === null || (typeof entryKind === 'string' && SKILL_ENTRY_KINDS.has(entryKind))) &&
    (value['realPath'] === null || typeof value['realPath'] === 'string') &&
    typeof value['name'] === 'string' &&
    (value['description'] === null || typeof value['description'] === 'string') &&
    typeof value['enabled'] === 'boolean' &&
    typeof scope === 'string' &&
    SKILL_SCOPES.has(scope) &&
    typeof origin === 'string' &&
    SKILL_ORIGINS.has(origin) &&
    typeof value['source'] === 'string' &&
    (value['baseDir'] === null || typeof value['baseDir'] === 'string') &&
    typeof value['broken'] === 'boolean'
  )
}

/** Structural guard for the probe's SkillsReport. */
export function isSkillsReport(value: unknown): value is SkillsReport {
  if (!isRecord(value)) return false
  const trust = value['trust']
  const trustOk =
    trust === undefined ||
    trust === null ||
    (isRecord(trust) &&
      (trust['decision'] === 'trusted' || trust['decision'] === 'untrusted' || trust['decision'] === 'none') &&
      typeof trust['trusted'] === 'boolean' &&
      typeof trust['hasResources'] === 'boolean')
  return (
    (value['cwd'] === null || typeof value['cwd'] === 'string') &&
    typeof value['scannedAt'] === 'number' &&
    (value['error'] === null || typeof value['error'] === 'string') &&
    Array.isArray(value['rows']) &&
    value['rows'].every(isSkillCatalogRow) &&
    trustOk
  )
}

// ---- list projection (Seam-1 table tests) ----

/** The badge a row renders with. Package wins over scope (a package skill
 * for a project-scope install is still a Package row); project scope is the
 * project badge; everything else is the user-dir badge. */
export function skillSourceBadge(row: Pick<SkillCatalogRow, 'scope' | 'origin'>): SkillSourceBadge {
  if (row.origin === 'package') return 'package'
  if (row.scope === 'project') return 'project'
  return 'user'
}

/**
 * Lexical containment, separator-safe: is `child` the directory itself or
 * inside it? Deliberately NO realpath — the delete rule is about the ENTRY
 * (the link) living in ~/.pi/agent/skills, not about where its target sits;
 * the main-side delete re-checks with lstat before touching anything.
 */
export function isUnderPiSkillsDir(child: string, piSkillsDir: string): boolean {
  const norm = (p: string): string => p.replace(/\/+$/, '')
  const dir = norm(piSkillsDir)
  const path = norm(child)
  if (path === dir) return true
  return path.startsWith(`${dir}/`)
}

/**
 * The delete kind for a row: 'link' = only the link/entry is removed (the
 * real directory it points at stays); 'real' = the real directory/file under
 * ~/.pi/agent/skills is removed from disk; null = not deletable (outside the
 * user skills dir, or a package-provided skill — those follow their package).
 */
export type SkillDeleteKind = 'link' | 'real' | null

export function skillDeleteKind(row: SkillCatalogRow): SkillDeleteKind {
  if (row.entryPath === null || row.origin === 'package') return null
  if (row.entryKind === 'symlink') return 'link'
  if (row.entryKind === 'real-dir' || row.entryKind === 'real-file') return 'real'
  return null
}

/** One row of the Skills section list (probe row + rendered dimensions). */
export interface SkillRowView extends SkillCatalogRow {
  badge: SkillSourceBadge
  badgeLabel: string
  deleteKind: SkillDeleteKind
}

export const SKILL_BADGE_LABELS: Record<SkillSourceBadge, string> = {
  user: 'User',
  package: 'Package',
  project: 'Project'
}

const BADGE_ORDER: Record<SkillSourceBadge, number> = { user: 0, package: 1, project: 2 }

/**
 * Project the probe rows into the list view: badge, delete kind, grouped
 * user → package → project and name-sorted within each group. The report is
 * never mutated; rows are copied.
 */
export function projectSkillRows(rows: readonly SkillCatalogRow[]): SkillRowView[] {
  return rows
    .map((row) => {
      const badge = skillSourceBadge(row)
      return { ...row, badge, badgeLabel: SKILL_BADGE_LABELS[badge], deleteKind: skillDeleteKind(row) }
    })
    .sort(
      (a, b) =>
        BADGE_ORDER[a.badge] - BADGE_ORDER[b.badge] ||
        a.name.localeCompare(b.name) ||
        a.path.localeCompare(b.path)
    )
}

// ---- section split + search projections (ticket 67) ----

/** The two section cards: global skills load everywhere, project skills
 * only for their directory. The split is a pure display projection over
 * the scope field — the union is still Pi's full loading surface. */
export interface SkillSectionSplit {
  /** scope !== 'project' rows (user dir + package-provided). */
  global: SkillRowView[]
  /** scope === 'project' rows. */
  project: SkillRowView[]
}

/** Partition projected rows into the Global / Project cards. */
export function partitionSkillRows(rows: readonly SkillRowView[]): SkillSectionSplit {
  const global: SkillRowView[] = []
  const project: SkillRowView[] = []
  for (const row of rows) {
    if (row.scope === 'project') project.push(row)
    else global.push(row)
  }
  return { global, project }
}

/** Case-insensitive substring match over name, description, and path —
 * the one skill-search entry filters both cards. Empty query = no filter. */
export function filterSkillRows(rows: readonly SkillRowView[], query: string): SkillRowView[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...rows]
  return rows.filter(
    (row) =>
      row.name.toLowerCase().includes(needle) ||
      (row.description ?? '').toLowerCase().includes(needle) ||
      row.path.toLowerCase().includes(needle)
  )
}

/** Confirmation copy for the two delete kinds (ticket 63: type-split, ZCode
 * confirmation semantics). English UI copy lives here so the smoke asserts
 * the exact wording. */
export function skillDeleteCopy(kind: Exclude<SkillDeleteKind, null>, realPath: string | null): string {
  if (kind === 'link') {
    return realPath !== null
      ? `This removes only the link from ~/.pi/agent/skills — the skill directory at ${realPath} is not touched.`
      : 'This removes only the broken link from ~/.pi/agent/skills — nothing else is touched.'
  }
  return 'The directory will be removed from disk. This cannot be undone.'
}

// ---- pure path helpers (POSIX-style; both sides run on the same machine,
// backslashes are normalized so Windows drive paths still relativize) ----

function splitPath(p: string): string[] {
  return p.replace(/\\/g, '/').split('/').filter((part) => part !== '')
}

/** Pure `path.relative` for the pattern derivations (same-machine paths). */
export function relativePath(from: string, to: string): string {
  const fromParts = splitPath(from)
  const toParts = splitPath(to)
  let common = 0
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common += 1
  }
  const ups = fromParts.length - common
  const down = toParts.slice(common)
  const rel = [...Array.from({ length: ups }, () => '..'), ...down].join('/')
  return rel === '' ? '.' : rel
}

/** Pure `path.dirname` (the tail after the last separator is dropped);
 * absolute inputs stay absolute. */
export function dirnamePath(p: string): string {
  const absolute = p.startsWith('/') || /^[A-Za-z]:/.test(p)
  const parts = splitPath(p)
  parts.pop()
  const joined = parts.join('/')
  if (joined === '') return absolute ? '/' : '.'
  return absolute ? `/${joined}`.replace(/^\/([A-Za-z]:)/, '$1') : joined
}

/** Pure `path.basename`. */
export function basenamePath(p: string): string {
  const parts = splitPath(p)
  return parts.length > 0 ? parts[parts.length - 1]! : p
}

// ---- toggle → settings-change derivation (pi config format, ticket 63) ----

/** Pi settings package entry shape (mirror of the SDK's PackageSource — the
 * renderer and the editor never import the SDK). */
export type PiPackageSource =
  | string
  | {
      source: string
      autoload?: boolean
      extensions?: string[]
      skills?: string[]
      prompts?: string[]
      themes?: string[]
    }

/** The slice of Pi's global settings.json the toggle writes. */
export interface PiResourceSettings {
  skills?: readonly string[]
  packages?: readonly PiPackageSource[]
}

/** The override entry pi config writes: `-{pattern}` disables, `+{pattern}`
 * force-includes. Any of `!`, `+`, `-` marks an override entry. */
export function overrideEntryTarget(entry: string): string {
  return entry.startsWith('!') || entry.startsWith('+') || entry.startsWith('-') ? entry.slice(1) : entry
}

/** The pi-config pattern for a top-level row: path relative to the row's
 * metadata baseDir (the agent dir is the fallback anchor). */
export function skillPatternFor(row: SkillCatalogRow, agentDir: string): string {
  return relativePath(row.baseDir ?? agentDir, row.path)
}

/** The pi-config pattern for a package-provided row: path relative to the
 * package root (metadata.baseDir; the skill's parent dir is the fallback). */
export function packageSkillPatternFor(row: SkillCatalogRow): string {
  return relativePath(row.baseDir ?? dirnamePath(row.path), row.path)
}

/**
 * Derive the settings change for one toggle, in exactly the format
 * `pi config` writes (ticket 63 acceptance: "与 pi config 同格式"):
 *
 * - top-level rows → the global `skills` array: existing override entries
 *   for this row's pattern are stripped, then `-{pattern}` (disable) or
 *   `+{pattern}` (enable) is appended.
 * - package rows → the package's entry in `packages`: string entries are
 *   promoted to object form, the per-resource filter array gains the same
 *   override entry; an emptied filter array reverts the entry to plain
 *   source form.
 *
 * Pure: returns the next document slice; unchanged input yields
 * `changed: false` and the SAME reference. Nothing is persisted here.
 */
export function deriveSkillSettingsChange(
  settings: PiResourceSettings,
  row: SkillCatalogRow,
  enable: boolean,
  agentDir: string
): { settings: PiResourceSettings; changed: boolean } {
  if (row.origin === 'package') {
    const packages = settings.packages ?? []
    const pattern = packageSkillPatternFor(row)
    const index = packages.findIndex((pkg) => (typeof pkg === 'string' ? pkg : pkg.source) === row.source)
    if (index === -1) return { settings, changed: false }
    const entry: PiPackageSource = packages[index]!
    const asObject = typeof entry === 'string' ? { source: entry } : { ...entry }
    const current = asObject.skills ?? []
    // Strip every existing override entry for this pattern, then append the
    // desired one — the array can never end up empty through this path (an
    // append always lands), so pi config's empty-filter cleanup is simply
    // unreachable here.
    const updated = current.filter((p) => overrideEntryTarget(p) !== pattern)
    updated.push(enable ? `+${pattern}` : `-${pattern}`)
    const result = [...packages]
    result[index] = { ...asObject, skills: updated }
    return { settings: { ...settings, packages: result }, changed: stringify(packages) !== stringify(result) }
  }

  const current = settings.skills ?? []
  const pattern = skillPatternFor(row, agentDir)
  const updated = current.filter((p) => overrideEntryTarget(p) !== pattern)
  updated.push(enable ? `+${pattern}` : `-${pattern}`)
  return { settings: { ...settings, skills: updated }, changed: stringify(current) !== stringify(updated) }
}

function stringify(value: unknown): string {
  return JSON.stringify(value)
}

// ---- identity fallbacks for rows Pi did not load ----

/**
 * Peek a SKILL.md's frontmatter scalars (name/description) for rows Pi does
 * not load (disabled by settings, or unreadable). Best-effort by design:
 * malformed files yield nulls and the row falls back to its directory name.
 */
export function peekSkillIdentity(raw: string): { name: string | null; description: string | null } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)/)
  if (!match) return { name: null, description: null }
  const block = match[1] ?? ''
  const scalar = (key: string): string | null => {
    const line = block.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'))
    if (!line) return null
    const value = (line[1] ?? '').trim().replace(/^['"]|['"]$/g, '').trim()
    return value === '' ? null : value
  }
  return { name: scalar('name'), description: scalar('description') }
}

/**
 * Build one catalog row with the identity fallback chain: the loaded face's
 * name/description when Pi loaded the skill, else the frontmatter peek,
 * else the entry directory name. `entry` carries the lstat classification
 * for rows under ~/.pi/agent/skills (null elsewhere).
 */
export function buildSkillCatalogRow(
  resource: {
    path: string
    enabled: boolean
    scope: string
    origin: string
    source: string
    baseDir?: string | null
  },
  identity: {
    loaded?: { name: string; description: string } | null
    frontmatter?: { name: string | null; description: string | null } | null
    entryPath?: string | null
    entryKind?: SkillEntryKind
    realPath?: string | null
    broken?: boolean
  }
): SkillCatalogRow {
  const frontmatter = identity.frontmatter ?? null
  const name =
    identity.loaded?.name ??
    (frontmatter?.name !== null && frontmatter?.name !== undefined ? frontmatter.name : null) ??
    basenamePath(identity.entryPath ?? dirnamePath(resource.path))
  const description =
    identity.loaded?.description ??
    (frontmatter?.description !== null && frontmatter?.description !== undefined ? frontmatter.description : null)
  return {
    path: resource.path,
    entryPath: identity.entryPath ?? null,
    entryKind: identity.entryKind ?? null,
    realPath: identity.realPath ?? null,
    name,
    description,
    // As-loaded truth: a broken row can never load; a live row is enabled
    // only when the package manager marks it enabled AND it is actually in
    // the loaded face (identity.loaded present).
    enabled: identity.broken === true ? false : resource.enabled && identity.loaded !== undefined,
    scope: (SKILL_SCOPES.has(resource.scope) ? resource.scope : 'temporary') as SkillScope,
    origin: (SKILL_ORIGINS.has(resource.origin) ? resource.origin : 'top-level') as SkillOrigin,
    source: resource.source,
    baseDir: resource.baseDir ?? null,
    broken: identity.broken ?? false
  }
}
