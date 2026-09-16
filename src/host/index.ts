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
import { assistantUsageOfMessage, lastAssistantUsage } from '../shared/context-ring'
import { buildSessionTree, extractTranscriptItems, type RawSessionEntry } from '../shared/sessions/parse'
import type { SessionTreePayload } from '../shared/sessions/types'
import { toolResultText } from '../shared/tool-format'
import { isPackagesOpDescriptor, packagesOpRefusal, type PackagesOpDescriptor } from '../shared/packages-management'
import { homedir } from 'node:os'
import { ApprovalGate } from './approval-gate'
import { runAuthProbe } from './auth-probe'
import { runOpWithManager } from './packages-op'
import {
  PICODE_BUILTIN_COMMANDS,
  buildSlashCommands,
  groupModelsByProvider,
  toModelRef,
  type SdkModelLike
} from './composer-list'
import { listRelativeFiles } from './files'
import { readGitBranch } from './git-branch'
import { createApprovalGateExtension, toImageContents } from './gate-extension'
import { HeldMessageEnd, monitorSessionManager } from './live-entry-ids'
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

/** User messages this process already echoed via the `prompt` command; the
 * appendMessage monitor consumes them at the persistence moment, where the
 * echo is relayed WITH the real session entry id (ticket 51). A prompt that
 * fails before persisting echoes id-less from its catch (flushPendingEcho). */
const pendingEchoes: string[] = []

/** Ticket 51: the current session's held assistant message_end (see
 * live-entry-ids). Re-armed per session wiring; released by the
 * appendMessage monitor at the persistence moment, or flushed id-less when
 * any other SDK event arrives first (aborted-turn shapes). */
let heldMessageEnd = new HeldMessageEnd()

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
  const { nodes } = buildSessionTree(rawEntries(manager), homedir())
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

/** Transcript of the leaf path (compaction-aware), replayed on resume/navigate/fork.
 * Ticket 77: the event also carries the path's most recent valid assistant
 * usage (the same walk the TUI's context readout rests on, minus the
 * trailing-estimate term — the ring's numerator口径, shared/context-ring.ts). */
function sendHistory(): void {
  const pathEntries = runtime!.session.sessionManager.buildContextEntries() as unknown as SessionEntry[]
  const items = extractTranscriptItems(pathEntries as unknown as RawSessionEntry[])
  const usage = lastAssistantUsage(pathEntries)
  if (usage !== undefined) send({ type: 'history_loaded', items, usage })
  else send({ type: 'history_loaded', items })
}

function wireSessionEvents(agentSession: AgentSession): void {
  unwireSession?.()
  heldMessageEnd = new HeldMessageEnd()
  /** Wall-clock start of the currently open thinking block (host-measured). */
  let thinkingStartedAt: number | null = null
  const unsubscribe = agentSession.subscribe((event: AgentSessionEvent) => {
    // Ticket 51: a held message_end whose entry never persisted flushes
    // id-less BEFORE anything can reorder the stream (the assistant hold
    // itself is the one message_end case that must not flush). Ticket 77:
    // the flushed event still rides the finished message's ring usage —
    // the message completed even when its entry never landed.
    if (!(event.type === 'message_end' && event.message.role === 'assistant') && heldMessageEnd.flush()) {
      const flushedUsage = heldMessageEnd.takeUsage()
      if (flushedUsage !== undefined) send({ type: 'message_end', usage: flushedUsage })
      else send({ type: 'message_end' })
    }
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
        // Ticket 78 (additive projection): when the SDK result carries a
        // string `details.diff` (the edit tool's display diff), it rides the
        // tool_end event as `diff` — the turn file bar's raw material. Every
        // other tool (and every older result shape) leaves the field absent,
        // so pre-78 renderer payloads keep validating unchanged.
        const result = event.result as { details?: unknown } | undefined
        const details = isRecord(result?.details) ? result?.details : undefined
        const diff = typeof details?.['diff'] === 'string' ? details['diff'] : undefined
        send({
          type: 'tool_end',
          toolCallId: event.toolCallId,
          output: toolResultText(event.result),
          isError: event.isError === true,
          ...(diff !== undefined ? { diff } : {})
        })
        break
      }
      case 'message_end': {
        if (event.message.role === 'user') break
        if (event.message.role !== 'assistant') break
        // Ticket 51: held — the contract event is released by the
        // appendMessage monitor at the persistence moment, carrying the
        // real session entry id the fork anchor needs. Ticket 77: the hold
        // also carries the message's ring usage under the TUI-calibrated
        // validity rule (aborted/errored/usage-less → undefined).
        heldMessageEnd.hold(assistantUsageOfMessage(event.message))
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

/** Relay one persisted user message (ticket 51): the single surfacing point
 * for prompt echoes AND delivered Steer/Follow-up messages — the
 * appendMessage monitor calls this at the persistence moment, where the real
 * session entry id is known. Prompt echoes are pre-recorded and consumed
 * here so delivered messages surface exactly once (ticket 05 semantics). */
function relayDeliveredUserText(text: string | null, entryId: string | undefined): void {
  if (text === null || text === '') return
  const echoIndex = pendingEchoes.indexOf(text)
  if (echoIndex !== -1) pendingEchoes.splice(echoIndex, 1)
  send(entryId !== undefined ? { type: 'user_message', text, entryId } : { type: 'user_message', text })
}

/** The appendMessage monitor callback (ticket 51): the persistence moment of
 * every LLM message. User messages relay with their real entry id; assistant
 * messages release the held message_end with theirs. */
function onMessageAppended(message: Parameters<SessionManager['appendMessage']>[0], entryId: string): void {
  if (message.role === 'user') {
    relayDeliveredUserText(userEntryText(message.content), entryId)
    return
  }
  if (message.role === 'assistant' && heldMessageEnd.settle()) {
    // Ticket 77: the released event rides the message's ring usage when the
    // message carried one (the host already applied the validity rule).
    const usage = heldMessageEnd.takeUsage()
    if (usage !== undefined) send({ type: 'message_end', entryId, usage })
    else send({ type: 'message_end', entryId })
  }
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
    // Ticket 51: wrap the manager BEFORE the AgentSession consumes it, so
    // every message persistence reports its real entry id (live fork anchor
    // + user_message echo). The factory backs the initial session AND every
    // in-host replacement (fork), so one wrap covers all sessions.
    monitorSessionManager(opts.sessionManager, onMessageAppended)
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
  // Ticket 51: the user_message echo waits for the entry's persistence (the
  // appendMessage monitor) so it carries the real session entry id. A prompt
  // that fails before persisting echoes id-less from its catch — the message
  // still surfaces next to its error.
  pendingEchoes.push(text)
  try {
    agentSession.prompt(text, { images: toImageContents(images) }).catch((err: unknown) => {
      flushPendingEcho(text)
      send({ type: 'turn_error', message: errorText(err) })
    })
  } catch (err) {
    flushPendingEcho(text)
    send({ type: 'turn_error', message: errorText(err) })
  }
}

/** Echo a prompt whose entry never persisted — id-less (the renderer falls
 * back to its synthetic id). No-op when the monitor already relayed it. */
function flushPendingEcho(text: string): void {
  const index = pendingEchoes.indexOf(text)
  if (index === -1) return
  pendingEchoes.splice(index, 1)
  send({ type: 'user_message', text })
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

/** Ticket 21: read-only branch readout — the one git interaction this host
 * ever makes, a pure read. Non-git workspaces degrade to null (the UI hides
 * the badge; no error surfaces). */
async function handleGetBranch(): Promise<void> {
  send({ type: 'branch_info', branch: await readGitBranch(cwd) })
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
        // Resolve, then ack the pill (ticket 25: the ack is what makes the
        // transcript story right in BACKGROUND sessions too — the renderer
        // may not have been watching the pill convert into a tool card).
        if (gate.resolve(message.toolCallId, { approved: true, reason: '', remember: message.remember === true })) {
          send({ type: 'approval_resolved', toolCallId: message.toolCallId, approved: true, reason: null })
        }
      }
      break
    case 'deny_tool':
      if (typeof message.toolCallId === 'string') {
        const reason = typeof message.reason === 'string' ? message.reason : ''
        if (gate.resolve(message.toolCallId, { approved: false, reason, remember: false })) {
          send({
            type: 'approval_resolved',
            toolCallId: message.toolCallId,
            approved: false,
            reason: reason.trim() !== '' ? reason : null
          })
        }
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
    case 'get_branch':
      void handleGetBranch()
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
  // No session machinery is booted on this path. Ticket 52: an optional cwd
  // argument scopes the command-catalog enumeration (prompt templates +
  // skills for that directory); without it the probe falls back to the home
  // directory (global resources only). Ticket 63: an optional agentDir
  // argument scopes the SKILLS enumeration (sandbox override for smokes —
  // session hosts never take this argument). The report is NOT a contract
  // event — the supervisor validates it with isAuthProbeReport on arrival.
  const probeCwdArg = process.argv[3]
  const probeCwd = typeof probeCwdArg === 'string' && probeCwdArg.trim() !== '' ? probeCwdArg : undefined
  const probeAgentDirArg = process.argv[4]
  const probeAgentDir = typeof probeAgentDirArg === 'string' && probeAgentDirArg.trim() !== '' ? probeAgentDirArg : undefined
  void runAuthProbe(probeCwd, probeAgentDir).then((report) => {
    process.send?.(report)
    // Give the IPC message a moment to flush before exiting.
    setTimeout(() => process.exit(0), 100).unref?.()
  })
} else if (process.argv[2] === '--packages-op') {
  // Ticket 64 packages op: a short-lived host-family process performing ONE
  // install/remove through the SDK's own package manager (the exact code
  // path pi install/remove run), relaying progress events and reporting an
  // outcome. The descriptor arrives as argv JSON (validated before use);
  // the trust gate mirrors pi install -l — an untrusted project refuses
  // project-scope writes before anything touches the disk.
  void (async () => {
    let descriptor: PackagesOpDescriptor | null = null
    try {
      const parsed: unknown = JSON.parse(process.argv[3] ?? 'null')
      descriptor = isPackagesOpDescriptor(parsed) ? parsed : null
    } catch {
      descriptor = null
    }
    if (descriptor === null) {
      process.send?.({ ok: false, error: 'Malformed packages op descriptor.' })
      setTimeout(() => process.exit(1), 100).unref?.()
      return
    }
    const send = (message: unknown): void => {
      process.send?.(message)
    }
    try {
      const sdk = await import('@earendil-works/pi-coding-agent')
      const agentDir = descriptor.agentDir !== null && descriptor.agentDir.trim() !== '' ? descriptor.agentDir : sdk.getAgentDir()
      // Trust gate (the same derivation the probe reports): a saved
      // trust.json decision wins; otherwise defaultProjectTrust decides.
      // SettingsManager starts project-untrusted and is flipped only when
      // the derivation trusts — the SDK's own assert then backs the gate.
      const settingsManager = sdk.SettingsManager.create(descriptor.cwd, agentDir, { projectTrusted: false })
      const trustStore = new sdk.ProjectTrustStore(agentDir)
      const saved = trustStore.get(descriptor.cwd)
      const projectTrusted = saved !== null ? saved : settingsManager.getDefaultProjectTrust() === 'always'
      settingsManager.setProjectTrusted(projectTrusted)
      const refusal = packagesOpRefusal(descriptor.local, projectTrusted)
      if (refusal !== null) {
        send({ ok: false, error: refusal })
        setTimeout(() => process.exit(0), 100).unref?.()
        return
      }
      // Global (user-scope) ops resolve local sources against the AGENT DIR —
      // the same base settings entries are relativized with — so the remove
      // matcher pairs the input with the stored entry. Resolving from the
      // focused session's cwd instead silently no-ops whenever the two dirs
      // sit at different depths (removeAndPersist reports false and the op
      // claimed success — unmasked by the packaged verify, whose extra tmp
      // nesting broke run-all's sibling-dir coincidence). Project ops keep
      // the project cwd: the project settings' base is cwd/.pi.
      const managerCwd = descriptor.local ? descriptor.cwd : agentDir
      const manager = new sdk.DefaultPackageManager({ cwd: managerCwd, agentDir, settingsManager })
      const outcome = await runOpWithManager(manager, descriptor, (event) => send(event))
      send(outcome)
      setTimeout(() => process.exit(outcome.ok ? 0 : 1), 200).unref?.()
    } catch (err) {
      send({ ok: false, error: err instanceof Error ? err.message : String(err) })
      setTimeout(() => process.exit(1), 100).unref?.()
    }
  })()
} else {
  boot()
}
