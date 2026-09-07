import { describe, expect, it } from 'vitest'
import { filterDeadCwd } from '../../src/shared/sessions/cwd-liveness'

/**
 * Ticket 42, Seam-1: the cwd-liveness filter is a PURE predicate — stat
 * results are injected (`cwdExists`), so the table never touches the
 * filesystem. Semantics under test:
 *
 *  - a session whose cwd is physically gone is dropped (it can never be
 *    opened — resume would crash the host), so it must not reach the
 *    sidebar's two views NOR ⌘K;
 *  - an in-app LIVE host session is exempt: a running session whose cwd
 *    was deleted mid-run must not vanish from the registry/sidebar;
 *  - this is NOT the archive invariant's territory — archiving guards a
 *    local preference and never makes a session unreachable, while this
 *    filter records a physical fact of the machine.
 */

interface Row {
  id: string
  cwd: string
}

const row = (id: string, cwd: string): Row => ({ id, cwd })

const EXISTS = new Map<string, boolean>([
  ['/work/alive', true],
  ['/work/dead', false]
])
const aliveOnly = (cwd: string): boolean => EXISTS.get(cwd) === true

describe('filterDeadCwd', () => {
  it('keeps sessions whose cwd exists and drops the physically dead ones', () => {
    const sessions = [row('a', '/work/alive'), row('b', '/work/dead')]
    expect(filterDeadCwd(sessions, aliveOnly)).toEqual([row('a', '/work/alive')])
  })

  it('exempts in-app live host sessions even when their cwd is gone', () => {
    const sessions = [row('a', '/work/alive'), row('b', '/work/dead'), row('c', '/work/dead')]
    const kept = filterDeadCwd(sessions, aliveOnly, new Set(['b']))
    expect(kept.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('an exemption for an alive-cwd session changes nothing', () => {
    const sessions = [row('a', '/work/alive')]
    expect(filterDeadCwd(sessions, aliveOnly, new Set(['a']))).toEqual([row('a', '/work/alive')])
  })

  it('exemption is by session id — another session on the same dead cwd still drops', () => {
    const sessions = [row('live', '/work/dead'), row('other', '/work/dead')]
    const kept = filterDeadCwd(sessions, aliveOnly, new Set(['live']))
    expect(kept.map((s) => s.id)).toEqual(['live'])
  })

  it('treats an unusable (empty) cwd as dead — resume could never target it', () => {
    const sessions = [row('a', '')]
    expect(filterDeadCwd(sessions, aliveOnly)).toEqual([])
  })

  it('defaults to no exemptions and preserves input order and references', () => {
    const sessions = [row('b', '/work/dead'), row('a', '/work/alive'), row('c', '/work/alive')]
    const kept = filterDeadCwd(sessions, aliveOnly)
    expect(kept).toEqual([row('a', '/work/alive'), row('c', '/work/alive')])
    expect(kept[0]).toBe(sessions[1])
    expect(kept[1]).toBe(sessions[2])
  })

  it('never mutates the input array', () => {
    const sessions = [row('a', '/work/dead'), row('b', '/work/alive')]
    filterDeadCwd(sessions, aliveOnly)
    expect(sessions).toEqual([row('a', '/work/dead'), row('b', '/work/alive')])
  })

  it('keeps everything when every stat result says alive (the fixture contract)', () => {
    // The visual-QA harnesses seed sessions whose cwd must be a REAL
    // directory — this row is the table-side pin of that contract.
    const sessions = [row('x', '/work/alive'), row('y', '/work/alive')]
    expect(filterDeadCwd(sessions, aliveOnly)).toEqual(sessions)
  })
})
