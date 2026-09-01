import { describe, expect, it } from 'vitest'
import { HostSupervisor } from '../../src/main/host-supervisor'
import type { HostToParent } from '../../src/shared/contract'

/**
 * Ticket 21: `get_branch` is a pure DISPLAY read. Addressed at a session
 * with no live host (visual-QA harnesses inject synthetic announcements;
 * crashed sessions keep their registry entry), it must degrade to
 * `branch_info(null)` — never the "no live host" error toast that real
 * commands rightly produce.
 */
describe('HostSupervisor — get_branch without a live host', () => {
  it('answers branch_info(null) instead of session_command_error', () => {
    const events: HostToParent[] = []
    const supervisor = new HostSupervisor({
      hostEntryPath: '/unused — nothing spawns for an unknown session',
      onHostEvent: (event) => events.push(event)
    })
    supervisor.handleParentCommand({ type: 'session_command', sessionId: 'ghost', command: { type: 'get_branch' } })
    expect(events).toEqual([{ type: 'session_event', sessionId: 'ghost', event: { type: 'branch_info', branch: null } }])
  })

  it('still errors for real commands on an unknown session', () => {
    const events: HostToParent[] = []
    const supervisor = new HostSupervisor({
      hostEntryPath: '/unused',
      onHostEvent: (event) => events.push(event)
    })
    supervisor.handleParentCommand({ type: 'session_command', sessionId: 'ghost', command: { type: 'prompt', text: 'hi' } })
    expect(events).toEqual([
      { type: 'session_event', sessionId: 'ghost', event: { type: 'session_command_error', message: 'This session has no live host — reopen it from the sidebar.' } }
    ])
  })
})
