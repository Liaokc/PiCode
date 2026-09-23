/**
 * MCP-status projection (ticket 96): the pure model behind the settings
 * window's per-server connection status — the focused session's adapter
 * (pi-mcp-adapter) publishes a versioned status snapshot on the session's
 * in-process event bus (`MCP_STATUS_EVENT`, channel `pi-mcp-adapter/status/v1`);
 * the host's inline extension validates it HERE and forwards it as the
 * additive `mcp_status` contract event, and the renderer projects it onto
 * the config rows.
 *
 * Adapter fidelity (pi-mcp-adapter 2.37.0, re-verified for ticket 148;
 * README "Runtime status
 * snapshots" + mcp-status.ts):
 * - the snapshot is READ-ONLY machine-readable data: reading it never
 *   connects a lazy server, starts authentication, or exposes SDK clients,
 *   transports, credentials, or server definitions — viewing the status in
 *   PiCode is therefore zero-side-effect by construction (the projection
 *   has no command surface at all);
 * - the six runtime states: connected / cached / failed / needs-auth /
 *   not-connected / disabled. The projection's seventh state is the
 *   honest absence of data (no focused session, or the session's adapter
 *   has not reported) — never an invented state;
 * - an initial snapshot is emitted after initialization (withheld until
 *   authoritative metadata is reconciled), updates follow status changes,
 *   and an EMPTY snapshot is emitted when the session shuts down;
 * - per server: name / status / toolCount / directToolCount / disabled
 *   (+ resourceCount when known, failedAgoSeconds only during an active
 *   failure). listenState / catalogStale stay adapter-internal and are
 *   dropped from the bounded contract projection.
 * - 2.37 re-verification (research/pi-mcp-adapter-2.37.0-diff.md §2.2):
 *   the adapter's mcp-status.ts is byte-identical to 2.35, and neither
 *   MCP_STATUS_SNAPSHOT_VERSION = 1 nor the
 *   `pi-mcp-adapter/status/v1` channel is bumped — the v1 projection and
 *   the pinned-channel subscription below stay exactly valid. The OAuth
 *   flow is unchanged as well: 2.37's one auth fix (getValidToken returns
 *   null for an expired access token with no refresh token) touches only
 *   the extension-facing token query — the /mcp-auth flow that puts a
 *   server into needs-auth is line-for-line unchanged. The 2.37
 *   `settings.deferWithMissingMetadata` may delay the initial snapshot or
 *   show zero tools until the first call — mcpStatusLine's not-yet-reported
 *   and empty-snapshot notes already cover that honestly.
 *
 * Pure module: no node builtins, no SDK imports, no adapter imports
 * (Seam-1 guardrail — the adapter is not a PiCode dependency; the channel
 * name and the shapes are mirrored here and pinned by tests).
 */

// ---- shapes (the bounded mirror of the adapter's snapshot) ----

/** The adapter's runtime status vocabulary (mcp-status.ts). */
export type McpRuntimeStatus = 'connected' | 'cached' | 'failed' | 'needs-auth' | 'not-connected' | 'disabled'

/** One server's live state as the contract carries it. */
export interface McpServerStatusData {
  name: string
  status: McpRuntimeStatus
  toolCount: number
  directToolCount: number
  disabled: boolean
  /** Present when the server's resource count is known. */
  resourceCount?: number
  /** Present only during an active failure (seconds since it started). */
  failedAgoSeconds?: number
}

/** The versioned snapshot the adapter publishes (MCP_STATUS_SNAPSHOT_VERSION = 1). */
export interface McpStatusSnapshotData {
  version: 1
  servers: readonly McpServerStatusData[]
  totalTools: number
  totalResources: number
  connectedCount: number
  disabledCount: number
}

/** The adapter's versioned event-bus channel (types.ts: MCP_STATUS_EVENT).
 * The name pins v1 — a future v2 channel has a DIFFERENT name, so this
 * subscription goes silent instead of misreading a new payload shape. */
export const MCP_STATUS_EVENT_CHANNEL = 'pi-mcp-adapter/status/v1'

// ---- parse (the host-side structural validation) ----

const RUNTIME_STATUSES: readonly McpRuntimeStatus[] = ['connected', 'cached', 'failed', 'needs-auth', 'not-connected', 'disabled']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function parseServerEntry(raw: unknown): McpServerStatusData | null {
  if (!isRecord(raw)) return null
  const name = raw['name']
  const status = raw['status']
  const toolCount = raw['toolCount']
  const directToolCount = raw['directToolCount']
  if (typeof name !== 'string' || name === '') return null
  if (typeof status !== 'string' || !RUNTIME_STATUSES.includes(status as McpRuntimeStatus)) return null
  if (!isFiniteNonNegative(toolCount) || !isFiniteNonNegative(directToolCount)) return null
  const entry: McpServerStatusData = {
    name,
    status: status as McpRuntimeStatus,
    toolCount: Math.floor(toolCount),
    directToolCount: Math.floor(directToolCount),
    disabled: raw['disabled'] === true
  }
  // Optional bounded fields; unknown adapter fields (listenState,
  // catalogStale, …) stay behind — the contract carries the projection.
  if (isFiniteNonNegative(raw['resourceCount'])) entry.resourceCount = Math.floor(raw['resourceCount'] as number)
  if (isFiniteNonNegative(raw['failedAgoSeconds'])) entry.failedAgoSeconds = Math.floor(raw['failedAgoSeconds'] as number)
  return Object.freeze(entry)
}

/**
 * Validate one adapter status event payload into the bounded snapshot.
 * Anything that is not a well-formed v1 snapshot parses as null — the
 * forwarder drops it (honest no-data instead of a misread state). The
 * parsed snapshot is deeply FROZEN: the projection is a read, and no
 * consumer can write state into it.
 */
export function parseMcpStatusSnapshot(raw: unknown): McpStatusSnapshotData | null {
  if (!isRecord(raw)) return null
  if (raw['version'] !== 1) return null
  if (!Array.isArray(raw['servers'])) return null
  if (!isFiniteNonNegative(raw['totalTools']) || !isFiniteNonNegative(raw['totalResources'])) return null
  if (!isFiniteNonNegative(raw['connectedCount']) || !isFiniteNonNegative(raw['disabledCount'])) return null
  const servers: McpServerStatusData[] = []
  for (const entry of raw['servers']) {
    const parsed = parseServerEntry(entry)
    if (parsed !== null) servers.push(parsed)
  }
  return Object.freeze({
    version: 1,
    servers: Object.freeze(servers),
    totalTools: raw['totalTools'] as number,
    totalResources: raw['totalResources'] as number,
    connectedCount: raw['connectedCount'] as number,
    disabledCount: raw['disabledCount'] as number
  })
}

// ---- projection (the renderer-side read) ----

/**
 * One server's live status from the focused session's snapshot. null = no
 * data for this server (no session, the adapter has not reported, or the
 * server is not in this session's runtime at all) — the row renders
 * WITHOUT a status badge instead of inventing one.
 */
export function statusForServer(name: string, snapshot: McpStatusSnapshotData | null): McpRuntimeStatus | null {
  return serverStatusEntry(name, snapshot)?.status ?? null
}

/** The live status of one server, or undefined when it carries no live data. */
export function serverStatusEntry(name: string, snapshot: McpStatusSnapshotData | null): McpServerStatusData | undefined {
  if (snapshot === null) return undefined
  return snapshot.servers.find((server) => server.name === name)
}

/**
 * Whether the row renders a RUNTIME badge for this status: 'disabled' is
 * covered by the config-derived Disabled badge (the same fact — the
 * adapter reports disabled exactly when the effective definition carries
 * the flag), so the runtime layer stays silent for it.
 */
export function shouldShowRuntimeBadge(status: McpRuntimeStatus): boolean {
  return status !== 'disabled'
}

/** Whether the tool-count chip is the server's truth for this status: a
 * live catalog exists for connected/cached; every other state's count is
 * not the server's contribution (needs-auth/failed/not-connected report
 * zeros, disabled contributes nothing). */
export function shouldShowToolCount(status: McpRuntimeStatus): boolean {
  return status === 'connected' || status === 'cached'
}

/** The tool-count chip: shown only where the count is the server's truth. */
export function mcpStatusToolCountLabel(toolCount: number): string {
  return toolCount === 1 ? '1 tool' : `${toolCount} tools`
}

/** The status-line projection: the honest empty copy when the section
 * cannot show live data; null when live badges are on display.
 *  - no focused session → the no-session note;
 *  - session whose adapter has not reported → the no-data note;
 *  - an EMPTY snapshot while the config shows rows → the stale-session
 *    note (the session predates the config's servers);
 *  - anything else → live data, no note. */
export function mcpStatusLine(state: {
  focusedSessionId: string | null
  snapshot: McpStatusSnapshotData | null
  configRowCount: number
}): string | null {
  if (state.focusedSessionId === null) {
    return 'Runtime status needs a focused session — MCP status is the live projection of that session’s adapter.'
  }
  if (state.snapshot === null) {
    return 'The focused session’s adapter has not reported MCP status yet.'
  }
  if (state.snapshot.servers.length === 0 && state.configRowCount > 0) {
    return 'The focused session’s adapter reports no servers — reopen the session to pick up config changes.'
  }
  return null
}

/** The badge copy for one runtime status (English UI, smoke-asserted). */
export function mcpStatusBadgeLabel(status: McpRuntimeStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected'
    case 'cached':
      return 'Cached'
    case 'failed':
      return 'Failed'
    case 'needs-auth':
      return 'Needs auth'
    case 'not-connected':
      return 'Not connected'
    case 'disabled':
      return 'Disabled'
  }
}
