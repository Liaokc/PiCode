/**
 * Bridge feed (CONTEXT.md: 桥接): folds the Seam-1 contract event stream
 * into a list of agent bash commands with their live output — the data
 * behind the Bridge Dock's command feed. PURE: events in, state out. There
 * is no input path into any pty or execution stream, so user interaction
 * can never re-enter the agent's bash (ADR-0004: one-way observation only).
 *
 * Semantics follow the contract: `tool_update` partials APPEND; `tool_end`
 * output REPLACES the partials — so the feed only appends the unseen tail
 * on completion. Only bash tool calls are projected; every other tool
 * passes silently. A new session resets the feed (per-session history).
 */
import type { HostToParent } from '../contract'

export type BridgeFeedStatus = 'running' | 'done' | 'failed' | 'interrupted'

export interface BridgeFeedEntry {
  readonly toolCallId: string
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

/** Settle every running entry (run ended/failed, host died). */
function settleRunning(state: BridgeFeedState): BridgeFeedState {
  if (!state.entries.some((entry) => entry.status === 'running')) return state
  return {
    entries: state.entries.map((entry) =>
      entry.status === 'running' ? { ...entry, status: 'interrupted' as const } : entry
    )
  }
}

export function projectBridgeFeed(state: BridgeFeedState, event: HostToParent): BridgeFeedState {
  switch (event.type) {
    case 'tool_start': {
      if (event.name !== 'bash') return state
      const command = typeof event.args['command'] === 'string' ? event.args['command'] : ''
      const entry: BridgeFeedEntry = {
        toolCallId: event.toolCallId,
        command: sanitizeBridgeCommand(command),
        status: 'running',
        output: ''
      }
      return { entries: [...state.entries, entry] }
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

    case 'session_created':
      // A replaced host = a new per-session feed.
      return state === initialBridgeFeedState ? state : initialBridgeFeedState

    case 'agent_end':
    case 'turn_error':
    case 'session_error':
    case 'host_exit':
      return settleRunning(state)

    default:
      return state
  }
}
