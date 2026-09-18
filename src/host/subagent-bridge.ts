/**
 * The subagent bridge (ticket 90): the host's second inline extension.
 * Subscribes to pi-subagents' in-process seams — the versioned RPC
 * (`subagents:rpc:v1:*`) and the async lifecycle events — and forwards
 * bounded contract events to the renderer. Like the approval gate, it rides
 * DefaultResourceLoaderOptions.extensionFactories: the same extension
 * pipeline as user packages, zero Pi modification.
 *
 * Surface (all additive, reported into the host-contract smoke):
 *   subagent_status command            → subagent_status reply event
 *   pi `subagent:async-started`        → subagent_async_started
 *   pi `subagent:async-complete`       → subagent_async_completed
 *   pi `subagent:foreground-complete`  → subagent_foreground_completed
 *   pi `subagent:child-status`         → subagent_child_status
 *
 * The status reply's `runs` come from reading the runs' status.json
 * artifacts directly (the asyncDirs the session record itself names —
 * ADR-0002: the replay names what ran, the artifact says how it's doing).
 * pi-subagents' RPC answers the `fleet` DTO (bounded, opaque keys). The RPC
 * status itself is deliberately NOT the runs source: completed runs leave
 * pi-subagents' in-memory projection after ~10s and are not restored on
 * reopen (only queued/running are), so the artifact read is the only
 * durable live source. Artifacts get cleaned up eventually — a missing one
 * simply means "no live evidence" (the directory projects Lost), never a
 * fabricated state.
 *
 * Degrades silently when pi-subagents is not installed: the ready event
 * never fires, status replies carry `available: false`, and the lifecycle
 * subscriptions just never see payloads.
 */

import type { InlineExtension } from '@earendil-works/pi-coding-agent'
import type { SessionScopedEvent, SubagentFleetDTO, SubagentRunState } from '../shared/contract'
import { subagentInfoOfDetails } from '../shared/sessions/parse'
import { clampInlineText } from '../shared/subagents/format'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** What the extension may send: one session's scoped events (the supervisor
 * tags and relays; `host_exit` is supervisor-only). */
type HostEvent = Exclude<SessionScopedEvent, { type: 'host_exit' }>

const RPC_REQUEST_EVENT = 'subagents:rpc:v1:request'
const RPC_REPLY_PREFIX = 'subagents:rpc:v1:reply:'

const ASYNC_STARTED_EVENT = 'subagent:async-started'
const ASYNC_COMPLETE_EVENT = 'subagent:async-complete'
const FOREGROUND_COMPLETE_EVENT = 'subagent:foreground-complete'
const CHILD_STATUS_EVENT = 'subagent:child-status'

/** How long the bridge waits for pi-subagents' RPC reply before answering
 * `available: false` (an in-process event-bus roundtrip is fast; the
 * timeout only ever fires when the package is absent or wedged). */
const RPC_TIMEOUT_MS = 3_000

/** Copy clamps for the forwarded lifecycle payloads (bounded IPC). */
const SUMMARY_CHARS = 240

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The shared clamp in the bridge's option shape (undefined, not null). */
function clampToOption(value: unknown, max: number): string | undefined {
  return clampInlineText(value, max) ?? undefined
}

function optString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function finiteMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined
}

export class SubagentBridge {
  /** The session's event bus, captured when the extension factory runs.
   * null = the session machinery hasn't created the extensions yet (or the
   * pi-subagents-independent boot failed before extension load). */
  private events: {
    emit(channel: string, data: unknown): void
    on(channel: string, handler: (data: unknown) => void): () => void
  } | null = null
  private rpcSeq = 0

  constructor(private readonly send: (event: HostEvent) => void) {}

  /** The inline extension (registered beside the approval gate). */
  readonly extension: InlineExtension = {
    name: 'picode-subagent-bridge',
    hidden: true,
    factory: (pi) => {
      this.events = pi.events
      // The subscriptions live on the session's own event bus — they die
      // with it (session shutdown / process exit); no manual unwiring.
      pi.events.on(ASYNC_STARTED_EVENT, (payload) => this.forwardAsyncStarted(payload))
      pi.events.on(ASYNC_COMPLETE_EVENT, (payload) => this.forwardAsyncCompleted(payload))
      pi.events.on(FOREGROUND_COMPLETE_EVENT, (payload) => this.forwardForegroundCompleted(payload))
      pi.events.on(CHILD_STATUS_EVENT, (payload) => this.forwardChildStatus(payload))
    }
  }

  /**
   * The `subagent_status` command: read the session record's async run
   * artifacts, ask pi-subagents' RPC for its fleet DTO, and answer with one
   * bounded snapshot. Always answers (availability degrades, never hangs).
   */
  async handleStatusRequest(requestId: string, collectAsyncDirs: () => string[]): Promise<void> {
    const runs = collectAsyncDirs().flatMap((asyncDir) => {
      const run = readRunStateFromArtifact(asyncDir)
      return run !== null ? [run] : []
    })
    const fleet = await this.requestFleet()
    this.send({ type: 'subagent_status', requestId, available: fleet !== null, runs, fleet })
  }

  /** The bounded fleet DTO via the in-process RPC; null when the package is
   * absent or the roundtrip fails/times out. */
  private async requestFleet(): Promise<SubagentFleetDTO | null> {
    const events = this.events
    if (events === null) return null
    const requestId = `picode-${++this.rpcSeq}-${Date.now().toString(36)}`
    const reply = await new Promise<unknown>((resolve) => {
      let settled = false
      const done = (value: unknown): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        unsubscribe()
        resolve(value)
      }
      const timer = setTimeout(() => done(undefined), RPC_TIMEOUT_MS)
      const unsubscribe = events.on(`${RPC_REPLY_PREFIX}${requestId}`, (data) => done(data))
      events.emit(RPC_REQUEST_EVENT, { version: 1, requestId, method: 'status', params: {}, source: { extension: 'picode-subagent-bridge' } })
    })
    if (!isRecord(reply) || reply['success'] !== true) return null
    return fleetFromRpcData(reply['data'])
  }

  private forwardAsyncStarted(payload: unknown): void {
    if (!isRecord(payload)) return
    const runId = optString(payload['id']) ?? optString(payload['runId'])
    if (runId === undefined) return
    const agents = Array.isArray(payload['agents']) ? payload['agents'].filter((a): a is string => typeof a === 'string') : undefined
    this.send({
      type: 'subagent_async_started',
      runId,
      ...(optString(payload['mode']) !== undefined ? { mode: optString(payload['mode']) } : {}),
      ...(optString(payload['agent']) !== undefined ? { agent: optString(payload['agent']) } : {}),
      ...(agents !== undefined && agents.length > 0 ? { agents } : {}),
      ...(optString(payload['asyncDir']) !== undefined ? { asyncDir: optString(payload['asyncDir']) } : {})
    })
  }

  private forwardAsyncCompleted(payload: unknown): void {
    if (!isRecord(payload)) return
    const runId = optString(payload['runId']) ?? optString(payload['id'])
    if (runId === undefined) return
    this.send({
      type: 'subagent_async_completed',
      runId,
      ...(optString(payload['state']) !== undefined ? { state: optString(payload['state']) } : {}),
      ...(typeof payload['success'] === 'boolean' ? { success: payload['success'] } : {}),
      ...(clampToOption(payload['summary'], SUMMARY_CHARS) !== undefined ? { summary: clampToOption(payload['summary'], SUMMARY_CHARS) } : {}),
      ...(finiteMs(payload['durationMs']) !== undefined ? { durationMs: finiteMs(payload['durationMs']) } : {})
    })
  }

  private forwardForegroundCompleted(payload: unknown): void {
    if (!isRecord(payload)) return
    const runId = optString(payload['runId'])
    if (runId === undefined) return
    this.send({
      type: 'subagent_foreground_completed',
      runId,
      ...(optString(payload['mode']) !== undefined ? { mode: optString(payload['mode']) } : {}),
      ...(optString(payload['agent']) !== undefined ? { agent: optString(payload['agent']) } : {}),
      ...(typeof payload['success'] === 'boolean' ? { success: payload['success'] } : {}),
      ...(optString(payload['state']) !== undefined ? { state: optString(payload['state']) } : {}),
      ...(clampToOption(payload['summary'], SUMMARY_CHARS) !== undefined ? { summary: clampToOption(payload['summary'], SUMMARY_CHARS) } : {}),
      ...(typeof payload['taskIndex'] === 'number' ? { taskIndex: payload['taskIndex'] } : {})
    })
  }

  private forwardChildStatus(payload: unknown): void {
    if (!isRecord(payload)) return
    const runId = optString(payload['runId'])
    const childId = optString(payload['childId'])
    const status = payload['status']
    if (runId === undefined || childId === undefined || (status !== 'stopping' && status !== 'stopped')) return
    this.send({
      type: 'subagent_child_status',
      runId,
      childId,
      status,
      ...(typeof payload['ts'] === 'number' ? { ts: payload['ts'] } : { ts: 0 }),
      ...(optString(payload['agent']) !== undefined ? { agent: optString(payload['agent']) } : {}),
      ...(typeof payload['stepIndex'] === 'number' ? { stepIndex: payload['stepIndex'] } : {}),
      ...(optString(payload['label']) !== undefined ? { label: optString(payload['label']) } : {})
    })
  }
}

/**
 * Read ONE async run's live state from its status.json artifact (the
 * envelope fields pi-subagents' runner writes; unknown fields ignored).
 * Returns null for absent/corrupt artifacts — no live evidence, no
 * invention.
 */
export function readRunStateFromArtifact(asyncDir: string): SubagentRunState | null {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(join(asyncDir, 'status.json'), 'utf8'))
  } catch {
    return null
  }
  if (!isRecord(raw)) return null
  const runId = optString(raw['runId']) ?? optString(raw['id'])
  const state = raw['state']
  if (runId === undefined) return null
  const validStates = ['queued', 'running', 'complete', 'failed', 'partial', 'paused', 'stopped', 'rejected']
  if (typeof state !== 'string' || !validStates.includes(state)) return null
  const agents = Array.isArray(raw['agents']) ? raw['agents'].filter((a): a is string => typeof a === 'string') : undefined
  const nestedChildren = Array.isArray(raw['nestedChildren'])
    ? raw['nestedChildren'].filter(isRecord).length
    : 0
  return {
    runId,
    state: state as SubagentRunState['state'],
    ...(finiteMs(raw['startedAt']) !== undefined ? { startedAt: finiteMs(raw['startedAt']) } : {}),
    ...(finiteMs(raw['endedAt']) !== undefined ? { endedAt: finiteMs(raw['endedAt']) } : {}),
    ...(optString(raw['mode']) !== undefined ? { mode: optString(raw['mode']) } : {}),
    ...(agents !== undefined && agents.length > 0 ? { agents } : {}),
    ...(optString(raw['currentTool']) !== undefined ? { currentTool: optString(raw['currentTool']) } : {}),
    ...(optString(raw['activityState']) !== undefined ? { activityState: optString(raw['activityState']) } : {}),
    ...(nestedChildren > 0 ? { nestedCount: nestedChildren } : {})
  }
}

/** The fleet DTO projection from a successful RPC status reply. */
function fleetFromRpcData(data: unknown): SubagentFleetDTO | null {
  if (!isRecord(data)) return null
  const fleet = data['fleet']
  if (!isRecord(fleet) || !Array.isArray(fleet['entries'])) return null
  const entries = fleet['entries'].flatMap((raw): Array<SubagentFleetDTO['entries'][number]> => {
    if (!isRecord(raw)) return []
    const key = optString(raw['key'])
    const agent = optString(raw['agent'])
    if (key === undefined || agent === undefined) return []
    const tokens = isRecord(raw['tokens']) ? raw['tokens'] : {}
    const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0)
    return [
      {
        key,
        agent,
        ...(optString(raw['role']) !== undefined ? { role: optString(raw['role']) } : {}),
        ...(optString(raw['model']) !== undefined ? { model: optString(raw['model']) } : {}),
        ...(optString(raw['effort']) !== undefined ? { effort: optString(raw['effort']) } : {}),
        ...(typeof raw['startedAt'] === 'number' ? { startedAt: raw['startedAt'] } : { startedAt: 0 }),
        tokens: { input: num(tokens['input']), output: num(tokens['output']), total: num(tokens['total']) },
        ...(optString(raw['goal']) !== undefined ? { goal: optString(raw['goal']) } : {})
      }
    ]
  })
  return {
    entries,
    totalActive: typeof fleet['totalActive'] === 'number' ? fleet['totalActive'] : entries.length,
    omitted: typeof fleet['omitted'] === 'number' ? fleet['omitted'] : 0
  }
}

/**
 * The host-side replay walk (the primary source's async-dir collection): the
 * session record's own subagent toolResult details name every asyncDir this
 * session ever launched. Reads ONLY what the projection already defines —
 * the same `subagentInfoOfDetails` the renderer's replay uses, so the two
 * never drift.
 */
export function collectSessionAsyncDirs(entries: readonly unknown[]): string[] {
  const dirs = new Set<string>()
  for (const entry of entries) {
    if (!isRecord(entry) || entry['type'] !== 'message') continue
    const message = entry['message']
    if (!isRecord(message) || message['role'] !== 'toolResult') continue
    const details = isRecord(message['details']) ? (message['details'] as Record<string, unknown>) : null
    const info = subagentInfoOfDetails(details)
    if (info?.asyncDir !== undefined) dirs.add(info.asyncDir)
  }
  return [...dirs]
}

