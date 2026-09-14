import type { AuthProbeReport, CommandCatalogRow, ModelCatalogEntry, ProviderAuthStatus } from '../shared/auth-status.ts'
import type { ThinkingLevel } from '../shared/contract.ts'
import {
  deriveProjectTrust,
  hasProjectTrustResources,
  parsePackageSourceKind,
  type PackageRow,
  type ProjectTrustState
} from '../shared/packages-management.ts'
import {
  buildSkillCatalogRow,
  isUnderPiSkillsDir,
  peekSkillIdentity,
  type SkillCatalogRow,
  type SkillEntryKind
} from '../shared/skills-management.ts'
import { homedir } from 'node:os'
import { existsSync, readdirSync, readFileSync, lstatSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Auth-probe collector (ticket 11, extended by ticket 52). The probe is a
 * short-lived host-family process (ADR-0003: the Pi SDK never loads in the
 * renderer or the main process) that enumerates the Pi provider registry
 * read-only and reports credential metadata — never secret values — plus
 * (ticket 52) the command catalog for one working directory: the resource
 * loader's prompt templates + skills, no session machinery behind it. This
 * module keeps the pure projections (`collectAuthStatuses`,
 * `collectCommandCatalog`, injectable + fake-testable); the SDK wiring
 * lives in `runAuthProbe` at the host entry.
 */

/** Structural subset of pi-ai `Models` the probe needs. */
export interface AuthProbeModels {
  getProviders(): ReadonlyArray<{ id: string }>
  getProvider(id: string): { name?: string } | undefined
  getModels(providerId?: string): ReadonlyArray<ProbeModelLike>
  checkAuth(providerId: string): Promise<{ source?: string; type: 'api_key' | 'oauth' } | undefined>
}

/** Structural subset of a pi-ai `Model` the probe projects (ticket 41: the
 * thinking-level data feeds the empty-state menu's per-model filtering). */
export interface ProbeModelLike {
  id: string
  name?: string
  reasoning?: boolean
  /** Maps pi thinking levels to model-specific values; null = unsupported,
   * missing key = provider default (pi-ai `Model.thinkingLevelMap`). */
  thinkingLevelMap?: Partial<Record<string, string | null>>
}

/** Canonical pi thinking levels, the SDK's EXTENDED_THINKING_LEVELS order. */
const ALL_LEVELS: readonly ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

/**
 * The thinking levels a model actually supports — mirrors the SDK's
 * `getSupportedThinkingLevels` (not exported from the package; verified
 * against the 0.84.x bundle). Non-reasoning models only ever support 'off';
 * a level mapped to null is unsupported; xhigh/max must be mapped
 * explicitly while the other levels default to supported.
 */
export function supportedThinkingLevels(model: ProbeModelLike): ThinkingLevel[] {
  if (!model.reasoning) return ['off']
  return ALL_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level]
    if (mapped === null) return false
    return level === 'xhigh' || level === 'max' ? mapped !== undefined : true
  })
}

/** Structural subset of the stored `Credential` (auth.json entry). */
export interface StoredCredentialLike {
  type?: string
  expires?: number
}

/**
 * Structural subset of the SDK's `ResourceLoader` the probe enumerates
 * (ticket 52): prompt templates + skills for one working directory — the
 * same `getPrompts`/`getSkills` faces the live session's slash menu feeds
 * from, so the empty-state menu matches the in-session one exactly.
 */
export interface ProbeResourceLoader {
  getPrompts(): { prompts: Array<{ name: string; description: string; argumentHint?: string }> }
  getSkills(): { skills: Array<{ name: string; description: string }> }
}

/**
 * Project the resource loader's prompt templates + skills into the probe
 * report's raw catalog rows (prompts first, then skills — the same order
 * the in-session `buildSlashCommands` uses). Enumeration failures degrade
 * to an empty catalog: the menu is truthfully empty, never a crash.
 */
export function collectCommandCatalog(loader: ProbeResourceLoader): CommandCatalogRow[] {
  try {
    const rows: CommandCatalogRow[] = loader.getPrompts().prompts.map((p) => ({
      name: p.name,
      description: p.description,
      // Frontmatter YAML may deliver a non-string hint (e.g. `[env]` parses
      // as a one-element array) even though the SDK types it string — the
      // in-session menu renders it inline, so stringify the same way.
      ...(p.argumentHint !== undefined ? { argumentHint: stringifyHint(p.argumentHint) } : {}),
      source: 'prompt' as const
    }))
    for (const skill of loader.getSkills().skills) {
      rows.push({ name: skill.name, description: skill.description, source: 'skill' })
    }
    return rows
  } catch {
    return []
  }
}

/** YAML frontmatter values can be arrays/numbers; the menu renders hints
 * inline via template literal, so non-strings stringify the same way. */
function stringifyHint(hint: unknown): string {
  return typeof hint === 'string' ? hint : String(hint)
}

// ---- ticket 63: skills enumeration (Pi's actual loading surface) ----

/** Structural subset of the SDK's ResolvedResource rows the enumeration needs. */
interface ResolvedSkillRow {
  path: string
  enabled: boolean
  metadata: { source: string; scope: string; origin: string; baseDir?: string }
}

interface PackageManagerLike {
  resolve(onMissing: (source: string) => Promise<'skip'>): Promise<{ skills: ResolvedSkillRow[] }>
}
/** The probe receives the SDK class dynamically (ESM-only package); the
 * structural ctor type keeps this module's surface SDK-free. The
 * settingsManager slot is the services' REAL SettingsManager — declared as
 * the opaque structural bound so the host module never names the SDK type. */
interface SettingsManagerLike {
  getGlobalSettings(): unknown
}

type PackageManagerCtor = new (options: {
  cwd: string
  agentDir: string
  settingsManager: SettingsManagerLike
}) => PackageManagerLike

/** Adapt the SDK's DefaultPackageManager to the structural ctor type: the
 * settingsManager passed here IS the services' real SettingsManager — the
 * `never` slot above only widens the dynamic-import value so the cast is
 * explicit at the single seam where the SDK enters. */
function asPackageManagerCtor(value: unknown): PackageManagerCtor {
  return value as PackageManagerCtor
}

/** The effective user skills dir (~/.pi/agent/skills) for the probe's agent dir. */
export function piSkillsDirFor(agentDir: string): string {
  return path.join(agentDir, 'skills')
}

/**
 * Enumerate the skill universe for the probed cwd (ticket 63):
 *
 * - `PackageManager.resolve('skip' on missing)` returns EVERY discovered
 *   entry — user dir (incl. symlinks), `~/.agents/skills`, trusted project
 *   dirs, package installs — each with its enabled flag and source metadata.
 *   The onMissing:'skip' handler keeps the pass strictly read-only (no
 *   auto-install of uninstalled packages).
 * - `resourceLoader.getSkills()` is the loaded face: identity (name /
 *   description) comes from there when present, else a frontmatter peek.
 * - A dangling-link scan of ~/.pi/agent/skills adds rows for broken links
 *   (real path deleted elsewhere) so the list can mark them — never hide.
 *
 * Failures degrade to an error report, never a throw.
 */
export async function collectSkillCatalog(
  services: {
    cwd: string
    agentDir: string
    settingsManager: SettingsManagerLike
    resourceLoader: { getSkills(): { skills: Array<{ name: string; description: string; filePath: string }> } }
  },
  PackageManager: PackageManagerCtor
): Promise<{ rows: SkillCatalogRow[]; error: string | null }> {
  const piSkillsDir = piSkillsDirFor(services.agentDir)
  try {
    const packageManager = new PackageManager({
      cwd: services.cwd,
      agentDir: services.agentDir,
      settingsManager: services.settingsManager
    })
    const resolved = await packageManager.resolve(async () => 'skip')
    const loaded = new Map(services.resourceLoader.getSkills().skills.map((s) => [s.filePath, s]))
    const rows: SkillCatalogRow[] = resolved.skills.map((resource) => {
      const entry = classifyEntry(resource.path, piSkillsDir)
      const loadedSkill = loaded.get(resource.path)
      const frontmatter = loadedSkill === undefined ? peekFile(resource.path) : null
      return buildSkillCatalogRow(
        {
          path: resource.path,
          enabled: resource.enabled,
          scope: resource.metadata.scope,
          origin: resource.metadata.origin,
          source: resource.metadata.source,
          baseDir: resource.metadata.baseDir ?? null
        },
        {
          loaded: loadedSkill ?? null,
          frontmatter,
          entryPath: entry.entryPath,
          entryKind: entry.entryKind,
          realPath: entry.realPath,
          broken: entry.broken
        }
      )
    })
    // Dangling links under the pi skills dir that resolve() silently skips:
    // every depth-1 symlink entry whose target is gone becomes a marked row.
    const seen = new Set(rows.map((r) => r.entryPath ?? r.path))
    for (const dangling of scanDanglingLinks(piSkillsDir)) {
      if (seen.has(dangling)) continue
      rows.push(
        buildSkillCatalogRow(
          {
            path: dangling,
            enabled: false,
            scope: 'user',
            origin: 'top-level',
            source: 'auto',
            baseDir: services.agentDir
          },
          { entryPath: dangling, entryKind: 'symlink', realPath: null, broken: true }
        )
      )
    }
    return { rows, error: null }
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Ticket 64: the packages enumeration needs the FULL resolved face (all
 * four resource types) plus the configured-package listing, so the probe
 * widens the structural PackageManager type for the packages pass.
 */
interface ResolvedPackageResource {
  path: string
  enabled: boolean
  metadata: { source: string; scope: string; origin: string; baseDir?: string }
}

interface PackagesPackageManagerLike extends PackageManagerLike {
  resolve(onMissing: (source: string) => Promise<'skip'>): Promise<{
    extensions: ResolvedPackageResource[]
    skills: ResolvedPackageResource[]
    prompts: ResolvedPackageResource[]
    themes: ResolvedPackageResource[]
  }>
  getInstalledPath(source: string, scope: 'user' | 'project'): string | undefined
}

interface PackagesSettingsManagerLike extends SettingsManagerLike {
  getProjectSettings(): { packages?: unknown[] }
  getDefaultProjectTrust(): string
}

interface ProjectTrustStoreLike {
  get(cwd: string): boolean | null
}

interface TrustStoreCtor {
  new (agentDir: string): ProjectTrustStoreLike
}

function asPackagesPackageManager(value: unknown): PackagesPackageManagerLike {
  return value as PackagesPackageManagerLike
}

function asTrustStoreCtor(value: unknown): TrustStoreCtor {
  return value as TrustStoreCtor
}

/**
 * Canonicalize a directory path the way the SDK's trust store keys its
 * decisions: resolve, then realpath when it exists.
 */
export function canonicalDir(cwd: string): string {
  try {
    return realpathSync(cwd)
  } catch {
    return path.resolve(cwd)
  }
}

/**
 * Enumerate the Packages-section universe for the probed cwd (ticket 64):
 *
 * - Global rows from the global settings' `packages` array; project rows
 *   from the project settings' array (SettingsManager loads both — the
 *   probe's face is "what is configured here").
 * - ONE resolve() pass (onMissing 'skip' — strictly read-only, never an
 *   auto-install) fills the per-package component counts (extensions /
 *   skills / prompts / themes) and the on-disk install paths.
 * - The project trust state is DERIVED read-only: saved trust.json
 *   decision (nearest parent) wins, otherwise the global
 *   defaultProjectTrust decides — 'ask' with no decision means untrusted
 *   (a non-interactive host has no UI to ask). No trust.json write ever
 *   happens here; the decision itself stays with Pi's /trust.
 *
 * Failures degrade to an error report, never a throw.
 */
export async function collectPackagesCatalog(services: {
  cwd: string
  agentDir: string
  settingsManager: PackagesSettingsManagerLike
},
PackageManager: PackageManagerCtor,
TrustStore: TrustStoreCtor): Promise<{
  global: PackageRow[]
  project: PackageRow[]
  trust: ProjectTrustState | null
  error: string | null
}> {
  try {
    const globalPackages = readPackagesArray(services.settingsManager.getGlobalSettings() as { packages?: unknown })
    const projectPackages = readPackagesArray(services.settingsManager.getProjectSettings() as { packages?: unknown })
    const manager = asPackagesPackageManager(
      new PackageManager({ cwd: services.cwd, agentDir: services.agentDir, settingsManager: services.settingsManager })
    )
    // One read-only resolve for ALL counts: grouped by the resolved
    // metadata (source × scope) so the right scope's entry gets the counts.
    const resolved = await manager.resolve(async () => 'skip')
    const countsBySource = new Map<string, { extensions: number; skills: number; prompts: number; themes: number }>()
    const addTo = (rows: ResolvedPackageResource[], key: keyof ReturnType<typeof emptyCounts>): void => {
      for (const resource of rows) {
        if (resource.metadata.origin !== 'package') continue
        const mapKey = `${resource.metadata.scope}\u0000${resource.metadata.source}`
        const counts = countsBySource.get(mapKey) ?? emptyCounts()
        counts[key] += 1
        countsBySource.set(mapKey, counts)
      }
    }
    addTo(resolved.extensions, 'extensions')
    addTo(resolved.skills, 'skills')
    addTo(resolved.prompts, 'prompts')
    addTo(resolved.themes, 'themes')
    const toRows = (entries: unknown[], scope: 'user' | 'project'): PackageRow[] =>
      entries.map((entry) => {
        const source = typeof entry === 'string' ? entry : String((entry as { source?: unknown }).source ?? '')
        const counts = countsBySource.get(`${scope}\u0000${source}`) ?? null
        let installedPath: string | null = null
        try {
          installedPath = manager.getInstalledPath(source, scope) ?? null
        } catch {
          installedPath = null
        }
        return {
          source,
          kind: parsePackageSourceKind(source),
          entry: entry as PackageRow['entry'],
          autoload:
            typeof entry === 'object' && entry !== null && typeof (entry as { autoload?: unknown }).autoload === 'boolean'
              ? ((entry as { autoload: boolean }).autoload as boolean)
              : null,
          counts: counts ? { ...counts } : null,
          installedPath,
          scope
        }
      })
    const hasResources = hasProjectTrustResources(services.cwd, homedir(), (p) => existsSync(p))
    const trustStore = new TrustStore(services.agentDir)
    const saved = trustStore.get(services.cwd)
    const trust = deriveProjectTrust({
      savedDecision: saved,
      defaultProjectTrust: services.settingsManager.getDefaultProjectTrust(),
      hasResources
    })
    return { global: toRows(globalPackages, 'user'), project: toRows(projectPackages, 'project'), trust, error: null }
  } catch (err) {
    return { global: [], project: [], trust: null, error: err instanceof Error ? err.message : String(err) }
  }
}

function emptyCounts(): { extensions: number; skills: number; prompts: number; themes: number } {
  return { extensions: 0, skills: 0, prompts: 0, themes: 0 }
}

/** The `packages` array of a settings document, tolerating junk. */
function readPackagesArray(doc: { packages?: unknown }): unknown[] {
  return Array.isArray(doc.packages) ? doc.packages : []
}

/** lstat classification of the deletable ENTRY for a row under the pi skills
 * dir; null (and no realPath) for rows elsewhere. Live links carry the
 * realpath of their content — the SSOT directory a delete must NOT touch. */
function classifyEntry(
  resourcePath: string,
  piSkillsDir: string
): { entryPath: string | null; entryKind: SkillEntryKind; realPath: string | null; broken: boolean } {
  if (!isUnderPiSkillsDir(resourcePath, piSkillsDir)) {
    return { entryPath: null, entryKind: null, realPath: null, broken: false }
  }
  const entry = resourcePath.endsWith('/SKILL.md') ? path.dirname(resourcePath) : resourcePath
  try {
    const stats = lstatSync(entry)
    if (stats.isSymbolicLink()) {
      // Link (live or dangling): the delete is an unlink of the link itself.
      let realPath: string | null = null
      try {
        realPath = realpathSync(resourcePath)
      } catch {
        // Dangling — the target is gone; keep the link row, mark it broken.
        return { entryPath: entry, entryKind: 'symlink', realPath: null, broken: true }
      }
      return { entryPath: entry, entryKind: 'symlink', realPath, broken: false }
    }
    if (stats.isDirectory()) return { entryPath: entry, entryKind: 'real-dir', realPath: null, broken: false }
    if (stats.isFile()) return { entryPath: entry, entryKind: 'real-file', realPath: null, broken: false }
    return { entryPath: entry, entryKind: null, realPath: null, broken: false }
  } catch {
    // lstat failed (entry vanished between resolve and classify): report it
    // as a broken link only when the row itself is also unreadable.
    return { entryPath: entry, entryKind: null, realPath: null, broken: false }
  }
}

/** Depth-1 symlinks under the skills dir whose target no longer exists. */
function scanDanglingLinks(piSkillsDir: string): string[] {
  try {
    return readdirSync(piSkillsDir, { withFileTypes: true })
      .filter((entry) => entry.isSymbolicLink())
      .map((entry) => path.join(piSkillsDir, entry.name))
      .filter((link) => {
        try {
          statSync(link)
          return false
        } catch {
          return true
        }
      })
  } catch {
    return []
  }
}

/** Best-effort frontmatter peek for rows Pi did not load. */
function peekFile(filePath: string): { name: string | null; description: string | null } | null {
  try {
    return peekSkillIdentity(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Project the provider registry into the read-only status rows: every
 * provider gets a row (configured or not) so the settings view can show the
 * "sign in from the Pi TUI" guidance where credentials are missing.
 */
export async function collectAuthStatuses(
  models: AuthProbeModels,
  readCredential: (providerId: string) => StoredCredentialLike | undefined
): Promise<AuthProbeReport> {
  const providers: ProviderAuthStatus[] = []
  const catalog: ModelCatalogEntry[] = []
  for (const provider of models.getProviders()) {
    const check = await models.checkAuth(provider.id).catch(() => undefined)
    const credential = readCredential(provider.id)
    const authType =
      check?.type ?? (credential?.type === 'api_key' || credential?.type === 'oauth' ? credential.type : null)
    const providerModels = models.getModels(provider.id)
    providers.push({
      providerId: provider.id,
      name: models.getProvider(provider.id)?.name ?? provider.id,
      modelCount: providerModels.length,
      authType,
      source: check?.source ?? null,
      oauthExpiresAt: credential?.type === 'oauth' && typeof credential.expires === 'number' ? credential.expires : null
    })
    for (const model of providerModels) {
      catalog.push({
        providerId: provider.id,
        modelId: model.id,
        name: model.name ?? model.id,
        thinkingLevels: supportedThinkingLevels(model)
      })
    }
  }
  return { scannedAt: Date.now(), providers, models: catalog, error: null }
}

/**
 * SDK wiring for the probe host process: stand up the cwd-bound session
 * services (ticket 52 — the same factory a real session uses, so the
 * resource loader sees exactly what a session in that directory would see;
 * no AgentSession is created — infrastructure only), project the model
 * registry and the resource catalog, and report. Never resolves secret
 * values — only the metadata the read-only views show.
 *
 * `cwd` (ticket 52) scopes the command catalog: without it the probe falls
 * back to the home directory (global resources only — no project-level
 * `.pi/` resources can live there beyond the agent dir's own). Errors never
 * throw — they surface as an error report the consumers can display.
 */
export async function runAuthProbe(cwd?: string, agentDir?: string): Promise<AuthProbeReport> {
  try {
    const sdk = await import('@earendil-works/pi-coding-agent')
    // The probe's effective working directory: an empty argument falls back
    // to the home directory (global resources only).
    const probeCwd = cwd && cwd.trim() !== '' ? cwd : homedir()
    const services = await sdk.createAgentSessionServices({
      cwd: probeCwd,
      ...(agentDir !== undefined && agentDir.trim() !== '' ? { agentDir } : {})
    })
    const report = await collectAuthStatuses(
      {
        getProviders: () => services.modelRuntime.getProviders().map((provider) => ({ id: provider.id })),
        getProvider: (id) => {
          const provider = services.modelRuntime.getProvider(id)
          return provider ? { name: provider.name } : undefined
        },
        getModels: (id) => services.modelRuntime.getModels(id),
        checkAuth: (id) => services.modelRuntime.checkAuth(id)
      },
      (id) => sdk.readStoredCredential(id)
    )
    report.commands = collectCommandCatalog(services.resourceLoader)
    // Ticket 63: the Skills-section enumeration rides the same probe report.
    const skills = await collectSkillCatalog(services, asPackageManagerCtor(sdk.DefaultPackageManager))
    report.skills = skills.rows
    report.skillsError = skills.error
    report.skillsScannedAt = Date.now()
    report.skillsCwd = cwd && cwd.trim() !== '' ? cwd : null
    // Ticket 64: the Packages-section enumeration + the read-only trust
    // state ride the same report (no trust.json write ever happens here).
    const packages = await collectPackagesCatalog(
      {
        cwd: probeCwd,
        agentDir: services.agentDir,
        settingsManager: services.settingsManager as unknown as PackagesSettingsManagerLike
      },
      asPackageManagerCtor(sdk.DefaultPackageManager),
      asTrustStoreCtor(sdk.ProjectTrustStore)
    )
    report.packages = packages.global
    report.projectPackages = packages.project
    report.packagesError = packages.error
    report.packagesScannedAt = Date.now()
    report.packagesCwd = cwd && cwd.trim() !== '' ? cwd : null
    report.projectTrust = packages.trust
    return report
  } catch (err) {
    return {
      scannedAt: Date.now(),
      providers: [],
      models: [],
      commands: [],
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
