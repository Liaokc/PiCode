/**
 * Chat reducer for Seam-1: folds the `HostToParent` contract event stream into
 * renderable chat state. A pure function — no I/O, no SDK imports, no time or
 * randomness — so component and logic tests inject event sequences directly
 * (spec: testing seam #1).
 */

import type { HostToParent } from './contract'

export interface ChatMessage {
  /** Stable within the current transcript (index-based; transcripts reset on session change). */
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Assistant messages still receiving text deltas. */
  streaming: boolean
}

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
  messages: ChatMessage[]
  /** An agent run is in flight (drives the composer's stop control). */
  agentRunning: boolean
  error: ChatError | null
}

export function initialChatState(): ChatState {
  return { session: null, messages: [], agentRunning: false, error: null }
}

function messageId(index: number): string {
  return `m${index}`
}

function openStreamingMessage(state: ChatState, text: string): ChatState {
  return {
    ...state,
    messages: [...state.messages, { id: messageId(state.messages.length), role: 'assistant', text, streaming: true }]
  }
}

/** Mark every streaming message done and set the running flag to `running`. */
function settle(state: ChatState, running: boolean): ChatState {
  const hasStreaming = state.messages.some((m) => m.streaming)
  const next: ChatState = { ...state, agentRunning: running }
  if (hasStreaming) {
    next.messages = next.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m))
  }
  return next
}

function hostExitMessage(event: Extract<HostToParent, { type: 'host_exit' }>): string {
  const detail = event.signal ? ` (${event.signal})` : event.code !== null ? ` (exit code ${event.code})` : ''
  return `Agent host exited unexpectedly${detail}.`
}

export function chatReducer(state: ChatState, event: HostToParent): ChatState {
  switch (event.type) {
    case 'session_created':
      // A new session replaces everything — single active session (α) with a
      // β-shaped contract: a fresh host instance owns a fresh transcript.
      return {
        session: { sessionId: event.sessionId, cwd: event.cwd, model: event.model },
        messages: [],
        agentRunning: false,
        error: null
      }

    case 'session_error':
      return { ...state, session: null, error: { kind: 'session', message: event.message } }

    case 'user_message':
      return {
        ...state,
        messages: [...state.messages, { id: messageId(state.messages.length), role: 'user', text: event.text, streaming: false }]
      }

    case 'history_loaded':
      // Resume / tree navigation replay: the host's leaf path IS the
      // transcript, so it replaces whatever was rendered before.
      return {
        ...state,
        messages: event.items.map((item) => ({ id: item.id, role: item.role, text: item.text, streaming: false })),
        error: null
      }

    case 'agent_start':
      return state.agentRunning ? state : { ...state, agentRunning: true }

    case 'message_start':
      return openStreamingMessage(state, '')

    case 'text_delta': {
      const last = state.messages[state.messages.length - 1]
      if (last && last.role === 'assistant' && last.streaming) {
        return { ...state, messages: [...state.messages.slice(0, -1), { ...last, text: last.text + event.delta }] }
      }
      // Defensive: deltas without a boundary still render somewhere.
      return openStreamingMessage(state, event.delta)
    }

    case 'message_end': {
      const last = state.messages[state.messages.length - 1]
      if (!last || last.role !== 'assistant' || !last.streaming) return state
      return { ...state, messages: [...state.messages.slice(0, -1), { ...last, streaming: false }] }
    }

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
