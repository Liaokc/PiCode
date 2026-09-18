/**
 * MCP OAuth bridge (ticket 89): the session host's side of the settings
 * window's Authenticate flow. The adapter (pi-mcp-adapter) registers the
 * `mcp-auth` extension command; when the session's extensions get a UI
 * context, that command runs the adapter's OWN authorization flow —
 * system browser open, localhost callback server, token exchange, keychain
 * storage — entirely inside the adapter. PiCode's part is the pipe:
 *
 *  - `bindExtensions({ uiContext })` gives the session's extensions a UI
 *    context (the SDK modes do exactly this; without it the adapter
 *    refuses with "requires an interactive session"). The bridge context
 *    mirrors the SDK's own no-op context except `notify` and `input`,
 *    which forward to the settings window DURING an in-flight flow only
 *    — notifications outside a flow change nothing, so ordinary session
 *    behavior stays identical.
 *  - `mcp_auth_start` runs `/mcp-auth <server>` through
 *    `session.prompt`, which dispatches extension commands in place
 *    without persisting a user entry (TUI parity).
 *  - `mcp_auth_input_required` / `mcp_auth_input_resolve` are the manual
 *    paste-callback-URL fallback (gateway scenario).
 *  - `mcp_auth_completed` terminates the flow; `ok` mirrors the adapter's
 *    own notices (an error-level notice during the flow = failure).
 *
 * Credentials never pass through here — the bridge relays prompts and
 * notices, never tokens.
 */

import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent'
import type { SessionScopedEvent } from '../shared/contract'

/** What the bridge may send: one session's scoped events (supervisor-relayed). */
type HostEvent = Exclude<SessionScopedEvent, { type: 'host_exit' }>

interface Notice {
  level: 'info' | 'warning' | 'error'
  message: string
}

interface PendingInput {
  resolve: (value: string | undefined) => void
}

const FLOW_ACTIVE_MAX_INPUTS = 4

export class McpAuthBridge {
  private flowServerName: string | null = null
  private flowNotices: Notice[] = []
  private inputs = new Map<string, PendingInput>()
  private nextRequestId = 0

  constructor(private readonly send: (event: HostEvent) => void) {}

  /** Whether an OAuth flow is currently in flight (one at a time). */
  get busy(): boolean {
    return this.flowServerName !== null
  }

  /**
   * Run the adapter's `/mcp-auth <server>` command through the session.
   * `runPrompt` is `session.prompt`; it resolves when the command handler
   * finished. `hasCommand` guards against the adapter NOT being loaded —
   * without it the text would fall through to a real model prompt.
   */
  async start(
    serverName: string,
    runPrompt: (text: string) => Promise<void>,
    hasCommand: (name: string) => boolean,
    abortSignal: AbortSignal | undefined
  ): Promise<void> {
    const name = serverName.trim()
    if (name === '') {
      this.send({ type: 'mcp_auth_completed', serverName: name, ok: false, notices: [{ level: 'error', message: 'No server name was given.' }] })
      return
    }
    if (this.flowServerName !== null) {
      this.send({ type: 'mcp_auth_completed', serverName: name, ok: false, notices: [{ level: 'error', message: `An OAuth flow for "${this.flowServerName}" is already running.` }] })
      return
    }
    if (!hasCommand('mcp-auth')) {
      this.send({
        type: 'mcp_auth_completed',
        serverName: name,
        ok: false,
        notices: [
          {
            level: 'error',
            message: 'The MCP adapter is not loaded in this session — install the pi-mcp-adapter package, then reopen the session.'
          }
        ]
      })
      return
    }
    this.flowServerName = name
    this.flowNotices = []
    try {
      await runPrompt(`/mcp-auth ${name}`)
    } catch (err) {
      this.flowNotices.push({
        level: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
    }
    const notices = this.flowNotices.slice(-8)
    const ok = !notices.some((notice) => notice.level === 'error')
    this.flowServerName = null
    this.flowNotices = []
    // Abort the flow's pending dialogs when the session died mid-flow.
    if (abortSignal?.aborted) {
      for (const [, input] of this.inputs) input.resolve(undefined)
      this.inputs.clear()
    }
    this.send({ type: 'mcp_auth_completed', serverName: name, ok, notices })
  }

  /** The renderer's manual-paste answer (null = cancelled). */
  resolveInput(requestId: string, value: string | null): void {
    const input = this.inputs.get(requestId)
    if (input === undefined) return
    this.inputs.delete(requestId)
    input.resolve(value === null ? undefined : value)
  }

  /** All pending dialogs resolve cancelled when the session goes down. */
  cancelAll(): void {
    for (const [, input] of this.inputs) input.resolve(undefined)
    this.inputs.clear()
    this.flowServerName = null
  }

  /**
   * The UI context handed to `session.bindExtensions`. Mirrors the SDK's
   * own no-op context (runner.ts) except `notify` + `input`, which relay
   * to the settings window during an in-flight flow; every other member
   * stays a no-op so ordinary extension behavior is untouched. The
   * `theme` getter is deliberately absent — no host flow reaches it, and
   * the bridge never renders terminal components.
   */
  uiContext(): ExtensionUIContext {
    const input = async (title: string, _placeholder?: string, opts?: { signal?: AbortSignal }): Promise<string | undefined> => {
      if (this.flowServerName === null) return undefined
      if (opts?.signal?.aborted) return undefined
      if (this.inputs.size >= FLOW_ACTIVE_MAX_INPUTS) return undefined
      const requestId = `mcp-auth-${++this.nextRequestId}`
      const serverName = this.flowServerName
      const promise = new Promise<string | undefined>((resolve) => {
        const onAbort = (): void => resolve(undefined)
        this.inputs.set(requestId, { resolve: (value) => {
          opts?.signal?.removeEventListener('abort', onAbort)
          resolve(value)
        } })
        opts?.signal?.addEventListener('abort', onAbort, { once: true })
      })
      this.send({ type: 'mcp_auth_input_required', requestId, serverName, title })
      return await promise
    }
    const notify = (message: string, type?: 'info' | 'warning' | 'error'): void => {
      if (this.flowServerName === null) return
      const level = type ?? 'info'
      this.flowNotices.push({ level, message })
      this.send({ type: 'mcp_auth_notice', serverName: this.flowServerName, level, message })
    }
    const context = {
      select: async () => undefined,
      confirm: async () => false,
      input,
      notify,
      onTerminalInput: () => () => {},
      setStatus: () => {},
      setWorkingMessage: () => {},
      setWorkingVisible: () => {},
      setWorkingIndicator: () => {},
      setHiddenThinkingLabel: () => {},
      setWidget: () => {},
      setFooter: () => {},
      setHeader: () => {},
      setTitle: () => {},
      custom: async () => undefined,
      pasteToEditor: () => {},
      setEditorText: () => {},
      getEditorText: () => '',
      editor: async () => undefined,
      addAutocompleteProvider: () => {},
      setEditorComponent: () => {},
      getEditorComponent: () => undefined,
      getAllThemes: () => [],
      getTheme: () => undefined,
      setTheme: () => ({ success: false, error: 'UI not available' }),
      getToolsExpanded: () => false,
      setToolsExpanded: () => {}
    }
    return context as unknown as ExtensionUIContext
  }
}
