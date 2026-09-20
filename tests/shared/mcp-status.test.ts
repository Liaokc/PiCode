/**
 * MCP-status projection tests (ticket 96, Seam-1): table-driven coverage of
 * the focused-session status snapshot projection — the structural parse of
 * the adapter's versioned status event (v1 channel), the seven-state
 * mapping (the adapter's six runtime states + the no-session/no-data
 * degradation), and the zero-trigger discipline (the projection is a pure
 * read: no invented states, no mutation, no command surface).
 */

import { describe, expect, it } from 'vitest'
import {
  MCP_STATUS_EVENT_CHANNEL,
  mcpStatusLine,
  mcpStatusToolCountLabel,
  parseMcpStatusSnapshot,
  shouldShowRuntimeBadge,
  shouldShowToolCount,
  statusForServer,
  type McpServerStatusData,
  type McpStatusSnapshotData
} from '../../src/shared/mcp-status'

const SNAPSHOT: McpStatusSnapshotData = {
  version: 1,
  servers: [
    { name: 'live', status: 'connected', toolCount: 12, directToolCount: 10, disabled: false },
    { name: 'memo', status: 'cached', toolCount: 8, directToolCount: 8, disabled: false },
    { name: 'flaky', status: 'failed', toolCount: 0, directToolCount: 0, disabled: false, failedAgoSeconds: 42 },
    { name: 'gate', status: 'needs-auth', toolCount: 0, directToolCount: 0, disabled: false },
    { name: 'idle', status: 'not-connected', toolCount: 0, directToolCount: 0, disabled: false },
    { name: 'off', status: 'disabled', toolCount: 0, directToolCount: 0, disabled: true }
  ],
  totalTools: 20,
  totalResources: 3,
  connectedCount: 1,
  disabledCount: 1
}

describe('parseMcpStatusSnapshot', () => {
  it('accepts a valid v1 snapshot and freezes the projection input', () => {
    const parsed = parseMcpStatusSnapshot({
      version: 1,
      servers: [{ name: 'live', status: 'connected', toolCount: 2, directToolCount: 2, disabled: false, listenState: 'active' }],
      totalTools: 2,
      totalResources: 0,
      connectedCount: 1,
      disabledCount: 0
    })
    expect(parsed).toEqual({
      version: 1,
      servers: [{ name: 'live', status: 'connected', toolCount: 2, directToolCount: 2, disabled: false }],
      totalTools: 2,
      totalResources: 0,
      connectedCount: 1,
      disabledCount: 0
    })
    // The zero-trigger discipline: the parsed snapshot is frozen, so no
    // consumer can write state into it (the projection is a read).
    expect(Object.isFrozen(parsed)).toBe(true)
    expect(Object.isFrozen(parsed!.servers)).toBe(true)
    expect(Object.isFrozen(parsed!.servers[0])).toBe(true)
  })

  it('keeps the optional per-server fields when the adapter reports them', () => {
    const parsed = parseMcpStatusSnapshot({
      version: 1,
      servers: [
        { name: 'flaky', status: 'failed', toolCount: 0, directToolCount: 0, disabled: false, failedAgoSeconds: 7, resourceCount: 2, catalogStale: true }
      ],
      totalTools: 0,
      totalResources: 2,
      connectedCount: 0,
      disabledCount: 0
    })
    // listenState/catalogStale stay adapter-internal; the bounded fields ride.
    expect(parsed!.servers[0]).toEqual({
      name: 'flaky',
      status: 'failed',
      toolCount: 0,
      directToolCount: 0,
      disabled: false,
      failedAgoSeconds: 7,
      resourceCount: 2
    })
  })

  it('rejects invalid envelopes (null / wrong version / bad servers / bad totals)', () => {
    expect(parseMcpStatusSnapshot(null)).toBeNull()
    expect(parseMcpStatusSnapshot('nope')).toBeNull()
    expect(parseMcpStatusSnapshot({ ...SNAPSHOT, version: 2 })).toBeNull()
    expect(parseMcpStatusSnapshot({ ...SNAPSHOT, servers: 'x' })).toBeNull()
    expect(parseMcpStatusSnapshot({ ...SNAPSHOT, totalTools: -1 })).toBeNull()
    expect(parseMcpStatusSnapshot({ ...SNAPSHOT, connectedCount: 'many' })).toBeNull()
    expect(parseMcpStatusSnapshot({ ...SNAPSHOT, version: '1' })).toBeNull()
  })

  it('drops invalid server entries but keeps the honest rest', () => {
    const parsed = parseMcpStatusSnapshot({
      version: 1,
      servers: [
        { name: 'live', status: 'connected', toolCount: 1, directToolCount: 1, disabled: false },
        { status: 'connected', toolCount: 1, directToolCount: 1, disabled: false }, // no name
        { name: 'ghost', status: 'zombie', toolCount: 1, directToolCount: 1, disabled: false }, // unknown status
        { name: 'neg', status: 'connected', toolCount: -5, directToolCount: 0, disabled: false } // negative count
      ],
      totalTools: 1,
      totalResources: 0,
      connectedCount: 1,
      disabledCount: 0
    })
    expect(parsed!.servers.map((s) => s.name)).toEqual(['live'])
  })
})

describe('statusForServer — the seven-state mapping', () => {
  it('maps the adapter\'s six runtime states one to one', () => {
    const cases: Array<[string, McpServerStatusData['status']]> = [
      ['live', 'connected'],
      ['memo', 'cached'],
      ['flaky', 'failed'],
      ['gate', 'needs-auth'],
      ['idle', 'not-connected'],
      ['off', 'disabled']
    ]
    for (const [name, status] of cases) {
      expect(statusForServer(name, SNAPSHOT)).toBe(status)
    }
  })

  it('degrades honestly: no snapshot → null (never an invented state)', () => {
    expect(statusForServer('live', null)).toBeNull()
  })

  it('a server the session never reported stays without data', () => {
    expect(statusForServer('configured-later', SNAPSHOT)).toBeNull()
  })
})

describe('shouldShowRuntimeBadge', () => {
  it('hides the runtime badge for disabled rows (the config Disabled badge covers it)', () => {
    expect(shouldShowRuntimeBadge('disabled')).toBe(false)
  })

  it('shows the runtime badge for every live state', () => {
    for (const status of ['connected', 'cached', 'failed', 'needs-auth', 'not-connected'] as const) {
      expect(shouldShowRuntimeBadge(status)).toBe(true)
    }
  })
})

describe('shouldShowToolCount', () => {
  it('the count chip rides only where a live catalog exists', () => {
    expect(shouldShowToolCount('connected')).toBe(true)
    expect(shouldShowToolCount('cached')).toBe(true)
    for (const status of ['failed', 'needs-auth', 'not-connected', 'disabled'] as const) {
      expect(shouldShowToolCount(status)).toBe(false)
    }
  })
})

describe('mcpStatusToolCountLabel', () => {
  it('counts tools honestly, singular included', () => {
    expect(mcpStatusToolCountLabel(0)).toBe('0 tools')
    expect(mcpStatusToolCountLabel(1)).toBe('1 tool')
    expect(mcpStatusToolCountLabel(12)).toBe('12 tools')
  })
})

describe('mcpStatusLine — the honest empty states', () => {
  it('no focused session: the no-session note', () => {
    const line = mcpStatusLine({ focusedSessionId: null, snapshot: null, configRowCount: 4 })
    expect(line).toContain('focused session')
  })

  it('session without a reported snapshot: the no-data note', () => {
    const line = mcpStatusLine({ focusedSessionId: 's1', snapshot: null, configRowCount: 4 })
    expect(line).toContain('has not reported')
  })

  it('an empty snapshot over config rows: the stale-session note', () => {
    const line = mcpStatusLine({
      focusedSessionId: 's1',
      snapshot: { ...SNAPSHOT, servers: [], connectedCount: 0, disabledCount: 0, totalTools: 0, totalResources: 0 },
      configRowCount: 4
    })
    expect(line).toContain('reopen the session')
  })

  it('live data on display hides the note — even with zero config rows', () => {
    expect(mcpStatusLine({ focusedSessionId: 's1', snapshot: SNAPSHOT, configRowCount: 6 })).toBeNull()
    expect(
      mcpStatusLine({ focusedSessionId: 's1', snapshot: { ...SNAPSHOT, servers: [] }, configRowCount: 0 })
    ).toBeNull()
  })
})

describe('MCP_STATUS_EVENT_CHANNEL', () => {
  it('pins the adapter\'s versioned v1 channel (a v2 channel name never matches)', () => {
    expect(MCP_STATUS_EVENT_CHANNEL).toBe('pi-mcp-adapter/status/v1')
  })
})
