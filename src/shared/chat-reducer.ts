/**
 * Chat reducer for Seam-1: folds the `HostToParent` contract event stream into
 * renderable chat state. A pure function — no I/O, no SDK imports, no time or
 * randomness — so component and logic tests inject event sequences directly
 * (spec: testing seam #1).
 *
 * The transcript is a flat list of entries in arrival order: user messages,
 * assistant entries (which own ordered thinking/text parts), and tool cards.
 * Elapsed-time display (thinking duration, "Working · Ns") is derived in the
 * view from contract-carried durations or local ticking — never here.
 */

import type { HostToParent } from './contract'

export interface ThinkingPart {
  kind: 'thinking'
  text: string
  /** Still receiving thinking deltas. */
  streaming: boolean
  /** Wall-clock duration measured by the host; null when it never closed cleanly. */
  durationMs: number | null
}

export interface TextPart {
  kind: 'text'
  text: string
}

export type AssistantPart = TextPart | ThinkingPart

export interface UserEntry {
  id: string
  role: 'user'
  text: string
}

export interface AssistantEntry {
  id: string
  role: 'assistant'
  /** Ordered thinking/text parts exactly as the model produced them. */
  parts: AssistantPart[]
  /** Still receiving message-level content (deltas may still arrive). */
  streaming: boolean
}

export type ToolState =
  /** Executing; updates may stream in. */
  | 'running'
  /** Finished successfully. */
  | 'done'
  /** Finished with a failure, or never finished (settled mid-run). */
  | 'error'

export interface ToolEntry {
  /** The tool call id from the contract (stable key for updates). */
  id: string
  role: 'tool'
  name: string
  args: Record<string, unknown>
  state: ToolState
  output: string
}

export type ChatEntry = UserEntry | AssistantEntry | ToolEntry

export interface ChatSessionInfo {
  sessionId: string
  cwd: string
  model: string | null
}

export type ChatError =
  | { kind: 'session'; message: string }
  | { kind: 'agent'; message: string }
  | { kind: 'host'; message: string; /** Last known working directory, when a rebuild can reuse it. */ cwd: string | null }

export interface ChatState {
  session: ChatSessionInfo | null
  entries: ChatEntry[]
  /** An agent run is in flight (drives the composer's stop control). */
  agentRunning: boolean
  error: ChatError | null
}

export function initialChatState(): ChatState {
  return { session: null, entries: [], agentRunning: false, error: null }
}

function entryId(index: number): string {
  return `m${index}`
}

function assistantEntry(index: number, parts: AssistantPart[]): AssistantEntry {
  return { id: entryId(index), role: 'assistant', parts, streaming: true }
}

function isAssistant(entry: ChatEntry | undefined): entry is AssistantEntry {
  return entry !== undefined && entry.role === 'assistant'
}

function isStreamingAssistant(entry: ChatEntry | undefined): entry is AssistantEntry {
  return isAssistant(entry) && entry.streaming
}

/** Close a thinking part that is still receiving deltas. */
function closeThinking(part: AssistantPart): AssistantPart {
  return part.kind === 'thinking' && part.streaming ? { ...part, streaming: false } : part
}

/**
 * Append or extend inside the trailing streaming assistant entry, creating
 * that entry defensively when the stream skips boundaries. `extend` returns
 * the entry's new parts for the append/extend decision.
 */
function withStreamingAssistant(state: ChatState, make: () => AssistantPart, extend: (parts: AssistantPart[]) => AssistantPart[]): ChatEntry[] {
  const last = state.entries[state.entries.length - 1]
  if (isStreamingAssistant(last)) {
    return [...state.entries.slice(0, -1), { ...last, parts: extend(last.parts) }]
  }
  return [...state.entries, assistantEntry(state.entries.length, [make()])]
}

/**
 * Mark every in-flight piece of work settled: streaming assistant entries and
 * their open thinking parts close; tool cards still running end in error —
 * the run ended without their result reaching the contract.
 */
function settle(state: ChatState, running: boolean): ChatState {
  const hasOpenWork = state.entries.some(
    (entry) =>
      (entry.role === 'assistant' && (entry.streaming || entry.parts.some((p) => p.kind === 'thinking' && p.streaming))) ||
      (entry.role === 'tool' && entry.state === 'running')
  )
  const next: ChatState = { ...state, agentRunning: running }
  if (hasOpenWork) {
    next.entries = next.entries.map((entry) => {
      if (entry.role === 'assistant') {
        return { ...entry, streaming: false, parts: entry.parts.map(closeThinking) }
      }
      if (entry.role === 'tool' && entry.state === 'running') {
        return {
          ...entry,
          state: 'error' as const,
          output: entry.output === '' ? 'The tool call ended without a result.' : entry.output
        }
      }
      return entry
    })
  }
  return next
}

function hostExitMessage(event: Extract<HostToParent, { type: 'host_exit' }>): string {
  const detail = event.signal ? ` (${event.signal})` : event.code !== null ? ` (exit code ${event.code})` : ''
  return `Agent host exited unexpectedly${detail}.`
}

function updateToolEntry(state: ChatState, toolCallId: string, update: (entry: ToolEntry) => ToolEntry): ChatState {
  const index = state.entries.findIndex((entry) => entry.role === 'tool' && entry.id === toolCallId)
  if (index === -1) return state
  const entry = state.entries[index]
  if (entry.role !== 'tool') return state
  const entries = [...state.entries]
  entries[index] = update(entry)
  return { ...state, entries }
}

export function chatReducer(state: ChatState, event: HostToParent): ChatState {
  switch (event.type) {
    case 'session_created':
      // A new session replaces everything — single active session (α) with a
      // β-shaped contract: a fresh host instance owns a fresh transcript.
      return {
        session: { sessionId: event.sessionId, cwd: event.cwd, model: event.model },
        entries: [],
        agentRunning: false,
        error: null
      }

    case 'session_error':
      return { ...state, session: null, error: { kind: 'session', message: event.message } }

    case 'user_message':
      return {
        ...state,
        entries: [...state.entries, { id: entryId(state.entries.length), role: 'user', text: event.text }]
      }

    case 'history_loaded':
      // Resume / tree navigation replay (ticket 04, ported to the entries
      // model): the host's leaf path IS the transcript, so it replaces
      // whatever was rendered before. Contract item ids are kept so ids stay
      // stable across re-replays (and never collide with live `mN` ids).
      return {
        ...state,
        entries: event.items.map((item) =>
          item.role === 'assistant'
            ? {
                id: item.id,
                role: 'assistant' as const,
                parts: [{ kind: 'text' as const, text: item.text }],
                streaming: false
              }
            : { id: item.id, role: 'user' as const, text: item.text }
        ),
        error: null
      }

    case 'agent_start':
      return state.agentRunning ? state : { ...state, agentRunning: true }

    case 'message_start':
      return { ...state, entries: [...state.entries, assistantEntry(state.entries.length, [])] }

    case 'text_delta':
      return {
        ...state,
        entries: withStreamingAssistant(
          state,
          () => ({ kind: 'text', text: event.delta }),
          (parts) => {
            const last = parts[parts.length - 1]
            // Content switched away from an open thinking block — close it.
            const closed = parts.map(closeThinking)
            if (last !== undefined && last.kind === 'text') {
              return [...closed.slice(0, -1), { kind: 'text', text: last.text + event.delta }]
            }
            return [...closed, { kind: 'text', text: event.delta }]
          }
        )
      }

    case 'thinking_delta':
      return {
        ...state,
        entries: withStreamingAssistant(
          state,
          () => ({ kind: 'thinking', text: event.delta, streaming: true, durationMs: null }),
          (parts) => {
            const last = parts[parts.length - 1]
            if (last !== undefined && last.kind === 'thinking' && last.streaming) {
              return [...parts.slice(0, -1), { ...last, text: last.text + event.delta }]
            }
            return [...parts, { kind: 'thinking', text: event.delta, streaming: true, durationMs: null }]
          }
        )
      }

    case 'thinking_end': {
      const last = state.entries[state.entries.length - 1]
      if (!isAssistant(last)) return state
      const index = last.parts.findLastIndex((p) => p.kind === 'thinking' && p.streaming)
      if (index === -1) return state
      const parts = [...last.parts]
      parts[index] = { ...parts[index], streaming: false, durationMs: event.durationMs } as ThinkingPart
      return { ...state, entries: [...state.entries.slice(0, -1), { ...last, parts }] }
    }

    case 'message_end': {
      const last = state.entries[state.entries.length - 1]
      if (!isStreamingAssistant(last)) return state
      return {
        ...state,
        entries: [...state.entries.slice(0, -1), { ...last, streaming: false, parts: last.parts.map(closeThinking) }]
      }
    }

    case 'tool_start':
      return {
        ...state,
        entries: [
          ...state.entries,
          { id: event.toolCallId, role: 'tool', name: event.name, args: event.args, state: 'running', output: '' }
        ]
      }

    case 'tool_update':
      return updateToolEntry(state, event.toolCallId, (entry) => ({
        ...entry,
        output: entry.output + event.partial
      }))

    case 'tool_end':
      // The final result is the complete output — it replaces any partials.
      return updateToolEntry(state, event.toolCallId, (entry) => ({
        ...entry,
        state: event.isError ? 'error' : 'done',
        output: event.output
      }))

    case 'agent_end':
      return settle(state, false)

    case 'turn_error':
      return { ...settle(state, false), error: { kind: 'agent', message: event.message } }

    // UI-level events (tree payload, rename acks, fork handoff) carry chat-
    // relevant info the App layer consumes; the transcript state is untouched.
    case 'session_tree':
    case 'session_renamed':
    case 'fork_created':
    case 'session_command_error':
      return state

    case 'host_exit': {
      const cwd = state.session?.cwd ?? null
      const detached = settle({ ...state, session: null }, false)
      return event.clean ? detached : { ...detached, error: { kind: 'host', message: hostExitMessage(event), cwd } }
    }
  }
}
