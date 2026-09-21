/**
 * McpService (main process, ticket 89): the settings window's MCP section
 * backend. The config files are small JSON documents, so the read side
 * parses them HERE — no probe host, no SDK (ADR-0003) — and the pure
 * shared model does the merge and the write derivations; this service
 * re-reads every file at action time, applies the derivation, and writes
 * atomically (temp file + rename) like the pi-settings editor.
 *
 * Red lines enforced at action time (ticket 89):
 * - every write path must pass `isCanonicalMcpWritePath` — exactly the
 *   adapter's `/mcp setup` targets (project `.mcp.json`, user-global
 *   shared `~/.config/mcp/mcp.json`), the project Pi override
 *   (`.pi/mcp.json` disabled flag), and the Pi global file. External
 *   host-tool configs (Cursor/Claude/…) and the cross-tool `~/.agents`
 *   files are NEVER written;
 * - OAuth credentials stay inside the adapter and the system keychain —
 *   this service never reads, writes, or transports credential material
 *   (the OAuth flow rides the session host bridge; see src/host).
 *
 * The home directory resolves through PICODE_MCP_HOME (smoke/harness
 * sandbox override) so smokes never touch the operator's real
 * `~/.config` / `~/.agents`; the Pi agent dir follows the
 * SkillsService rule (PICODE_PI_AGENT_DIR, else PI_CODING_AGENT_DIR,
 * else ~/.pi/agent).
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  buildMcpLayerDescriptors,
  deriveDisabledFlagWrite,
  deriveServerEntryRemove,
  deriveServerEntryWrite,
  editTargetPathFor,
  formToServerEntry,
  isCanonicalMcpWritePath,
  mcpReadOnlyWinnerCopy,
  mergeMcpLayers,
  parseMcpDocument,
  revealTargetForLayer,
  sharedConfigTargetPath,
  type McpConfigLayer,
  type McpLayerReport,
  type McpServerEntry,
  type McpServerForm,
  type McpSetupTarget
} from '../../shared/mcp-management'

/** Toggle/add/edit/remove outcomes the renderer's toasts surface verbatim. */
export type McpActionOutcome = { ok: true; path: string } | { ok: false; error: string }

export interface McpServiceOptions {
  /** Pi agent dir override (smoke/harness sandbox); null = the default. */
  agentDirOverride?: string | null
}

export class McpService {
  readonly agentDirOverride: string | null

  constructor(options: McpServiceOptions) {
    this.agentDirOverride = options.agentDirOverride ?? null
  }

  /** Per-call resolution — the smoke may set its sandbox after main is up. */
  get agentDir(): string {
    if (this.agentDirOverride !== null) return this.agentDirOverride
    const env = process.env['PICODE_PI_AGENT_DIR'] ?? process.env['PI_CODING_AGENT_DIR'] ?? ''
    if (env.trim() !== '') return env
    return path.join(homedir(), '.pi', 'agent')
  }

  /** The home the GLOBAL layers resolve against (sandboxable for smokes). */
  get home(): string {
    const override = process.env['PICODE_MCP_HOME'] ?? ''
    return override.trim() !== '' ? override : homedir()
  }

  /**
   * The MCP layer report for one workspace (cwd null = the global face
   * only). Reads every layer file fresh; every failure mode resolves into
   * the report — never a throw.
   */
  listConfig(cwd: string | null): McpLayerReport {
    const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null
    try {
      const descriptors = buildMcpLayerDescriptors({ home: this.home, agentDir: this.agentDir, cwd: dir })
      const globalLayers: McpConfigLayer[] = []
      const projectLayers: McpConfigLayer[] = []
      for (const descriptor of descriptors) {
        const layer = this.readLayer(descriptor)
        if (layer.scope === 'project') projectLayers.push(layer)
        else globalLayers.push(layer)
      }
      return {
        cwd: dir,
        agentDir: this.agentDir,
        home: this.home,
        scannedAt: Date.now(),
        globalLayers,
        projectLayers,
        error: null
      }
    } catch (err) {
      return {
        cwd: dir,
        agentDir: this.agentDir,
        home: this.home,
        scannedAt: Date.now(),
        globalLayers: [],
        projectLayers: [],
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  private readLayer(descriptor: ReturnType<typeof buildMcpLayerDescriptors>[number]): McpConfigLayer {
    const file = descriptor.path
    if (!existsSync(file)) {
      return { ...descriptor, exists: false, error: null, servers: {} }
    }
    let raw: string
    try {
      raw = readFileSync(file, 'utf-8')
    } catch (err) {
      return { ...descriptor, exists: true, error: err instanceof Error ? err.message : String(err), servers: {} }
    }
    try {
      const parsed = parseMcpDocument(raw)
      return { ...descriptor, exists: true, error: null, servers: parsed.servers }
    } catch (err) {
      return { ...descriptor, exists: true, error: err instanceof Error ? err.message : String(err), servers: {} }
    }
  }

  /**
   * Enable/disable one server: writes ONLY the disabled flag into the
   * project Pi override (`.pi/mcp.json`) — the adapter's
   * `/mcp enable|disable` semantics, derived by the pure model and
   * re-read at action time. A corrupt override file refuses the action
   * (the adapter throws honestly on unreadable config — silent replace
   * would destroy data).
   */
  async toggleServer(serverName: string, disabled: boolean, cwd: string | null): Promise<McpActionOutcome> {
    if (typeof serverName !== 'string' || serverName.trim() === '') {
      return { ok: false, error: 'Malformed enable/disable request.' }
    }
    const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null
    if (dir === null) {
      return { ok: false, error: 'Enable/disable writes the project override — no focused session is scoped.' }
    }
    try {
      const flagFile = path.join(dir, '.pi', 'mcp.json')
      if (!isCanonicalMcpWritePath(flagFile, { home: this.home, agentDir: this.agentDir, cwd: dir })) {
        return { ok: false, error: 'Refusing to write outside the canonical MCP config targets.' }
      }
      const raw = this.readRawDocOrThrow(flagFile)
      const lowerServers = this.mergedServersBelow(dir)
      const { doc, changed } = deriveDisabledFlagWrite(raw, lowerServers, serverName, disabled)
      if (changed) await this.writeRawDoc(flagFile, doc)
      return { ok: true, path: flagFile }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /** The merged definitions of every layer BELOW the project Pi layer —
   * the pure enable rule consults them (an explicit false beats a lower
   * disabled flag). The merge itself is the pure model's (adapter rules).
   */
  private mergedServersBelow(cwd: string): Record<string, McpServerEntry> {
    const report = this.listConfig(cwd)
    const rows = mergeMcpLayers([...report.globalLayers, ...report.projectLayers.filter((l) => l.id !== 'pi-project')])
    return Object.fromEntries(rows.map((row) => [row.name, row.entry]))
  }

  /**
   * Add or edit one server through the form model. `target` chooses the
   * `/mcp setup` target for ADDS (project `.mcp.json` / global shared
   * config); for EDITS the write lands in the winning layer's own file
   * (cross-tool `~/.agents` winners refuse — honest message, zero writes).
   */
  async writeServerEntry(
    mode: 'add' | 'edit',
    form: McpServerForm,
    target: McpSetupTarget,
    cwd: string | null,
    preserve: McpServerEntry = {}
  ): Promise<McpActionOutcome> {
    const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null
    try {
      const built = formToServerEntry(form, preserve)
      if ('error' in built) return { ok: false, error: built.error }
      const name = form.name.trim()

      let file: string
      if (mode === 'add') {
        file = sharedConfigTargetPath(target, { home: this.home, cwd: dir })
      } else {
        const report = this.listConfig(dir)
        const rows = mergeMcpLayers([...report.globalLayers, ...report.projectLayers])
        const row = rows.find((r) => r.name === name)
        if (row === undefined) {
          return { ok: false, error: `"${name}" is no longer in the config — refresh and retry.` }
        }
        const resolved = editTargetPathFor(row)
        if (resolved === null) {
          return { ok: false, error: mcpReadOnlyWinnerCopy(row) }
        }
        file = resolved
      }
      if (!isCanonicalMcpWritePath(file, { home: this.home, agentDir: this.agentDir, cwd: dir })) {
        return { ok: false, error: 'Refusing to write outside the canonical MCP config targets.' }
      }
      const raw = this.readRawDocOrThrow(file)
      const { doc, changed } = deriveServerEntryWrite(raw, name, built.entry)
      if (changed) await this.writeRawDoc(file, doc)
      return { ok: true, path: file }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Delete one server: removes the definition from the winning layer's
   * file (cross-tool `~/.agents` winners refuse). A shadowed definition
   * resurfaces — the confirmation copy says so before the write.
   */
  async removeServer(serverName: string, cwd: string | null): Promise<McpActionOutcome> {
    const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null
    try {
      const report = this.listConfig(dir)
      const rows = mergeMcpLayers([...report.globalLayers, ...report.projectLayers])
      const row = rows.find((r) => r.name === serverName)
      if (row === undefined) {
        return { ok: false, error: `"${serverName}" is not in the config — refresh and retry.` }
      }
      const resolved = editTargetPathFor(row)
      if (resolved === null) {
        return { ok: false, error: mcpReadOnlyWinnerCopy(row) }
      }
      if (!isCanonicalMcpWritePath(resolved, { home: this.home, agentDir: this.agentDir, cwd: dir })) {
        return { ok: false, error: 'Refusing to write outside the canonical MCP config targets.' }
      }
      const raw = this.readRawDocOrThrow(resolved)
      const { doc, changed } = deriveServerEntryRemove(raw, serverName)
      if (changed) await this.writeRawDoc(resolved, doc)
      return { ok: true, path: resolved }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * The Finder-reveal entry for one layer file: the file itself when it
   * exists, else the nearest existing ancestor. Read-only; only paths
   * that belong to a real layer descriptor resolve (cwd-scoped), so the
   * entry can never be steered at arbitrary filesystem locations.
   */
  revealLayer(layerPath: string, cwd: string | null): { ok: boolean; target: string | null } {
    if (typeof layerPath !== 'string' || layerPath.trim() === '') return { ok: false, target: null }
    const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null
    const known = buildMcpLayerDescriptors({ home: this.home, agentDir: this.agentDir, cwd: dir })
    if (!known.some((d) => d.path === layerPath)) return { ok: false, target: null }
    const target = revealTargetForLayer(layerPath, (candidate) => existsSync(candidate))
    return { ok: true, target }
  }

  /** Read one config document as an object for a WRITE: missing = {}, a
   * corrupt document THROWS (the action must never silently replace a
   * file's content — adapter-faithful refusal). */
  private readRawDocOrThrow(file: string): Record<string, unknown> {
    if (!existsSync(file)) return {}
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf-8'))
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    throw new Error(`${file}: the config root must be a JSON object.`)
  }

  /** Atomic write (temp + rename), 2-space JSON + trailing newline — the
   * exact serialization shape the adapter's own writer produces, and the
   * adapter's 2.35 writeConfigText contract: an existing file resolves
   * through symlinks (the alias survives; its TARGET is atomically
   * replaced) and keeps its file mode; a missing file is created at the
   * literal canonical path. The returned/report path stays canonical. */
  private async writeRawDoc(file: string, doc: Record<string, unknown>): Promise<void> {
    let target = file
    let mode: number | undefined
    try {
      target = realpathSync(file)
      mode = statSync(target).mode & 0o777
    } catch {
      // Missing file → write at the literal path with default mode.
    }
    await mkdir(path.dirname(target), { recursive: true })
    const temp = `${target}.picode-tmp`
    await rm(temp, { force: true })
    await writeFile(temp, `${JSON.stringify(doc, null, 2)}\n`, mode === undefined ? { encoding: 'utf-8' } : { encoding: 'utf-8', mode })
    await rename(temp, target)
  }
}
