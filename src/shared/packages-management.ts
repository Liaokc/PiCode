/**
 * Packages-management model (ticket 64): the Packages section of the
 * settings window — global packages (~/.pi/agent/settings.json) and
 * project packages (cwd/.pi/settings.json), plus the read-only project
 * trust display.
 *
 * Division of labor (the ticket's red line): PiCode WRITES the packages
 * configuration Pi consumes and never decides trust — install/remove go
 * through the SDK's own DefaultPackageManager (the exact code path
 * `pi install`/`pi remove` run), toggles derive the pi-config filter
 * format, and trust is DISPLAYED from trust.json + the global
 * defaultProjectTrust derivation. Zero trust.json writes.
 *
 * Package-level enable state: Pi has no package-level switch — the
 * pi-config format expresses "load nothing from this package" as an
 * object entry whose four filter arrays are all `[]` (settings.md:
 * "Empty array explicitly disables all resources of this type" — the
 * SDK applies it verbatim). Toggle OFF writes that canonical shape,
 * toggle ON strips the empty arrays and collapses back to the plain
 * string form when nothing else remains (the same cleanup pi config
 * applies). Known trade-off, recorded here: a package-level OFF→ON
 * round trip does not restore per-resource filters the entry carried
 * before the OFF (they are overwritten by the canonical shape).
 *
 * Trust derivation (ticket Q11=A, non-interactive host — no UI to ask):
 * a saved trust.json decision for the cwd or its nearest parent wins;
 * with no saved decision the global `defaultProjectTrust` decides —
 * `always` trusts, `ask`/`never` do not. The decision itself stays with
 * Pi's /trust command.
 *
 * Pure module: no node builtins, no SDK imports (Seam-1 guardrail) —
 * the probe reports rows over IPC and renderer/main consume the
 * projections.
 */

import type { PiPackageSource } from './skills-management'

// ---- source classification (mirrors the SDK's parseSource) ----

/** `npm:` specs, git URLs (git: shorthand or protocol URLs), local paths. */
export type PackageSourceKind = 'npm' | 'git' | 'local'

/**
 * Classify a package source the way the SDK's parseSource does: `npm:`
 * specs are npm; `git:` shorthands, `github:` shorthands and protocol
 * URLs (https/http/ssh/git) are git; everything else — absolute,
 * relative, or bare — is a local path. Informational (badges); the
 * install itself re-parses through the SDK.
 */
export function parsePackageSourceKind(source: string): PackageSourceKind {
  const trimmed = source.trim()
  if (trimmed.startsWith('npm:')) return 'npm'
  if (trimmed.startsWith('git:') || trimmed.startsWith('github:')) return 'git'
  if (/^(https?|ssh|git):\/\//.test(trimmed)) return 'git'
  return 'local'
}

export const PACKAGE_KIND_LABELS: Record<PackageSourceKind, string> = {
  npm: 'NPM',
  git: 'Git',
  local: 'Local'
}

const KIND_ORDER: Record<PackageSourceKind, number> = { npm: 0, git: 1, local: 2 }

/** The source string of a settings entry (string form or object form). */
export function packageEntrySource(entry: PiPackageSource): string {
  return typeof entry === 'string' ? entry : entry.source
}

// ---- package enable state (the pi-config filter format) ----

const FILTER_KEYS = ['extensions', 'skills', 'prompts', 'themes'] as const

/**
 * The canonical "package off" shape: object form with ALL FOUR filter
 * arrays present and empty. Anything else — string form, missing arrays,
 * non-empty filters — loads at least potentially, so it is "on".
 */
export function isPackageEntryDisabled(entry: PiPackageSource): boolean {
  if (typeof entry === 'string') return false
  return FILTER_KEYS.every((key) => Array.isArray(entry[key]) && entry[key].length === 0)
}

/**
 * Derive the entry's next shape for a package-level toggle. OFF → object
 * form with all four filter arrays emptied (other keys like autoload are
 * preserved); ON → empty filter arrays dropped, collapsing to the plain
 * string form when only `source` remains (an `autoload` key keeps the
 * object). Unchanged input yields `changed: false` and the SAME
 * reference.
 */
export function derivePackageEntryToggle(
  entry: PiPackageSource,
  enable: boolean
): { entry: PiPackageSource; changed: boolean } {
  if (enable) {
    if (typeof entry === 'string') return { entry, changed: false }
    const next: Record<string, unknown> = { ...entry }
    let dropped = false
    for (const key of FILTER_KEYS) {
      const value = next[key]
      if (Array.isArray(value) && value.length === 0) {
        delete next[key]
        dropped = true
      }
    }
    if (!dropped) return { entry, changed: false }
    const keys = Object.keys(next)
    if (keys.length === 1 && keys[0] === 'source') return { entry: next['source'] as string, changed: true }
    return { entry: next as unknown as PiPackageSource, changed: true }
  }
  if (isPackageEntryDisabled(entry)) return { entry, changed: false }
  const base: Record<string, unknown> = typeof entry === 'string' ? { source: entry } : { ...entry }
  for (const key of FILTER_KEYS) base[key] = []
  return { entry: base as unknown as PiPackageSource, changed: true }
}

/**
 * Derive the next `packages` array for one toggle: the entry is found by
 * its source string; a missing entry (removed elsewhere mid-flight) is a
 * no-op. Pure — nothing is persisted here.
 */
export function derivePackagesArrayToggle(
  packages: readonly PiPackageSource[],
  source: string,
  enable: boolean
): { packages: PiPackageSource[]; changed: boolean } {
  const index = packages.findIndex((pkg) => packageEntrySource(pkg) === source)
  if (index === -1) return { packages: [...packages], changed: false }
  const { entry, changed } = derivePackageEntryToggle(packages[index], enable)
  if (!changed) return { packages: [...packages], changed: false }
  const next = [...packages]
  next[index] = entry
  return { packages: next, changed: true }
}

// ---- probe report shapes (additive members of AuthProbeReport, ticket 64) ----

export interface PackageComponentCounts {
  extensions: number
  skills: number
  prompts: number
  themes: number
}

export type PackageScope = 'user' | 'project'

/** One package row of the probe's enumeration (the settings universe). */
export interface PackageRow {
  source: string
  kind: PackageSourceKind
  /** The raw settings entry (string or object) — the toggle's anchor. */
  entry: PiPackageSource
  /** Object-form `autoload` flag; null = string form / absent. */
  autoload: boolean | null
  /** Resolved component counts; null = the package could not be resolved
   * (missing install, dead local path). */
  counts: PackageComponentCounts | null
  /** The on-disk location when it exists (npm/git install dir, existing
   * local path). */
  installedPath: string | null
  scope: PackageScope
}

/**
 * The trust state of the probed project directory, READ-ONLY. `decision`
 * is the saved trust.json face ('none' = no saved decision for the cwd or
 * any parent); `trusted` is the loading face the derivation produces.
 */
export interface ProjectTrustState {
  decision: 'trusted' | 'untrusted' | 'none'
  trusted: boolean
  /** Whether the project carries trust-requiring resources at all (cwd/.pi
   * entries or .agents/skills in the cwd or an ancestor) — the untrusted
   * banner only means something when there is something to load. */
  hasResources: boolean
}

/** What the probe (host-family child) reports for the Packages section. */
export interface PackagesReport {
  /** The working directory the project layer was scoped to (null = the
   * global face — the section then has no project layer). */
  cwd: string | null
  scannedAt: number
  /** Global packages (~/.pi/agent/settings.json `packages`). */
  global: PackageRow[]
  /** Project packages (cwd/.pi/settings.json `packages`); empty without a cwd. */
  project: PackageRow[]
  /** The project's trust state; null without a cwd. */
  trust: ProjectTrustState | null
  error: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Structural guard for one package row arriving over IPC (probe → main). */
export function isPackageRow(value: unknown): value is PackageRow {
  if (!isRecord(value)) return false
  const entry = value['entry']
  const entryOk = typeof entry === 'string' || isRecord(entry)
  const autoload = value['autoload']
  const counts = value['counts']
  const countsOk =
    counts === null ||
    (isRecord(counts) &&
      typeof counts['extensions'] === 'number' &&
      typeof counts['skills'] === 'number' &&
      typeof counts['prompts'] === 'number' &&
      typeof counts['themes'] === 'number')
  const installedPath = value['installedPath']
  return (
    typeof value['source'] === 'string' &&
    typeof value['kind'] === 'string' &&
    ['npm', 'git', 'local'].includes(value['kind']) &&
    entryOk &&
    (autoload === null || typeof autoload === 'boolean') &&
    countsOk &&
    (installedPath === null || typeof installedPath === 'string') &&
    (value['scope'] === 'user' || value['scope'] === 'project')
  )
}

/** Structural guard for the probe's PackagesReport. */
export function isPackagesReport(value: unknown): value is PackagesReport {
  if (!isRecord(value)) return false
  return (
    (value['cwd'] === null || typeof value['cwd'] === 'string') &&
    typeof value['scannedAt'] === 'number' &&
    (value['error'] === null || typeof value['error'] === 'string') &&
    Array.isArray(value['global']) &&
    value['global'].every(isPackageRow) &&
    Array.isArray(value['project']) &&
    value['project'].every(isPackageRow) &&
    isTrustState(value['trust'])
  )
}

function isTrustState(value: unknown): value is ProjectTrustState | null {
  if (value === null) return true
  if (!isRecord(value)) return false
  return (
    (value['decision'] === 'trusted' || value['decision'] === 'untrusted' || value['decision'] === 'none') &&
    typeof value['trusted'] === 'boolean' &&
    typeof value['hasResources'] === 'boolean'
  )
}

// ---- package operations (install/remove via the SDK's own manager) ----

/** One install/remove op descriptor (main → op host over argv JSON). */
export interface PackagesOpDescriptor {
  op: 'install' | 'remove'
  source: string
  /** true = project scope (cwd/.pi/settings.json, `pi install -l`). */
  local: boolean
  cwd: string
  /** Agent-dir override for smokes/harnesses; null = the SDK's default. */
  agentDir: string | null
}

/** Progress relay of one running op (op host → main → renderer). */
export interface PackagesProgressEvent {
  kind: 'packages-progress'
  phase: 'start' | 'progress' | 'complete' | 'error'
  action: 'install' | 'remove'
  source: string
  message: string | null
}

export type PackagesOpOutcome = { ok: true } | { ok: false; error: string }

/** The refusal pi itself prints for untrusted project-scope writes (pi
 * official tone; the GUI wording points at /trust). */
export const PROJECT_UNTRUSTED_ERROR =
  'Project is not trusted — trust it with /trust in a Pi session before managing its packages.'

/**
 * The pure gate every project-scope op runs before touching anything:
 * project ops require a trusted project (saved decision or
 * defaultProjectTrust: 'always'); global ops never need trust. Returns
 * the refusal message, or null when the op may proceed.
 */
export function packagesOpRefusal(local: boolean, projectTrusted: boolean): string | null {
  if (!local) return null
  return projectTrusted ? null : PROJECT_UNTRUSTED_ERROR
}

/** Structural guard for op descriptors arriving at the op host. */
export function isPackagesOpDescriptor(value: unknown): value is PackagesOpDescriptor {
  if (!isRecord(value)) return false
  return (
    (value['op'] === 'install' || value['op'] === 'remove') &&
    typeof value['source'] === 'string' &&
    value['source'].trim() !== '' &&
    typeof value['local'] === 'boolean' &&
    typeof value['cwd'] === 'string' &&
    value['cwd'].trim() !== '' &&
    (value['agentDir'] === null || typeof value['agentDir'] === 'string')
  )
}

// ---- list projection (Seam-1 table tests) ----

/** One row of the Packages section list (probe row + rendered dimensions). */
export interface PackageRowView extends PackageRow {
  badgeLabel: string
  /** True = the canonical all-[]-filters off state (pi-config format). */
  disabled: boolean
  /** "2 extensions · 1 skill" — null when the package did not resolve. */
  countsLabel: string | null
  /** Presence note for unresolved rows: npm/git → Not installed, local →
   * Source missing. null for resolved rows. */
  statusNote: string | null
}

/** Human label for resolved component counts; zero types are omitted. */
export function packageCountsLabel(counts: PackageComponentCounts): string {
  const parts: string[] = []
  if (counts.extensions > 0) parts.push(counts.extensions === 1 ? '1 extension' : `${counts.extensions} extensions`)
  if (counts.skills > 0) parts.push(counts.skills === 1 ? '1 skill' : `${counts.skills} skills`)
  if (counts.prompts > 0) parts.push(counts.prompts === 1 ? '1 prompt' : `${counts.prompts} prompts`)
  if (counts.themes > 0) parts.push(counts.themes === 1 ? '1 theme' : `${counts.themes} themes`)
  return parts.join(' · ')
}

/**
 * Project the probe rows into the list view: kind badge label, disable
 * state, counts label, and status note — npm/git sorted before local,
 * then by source. The report is never mutated; rows are copied.
 */
export function projectPackageRows(rows: readonly PackageRow[]): PackageRowView[] {
  return rows
    .map((row) => {
      const countsLabel = row.counts === null ? null : packageCountsLabel(row.counts)
      const statusNote =
        row.counts === null ? (row.kind === 'local' ? 'Source missing' : 'Not installed') : null
      return {
        ...row,
        badgeLabel: PACKAGE_KIND_LABELS[row.kind],
        disabled: isPackageEntryDisabled(row.entry),
        countsLabel,
        statusNote
      }
    })
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.source.localeCompare(b.source))
}

// ---- trust derivation (read-only; the decision stays with Pi's /trust) ----

/** The untrusted banner's copy — the smoke asserts the exact wording. */
export const PACKAGES_UNTRUSTED_BANNER =
  'Project resources are not loaded by Pi. Trust this project with /trust in a Pi session.'

/**
 * Derive the trust state: a saved decision (true/false) wins; with none,
 * `defaultProjectTrust === 'always'` trusts and everything else — ask,
 * never, unknown, absent — does not (a non-interactive host has no UI to
 * ask, so the safe default applies).
 */
export function deriveProjectTrust(options: {
  savedDecision: boolean | null
  defaultProjectTrust: string | null
  hasResources: boolean
}): ProjectTrustState {
  const { savedDecision, defaultProjectTrust, hasResources } = options
  if (savedDecision !== null) {
    return { decision: savedDecision ? 'trusted' : 'untrusted', trusted: savedDecision, hasResources }
  }
  return { decision: 'none', trusted: defaultProjectTrust === 'always', hasResources }
}

/**
 * Pure nearest-decision walk over a parsed trust.json document (keys are
 * canonicalized absolute paths, values true/false/null). Mirrors the
 * SDK's findNearestTrustEntry: the cwd itself first, then parents up to
 * the root. Both `doc` and `cwd` must be pre-canonicalized by the caller.
 */
export function savedTrustDecision(doc: Record<string, unknown>, cwd: string): boolean | null {
  const norm = (p: string): string => p.replace(/\/+$/, '') || '/'
  let current = norm(cwd)
  for (;;) {
    const value = doc[current]
    if (value === true || value === false) return value
    const parent = current.slice(0, current.lastIndexOf('/')) || '/'
    if (parent === current) return null
    current = parent
  }
}

/**
 * Pure trust-requiring-resources check for one directory (real existsSync
 * injected by the caller). Mirrors the SDK's hasTrustRequiringProjectResources:
 * trust-requiring entries under cwd/.pi, or .agents/skills in the cwd or an
 * ancestor — except the user's own ~/.agents/skills.
 */
export function hasProjectTrustResources(
  cwd: string,
  homeDir: string,
  exists: (path: string) => boolean
): boolean {
  const TRUST_REQUIRING = ['settings.json', 'extensions', 'skills', 'prompts', 'themes', 'SYSTEM.md', 'APPEND_SYSTEM.md']
  const norm = (p: string): string => p.replace(/\/+$/, '') || '/'
  const userAgentsSkills = `${norm(homeDir)}/.agents/skills`
  let current = norm(cwd)
  for (const entry of TRUST_REQUIRING) {
    if (exists(`${current}/.pi/${entry}`)) return true
  }
  for (;;) {
    if (`${current}/.agents/skills` !== userAgentsSkills && exists(`${current}/.agents/skills`)) return true
    const parent = current.slice(0, current.lastIndexOf('/')) || '/'
    if (parent === current) return false
    current = parent
  }
}
