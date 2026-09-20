/**
 * MCP status store (ticket 96): the settings window's MCP section
 * subscribes here for the focused session's adapter status snapshots. The
 * App folds the scoped host event stream into this store (the chat reducer
 * no-ops the event type); the section projects the FOCUSED session's
 * snapshot (its own prop) onto the config rows. Pure pub/sub — no React,
 * no Electron.
 *
 * Last-wins per session: the snapshot is a full projection (the adapter
 * re-publishes on every status change, and an EMPTY snapshot rides the
 * session shutdown), so there is no per-server diffing anywhere.
 */

import type { McpStatusSnapshotData, SessionScopedEvent } from '../../../../shared/contract'

export type McpStatusEvent = Extract<SessionScopedEvent, { type: 'mcp_status' }>

/** Whether one scoped event is an MCP status event (App-side filter). */
export function isMcpStatusEvent(event: SessionScopedEvent): event is McpStatusEvent {
  return event.type === 'mcp_status'
}

type Listener = () => void

class McpStatusStore {
  /** One snapshot per session id (last wins). Bounded by the app run's
   * session count; snapshots are tiny sanitized copies. */
  private snapshots = new Map<string, McpStatusSnapshotData>()
  private listeners = new Set<Listener>()

  /** One session's snapshot (null = no session / the adapter has not
   * reported). The section asks with the FOCUSED session's id. */
  snapshotFor(sessionId: string | null): McpStatusSnapshotData | null {
    if (sessionId === null) return null
    return this.snapshots.get(sessionId) ?? null
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Fold one (already filtered) scoped event tagged with its session. */
  dispatch(event: McpStatusEvent, sessionId: string): void {
    this.snapshots.set(sessionId, event.snapshot)
    for (const listener of this.listeners) listener()
  }

  /** The session's host is gone (host_exit / session_detached): its last
   * snapshot is stale — the adapter is dead and graceful shutdown's EMPTY
   * snapshot never arrived (crash path). Drop it so the section shows the
   * honest no-data state instead of badges for a dead runtime. */
  dropSession(sessionId: string): void {
    if (!this.snapshots.delete(sessionId)) return
    for (const listener of this.listeners) listener()
  }

  /** Testing seam: reset all state. */
  reset(): void {
    this.snapshots.clear()
    for (const listener of this.listeners) listener()
  }
}

export const mcpStatusStore = new McpStatusStore()
