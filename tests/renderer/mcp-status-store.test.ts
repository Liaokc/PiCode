/**
 * MCP status store tests (ticket 96): the settings window's focused-session
 * projection store — last-wins per session, honest null for the unknown,
 * listener notification only on change-capable events. Pure pub/sub, no
 * React/Electron (the store module must stay importable in node tests).
 */

import { describe, expect, it, vi } from 'vitest'
import { isMcpStatusEvent, mcpStatusStore, type McpStatusEvent } from '../../src/renderer/src/components/settings/mcp-status-store'
import type { McpStatusSnapshotData, SessionScopedEvent } from '../../src/shared/contract'

const SNAP_A: McpStatusSnapshotData = {
  version: 1,
  servers: [{ name: 'live', status: 'connected', toolCount: 3, directToolCount: 3, disabled: false }],
  totalTools: 3,
  totalResources: 0,
  connectedCount: 1,
  disabledCount: 0
}

const SNAP_EMPTY: McpStatusSnapshotData = {
  version: 1,
  servers: [],
  totalTools: 0,
  totalResources: 0,
  connectedCount: 0,
  disabledCount: 0
}

function event(snapshot: McpStatusSnapshotData): McpStatusEvent {
  return { type: 'mcp_status', snapshot }
}

describe('isMcpStatusEvent', () => {
  it('accepts only the mcp_status member', () => {
    expect(isMcpStatusEvent(event(SNAP_A))).toBe(true)
    expect(isMcpStatusEvent({ type: 'agent_start' } as unknown as SessionScopedEvent)).toBe(false)
  })
})

describe('mcpStatusStore', () => {
  it('answers the focused session with its last-won snapshot', () => {
    mcpStatusStore.reset()
    mcpStatusStore.dispatch(event(SNAP_A), 's1')
    expect(mcpStatusStore.snapshotFor('s1')).toEqual(SNAP_A)
    mcpStatusStore.dispatch(event(SNAP_EMPTY), 's1')
    expect(mcpStatusStore.snapshotFor('s1')).toEqual(SNAP_EMPTY)
  })

  it('an unreported session (and no session) degrade to null', () => {
    mcpStatusStore.reset()
    mcpStatusStore.dispatch(event(SNAP_A), 's1')
    expect(mcpStatusStore.snapshotFor('s2')).toBeNull()
    expect(mcpStatusStore.snapshotFor(null)).toBeNull()
  })

  it('sessions are scoped independently', () => {
    mcpStatusStore.reset()
    mcpStatusStore.dispatch(event(SNAP_A), 's1')
    mcpStatusStore.dispatch(event(SNAP_EMPTY), 's2')
    expect(mcpStatusStore.snapshotFor('s1')).toEqual(SNAP_A)
    expect(mcpStatusStore.snapshotFor('s2')).toEqual(SNAP_EMPTY)
  })

  it('subscribers are notified on dispatch and unsubscribe cleanly', () => {
    mcpStatusStore.reset()
    const listener = vi.fn()
    const unsubscribe = mcpStatusStore.subscribe(listener)
    mcpStatusStore.dispatch(event(SNAP_A), 's1')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    mcpStatusStore.dispatch(event(SNAP_EMPTY), 's1')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reset clears every session and notifies', () => {
    mcpStatusStore.dispatch(event(SNAP_A), 's1')
    const listener = vi.fn()
    mcpStatusStore.subscribe(listener)
    mcpStatusStore.reset()
    expect(mcpStatusStore.snapshotFor('s1')).toBeNull()
    expect(listener).toHaveBeenCalled()
  })
})
