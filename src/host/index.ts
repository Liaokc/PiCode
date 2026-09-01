/**
 * Agent host process entry (ADR-0003). One process instance backs exactly one
 * Session, created in the working directory given as argv[2]; when argv[3] is
 * present it names an existing session jsonl to REOPEN instead (Handoff with
 * the pi TUI — same file, same history).
 *
 * Session replacement flows (fork now, and any future in-host resume) run
 * through the SDK's own AgentSessionRuntime — the same flows the pi TUI uses —
 * so branch/file semantics never drift from Pi.
 *
 * Runs under plain Node (Electron forks it with ELECTRON_RUN_AS_NODE=1; the
 * headless contract smoke forks it with the system node). Talks exclusively in
 * `ParentToHost`/`HostControlCommand` in and `HostToParent` out over Node IPC.
 * The Pi SDK is loaded here and nowhere else (Seam-1); it is ESM-only, hence
 * the dynamic import from this CJS entry.
 */

import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionRuntime,
  CreateAgentSessionFromServicesOptions,
  SessionEntry,
  SessionManager,
  SessionStartEvent
} from '@earendil-works/pi-coding-agent'
import type {
  AccessMode,
  HostToParent,
  ImageAttachment,
  ModelRef,
  SessionScopedEvent,
  ThinkingLevel
} from '../shared/contract'
import type { SessionDefaults } from '../shared/preferences'
import { buildSessionTree, extractTranscriptItems, type RawSessionEntry } from '../shared/sessions/parse'
import type { SessionTreePayload } from '../shared/sessions/types'
import { toolResultText } from '../shared/tool-format'
import { ApprovalGate } from './approval-gate'
import { runAuthProbe } from './auth-probe'
import {
  PICODE_BUILTIN_COMMANDS,
  buildSlashCommands,
  groupModelsByProvider,
  toModelRef,
  type SdkModelLike
} from './composer-list'
import { listRelativeFiles } from './files'
import { createApprovalGateExtension, toImageContents } from './gate-extension'
import { parseSessionArgs } from './session-args'

/** Working directory / resume target / PiCode preference defaults (ticket 11),
 * parsed once at boot from argv (see session-args). */
let cwd: string
let resumeFile: string | null = null
let newSessionDefaults: SessionDefaults | null = null
/** True while the boot create is still pending — seeds apply once, never to
 * later in-host session replacements (fork). */
let pendingSeed = false

/** What this process sends: one session's scoped events (the supervisor
 * tags them with the session id and relays; `host_exit` is supervisor-only). */
type HostEvent = Exclude<SessionScopedEvent, { type: 'host_exit' }>

function send(event: HostEvent): void {
  try {
    process.send?.(event)
  } catch {
    // Parent is gone; the disconnect handler will end us.
  }
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

let runtime: AgentSessionRuntime | null = null
let unwireSession: (() => void) | null = null
let settled = true // true = no agent run in flight
/** Error from the latest failed assistant message, surfaced only if the run
 * actually ends in failure (auto-retry may still recover). */
let pendingTurnError: string | null = null

/** The approval gate (one per host process = per Session) + its extension. */
const gate = new ApprovalGate()
const approvalExtension = createApprovalGateExtension(gate, send)

/** User messages this process already echoed via the `prompt` command; used
 * to de-duplicate the `entry_appended` relay so delivered Steer/Follow-up
 * messages surface exactly once (ticket 05 queue semantics). */
const pendingEchoes: string[] = []

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The SDK entry union is structurally compatible with our raw shape; the cast
 * is confined to this seam so the pure shared parsers stay SDK-free.
 */
function rawEntries(manager: SessionManager): RawSessionEntry[] {
  return manager.getEntries() as unknown as RawSessionEntry[]
}

function treePayload(): SessionTreePayload {
  const manager = runtime!.session.sessionManager
  const { nodes } = buildSessionTree(rawEntries(manager))
  return {
    sessionId: manager.getSessionId(),
    // The live leaf pointer (NOT the file-order tail — branch() moves the
    // leaf in memory without rewriting the append-only file).
    leafId: manager.getLeafId(),
    name: manager.getSessionName() ?? null,
    nodes
  }
}

function sendTree(): void {
  send({ type: 'session_tree', tree: treePayload() })
}

/** Transcript of the leaf path (compaction-aware), replayed on resume/navigate/fork. */
function sendHistory(): void {
  const pathEntries = runtime!.session.sessionManager.buildContextEntries() as unknown as SessionEntry[]
  send({ type: 'history_loaded', items: extractTranscriptItems(pathEntries as unknown as RawSessionEntry[]) })
}

function wireSessionEvents(agentSession: AgentSession): void {
  unwireSession?.()
  /** Wall-clock start of the currently open thinking block (host-measured). */
  let thinkingStartedAt: number | null = null
  const unsubscribe = agentSession.subscribe((event: AgentSessionEvent) => {
    switch (event.type) {
      case 'agent_start':
        settled = false
        pendingTurnError = null
        send({ type: 'agent_start' })
        break
      case 'message_start': {
        if (event.message.role === 'assistant') send({ type: 'message_start' })
        break
      }
      case 'message_update': {
        const assistantEvent = event.assistantMessageEvent
        if (assistantEvent.type === 'text_delta') {
          send({ type: 'text_delta', delta: assistantEvent.delta })
        } else if (assistantEvent.type === 'thinking_delta') {
          send({ type: 'thinking_delta', delta: assistantEvent.delta })
        } else if (assistantEvent.type === 'thinking_start') {
          thinkingStartedAt = Date.now()
        } else if (assistantEvent.type === 'thinking_end') {
          const durationMs = thinkingStartedAt !== null ? Math.max(0, Date.now() - thinkingStartedAt) : 0
          thinkingStartedAt = null
          send({ type: 'thinking_end', durationMs })
        }
        break
      }
      case 'tool_execution_start': {
        send({
          type: 'tool_start',
          toolCallId: event.toolCallId,
          name: event.toolName,
          args: isRecord(event.args) ? event.args : {}
        })
        break
      }
      case 'tool_execution_update': {
        send({ type: 'tool_update', toolCallId: event.toolCallId, partial: toolResultText(event.partialResult) })
        break
      }
      case 'tool_execution_end': {
        send({
          type: 'tool_end',
          toolCallId: event.toolCallId,
          output: toolResultText(event.result),
          isError: event.isError === true
        })
        break
      }
      case 'message_end': {
        if (event.message.role === 'user') {
          // Steer/Follow-up deliveries surface as injected user messages.
          relayDeliveredUserText(userEntryText(event.message.content))
          break
        }
        if (event.message.role !== 'assistant') break
        send({ type: 'message_end' })
        // Hold the error: auto-retry may still recover; only a run that ends
        // in failure surfaces `turn_error` (see `agent_end` below).
        if (event.message.stopReason === 'error') {
          pendingTurnError = event.message.errorMessage ?? 'The model request failed.'
        }
        break
      }
      case 'agent_end': {
        // `willRetry` marks a retryable failure — the run is NOT over; suppress
        // agent_end so the renderer keeps showing the working state, and drop
        // the held error (the retried message will report fresh results).
        if (event.willRetry) {
          pendingTurnError = null
          break
        }
        settled = true
        // Any pill still pending dies with the run (abort/compaction paths).
        gate.cancelAll('The turn ended before a decision.')
        if (pendingTurnError !== null) {
          send({ type: 'turn_error', message: pendingTurnError })
          pendingTurnError = null
        }
        send({ type: 'agent_end' })
        break
      }
      // ---- ticket 05: queue, delivery echoes, thinking tier, compaction ----
      case 'queue_update':
        send({ type: 'queue_update', steering: [...event.steering], followUp: [...event.followUp] })
        break
      case 'entry_appended':
        relayAppendedUserEntry(event.entry)
        break
      case 'thinking_level_changed':
        send({
          type: 'thinking_level_changed',
          level: event.level as ThinkingLevel,
          availableLevels: agentSession.getAvailableThinkingLevels() as ThinkingLevel[]
        })
        break
      case 'compaction_start':
        send({ type: 'host_notice', level: 'info', message: 'Compacting conversation context…' })
        break
      case 'compaction_end':
        send(
          event.aborted || event.errorMessage
            ? {
                type: 'host_notice',
                level: 'error',
                message: `Compaction failed${event.errorMessage ? `: ${event.errorMessage}` : ''}.`
              }
            : { type: 'host_notice', level: 'info', message: 'Context compacted.' }
        )
        break
      default:
        break
    }
  })
  unwireSession = unsubscribe
}

/** A user message delivered mid-run (Steer/Follow-up) surfaces in the
 * transcript exactly once: prompt echoes are pre-recorded and consumed, and
 * a small recent-set guards the double path (message_end + entry_appended). */
const recentRelays: string[] = []

function relayDeliveredUserText(text: string | null): void {
  if (text === null || text === '') return
  const echoIndex = pendingEchoes.indexOf(text)
  if (echoIndex !== -1) {
    pendingEchoes.splice(echoIndex, 1)
    return
  }
  if (recentRelays.includes(text)) return
  recentRelays.push(text)
  if (recentRelays.length > 20) recentRelays.shift()
  send({ type: 'user_message', text })
}

function relayAppendedUserEntry(entry: SessionEntry): void {
  const candidate = entry as { type?: string; message?: { role?: string; content?: unknown } }
  if (candidate.type !== 'message' || candidate.message?.role !== 'user') return
  relayDeliveredUserText(userEntryText(candidate.message.content))
}

function userEntryText(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return null
  const parts: string[] = []
  for (const block of content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

function announceCurrentSession(resumed: boolean): void {
  const agentSession = runtime!.session
  send({
    type: 'session_created',
    sessionId: agentSession.sessionId,
    cwd,
    model: agentSession.model?.id ?? null,
    sessionFile: agentSession.sessionFile ?? null,
    name: agentSession.sessionManager.getSessionName() ?? null,
    resumed
  })
  // Composer state travels with the session announcement so a fresh renderer
  // (or a fork/rebuild) sees model/thinking/access mode atomically.
  send(composerState())
  send(modelsAvailable())
  send(slashCommands())
  if (resumed) {
    sendHistory()
    sendTree()
  }
}

// ---- ticket 05: composer state builders ----

function modelRefOrNull(model: AgentSession['model']): ModelRef | null {
  return model ? toModelRef(model) : null
}

function composerState(): Extract<HostToParent, { type: 'composer_state' }> {
  const agentSession = runtime!.session
  return {
    type: 'composer_state',
    model: modelRefOrNull(agentSession.model),
    thinkingLevel: (agentSession.thinkingLevel ?? null) as ThinkingLevel | null,
    availableLevels: agentSession.getAvailableThinkingLevels() as ThinkingLevel[],
    accessMode: gate.getMode()
  }
}

function modelsAvailable(): Extract<HostToParent, { type: 'models_available' }> {
  const modelRuntime = runtime!.services.modelRuntime
  const available = modelRuntime.getAvailableSnapshot() as readonly SdkModelLike[]
  return {
    type: 'models_available',
    providers: groupModelsByProvider(available, (providerId) => modelRuntime.getProvider(providerId)?.name),
    current: modelRefOrNull(runtime!.session.model)
  }
}

function slashCommands(): Extract<HostToParent, { type: 'slash_commands' }> {
  const loader = runtime!.services.resourceLoader
  return {
    type: 'slash_commands',
    commands: buildSlashCommands(loader.getPrompts().prompts, loader.getSkills().skills, PICODE_BUILTIN_COMMANDS)
  }
}

async function createSession(): Promise<void> {
  const sdk = await import('@earendil-works/pi-coding-agent')
  // Smoke isolation (ticket 13): when PICODE_SESSION_DIR is set, NEW sessions
  // are stored under that directory instead of the real ~/.pi/agent/sessions.
  // In-host forks follow the current manager's session dir, so every session
  // file a smoke run produces stays inside the throwaway store. Resumes open
  // an explicit file (dir derives from the file's own location). Auth,
  // models and settings still come from the real agent dir — only session
  // WRITES are isolated.
  const isolatedSessionDir = process.env['PICODE_SESSION_DIR']
  const manager = resumeFile
    ? sdk.SessionManager.open(resumeFile)
    : sdk.SessionManager.create(cwd, isolatedSessionDir || undefined)
  // The factory recreates cwd-bound services on every session replacement —
  // the same shape the pi TUI hands to createAgentSessionRuntime. The
  // approval gate rides the resource loader's inline-extension pipeline.
  const factory = async (opts: { cwd: string; sessionManager: SessionManager; sessionStartEvent?: SessionStartEvent }) => {
    const services = await sdk.createAgentSessionServices({
      cwd: opts.cwd,
      resourceLoaderOptions: { extensionFactories: [approvalExtension] }
    })
    // Seeds apply to the INITIAL creation only — in-host replacements (fork)
    // re-run this factory and must inherit the branched session's model.
    const seed = pendingSeed ? newSessionSeedOptions(services) : {}
    pendingSeed = false
    const result = await sdk.createAgentSessionFromServices({
      services,
      sessionManager: opts.sessionManager,
      sessionStartEvent: opts.sessionStartEvent,
      ...seed
    })
    return { ...result, services, diagnostics: services.diagnostics }
  }
  runtime = await sdk.createAgentSessionRuntime(factory, {
    cwd,
    agentDir: sdk.getAgentDir(),
    sessionManager: manager
  })
  wireSessionEvents(runtime.session)
  announceCurrentSession(Boolean(resumeFile))
}

/**
 * PiCode preference defaults (ticket 11) for a NEW session, resolved against
 * that session's own services. Unknown model ids fall back to Pi's own
 * default; resumes never receive defaults (their model state is their own).
 * The SDK clamps the thinking level to the model's capabilities.
 */
function newSessionSeedOptions(services: {
  modelRuntime: { getModel(providerId: string, modelId: string): unknown }
}): Pick<CreateAgentSessionFromServicesOptions, 'model' | 'thinkingLevel'> {
  if (resumeFile || newSessionDefaults === null) return {}
  const seed: Pick<CreateAgentSessionFromServicesOptions, 'model' | 'thinkingLevel'> = {}
  if (newSessionDefaults.providerId !== undefined && newSessionDefaults.modelId !== undefined) {
    const model = services.modelRuntime.getModel(newSessionDefaults.providerId, newSessionDefaults.modelId)
    if (model) seed.model = model as CreateAgentSessionFromServicesOptions['model']
  }
  if (newSessionDefaults.thinkingLevel !== undefined) seed.thinkingLevel = newSessionDefaults.thinkingLevel
  return seed
}

function handlePrompt(text: string, images?: ImageAttachment[]): void {
  const agentSession = runtime?.session
  if (!agentSession || !settled) {
    send({ type: 'turn_error', message: 'Cannot prompt while no session is ready or a run is in flight.' })
    return
  }
  send({ type: 'user_message', text })
  pendingEchoes.push(text)
  try {
    agentSession.prompt(text, { images: toImageContents(images) }).catch((err: unknown) => {
      pullEcho(text)
      send({ type: 'turn_error', message: errorText(err) })
    })
  } catch (err) {
    pullEcho(text)
    send({ type: 'turn_error', message: errorText(err) })
  }
}

function pullEcho(text: string): void {
  const index = pendingEchoes.indexOf(text)
  if (index !== -1) pendingEchoes.splice(index, 1)
}

/** Explicit Steer: inject into the RUNNING turn (renderer chose the mode).
 * If the run already ended (render/Enter race), deliver as a normal prompt
 * so the text can never silently rot in an invisible queue. */
async function handleQueued(kind: 'steer_prompt' | 'follow_up_prompt', text: string, images?: ImageAttachment[]): Promise<void> {
  const agentSession = runtime?.session
  if (!agentSession) {
    send({ type: 'session_command_error', message: 'No session is open.' })
    return
  }
  if (settled) {
    handlePrompt(text, images)
    return
  }
  try {
    const content = toImageContents(images)
    if (kind === 'steer_prompt') await agentSession.steer(text, content)
    else await agentSession.followUp(text, content)
  } catch (err) {
    send({ type: 'session_command_error', message: errorText(err) })
  }
}

async function handleSetModel(providerId: string, modelId: string): Promise<void> {
  if (!runtime) {
    send({ type: 'session_command_error', message: 'No session is open.' })
    return
  }
  const model = runtime.services.modelRuntime.getModel(providerId, modelId)
  if (!model) {
    send({ type: 'session_command_error', message: `Model ${providerId}/${modelId} is not available.` })
    return
  }
  try {
    await runtime.session.setModel(model)
    send({
      type: 'model_changed',
      model: toModelRef(runtime.session.model!),
      thinkingLevel: (runtime.session.thinkingLevel ?? null) as ThinkingLevel | null,
      availableLevels: runtime.session.getAvailableThinkingLevels() as ThinkingLevel[]
    })
  } catch (err) {
    send({ type: 'session_command_error', message: errorText(err) })
  }
}

function handleSetThinkingLevel(level: ThinkingLevel): void {
  const agentSession = runtime?.session
  if (!agentSession) {
    send({ type: 'session_command_error', message: 'No session is open.' })
    return
  }
  try {
    // setThinkingLevel clamps to model capabilities; when the effective level
    // changes the SDK's thinking_level_changed event echoes it back.
    agentSession.setThinkingLevel(level)
  } catch (err) {
    send({ type: 'session_command_error', message: errorText(err) })
  }
}

function handleSetAccessMode(mode: AccessMode): void {
  gate.setMode(mode)
  send({ type: 'access_mode_changed', mode: gate.getMode() })
}

async function handleCompact(): Promise<void> {
  const agentSession = runtime?.session
  if (!agentSession) {
    send({ type: 'session_command_error', message: 'No session is open.' })
    return
  }
  try {
    await agentSession.compact()
    // compaction_start/end SDK events carry the notices to the renderer.
  } catch (err) {
    send({ type: 'host_notice', level: 'error', message: `Compaction failed: ${errorText(err)}` })
  }
}

async function handleListFiles(requestId: string, query: string): Promise<void> {
  void query // ranking happens renderer-side; the host returns the candidate set
  const files = await listRelativeFiles(cwd)
  send({ type: 'file_list', requestId, files })
}

async function handleAbort(): Promise<void> {
  const agentSession = runtime?.session
  if (!agentSession) return
  // Pending pills die with the turn — resolve their waiters before abort so
  // the agent loop never stays parked on a decision nobody will give.
  gate.cancelAll('The turn was aborted.')
  try {
    await agentSession.abort()
  } catch (err) {
    send({ type: 'turn_error', message: errorText(err) })
  }
}

function requireSettledSession(): boolean {
  if (!runtime) {
    send({ type: 'session_command_error', message: 'No session is open.' })
    return false
  }
  if (!settled) {
    send({ type: 'session_command_error', message: 'Cannot restructure the session while the agent is running.' })
    return false
  }
  return true
}

async function handleNavigateTree(entryId: string): Promise<void> {
  if (!requireSettledSession()) return
  try {
    const result = await runtime!.session.navigateTree(entryId)
    if (result.cancelled) {
      send({ type: 'session_command_error', message: 'Tree navigation was cancelled.' })
      return
    }
    sendHistory()
    sendTree()
  } catch (err) {
    send({ type: 'session_command_error', message: errorText(err) })
  }
}

async function handleFork(entryId: string): Promise<void> {
  if (!requireSettledSession()) return
  try {
    // position 'at': continue from exactly the chosen entry. The runtime
    // clones the session file (path root→entry) and swaps to a fresh
    // AgentSession — Pi's own fork semantics, identical to the TUI.
    const result = await runtime!.fork(entryId, { position: 'at' })
    if (result.cancelled) {
      send({ type: 'session_command_error', message: 'Fork was cancelled.' })
      return
    }
    wireSessionEvents(runtime!.session)
    announceCurrentSession(true)
  } catch (err) {
    send({ type: 'session_command_error', message: errorText(err) })
  }
}

function handleRename(name: string): void {
  if (!requireSettledSession()) return
  try {
    runtime!.session.setSessionName(name)
    const finalName = runtime!.session.sessionManager.getSessionName() ?? null
    send({ type: 'session_renamed', name: finalName })
    sendTree()
  } catch (err) {
    send({ type: 'session_command_error', message: errorText(err) })
  }
}

process.on('message', (message: unknown) => {
  if (!isRecord(message) || typeof message.type !== 'string') return
  switch (message.type) {
    case 'prompt':
      if (typeof message.text === 'string') {
        handlePrompt(message.text, message.images as ImageAttachment[] | undefined)
      }
      break
    case 'steer_prompt':
    case 'follow_up_prompt':
      if (typeof message.text === 'string') {
        void handleQueued(message.type, message.text, message.images as ImageAttachment[] | undefined)
      }
      break
    case 'clear_queue':
      runtime?.session.clearQueue() // emits queue_update itself
      break
    case 'set_model':
      if (typeof message.providerId === 'string' && typeof message.modelId === 'string') {
        void handleSetModel(message.providerId, message.modelId)
      }
      break
    case 'set_thinking_level':
      if (typeof message.level === 'string') handleSetThinkingLevel(message.level as ThinkingLevel)
      break
    case 'set_access_mode':
      if (typeof message.mode === 'string') handleSetAccessMode(message.mode as AccessMode)
      break
    case 'approve_tool':
      if (typeof message.toolCallId === 'string') {
        gate.resolve(message.toolCallId, {
          approved: true,
          reason: '',
          remember: message.remember === true
        })
      }
      break
    case 'deny_tool':
      if (typeof message.toolCallId === 'string') {
        gate.resolve(message.toolCallId, {
          approved: false,
          reason: typeof message.reason === 'string' ? message.reason : '',
          remember: false
        })
      }
      break
    case 'compact_session':
      void handleCompact()
      break
    case 'list_files':
      if (typeof message.requestId === 'string') {
        void handleListFiles(message.requestId, typeof message.query === 'string' ? message.query : '')
      }
      break
    case 'abort_turn':
      void handleAbort()
      break
    case 'navigate_tree':
      if (typeof message.entryId === 'string') void handleNavigateTree(message.entryId)
      break
    case 'fork_session':
      if (typeof message.entryId === 'string') void handleFork(message.entryId)
      break
    case 'set_session_label':
      if (typeof message.name === 'string') handleRename(message.name)
      break
    case 'request_tree':
      if (runtime) sendTree()
      break
    case 'shutdown':
      void (async () => {
        gate.cancelAll('The session is shutting down.')
        try {
          await runtime?.dispose()
        } catch {
          // Dispose issues must not block shutdown.
        } finally {
          process.exit(0)
        }
      })()
      // Safety net if dispose hangs (e.g. an unresponsive model stream).
      setTimeout(() => process.exit(0), 2_000).unref?.()
      break
    default:
      break
  }
})

// If the parent dies for any reason (even SIGKILL), the IPC channel closes —
// exit so no orphan host survives (ticket acceptance: no orphaned processes).
process.on('disconnect', () => {
  process.exit(0)
})

process.on('uncaughtException', (err) => {
  if (!settled) send({ type: 'turn_error', message: errorText(err) })
  else send({ type: 'session_error', message: errorText(err) })
  process.exit(1)
})

/** Normal boot path: parse argv, then bring up the session (probe mode skips
 * this entirely — see the branch below). */
function boot(): void {
  const args = parseSessionArgs(process.argv)
  cwd = args.cwd
  resumeFile = args.resumeFile
  newSessionDefaults = args.defaults
  pendingSeed = true
  void createSession().catch((err: unknown) => {
    send({ type: 'session_error', message: errorText(err) })
    // Give the IPC message a moment to flush before exiting.
    setTimeout(() => process.exit(1), 100)
  })
}

if (process.argv[2] === '--auth-probe') {
  // Ticket 11 auth probe: a short-lived host-family process that reports the
  // read-only provider credential status for the settings window, then exits.
  // No session machinery is booted on this path. The report is NOT a contract
  // event — the supervisor validates it with isAuthProbeReport on arrival.
  void runAuthProbe().then((report) => {
    process.send?.(report)
    // Give the IPC message a moment to flush before exiting.
    setTimeout(() => process.exit(0), 100).unref?.()
  })
} else {
  boot()
}
