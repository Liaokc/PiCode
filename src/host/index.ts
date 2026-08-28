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
  SessionEntry,
  SessionManager,
  SessionStartEvent
} from '@earendil-works/pi-coding-agent'
import type { HostToParent } from '../shared/contract'
import { buildSessionTree, extractTranscriptItems, type RawSessionEntry } from '../shared/sessions/parse'
import type { SessionTreePayload } from '../shared/sessions/types'
import { toolResultText } from '../shared/tool-format'

const cwd = process.argv[2]
const resumeFile = process.argv[3]
if (!cwd) {
  process.exitCode = 1
  throw new Error('agent host requires a working directory as argv[2]')
}

/** Every contract event except `host_exit`, which only the supervisor emits. */
type HostEvent = Exclude<HostToParent, { type: 'host_exit' }>

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
        if (pendingTurnError !== null) {
          send({ type: 'turn_error', message: pendingTurnError })
          pendingTurnError = null
        }
        send({ type: 'agent_end' })
        break
      }
      default:
        break
    }
  })
  unwireSession = unsubscribe
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
  if (resumed) {
    sendHistory()
    sendTree()
  }
}

async function createSession(): Promise<void> {
  const sdk = await import('@earendil-works/pi-coding-agent')
  const manager = resumeFile ? sdk.SessionManager.open(resumeFile) : sdk.SessionManager.create(cwd)
  // The factory recreates cwd-bound services on every session replacement —
  // the same shape the pi TUI hands to createAgentSessionRuntime.
  const factory = async (opts: { cwd: string; sessionManager: SessionManager; sessionStartEvent?: SessionStartEvent }) => {
    const services = await sdk.createAgentSessionServices({ cwd: opts.cwd })
    const result = await sdk.createAgentSessionFromServices({
      services,
      sessionManager: opts.sessionManager,
      sessionStartEvent: opts.sessionStartEvent
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

function handlePrompt(text: string): void {
  const agentSession = runtime?.session
  if (!agentSession || !settled) {
    send({ type: 'turn_error', message: 'Cannot prompt while no session is ready or a run is in flight.' })
    return
  }
  send({ type: 'user_message', text })
  try {
    agentSession.prompt(text).catch((err: unknown) => send({ type: 'turn_error', message: errorText(err) }))
  } catch (err) {
    send({ type: 'turn_error', message: errorText(err) })
  }
}

async function handleAbort(): Promise<void> {
  const agentSession = runtime?.session
  if (!agentSession) return
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
      if (typeof message.text === 'string') handlePrompt(message.text)
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

createSession().catch((err: unknown) => {
  send({ type: 'session_error', message: errorText(err) })
  // Give the IPC message a moment to flush before exiting.
  setTimeout(() => process.exit(1), 100)
})
