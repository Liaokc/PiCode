/**
 * MCP OAuth flow store (ticket 89): the settings window's MCP section
 * subscribes here for the session host's bridge events. The App folds the
 * scoped host event stream into this store (the chat reducer no-ops these
 * event types); the section renders the manual-paste dialog and the flow
 * status from it. Pure pub/sub — no React, no Electron.
 */

import type {
  SessionScopedEvent
} from '../../../../shared/contract'

export type McpAuthEvent = Extract<
  SessionScopedEvent,
  { type: 'mcp_auth_input_required' | 'mcp_auth_notice' | 'mcp_auth_completed' }
>

export interface McpAuthState {
  /** The session the in-flight flow belongs to (null = idle). */
  sessionId: string | null
  serverName: string | null
  running: boolean
  /** The outstanding manual-paste request (null = none). */
  inputRequired: { requestId: string; title: string } | null
  /** The relayed notice tail of the in-flight (or just-finished) flow. */
  notices: Array<{ level: 'info' | 'warning' | 'error'; message: string }>
  /** Terminal state of the last flow (null while running). */
  completed: { ok: boolean; notices: Array<{ level: 'info' | 'warning' | 'error'; message: string }> } | null
}

export function initialMcpAuthState(): McpAuthState {
  return { sessionId: null, serverName: null, running: false, inputRequired: null, notices: [], completed: null }
}

type Listener = (state: McpAuthState) => void

/** Whether one scoped event is an MCP auth bridge event (App-side filter). */
export function isMcpAuthEvent(event: SessionScopedEvent): event is McpAuthEvent {
  return (
    event.type === 'mcp_auth_input_required' ||
    event.type === 'mcp_auth_notice' ||
    event.type === 'mcp_auth_completed'
  )
}

class McpAuthStore {
  private state: McpAuthState = initialMcpAuthState()
  private listeners = new Set<Listener>()

  getState(): McpAuthState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Fold one (already filtered) scoped event tagged with its session. */
  dispatch(event: McpAuthEvent, sessionId: string): void {
    switch (event.type) {
      case 'mcp_auth_input_required':
        // An input request can only belong to the in-flight flow.
        if (!this.state.running || this.state.sessionId !== sessionId) return
        this.set({ inputRequired: { requestId: event.requestId, title: event.title } })
        return
      case 'mcp_auth_notice':
        if (!this.state.running || this.state.sessionId !== sessionId) return
        this.set({ notices: [...this.state.notices, { level: event.level, message: event.message }] })
        return
      case 'mcp_auth_completed':
        if (this.state.running && this.state.sessionId !== sessionId) return
        this.set({
          running: false,
          inputRequired: null,
          notices: event.notices,
          completed: { ok: event.ok, notices: event.notices }
        })
        return
    }
  }

  /** The renderer asked the host to start a flow for one server. */
  flowStarted(sessionId: string, serverName: string): void {
    this.set({
      sessionId,
      serverName,
      running: true,
      inputRequired: null,
      notices: [],
      completed: null
    })
  }

  /** The renderer answered the manual-paste dialog (null = cancel). */
  submitInput(requestId: string, value: string | null): void {
    if (this.state.inputRequired === null || this.state.inputRequired.requestId !== requestId) return
    this.set({ inputRequired: null })
    if (this.state.sessionId !== null) {
      window.picode.chat.sendToHost({
        type: 'session_command',
        sessionId: this.state.sessionId,
        command: { type: 'mcp_auth_input_resolve', requestId, value }
      })
    }
  }

  /** Leaving the section clears the finished state (a running flow keeps). */
  resetFinished(): void {
    if (this.state.running) return
    this.set(initialMcpAuthState())
  }

  private set(patch: Partial<McpAuthState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener(this.state)
  }
}

export const mcpAuthStore = new McpAuthStore()
