/**
 * Bridge feed (CONTEXT.md: 桥接): folds the Seam-1 contract event stream
 * into a list of agent bash commands with their live output — the data
 * behind the Bridge panel's command feed. PURE: events in, state out. There
 * is no input path into any pty or execution stream, so user interaction
 * can never re-enter the agent's bash (ADR-0004: one-way observation only).
 *
 * Registry-stream shape (ticket 20): the supervisor wraps session-scoped
 * events in `session_event`; the feed unwraps them and tags each entry with
 * its session. The unwrapped shapes remain valid (visual-QA harnesses
 * inject them) and are treated as the single focused/only session.
 *
 * The feed is a GLOBAL activity console: `session_created` never resets it
 * (ticket 20 — background sessions keep running; wiping on every
 * announcement would drop their live commands). Lifecycle settling is
 * session-scoped for wrapped events and settles everything for the legacy
 * unwrapped shape. A capacity cap drops the oldest entries.
 */
import type { HostToParent, SessionScopedEvent } from '../contract'

export type BridgeFeedStatus = 'running' | 'done' | 'failed' | 'interrupted'

export interface BridgeFeedEntry {
  readonly toolCallId: string
  /** Session the command belongs to (null for legacy unwrapped events). */
  readonly sessionId: string | null
  /** One sanitized line — the safe-to-render command header. */
  readonly command: string
  readonly status: BridgeFeedStatus
  /** Raw accumulated output (partials + completion tail), newline-separated. */
  readonly output: string
}

export interface BridgeFeedState {
  readonly entries: ReadonlyArray<BridgeFeedEntry>
}

export const initialBridgeFeedState: BridgeFeedState = { entries: [] }

/** Oldest entries are dropped beyond this (one app run's observation log). */
export const MAX_FEED_ENTRIES = 200

const MAX_COMMAND_CHARS = 160

/**
 * Make an agent-supplied command safe to render as a one-line header: strip
 * ANSI escapes (CSI + OSC), collapse control characters and whitespace, cap
 * the length. Real command OUTPUT is never sanitized — only headers are.
 */
export function sanitizeBridgeCommand(command: string): string {
  const withoutAnsi = command
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '') // CSI sequences
    .replace(/\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)?/g, '') // OSC sequences
    .replace(/\u001b/g, '') // stray escapes
  const collapsed = withoutAnsi.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/ {2,}/g, ' ').trim()
  return collapsed.length > MAX_COMMAND_CHARS ? collapsed.slice(0, MAX_COMMAND_CHARS - 1) + '…' : collapsed
}

/** Suffix of `output` not already streamed, newline-terminated. */
function unseenTail(output: string, streamedChars: number): string | null {
  const tail = output.slice(Math.min(streamedChars, output.length))
  if (tail.trim() === '') return null
  return tail.endsWith('\n') ? tail : tail + '\n'
}

function mapEntry(
  state: BridgeFeedState,
  toolCallId: string,
  map: (entry: BridgeFeedEntry) => BridgeFeedEntry | null
): BridgeFeedState {
  const index = state.entries.findIndex((entry) => entry.toolCallId === toolCallId)
  if (index === -1) return state
  const mapped = map(state.entries[index])
  if (mapped === null || mapped === state.entries[index]) return state
  const entries = state.entries.slice()
  entries[index] = mapped
  return { entries }
}

function pushEntry(state: BridgeFeedState, entry: BridgeFeedEntry): BridgeFeedState {
  const entries = [...state.entries, entry]
  return { entries: entries.length > MAX_FEED_ENTRIES ? entries.slice(entries.length - MAX_FEED_ENTRIES) : entries }
}

/** Settle every running entry matching the scope: one session for wrapped
 * events, everything for the legacy unwrapped shape (sessionId null). */
function settleRunning(state: BridgeFeedState, sessionId: string | null): BridgeFeedState {
  const matches = (entry: BridgeFeedEntry): boolean =>
    sessionId === null ? true : entry.sessionId === sessionId || entry.sessionId === null
  if (!state.entries.some((entry) => entry.status === 'running' && matches(entry))) return state
  return {
    entries: state.entries.map((entry) =>
      entry.status === 'running' && matches(entry) ? { ...entry, status: 'interrupted' as const } : entry
    )
  }
}

function foldScoped(state: BridgeFeedState, event: SessionScopedEvent, sessionId: string | null): BridgeFeedState {
  switch (event.type) {
    case 'tool_start': {
      if (event.name !== 'bash') return state
      const command = typeof event.args['command'] === 'string' ? event.args['command'] : ''
      return pushEntry(state, {
        toolCallId: event.toolCallId,
        sessionId,
        command: sanitizeBridgeCommand(command),
        status: 'running',
        output: ''
      })
    }

    case 'tool_update': {
      return mapEntry(state, event.toolCallId, (entry) =>
        entry.status === 'running' ? { ...entry, output: entry.output + event.partial } : null
      )
    }

    case 'tool_end': {
      return mapEntry(state, event.toolCallId, (entry) => {
        if (entry.status !== 'running') return null
        const tail = unseenTail(event.output, entry.output.length)
        const output = tail !== null && (event.isError || entry.output.length < event.output.length)
          ? entry.output + tail
          : entry.output
        return { ...entry, status: event.isError ? ('failed' as const) : ('done' as const), output }
      })
    }

    case 'agent_end':
    case 'turn_error':
    case 'session_error':
    case 'host_exit':
      return settleRunning(state, sessionId)

    default:
      // session_created / session_detached / session_tree / chat noise:
      // the feed is a global activity log — nothing to fold.
      return state
  }
}

export function projectBridgeFeed(state: BridgeFeedState, event: HostToParent): BridgeFeedState {
  if (event.type === 'session_event') return foldScoped(state, event.event, event.sessionId)
  return foldScoped(state, event, null)
}
