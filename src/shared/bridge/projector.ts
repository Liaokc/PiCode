/**
 * Bridge projector (CONTEXT.md: 桥接): folds the Seam-1 contract event stream
 * into display frames for the terminal tab's projection area. PURE — the
 * projector consumes `HostToParent` events and produces byte frames and a
 * small state record, nothing else. It has no write path into any pty or
 * execution stream, so user keystrokes can never re-enter the agent's bash
 * (ADR-0004: one-way observation only).
 *
 * Semantics follow the contract: `tool_update` partials APPEND; `tool_end`
 * output REPLACES the partials — so the projector tracks how much output it
 * already streamed per call and only prints the unseen tail on completion.
 * Only bash tool calls are projected; every other tool passes silently.
 */
import type { HostToParent } from '../contract'

export interface BridgeProjectorState {
  /** bash toolCallId → characters of its output already streamed to the view. */
  readonly streamed: Readonly<Record<string, number>>
}

export const initialBridgeProjectorState: BridgeProjectorState = { streamed: {} }

export interface BridgeProjection {
  state: BridgeProjectorState
  /** Byte frames to write into the bridge view, in order. */
  frames: string[]
}

const DIM = '\u001b[2m'
const GREEN = '\u001b[32m'
const RED = '\u001b[31m'
const RESET = '\u001b[0m'

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

export function bridgeCommandFrame(command: string): string {
  return `\r\n${DIM}$ ${sanitizeBridgeCommand(command)}${RESET}\r\n`
}

export function bridgeStatusFrame(outcome: 'done' | 'failed' | 'interrupted'): string {
  const mark = outcome === 'done' ? `${GREEN}✓ done${RESET}` : `${RED}✗ ${outcome}${RESET}`
  return `\r\n${DIM}[bridge] ${mark}${RESET}\r\n`
}

function unchanged(state: BridgeProjectorState): BridgeProjection {
  return { state, frames: [] }
}

/** Suffix of `output` not already streamed, CRLF-normalized for the view. */
function unseenTail(output: string, streamedChars: number): string | null {
  const tail = output.slice(Math.min(streamedChars, output.length))
  if (tail.trim() === '') return null
  return tail.endsWith('\n') ? tail : tail + '\r\n'
}

export function projectBridgeEvent(state: BridgeProjectorState, event: HostToParent): BridgeProjection {
  switch (event.type) {
    case 'tool_start': {
      if (event.name !== 'bash') return unchanged(state)
      const command = typeof event.args['command'] === 'string' ? event.args['command'] : ''
      return {
        state: { streamed: { ...state.streamed, [event.toolCallId]: 0 } },
        frames: [bridgeCommandFrame(command)]
      }
    }

    case 'tool_update': {
      const streamedChars = state.streamed[event.toolCallId]
      if (streamedChars === undefined) return unchanged(state)
      return {
        state: { streamed: { ...state.streamed, [event.toolCallId]: streamedChars + event.partial.length } },
        frames: [event.partial]
      }
    }

    case 'tool_end': {
      const streamedChars = state.streamed[event.toolCallId]
      if (streamedChars === undefined) return unchanged(state)
      const rest = { ...state.streamed }
      delete rest[event.toolCallId]
      const frames: string[] = []
      const tail = unseenTail(event.output, streamedChars)
      if (tail !== null && (event.isError || streamedChars < event.output.length)) frames.push(tail)
      frames.push(bridgeStatusFrame(event.isError ? 'failed' : 'done'))
      return { state: { streamed: rest }, frames }
    }

    case 'session_created':
    case 'agent_end':
    case 'turn_error':
    case 'session_error':
    case 'host_exit': {
      // A replaced host, a finished/failed run, or a dead host process
      // strands any still-active calls — settle them so the pane's status
      // chip never sticks on "running".
      const ids = Object.keys(state.streamed)
      if (ids.length === 0) return unchanged(state)
      return {
        state: { streamed: {} },
        frames: ids.map(() => bridgeStatusFrame('interrupted'))
      }
    }

    default:
      return unchanged(state)
  }
}
