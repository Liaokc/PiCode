/**
 * Agent host process entry (ADR-0003). One process instance backs exactly one
 * Session, created in the working directory given as argv[2].
 *
 * Runs under plain Node (Electron forks it with ELECTRON_RUN_AS_NODE=1; the
 * headless contract smoke forks it with the system node). Talks exclusively in
 * `ParentToHost`/`HostControlCommand` in and `HostToParent` out over Node IPC.
 * The Pi SDK is loaded here and nowhere else (Seam-1); it is ESM-only, hence
 * the dynamic import from this CJS entry.
 */

import type { HostToParent } from '../shared/contract'

const cwd = process.argv[2]
if (!cwd) {
  process.exitCode = 1
  throw new Error('agent host requires a working directory as argv[2]')
}

interface AgentSessionLike {
  prompt(text: string, options?: object): Promise<void>
  abort(): Promise<void>
  dispose(): void
  subscribe(listener: (event: unknown) => void): () => void
  sessionId: string
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

let session: AgentSessionLike | null = null
let settled = true // true = no agent run in flight

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function wireSessionEvents(raw: AgentSessionLike): void {
  raw.subscribe((event: unknown) => {
    if (!isRecord(event) || typeof event.type !== 'string') return
    switch (event.type) {
      case 'agent_start':
        settled = false
        send({ type: 'agent_start' })
        break
      case 'message_start': {
        const message = event.message as { role?: string } | undefined
        if (message?.role === 'assistant') send({ type: 'message_start' })
        break
      }
      case 'message_update': {
        const assistantEvent = event.assistantMessageEvent as { type?: string; delta?: string } | undefined
        if (assistantEvent?.type === 'text_delta' && typeof assistantEvent.delta === 'string') {
          send({ type: 'text_delta', delta: assistantEvent.delta })
        }
        break
      }
      case 'message_end': {
        const message = event.message as
          | { role?: string; stopReason?: string; errorMessage?: string; model?: string }
          | undefined
        if (message?.role !== 'assistant') break
        send({ type: 'message_end' })
        if (message.stopReason === 'error') {
          send({ type: 'turn_error', message: message.errorMessage ?? 'The model request failed.' })
        }
        break
      }
      case 'agent_end': {
        // `willRetry` marks a retryable failure — the run is NOT over; suppress
        // agent_end so the renderer keeps showing the working state.
        if (event.willRetry === true) break
        settled = true
        send({ type: 'agent_end' })
        break
      }
      default:
        break
    }
  })
}

async function createSession(): Promise<void> {
  const sdk = await import('@earendil-works/pi-coding-agent')
  const { session: created } = await sdk.createAgentSession({
    cwd,
    sessionManager: sdk.SessionManager.create(cwd)
  })
  session = created as unknown as AgentSessionLike
  wireSessionEvents(created)
  send({
    type: 'session_created',
    sessionId: created.sessionId,
    cwd,
    model: created.model?.id ?? null
  })
}

function handlePrompt(text: string): void {
  if (!session || !settled) {
    send({ type: 'turn_error', message: 'Cannot prompt while no session is ready or a run is in flight.' })
    return
  }
  send({ type: 'user_message', text })
  try {
    session.prompt(text).catch((err: unknown) => send({ type: 'turn_error', message: errorText(err) }))
  } catch (err) {
    send({ type: 'turn_error', message: errorText(err) })
  }
}

async function handleAbort(): Promise<void> {
  if (!session) return
  try {
    await session.abort()
  } catch (err) {
    send({ type: 'turn_error', message: errorText(err) })
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
    case 'shutdown':
      try {
        session?.dispose()
      } finally {
        process.exit(0)
      }
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
