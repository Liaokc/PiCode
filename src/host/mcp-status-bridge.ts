/**
 * The MCP status bridge (ticket 96): the host's third inline extension.
 * Subscribes to the pi-mcp-adapter's versioned status channel on the
 * session's in-process event bus (pi.events) and forwards each VALIDATED
 * snapshot as one bounded contract event. Like the approval gate and the
 * subagent bridge, it rides DefaultResourceLoaderOptions.extensionFactories:
 * the same extension pipeline as user packages, zero Pi modification.
 *
 * Surface (additive, reported into the host-contract smoke):
 *   adapter `pi-mcp-adapter/status/v1`  → mcp_status
 *
 * Receive-only BY DESIGN: there is no command path here — the renderer can
 * never ask for a status read, so viewing the MCP section cannot connect a
 * lazy server, start authentication, or touch anything (the adapter's own
 * read is zero-side-effect: no SDK clients, transports, credentials, or
 * definitions cross this bridge — only the sanitized counts/status copy).
 *
 * The channel name pins v1 (a future v2 channel has a DIFFERENT name, so
 * this subscription goes silent rather than misreading a new shape); each
 * payload is validated by the shared pure parser (shared/mcp-status.ts)
 * before forwarding — malformed payloads are dropped, never guessed into
 * states. Degrades silently when the adapter is not installed: the channel
 * simply never emits, and the renderer shows the honest no-data state.
 */

import type { InlineExtension } from '@earendil-works/pi-coding-agent'
import type { SessionScopedEvent } from '../shared/contract'
import { MCP_STATUS_EVENT_CHANNEL, parseMcpStatusSnapshot } from '../shared/mcp-status'

/** What the extension may send: one session's scoped events (the supervisor
 * tags and relays; `host_exit` is supervisor-only). */
type HostEvent = Exclude<SessionScopedEvent, { type: 'host_exit' }>

export class McpStatusBridge {
  constructor(private readonly send: (event: HostEvent) => void) {}

  /** The inline extension (registered beside the approval gate and the
   * subagent bridge). The subscription lives on the session's own event
   * bus — it dies with the session (shutdown / process exit); no manual
   * unwiring, and the adapter's session-shutdown EMPTY snapshot rides the
   * same channel. */
  readonly extension: InlineExtension = {
    name: 'picode-mcp-status-bridge',
    hidden: true,
    factory: (pi) => {
      pi.events.on(MCP_STATUS_EVENT_CHANNEL, (payload: unknown) => {
        const snapshot = parseMcpStatusSnapshot(payload)
        if (snapshot !== null) this.send({ type: 'mcp_status', snapshot })
      })
    }
  }
}
