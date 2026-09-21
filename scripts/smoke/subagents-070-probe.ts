/**
 * pi-subagents 0.70.1 LIVE integration probe (ticket 111). Boots a real SDK
 * session IN-PROCESS with the REAL PiCode subagent bridge registered (the
 * same resource-loader pipeline as the host) and pi-subagents loaded from
 * the real agent dir — then drives REAL async subagent runs through the
 * versioned RPC and verifies every integration surface ticket 111 re-audits,
 * against the live package:
 *
 *   ① RPC reply shapes  — ping capabilities (fleetStatus v1), status reply
 *                         { text, details, fleet, asyncSnapshot }, steer
 *                         acknowledged delivery (deliveryStatus), stop reply
 *                         state:"stopping" — via the BRIDGE's own handlers
 *                         (the exact consumption path tickets 90/99/101 ship)
 *                         plus raw replies for the census.
 *   ② status.json       — runId / state / startedAt / mode / agents /
 *                         sessionFile / steps / endedAt / tokens: what
 *                         PiCode's parsers consume vs what 0.70.1 writes
 *                         (field census + strict reads, unknown fields
 *                         tolerated).
 *   ③ events            — subagent:async-started / async-complete,
 *                         subagent:child-status (stopping/stopped), and the
 *                         bridge's forwarded contract twins.
 *   ④ seven-state live  — the artifact states a real run actually passes
 *                         through (running → complete; running → stopped via
 *                         RPC stop) mapped through the SHARED parsers
 *                         (parseRunStateEnvelope + mapArtifactState); the
 *                         non-observable states stay table-driven (vitest).
 *
 * Real model calls: two cheap scout children. Same class as smoke stages
 * 2/5/6 — dev-app serialization applies (run the ps check first).
 *
 * Usage: node scripts/smoke/subagents-070-probe.ts
 * Needs working model auth in ~/.pi/agent (same as the pi TUI). Session
 * writes land in a throwaway store; the real session library is untouched.
 * Exits 0 only when every expectation held. Progress logs as PROBE lines.
 */

import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as pi from '@earendil-works/pi-coding-agent'
import { SubagentBridge } from '../../src/host/subagent-bridge.ts'
import type { HostEvent } from '../../src/host/subagent-bridge.ts'
import { ensureSubagentRunnerPackageRoot } from '../../src/host/subagent-runner-root.ts'
import { parseRunStateEnvelope, parseTranscriptSourceEnvelope } from '../../src/shared/subagents/artifact.ts'
import { mapArtifactState } from '../../src/shared/subagents/directory.ts'

const RPC_REQUEST_EVENT = 'subagents:rpc:v1:request'
const ASYNC_STARTED_EVENT = 'subagent:async-started'
const ASYNC_COMPLETE_EVENT = 'subagent:async-complete'
const CHILD_STATUS_EVENT = 'subagent:child-status'

const CHILD_BUDGET_MS = 180_000
const RPC_ROUNDTRIP_MS = 15_000

function log(step: string, detail = ''): void {
  console.log(`PROBE ${step}${detail ? ` ${detail}` : ''}`)
}

function fail(message: string): never {
  console.error(`PROBE FAIL ${message}`)
  process.exit(1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function withTimeout<T>(label: string, budgetMs: number, body: (deadline: number) => Promise<T>): Promise<T> {
  const deadline = Date.now() + budgetMs
  const timer = setTimeout(() => fail(`${label}: budget of ${budgetMs}ms elapsed`), budgetMs)
  try {
    return await body(deadline)
  } finally {
    clearTimeout(timer)
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// ---- setup -----------------------------------------------------------------

const probeCwd = mkdtempSync(join(tmpdir(), 'picode-probe070-cwd-'))
const sessionsStore = mkdtempSync(join(tmpdir(), 'picode-probe070-sessions-'))
// Artifact isolation (the ticket-90 smoke stage precedent): the probe's real
// runs write status.json under a throwaway temp root, never the shared
// per-uid root where the operator's own runs live.
process.env['PI_SUBAGENTS_TEMP_ROOT'] = mkdtempSync(join(tmpdir(), 'picode-probe070-artifacts-'))

/** Every forwarded bridge event (the renderer-facing contract twins). */
const bridgeEvents: HostEvent[] = []
const bridge = new SubagentBridge((event) => bridgeEvents.push(event))

/** Raw pi.events access + raw event census (an observer twin of the bridge's
 * own capture — same factory pipeline, one rung lower). */
let bus: { emit(channel: string, data: unknown): void; on(channel: string, handler: (data: unknown) => void): () => void } | null = null
const rawEvents: Array<{ channel: string; data: unknown }> = []
const observer: pi.InlineExtension = {
  name: 'picode-070-probe-observer',
  hidden: true,
  factory: (pi) => {
    bus = pi.events
    for (const channel of [ASYNC_STARTED_EVENT, ASYNC_COMPLETE_EVENT, CHILD_STATUS_EVENT]) {
      pi.events.on(channel, (data) => rawEvents.push({ channel, data }))
    }
  }
}

const rpcSeq = { n: 0 }
/** One raw RPC roundtrip on the session bus (the census view). */
function rpc(method: string, params: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: { code?: string; message?: string } }> {
  const events = bus
  if (events === null) return Promise.reject(new Error('session bus not wired'))
  const requestId = `probe070-${++rpcSeq.n}-${Date.now().toString(36)}`
  return withTimeout(`rpc ${method}`, RPC_ROUNDTRIP_MS, async () => {
    return await new Promise((resolve) => {
      const unsubscribe = events.on(`subagents:rpc:v1:reply:${requestId}`, (data) => {
        unsubscribe()
        resolve(data as { success: boolean; data?: unknown; error?: { code?: string; message?: string } })
      })
      events.emit(RPC_REQUEST_EVENT, { version: 1, requestId, method, params, source: { extension: 'picode-070-probe-observer' } })
    })
  })
}

/** Poll until the predicate accepts; fails with the last value otherwise. */
async function pollUntil<T>(label: string, budgetMs: number, read: () => T, accept: (v: T) => boolean): Promise<T> {
  return await withTimeout(label, budgetMs, async (deadline) => {
    let last = read()
    while (!accept(last)) {
      if (Date.now() > deadline) fail(`${label}: never matched, last=${JSON.stringify(last)}`)
      await sleep(250)
      last = read()
    }
    return last
  })
}

function readStatusJson(asyncDir: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(join(asyncDir, 'status.json'), 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

const statusFieldCensus = new Set<string>()
function census(status: Record<string, unknown>): void {
  for (const key of Object.keys(status)) statusFieldCensus.add(key)
}

async function main(): Promise<void> {
  log('boot_start', 'real agent dir, real pi-subagents, bridge + observer inline')
  // The HOST's own ticket-111 fix (src/host/subagent-runner-root.ts), driven
  // exactly as the host drives it after the SDK import — this verifies the
  // real wiring, not a probe-side copy.
  ensureSubagentRunnerPackageRoot(pi.getPackageDir())
  const manager = pi.SessionManager.create(probeCwd, sessionsStore)
  const services = await pi.createAgentSessionServices({
    cwd: probeCwd,
    resourceLoaderOptions: { extensionFactories: [bridge.extension, observer] }
  })
  const result = await pi.createAgentSessionFromServices({ services, sessionManager: manager })
  await result.session.bindExtensions({ mode: 'rpc' })
  if (bus === null) fail('boot: the observer factory never ran (extension pipeline broken)')

  // ---- ① RPC surface is live: ping + capabilities -------------------------
  await withTimeout('rpc ready', 30_000, async (deadline) => {
    while (true) {
      const ping = await rpc('ping', {}).catch(() => null)
      if (ping !== null && ping.success === true) {
        const data = isRecord(ping.data) ? ping.data : {}
        const capabilities = isRecord(data['capabilities']) ? (data['capabilities'] as Record<string, unknown>) : {}
        const events = isRecord(data['events']) ? (data['events'] as Record<string, unknown>) : {}
        if (!isRecord(capabilities['fleetStatus']) || capabilities['fleetStatus']['version'] !== 1) {
          fail(`ping: fleetStatus capability is not v1 (${JSON.stringify(capabilities['fleetStatus'])})`)
        }
        if (capabilities['nonRecoveringSteer'] !== true) fail('ping: nonRecoveringSteer capability absent')
        if (events['childStatus'] !== CHILD_STATUS_EVENT) fail(`ping: events.childStatus != ${CHILD_STATUS_EVENT} (${JSON.stringify(events)})`)
        log('rpc_capabilities', 'fleetStatus v1 + nonRecoveringSteer + childStatus channel match')
        return
      }
      if (Date.now() > deadline) fail('rpc ready: ping never succeeded')
      await sleep(250)
    }
  })

  // ---- leg 1: spawn → running → status/steer → natural COMPLETE -----------

  // ③ identity lives in details (the SAME launch receipt the session
  // transcript persists and ticket 90's replay parses — one shape, two
  // consumers): runId/asyncId/asyncDir/mode.
  // A long multi-tool single task: the live window must outlast the steer +
  // status roundtrips below (a flash-model child answers trivial prompts in
  // seconds; reads + a long write keep it busy for tens of seconds).
  const LONG_TASK = 'Read the files package.json, tsconfig.json, vitest.config.ts, eslint.config.js and README.md in this directory ONE AT A TIME, waiting for each result before the next. After the five reads, write the numbers from 1 to 100, one per line. Then reply with exactly: PICODE070OK'
  const leg1 = await rpc('spawn', { agent: 'scout', task: LONG_TASK })
  if (leg1.success !== true) fail(`spawn leg1 failed: ${JSON.stringify(leg1.error)}`)
  const spawnData = isRecord(leg1.data) ? leg1.data : {}
  const spawnDetails = isRecord(spawnData['details']) ? spawnData['details'] : {}
  const runId1 = typeof spawnDetails['runId'] === 'string' ? spawnDetails['runId'] : (typeof spawnDetails['asyncId'] === 'string' ? spawnDetails['asyncId'] : undefined)
  const asyncDir1 = typeof spawnDetails['asyncDir'] === 'string' ? spawnDetails['asyncDir'] : undefined
  if (runId1 === undefined || runId1 === '') fail(`spawn leg1: no run id in details (keys=${JSON.stringify(Object.keys(spawnDetails))})`)
  if (asyncDir1 === undefined || asyncDir1 === '') fail(`spawn leg1: no asyncDir in details (keys=${JSON.stringify(Object.keys(spawnDetails))})`)
  log('spawn_leg1', `runId=${runId1} mode=${String(spawnDetails['mode'])}`)

  // The runner writes the initial status.json (state running) BEFORE the
  // spawn reply returns — wait for it, then fire the steer IMMEDIATELY so it
  // lands mid-run no matter how fast the child is.
  await pollUntil('status.json exists', 60_000, () => readStatusJson(asyncDir1!), (s) => {
    if (s !== null) census(s)
    return s !== null && (s['state'] === 'running' || s['state'] === 'queued')
  })

  // ③ async-started: raw event + bridge twin (already fired for a single
  // spawn — the launch emits it before the runner process is up).
  const startedRaw = await pollUntil('async-started raw event', 30_000, () => rawEvents.find((e) => e.channel === ASYNC_STARTED_EVENT && isRecord(e.data) && (e.data['id'] === runId1 || e.data['runId'] === runId1)), (e) => e !== undefined)
  log('async_started_raw', `keys=${JSON.stringify(Object.keys(startedRaw!.data as Record<string, unknown>).sort())}`)
  const startedTwin = await pollUntil(
    'async_started bridge twin',
    15_000,
    () => bridgeEvents.filter((e): e is Extract<HostEvent, { type: 'subagent_async_started' }> => e.type === 'subagent_async_started' && e.runId === runId1).at(-1)!,
    (e) => e !== undefined
  )
  log('async_started_twin', `mode=${String(startedTwin.mode)} asyncDir=${String(startedTwin.asyncDir)}`)

  // ① steer roundtrip through the BRIDGE (ticket 99's exact path).
  bridgeEvents.length = 0
  await bridge.handleSteerRequest('probe-steer-1', runId1!, 'Continue: still reply with exactly PICODE070OK at the very end')
  const steerTwin = bridgeEvents.find((e): e is Extract<HostEvent, { type: 'subagent_steer_receipt' }> => e.type === 'subagent_steer_receipt')
  if (steerTwin === undefined) fail('bridge handleSteerRequest forwarded no steer receipt')
  if (steerTwin.ok !== true || (steerTwin.deliveryStatus !== 'delivered' && steerTwin.deliveryStatus !== 'queued')) {
    fail(`bridge steer receipt drift: ${JSON.stringify(steerTwin)}`)
  }
  log('steer_bridge_twin', `ok=true deliveryStatus=${steerTwin.deliveryStatus}`)

  // ② status.json while running + ④ shared-parser projection.
  const runningStatus = await pollUntil('status.json running', CHILD_BUDGET_MS, () => readStatusJson(asyncDir1!), (s) => {
    if (s !== null) census(s)
    return s !== null && s['state'] === 'running'
  })
  if (runningStatus === null) fail('status.json running: poll returned null')
  const runningParsed = parseRunStateEnvelope(runningStatus)
  if (runningParsed === null) fail('parseRunStateEnvelope: the REAL running status.json did not parse')
  if (runningParsed.runId !== runId1) fail(`parseRunStateEnvelope: runId ${runningParsed.runId} != spawn reply ${runId1}`)
  log('status_json_running', `state=${runningParsed.state} → badge=${mapArtifactState(runningParsed.state)}`)

  // ② the conversation tab's source fields (ticket 99's parser, real file).
  // sessionFile lands once the child's own session starts writing — poll for
  // it inside the live artifact (0.70.1 writes it top-level for singles).
  const transcriptStatus = await pollUntil('status.json sessionFile', CHILD_BUDGET_MS, () => readStatusJson(asyncDir1!), (s) => {
    if (s !== null) census(s)
    return s !== null && typeof s['sessionFile'] === 'string' && s['sessionFile'] !== ''
  })
  if (transcriptStatus === null) fail('status.json sessionFile: poll returned null')
  const transcript = parseTranscriptSourceEnvelope(transcriptStatus)
  if (transcript === null) fail('parseTranscriptSourceEnvelope: the REAL running status.json did not parse')
  if (transcript.sessionFile === null || !existsSync(transcript.sessionFile)) {
    fail(`status.json sessionFile missing or not on disk: ${String(transcript.sessionFile)}`)
  }
  log('status_json_live_fields', `sessionFile=on-disk steps=${transcript.steps} workflowGraph=${'workflowGraph' in transcriptStatus ? 'present' : 'absent'}`)

  // ① status roundtrip: RAW reply { text, details, fleet, asyncSnapshot }
  // + the BRIDGE's forwarded subagent_status (available + fleet DTO + runs).
  const statusRaw = await rpc('status', {})
  if (statusRaw.success !== true) fail(`status RPC failed: ${JSON.stringify(statusRaw.error)}`)
  const statusData = isRecord(statusRaw.data) ? statusRaw.data : {}
  for (const key of ['text', 'details', 'fleet', 'asyncSnapshot']) {
    if (!(key in statusData)) fail(`status reply missing "${key}" (shape drift)`)
  }
  const fleet = statusData['fleet'] as Record<string, unknown>
  if (fleet['version'] !== 1 || !Array.isArray(fleet['entries'])) fail(`fleet DTO drift: ${JSON.stringify(fleet)}`)
  const asyncSnapshot = statusData['asyncSnapshot']
  if (!isRecord(asyncSnapshot) || !Array.isArray(asyncSnapshot['runs'])) fail(`asyncSnapshot drift: ${JSON.stringify(asyncSnapshot)}`)
  if (!(asyncSnapshot['runs'] as Array<Record<string, unknown>>).some((r) => r['id'] === runId1)) {
    fail(`asyncSnapshot.runs has no entry for ${runId1}`)
  }
  log('status_raw_shape', `fleet.entries=${fleet['entries'].length} totalActive=${String(fleet['totalActive'])} asyncSnapshot.runs=${(asyncSnapshot['runs'] as unknown[]).length}`)

  bridgeEvents.length = 0
  await bridge.handleStatusRequest('probe-status-1', () => [asyncDir1!])
  const statusTwin = bridgeEvents.find((e): e is Extract<HostEvent, { type: 'subagent_status' }> => e.type === 'subagent_status')
  if (statusTwin === undefined) fail('bridge handleStatusRequest forwarded no subagent_status')
  if (statusTwin.available !== true) fail('bridge subagent_status: available != true (RPC fleet path broken on 0.70.1)')
  // The wire's fleet.version==1 was already asserted on the RAW reply; the
  // bridge's DTO projection carries entries/totalActive/omitted.
  if (statusTwin.fleet === null || statusTwin.fleet.entries.length === 0) {
    fail('bridge subagent_status: fleet DTO not projected from the real reply')
  }
  const twinRun = statusTwin.runs.find((r) => r.runId === runId1)
  if (twinRun === undefined) fail('bridge subagent_status: the live run state is missing from runs[]')
  log('status_bridge_twin', `available=true fleet.entries=${statusTwin.fleet.entries.length} run.state=${twinRun.state}`)

  // ③ natural completion: raw + twin, final artifact state → Completed.
  const completedTwin = await pollUntil(
    'leg1 complete twin',
    CHILD_BUDGET_MS,
    () => bridgeEvents.find((e): e is Extract<HostEvent, { type: 'subagent_async_completed' }> => e.type === 'subagent_async_completed' && e.runId === runId1)!,
    (e) => e !== undefined
  )
  const completedRaw = rawEvents.find((e) => e.channel === ASYNC_COMPLETE_EVENT && isRecord(e.data) && (e.data['runId'] === runId1 || e.data['id'] === runId1))
  if (completedRaw === undefined) fail('async-complete raw event never arrived for leg1')
  log('async_complete_raw', `keys=${JSON.stringify(Object.keys(completedRaw!.data as Record<string, unknown>).sort())}`)
  const finalStatus1 = await pollUntil('leg1 final status.json', 30_000, () => readStatusJson(asyncDir1!), (s) => {
    if (s !== null) census(s)
    return s !== null && (s['state'] === 'complete' || s['state'] === 'failed' || s['state'] === 'partial')
  })
  if (finalStatus1 === null) fail('leg1 final status.json: poll returned null')
  const finalParsed1 = parseRunStateEnvelope(finalStatus1)
  if (finalParsed1 === null || finalParsed1.state !== 'complete') fail(`leg1 final artifact state is not complete: ${JSON.stringify(finalStatus1['state'])}`)
  if (mapArtifactState(finalParsed1.state) !== 'completed') fail('mapArtifactState(complete) != completed')
  log('leg1_verdict', `complete → badge=completed (twin.success=${String(completedTwin.success)})`)

  // ---- leg 2: spawn → running → RPC STOP → stopped ------------------------

  const leg2 = await rpc('spawn', { agent: 'scout', task: 'Read the files package.json, tsconfig.json and vitest.config.ts in this directory ONE AT A TIME, waiting for each result. Then write the numbers from 1 to 150, one per line, and reply with exactly: DONE150' })
  if (leg2.success !== true) fail(`spawn leg2 failed: ${JSON.stringify(leg2.error)}`)
  const spawn2 = isRecord(leg2.data) ? leg2.data : {}
  const details2 = isRecord(spawn2['details']) ? spawn2['details'] : {}
  const runId2 = typeof details2['runId'] === 'string' ? details2['runId'] : (typeof details2['asyncId'] === 'string' ? details2['asyncId'] : undefined)
  const asyncDir2 = typeof details2['asyncDir'] === 'string' ? details2['asyncDir'] : undefined
  if (runId2 === undefined || asyncDir2 === undefined) fail(`spawn leg2: details missing run id/asyncDir (keys=${JSON.stringify(Object.keys(details2))})`)
  log('spawn_leg2', `runId=${runId2}`)

  await pollUntil('leg2 status.json running', CHILD_BUDGET_MS, () => readStatusJson(asyncDir2!), (s) => {
    if (s !== null) census(s)
    return s !== null && s['state'] === 'running'
  })
  bridgeEvents.length = 0
  await bridge.handleStopRequest('probe-stop-1', runId2!)
  const stopTwin = bridgeEvents.find((e): e is Extract<HostEvent, { type: 'subagent_stop_receipt' }> => e.type === 'subagent_stop_receipt')
  if (stopTwin === undefined) fail('bridge handleStopRequest forwarded no stop receipt')
  if (stopTwin.ok !== true || stopTwin.state !== 'stopping') fail(`bridge stop receipt drift: ${JSON.stringify(stopTwin)}`)
  log('stop_bridge_twin', 'ok=true state=stopping (REAL stop control channel accepted)')

  // ③ child-status is a CHILD-targeted hint (live-probe finding: a TOP-LEVEL
  // stop rides stopRunner() and records only subagent.run.stopped — the doc
  // marks child-status as observer hints; status snapshots stay
  // authoritative, which is exactly PiCode's projection order). The
  // child-targeted leg below exercises the events themselves.
  const childStatuses2 = bridgeEvents.filter(
    (e): e is Extract<HostEvent, { type: 'subagent_child_status' }> => e.type === 'subagent_child_status' && e.runId === runId2
  )
  const finalStatus2 = await pollUntil('leg2 final status.json', 90_000, () => readStatusJson(asyncDir2!), (s) => {
    if (s !== null) census(s)
    return s !== null && s['state'] === 'stopped'
  })
  if (finalStatus2 === null) fail('leg2 final status.json: poll returned null')
  const finalParsed2 = parseRunStateEnvelope(finalStatus2)
  if (finalParsed2 === null || mapArtifactState(finalParsed2.state) !== 'cancelled') {
    fail(`stopped run did not project Cancelled: ${JSON.stringify(finalParsed2)}`)
  }
  log('leg2_verdict', `stopped → badge=cancelled (child-status hints on a top-level stop: ${childStatuses2.length})`)

  // ---- leg 3: child-targeted stop → the child-status event family --------

  const leg3 = await rpc('spawn', { agent: 'scout', task: 'Read the files package.json and tsconfig.json in this directory ONE AT A TIME, waiting for each result. Then write the numbers from 1 to 90, one per line, and reply with exactly: DONE90' })
  if (leg3.success !== true) fail(`spawn leg3 failed: ${JSON.stringify(leg3.error)}`)
  const spawn3 = isRecord(leg3.data) ? leg3.data : {}
  const details3 = isRecord(spawn3['details']) ? spawn3['details'] : {}
  const runId3 = typeof details3['runId'] === 'string' ? details3['runId'] : (typeof details3['asyncId'] === 'string' ? details3['asyncId'] : undefined)
  const asyncDir3 = typeof details3['asyncDir'] === 'string' ? details3['asyncDir'] : undefined
  if (runId3 === undefined || asyncDir3 === undefined) fail(`spawn leg3: details missing run id/asyncDir (keys=${JSON.stringify(Object.keys(details3))})`)
  log('spawn_leg3', `runId=${runId3}`)

  await pollUntil('leg3 status.json running', CHILD_BUDGET_MS, () => readStatusJson(asyncDir3!), (s) => {
    if (s !== null) census(s)
    return s !== null && s['state'] === 'running'
  })
  // childId resolution: step.childId ?? step.workflowKey ?? step.runId ??
  // 'step:<index>' (pi-subagents child-identity) — 'step:0' always resolves.
  const childId3 = 'step:0'
  const stop3 = await rpc('stop', { id: runId3, childId: childId3 })
  if (stop3.success !== true) fail(`child-targeted stop failed: ${JSON.stringify(stop3.error)}`)
  const stop3Data = isRecord(stop3.data) ? stop3.data : {}
  if (stop3Data['state'] !== 'stopping') fail(`child-targeted stop reply state drift: ${JSON.stringify(stop3Data)}`)
  log('stop_child_raw', `state=${String(stop3Data['state'])} childId=${String(stop3Data['childId'])}`)

  const childStatuses3 = await pollUntil(
    'child-status events (child-targeted stop)',
    60_000,
    () => rawEvents.filter((e) => e.channel === CHILD_STATUS_EVENT && isRecord(e.data) && e.data['runId'] === runId3),
    (list) => list.some((e) => (e.data as Record<string, unknown>)['status'] === 'stopping')
  )
  log('child_status_raw', `statuses=${JSON.stringify(childStatuses3.map((e) => (e.data as Record<string, unknown>)['status']))}`)
  const childTwins3 = await pollUntil(
    'child-status bridge twins',
    30_000,
    () => bridgeEvents.filter((e): e is Extract<HostEvent, { type: 'subagent_child_status' }> => e.type === 'subagent_child_status' && e.runId === runId3),
    (list) => list.length > 0
  )
  log('child_status_twin', `statuses=${JSON.stringify(childTwins3.map((e) => e.status))}`)
  if (!childTwins3.some((e) => e.status === 'stopping' || e.status === 'stopped')) fail('child-status bridge twins carried neither stopping nor stopped')
  // Child-targeted stops leave the RUN in a terminal state that reflects the
  // child's forced exit (observed live: failed, with steps[0].status=stopped
  // — the run-level 'stopped' lifecycle belongs to the TOP-LEVEL stop, leg
  // 2). Assert terminal + the honest badge projection either way.
  const finalStatus3 = await pollUntil('leg3 final status.json', 90_000, () => readStatusJson(asyncDir3!), (s) => {
    if (s !== null) census(s)
    return s !== null && ['stopped', 'failed', 'partial', 'complete'].includes(s['state'] as string)
  })
  if (finalStatus3 === null) fail('leg3 final status.json: poll returned null')
  const finalParsed3 = parseRunStateEnvelope(finalStatus3)
  if (finalParsed3 === null) fail('leg3 final artifact did not parse')
  log('leg3_verdict', `child-targeted stop → run state=${finalParsed3.state} badge=${mapArtifactState(finalParsed3.state)} (stopped hints relayed, artifact authoritative)`)

  // ---- checklist summary ---------------------------------------------------

  log('field_census', `status.json keys 0.70.1 wrote: ${[...statusFieldCensus].sort().join(',')}`)
  const mustSee = ['runId', 'state', 'startedAt', 'endedAt', 'mode', 'sessionFile', 'steps']
  const missing = mustSee.filter((key) => !statusFieldCensus.has(key))
  if (missing.length > 0) fail(`field census: PiCode/doc-consumed keys never seen in the real artifacts: ${missing.join(',')}`)
  log('verdict', '① RPC shapes ② status.json fields ③ events ④ live projection — all held on 0.70.1')
  log('PASS')
  rmSync(probeCwd, { recursive: true, force: true })
  rmSync(sessionsStore, { recursive: true, force: true })
  rmSync(process.env['PI_SUBAGENTS_TEMP_ROOT']!, { recursive: true, force: true })
}

try {
  await main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
