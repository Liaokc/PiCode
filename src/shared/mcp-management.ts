/**
 * MCP-management model (ticket 89): the settings window's MCP section.
 * The list mirrors the pi-mcp-adapter's ACTUAL config surface — every layer
 * the adapter reads, in its exact precedence order — plus the pure
 * derivations that turn a toggle into the adapter's `disabled` flag write,
 * an add/edit into a `/mcp setup` target write, and a delete into a
 * remove-from-the-owning-layer action.
 *
 * Adapter fidelity (pi-mcp-adapter 2.34.0):
 * - Layer precedence (lowest → highest): user-global shared
 *   (`~/.config/mcp/mcp.json`) → `~/.agents` shared files → Pi global
 *   override (`<agentDir>/mcp.json`) → project shared (`.mcp.json`) →
 *   Pi project override (`<cwd>/.pi/mcp.json`). Later layers win.
 * - The merge is per-field with URL-bound auth security: a higher layer
 *   that repoints a server at another transport or url must not inherit
 *   the lower layer's auth material (credential-exfiltration guard).
 * - Enable/disable writes ONLY the `disabled` flag into the project Pi
 *   layer (`.pi/mcp.json`) — exactly the adapter's
 *   `writeProjectServerDisabledOverride`; enabling writes an explicit
 *   `false` only when a lower layer is itself disabled, and an emptied
 *   entry is removed from the file.
 * - Add/edit/delete write targets are the adapter's `/mcp setup` targets:
 *   the project `.mcp.json` and the user-global shared
 *   `~/.config/mcp/mcp.json` — plus, for edits/deletes of definitions that
 *   already live in a Pi-owned layer, that layer's own file.
 *
 * Data safety line (ticket 89): external host-tool configs (Cursor, Claude
 * Code, Codex, …) are read-only compatibility discovery for the ADAPTER —
 * PiCode never reads or writes them, and the cross-tool `~/.agents` shared
 * files are never written either (the adapter redirects their writes to the
 * Pi global file). The canonical write surface is exactly:
 * `<cwd>/.mcp.json`, `~/.config/mcp/mcp.json`, `<cwd>/.pi/mcp.json`,
 * `<agentDir>/mcp.json`. `isCanonicalMcpWritePath` is the action-time guard.
 *
 * Pure module: no node builtins, no SDK imports (Seam-1 guardrail) — the
 * service reports layers over IPC and the renderer consumes projections.
 */

// ---- shapes ----

/** One MCP server definition as written in a config file. The adapter's
 * ServerEntry is deliberately open; PiCode validates the discriminating
 * fields (command vs url vs socket) and passes the rest through. */
export type McpServerEntry = Record<string, unknown>

/** The config layers PiCode manages, in the adapter's precedence order
 * (lowest first). `agents-*` rows are shared cross-tool files — readable
 * for the merged view, never written (adapter discipline). */
export type McpSourceId =
  | 'shared-global'
  | 'agents-global'
  | 'agents-nested-global'
  | 'pi-global'
  | 'shared-project'
  | 'pi-project'

export type McpSourceScope = 'global' | 'project'
/** `shared` = the standard cross-tool file; `pi` = a Pi-owned file. */
export type McpSourceKind = 'shared' | 'pi'

export interface McpLayerDescriptor {
  id: McpSourceId
  label: string
  scope: McpSourceScope
  kind: McpSourceKind
  /** Absolute file path for this layer (pure join of the inputs). */
  path: string
}

/** One layer as the service reports it (parsed on the main side). */
export interface McpConfigLayer extends McpLayerDescriptor {
  exists: boolean
  /** Parse/read failure — shown honestly, never silently hidden. */
  error: string | null
  /** The layer's own definitions, verbatim (not merged). */
  servers: Record<string, McpServerEntry>
}

/** What the service reports for one query (cwd null = no project face). */
export interface McpLayerReport {
  cwd: string | null
  agentDir: string
  home: string
  scannedAt: number
  /** Global layers, lowest precedence first. */
  globalLayers: McpConfigLayer[]
  /** Project layers, lowest precedence first; empty without a cwd. */
  projectLayers: McpConfigLayer[]
  error: string | null
}

/** One row of the effective-config merged view. */
export interface McpEffectiveServer {
  name: string
  /** The merged effective definition (per-field merge, adapter rules). */
  entry: McpServerEntry
  /** The layer whose definition wins (the highest one defining the name). */
  winnerId: McpSourceId
  winnerLabel: string
  winnerPath: string
  winnerScope: McpSourceScope
  winnerKind: McpSourceKind
  /** Every layer defining the name, lowest precedence first — the 来源
   * badges of the merged view. */
  definedIn: McpLayerDescriptor[]
  disabled: boolean
  /** Config-derived OAuth marker (the live needs-auth STATE is ticket 96). */
  oauth: boolean
}

/** One row of the section list (effective row + rendered dimensions). */
// ---- layer path resolution (pure; home/agentDir/cwd injected) ----

/** The layer descriptors for one query, in adapter precedence order
 * (lowest → highest). Project layers appear only with a cwd. Mirrors the
 * adapter's getConfigSources minus host-import/ancestor discovery (those
 * are read-only adapter features with no PiCode write path). */
export function buildMcpLayerDescriptors(options: {
  home: string
  agentDir: string
  cwd: string | null
}): McpLayerDescriptor[] {
  const { home, agentDir, cwd } = options
  const global: McpLayerDescriptor[] = [
    { id: 'shared-global', label: 'Global shared', scope: 'global', kind: 'shared', path: joinPath(home, '.config', 'mcp', 'mcp.json') },
    { id: 'agents-global', label: 'Global .agents', scope: 'global', kind: 'shared', path: joinPath(home, '.agents', 'mcp.json') },
    { id: 'agents-nested-global', label: 'Global .agents/mcp', scope: 'global', kind: 'shared', path: joinPath(home, '.agents', 'mcp', 'mcp.json') },
    { id: 'pi-global', label: 'Pi global', scope: 'global', kind: 'pi', path: joinPath(agentDir, 'mcp.json') }
  ]
  if (cwd === null || cwd.trim() === '') return global
  return [
    ...global,
    { id: 'shared-project', label: 'Project shared', scope: 'project', kind: 'shared', path: joinPath(cwd, '.mcp.json') },
    { id: 'pi-project', label: 'Pi project', scope: 'project', kind: 'pi', path: joinPath(cwd, '.pi', 'mcp.json') }
  ]
}

// ---- pure path helpers (POSIX-style, same-machine semantics) ----

function splitPath(p: string): string[] {
  return p.replace(/\\/g, '/').split('/').filter((part) => part !== '')
}

/** Pure `path.join` for the descriptor paths (segments must be clean). */
export function joinPath(...segments: readonly string[]): string {
  const parts = splitPath(segments.join('/'))
  const absolute = segments.join('/').startsWith('/') || /^[A-Za-z]:/.test(segments.join('/'))
  const joined = parts.join('/')
  if (joined === '') return absolute ? '/' : '.'
  return absolute ? `/${joined}`.replace(/^\/([A-Za-z]:)/, '$1') : joined
}

/** Pure `path.dirname`. */
export function dirnamePath(p: string): string {
  const absolute = p.startsWith('/') || /^[A-Za-z]:/.test(p)
  const parts = splitPath(p)
  parts.pop()
  const joined = parts.join('/')
  if (joined === '') return absolute ? '/' : '.'
  return absolute ? `/${joined}`.replace(/^\/([A-Za-z]:)/, '$1') : joined
}

// ---- parse (structural half of the adapter's readValidatedConfig) ----

export interface ParsedMcpDoc {
  /** The raw document object (unknown keys preserved for writes). */
  doc: Record<string, unknown>
  /** The servers key the document actually uses ('mcpServers' canonical,
   * 'mcp-servers' tolerated — the adapter reads both). */
  key: 'mcpServers' | 'mcp-servers'
  servers: Record<string, McpServerEntry>
}

/** Parse one config file's raw JSON text into the servers map. A missing
 * document parses as an empty honest layer (the first-user form); a
 * corrupt document THROWS — the service wraps the message into the
 * layer's `error` so the UI can show it. */
export function parseMcpDocument(raw: string | null): ParsedMcpDoc {
  if (raw === null) return { doc: {}, key: 'mcpServers', servers: {} }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The config root must be a JSON object.')
  }
  const doc = parsed as Record<string, unknown>
  const key: 'mcpServers' | 'mcp-servers' = doc['mcpServers'] !== undefined ? 'mcpServers' : doc['mcp-servers'] !== undefined ? 'mcp-servers' : 'mcpServers'
  const rawServers = doc[key]
  if (rawServers === undefined) return { doc, key, servers: {} }
  if (rawServers === null || typeof rawServers !== 'object' || Array.isArray(rawServers)) {
    throw new Error(`"${key}" must be an object of server definitions.`)
  }
  const servers: Record<string, McpServerEntry> = {}
  for (const [name, entry] of Object.entries(rawServers as Record<string, unknown>)) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Server "${name}" must be an object.`)
    }
    servers[name] = entry as McpServerEntry
  }
  return { doc, key, servers }
}

/** Extract just the servers object of an already-parsed document. */
export function serversOf(doc: Record<string, unknown>): Record<string, McpServerEntry> {
  const raw = doc['mcpServers'] ?? doc['mcp-servers']
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, McpServerEntry> = {}
  for (const [name, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) out[name] = entry as McpServerEntry
  }
  return out
}

// ---- merge (faithful port of the adapter's per-field rules) ----

/** URL-bound auth material: never inherited when a higher layer repoints a
 * server at a different url (the adapter's credential-exfiltration guard). */
const URL_BOUND_AUTH_FIELDS = ['headers', 'bearerToken', 'bearerTokenEnv', 'bearerTokenStore', 'requestHeadersCommand', 'caFile'] as const

/** The fields a stdio definition drops when it overrides an existing
 * remote/socket definition (and vice versa) — transport switching starts
 * clean instead of mixing halves of two transports. */
const REMOTE_ONLY_FIELDS = ['url', 'headers', 'requestHeadersCommand', 'caFile', 'auth', 'bearerToken', 'bearerTokenEnv', 'bearerTokenStore', 'oauth', 'httpTransport', 'socket'] as const
const STDIO_ONLY_FIELDS = ['command', 'args', 'env', 'cwd', 'pluginDataDir', 'literalEnv', 'inheritEnv', 'socket'] as const

/**
 * Merge ONE server definition over an existing (lower-precedence) one —
 * the adapter's mergeServerMaps for plain entries:
 *
 * - a definition switching transport (command over a remote base, url over
 *   a stdio/socket base, socket over a stdio/remote base) drops the other
 *   transport's fields;
 * - a definition repointing `url` drops the old url's auth material
 *   (headers/bearer/oauth…) unless the base carried `oauth: false`;
 * - everything else merges per top-level field, definition wins.
 *
 * (The adapter additionally normalizes built-in agent-plugin entries;
 * plain JSON config files never carry those, so the spread is exact.)
 */
export function mergeServerEntry(existing: McpServerEntry | undefined, definition: McpServerEntry): McpServerEntry {
  if (existing === undefined) return { ...definition }
  const baseEntry: McpServerEntry = { ...existing }
  const drops = new Set<string>()
  if (typeof definition['command'] === 'string') {
    for (const field of REMOTE_ONLY_FIELDS) drops.add(field)
  } else if (typeof definition['url'] === 'string') {
    for (const field of STDIO_ONLY_FIELDS) drops.add(field)
  } else if (typeof definition['socket'] === 'string') {
    for (const field of [...STDIO_ONLY_FIELDS.filter((f) => f !== 'socket'), ...REMOTE_ONLY_FIELDS.filter((f) => f !== 'socket')]) drops.add(field)
  }
  if (typeof definition['url'] === 'string' && definition['url'] !== existing['url']) {
    for (const field of URL_BOUND_AUTH_FIELDS) drops.add(field)
    if (baseEntry['oauth'] !== false) drops.add('oauth')
  }
  for (const field of drops) delete baseEntry[field]
  return { ...baseEntry, ...definition }
}

/**
 * Merge the layers' server maps in precedence order (LOWEST first) and
 * annotate each server with its winning source and every defining layer.
 * The input layers are never mutated.
 */
export function mergeMcpLayers(layers: readonly McpConfigLayer[]): McpEffectiveServer[] {
  const merged = new Map<string, McpServerEntry>()
  const definingLayers = new Map<string, McpLayerDescriptor[]>()
  for (const layer of layers) {
    for (const [name, definition] of Object.entries(layer.servers)) {
      const mergedEntry = mergeServerEntry(merged.get(name), definition)
      merged.set(name, mergedEntry)
      const descriptors = definingLayers.get(name) ?? []
      descriptors.push({ id: layer.id, label: layer.label, scope: layer.scope, kind: layer.kind, path: layer.path })
      definingLayers.set(name, descriptors)
    }
  }
  const rows: McpEffectiveServer[] = []
  for (const [name, entry] of merged) {
    const definedIn = definingLayers.get(name) ?? []
    const winner = definedIn[definedIn.length - 1]
    if (winner === undefined) continue
    rows.push({
      name,
      entry,
      winnerId: winner.id,
      winnerLabel: winner.label,
      winnerPath: winner.path,
      winnerScope: winner.scope,
      winnerKind: winner.kind,
      definedIn,
      disabled: entry['disabled'] === true,
      oauth: supportsOAuth(entry)
    })
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

/** The badge an effective row renders with: the winning layer's label —
 * with cross-tool `.agents` winners marked read-only (never written). */
export function mcpWinnerBadgeLabel(row: Pick<McpEffectiveServer, 'winnerId' | 'winnerLabel'>): string {
  return row.winnerId === 'agents-global' || row.winnerId === 'agents-nested-global' ? `${row.winnerLabel} (read-only)` : row.winnerLabel
}

/** Partition effective rows into the Global / Project cards by winning
 * layer scope (the Skills dual-card split; the row keeps its full
 * defined-in story either way). */
export function partitionMcpRows(rows: readonly McpEffectiveServer[]): { global: McpEffectiveServer[]; project: McpEffectiveServer[] } {
  const global: McpEffectiveServer[] = []
  const project: McpEffectiveServer[] = []
  for (const row of rows) {
    if (row.winnerScope === 'project') project.push(row)
    else global.push(row)
  }
  return { global, project }
}

/** Case-insensitive substring filter over name + transport fields — the
 * one search entry filters both cards. */
export function filterMcpRows(rows: readonly McpEffectiveServer[], query: string): McpEffectiveServer[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...rows]
  return rows.filter((row) => {
    if (row.name.toLowerCase().includes(needle)) return true
    const url = row.entry['url']
    const command = row.entry['command']
    if (typeof url === 'string' && url.toLowerCase().includes(needle)) return true
    if (typeof command === 'string' && command.toLowerCase().includes(needle)) return true
    return false
  })
}

// ---- OAuth support (adapter-faithful, for the Authenticate affordance) ----

/**
 * Whether the adapter offers OAuth for this server: a url, not explicitly
 * disabled (`auth: false` / `oauth: false`), and either an explicit
 * `auth: "oauth"` or auto-detection (auth unset, no custom headers —
 * configured headers take precedence over implicit OAuth).
 */
export function supportsOAuth(definition: McpServerEntry): boolean {
  if (typeof definition['url'] !== 'string' || definition['url'] === '') return false
  if (definition['auth'] === false || definition['oauth'] === false) return false
  if (definition['auth'] === 'oauth') return true
  if (definition['auth'] !== undefined) return false
  const headers = definition['headers']
  if (headers !== null && typeof headers === 'object' && !Array.isArray(headers) && Object.keys(headers).length > 0) return false
  return true
}

// ---- write-target resolution (the action-time red line) ----

/** The `/mcp setup` target a form write lands in: the project
 * `.mcp.json` or the user-global shared `~/.config/mcp/mcp.json`. */
export type McpSetupTarget = 'project' | 'global'

export function sharedConfigTargetPath(target: McpSetupTarget, options: { home: string; cwd: string | null }): string {
  if (target === 'global') return joinPath(options.home, '.config', 'mcp', 'mcp.json')
  if (options.cwd === null || options.cwd.trim() === '') {
    throw new Error('A project write needs an active workspace — no focused session is scoped.')
  }
  return joinPath(options.cwd, '.mcp.json')
}

/**
 * The file an EDIT or DELETE of one server targets: the winning layer's
 * own file — except cross-tool `~/.agents` layers, which are never
 * written (adapter discipline: their writes redirect to the Pi global
 * file; PiCode refuses outright with an honest message instead).
 * Null = refuse (agents winner, or the name is not defined at all).
 */
export function editTargetPathFor(row: Pick<McpEffectiveServer, 'winnerId' | 'winnerPath'>): string | null {
  if (row.winnerId === 'agents-global' || row.winnerId === 'agents-nested-global') return null
  return row.winnerPath
}

/** The canonical write surface (action-time guard): exactly these four
 * files may ever be written — the `/mcp setup` targets, the project Pi
 * override, and the Pi global file. Everything else (external host-tool
 * configs, `~/.agents` files, session files) is refused. */
export function isCanonicalMcpWritePath(path: string, options: { home: string; agentDir: string; cwd: string | null }): boolean {
  const canonical = new Set<string>([
    sharedConfigTargetPath('global', { home: options.home, cwd: options.cwd }),
    joinPath(options.agentDir, 'mcp.json')
  ])
  if (options.cwd !== null && options.cwd.trim() !== '') {
    canonical.add(joinPath(options.cwd, '.mcp.json'))
    canonical.add(joinPath(options.cwd, '.pi', 'mcp.json'))
  }
  return canonical.has(path)
}

/**
 * The Finder-reveal target for one layer file: the file itself when it
 * exists, else the nearest existing ancestor (a missing layer must still
 * open somewhere honest). Pure — the existence list is injected.
 */
export function revealTargetForLayer(path: string, exists: (candidate: string) => boolean): string {
  if (exists(path)) return path
  let current = dirnamePath(path)
  while (!exists(current)) {
    const parent = dirnamePath(current)
    if (parent === current) break
    current = parent
  }
  return current
}

// ---- document derivations (pure halves of the adapter's writers) ----

export interface DocWrite {
  /** The next raw document (unknown keys preserved). Same reference when
   * nothing changed. */
  doc: Record<string, unknown>
  changed: boolean
}

/**
 * Derive the next document for a server add/edit: the full entry replaces
 * the definition under the canonical servers key. A legacy `mcp-servers`
 * document migrates to `mcpServers` on write (the adapter's setServersObject
 * does the same); the migration alone counts as a change.
 */
export function deriveServerEntryWrite(rawDoc: Record<string, unknown>, serverName: string, entry: McpServerEntry): DocWrite {
  const servers = { ...serversOf(rawDoc) }
  const before = JSON.stringify(servers[serverName] ?? null)
  const after = JSON.stringify(entry)
  const legacy = rawDoc['mcp-servers'] !== undefined
  const changed = before !== after || legacy
  if (!changed) return { doc: rawDoc, changed: false }
  const doc = { ...rawDoc }
  delete doc['mcp-servers']
  servers[serverName] = entry
  doc['mcpServers'] = servers
  return { doc, changed: true }
}

/**
 * Derive the next document for a server delete: the definition is removed
 * from the document's servers map. `changed` is false when the name was
 * not defined here (the caller re-scopes instead of writing a no-op).
 */
export function deriveServerEntryRemove(rawDoc: Record<string, unknown>, serverName: string): DocWrite {
  const servers = { ...serversOf(rawDoc) }
  if (!Object.hasOwn(servers, serverName)) return { doc: rawDoc, changed: false }
  delete servers[serverName]
  const key: 'mcpServers' | 'mcp-servers' = rawDoc['mcpServers'] !== undefined ? 'mcpServers' : 'mcp-servers'
  const doc = { ...rawDoc }
  doc[key] = servers
  return { doc, changed: true }
}

/**
 * Derive the next PROJECT-PI document for an enable/disable toggle — the
 * faithful port of the adapter's writeProjectServerDisabledOverride:
 *
 * - disable: the entry grows `disabled: true` (never a full copy of the
 *   definition — credentials never flow into the override file);
 * - enable: the `disabled` field is dropped, and an explicit
 *   `disabled: false` is written ONLY when a lower-precedence layer is
 *   itself disabled (the flag must actively beat it);
 * - an emptied entry is removed from the map entirely.
 *
 * `lowerServers` = the merge of every layer BELOW the project Pi layer
 * (the caller computes it from the report). Pure.
 */
export function deriveDisabledFlagWrite(
  rawDoc: Record<string, unknown>,
  lowerServers: Record<string, McpServerEntry>,
  serverName: string,
  disabled: boolean
): DocWrite {
  const key: 'mcpServers' | 'mcp-servers' = rawDoc['mcpServers'] !== undefined || rawDoc['mcp-servers'] === undefined ? 'mcpServers' : 'mcp-servers'
  const servers = { ...serversOf(rawDoc) }
  const existing = servers[serverName]
  let next: Record<string, unknown>
  if (disabled) {
    next = { ...(existing ?? {}), disabled: true }
  } else {
    next = Object.fromEntries(Object.entries(existing ?? {}).filter(([field]) => field !== 'disabled'))
    if (lowerServers[serverName]?.['disabled'] === true) next['disabled'] = false
  }
  const unchanged = (existing === undefined && Object.keys(next).length === 0) || JSON.stringify(existing ?? null) === JSON.stringify(next)
  if (unchanged) return { doc: rawDoc, changed: false }
  if (Object.keys(next).length === 0) delete servers[serverName]
  else servers[serverName] = next
  const doc = { ...rawDoc }
  doc[key] = servers
  return { doc, changed: true }
}

// ---- form model (add/edit dialog) ----

export interface McpServerForm {
  name: string
  transport: 'stdio' | 'http'
  command: string
  /** One argument per line (JSON arrays stay in the file). */
  args: string
  /** `KEY=value` per line. */
  env: string
  url: string
  /** Writes `auth: "oauth"` on http servers. */
  oauth: boolean
}

/** Prefill the form from an effective entry (unknown fields are written
 * back untouched by the save — the edit round-trips them). */
export function entryToForm(entry: McpServerEntry, name: string): McpServerForm {
  const env = entry['env']
  return {
    name,
    transport: typeof entry['url'] === 'string' ? 'http' : 'stdio',
    command: typeof entry['command'] === 'string' ? entry['command'] : '',
    args: Array.isArray(entry['args']) ? entry['args'].filter((a): a is string => typeof a === 'string').join('\n') : '',
    env:
      env !== null && typeof env === 'object' && !Array.isArray(env)
        ? Object.entries(env as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'string')
            .map(([k, v]) => `${k}=${String(v)}`)
            .join('\n')
        : '',
    url: typeof entry['url'] === 'string' ? entry['url'] : '',
    oauth: entry['auth'] === 'oauth'
  }
}

/** Validate + build the entry from the form. Unknown entry fields ride
 * `preserve` back into the written entry (edit round-trip). */
export function formToServerEntry(
  form: McpServerForm,
  preserve: McpServerEntry = {}
): { entry: McpServerEntry } | { error: string } {
  const name = form.name.trim()
  if (name === '') return { error: 'The server name is required.' }
  const entry: McpServerEntry = { ...preserve }
  if (form.transport === 'http') {
    const url = form.url.trim()
    if (url === '') return { error: 'A server URL is required for remote servers.' }
    delete entry['command']
    delete entry['args']
    delete entry['cwd']
    entry['url'] = url
    if (form.oauth) entry['auth'] = 'oauth'
    // Unchecked: keep an explicit `auth: false` opt-out round-trip; drop a
    // stale `auth: "oauth"` (auto-detect is the default for a plain url).
    else if (entry['auth'] === 'oauth') delete entry['auth']
  } else {
    const command = form.command.trim()
    if (command === '') return { error: 'A command is required for local servers.' }
    delete entry['url']
    delete entry['auth']
    entry['command'] = command
    const args = form.args
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
    if (args.length > 0) entry['args'] = args
    else delete entry['args']
    const envLines = form.env
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
    if (envLines.length > 0) {
      const env: Record<string, string> = {}
      for (const line of envLines) {
        const eq = line.indexOf('=')
        if (eq <= 0) return { error: `Environment entries must be KEY=value (saw "${line}").` }
        env[line.slice(0, eq)] = line.slice(eq + 1)
      }
      entry['env'] = env
    } else {
      delete entry['env']
    }
  }
  return { entry }
}

// ---- UI copy (English; smoke asserts the exact wording) ----

export const MCP_SECURITY_COPY = 'MCP servers run with full system access. Add only servers you trust.'

/** The delete confirmation copy: names the file the delete touches, and
 * the shadowing semantics (a lower-layer definition resurfaces). */
export function mcpDeleteCopy(row: Pick<McpEffectiveServer, 'name' | 'winnerPath' | 'definedIn'>): string {
  const shadowed = row.definedIn.length > 1
  return shadowed
    ? `This removes "${row.name}" from ${row.winnerPath} — the definition in the lower layer resurfaces.`
    : `This removes "${row.name}" from ${row.winnerPath}. This cannot be undone.`
}

/** The refusal copy for cross-tool `~/.agents` winners (never written). */
export function mcpReadOnlyWinnerCopy(row: Pick<McpEffectiveServer, 'name' | 'winnerPath'>): string {
  return `"${row.name}" is defined in the cross-tool shared config ${row.winnerPath} — PiCode never writes it. Edit that file directly, or add an override for this server.`
}
