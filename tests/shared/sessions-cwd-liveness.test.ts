import { describe, expect, it } from 'vitest'
import { cwdRowState, withCwdMissing, CWD_MISSING_ROW_TOAST } from '../../src/shared/sessions/cwd-liveness'

/**
 * Tickets 42 + 54, Seam-1: the cwd-liveness model is a PURE projection —
 * stat results are injected (`cwdExists`), so the table never touches the
 * filesystem.
 *
 * Ticket 54 supersedes ticket 42's reachability shape: dead-cwd sessions
 * STAY LISTED (the index annotates the physical fact as the additive
 * `cwdMissing` flag) and the UI derives three states from flag × live host:
 *
 *   - normal   — cwd alive (or the flag absent: old payloads validate);
 *   - warning  — cwd dead but a live host in this app (活豁免): the row
 *     stays normal, the session view carries the CWD banner;
 *   - dimmed   — cwd dead, no live host (死亡): gray row + "cwd missing"
 *     meta, click explains only, ⌘K excludes;
 *   - recovery — the directory reappearing clears the flag (复现恢复): the
 *     gray row and the banner restore/clear automatically on the next scan.
 *
 * Session files are never touched by any of this.
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

describe('withCwdMissing — the index-side annotation (ticket 54)', () => {
  it('keeps every session listed and flags only the physically dead ones', () => {
    const sessions = [row('a', '/work/alive'), row('b', '/work/dead')]
    const annotated = withCwdMissing(sessions, aliveOnly)
    expect(annotated.map((s) => s.id)).toEqual(['a', 'b'])
    expect('cwdMissing' in annotated[0]).toBe(false)
    expect(annotated[1]?.cwdMissing).toBe(true)
  })

  it('leaves alive sessions at their EXACT old payload shape (additive contract: absent, not false)', () => {
    const sessions = [row('a', '/work/alive')]
    const annotated = withCwdMissing(sessions, aliveOnly)
    // Same reference: the pre-54 payload passes through byte-identical, so
    // old consumers and old payloads keep validating.
    expect(annotated[0]).toBe(sessions[0])
  })

  it('treats an unusable (empty) cwd as dead — resume could never target it', () => {
    const annotated = withCwdMissing([row('a', '')], aliveOnly)
    expect(annotated[0]?.cwdMissing).toBe(true)
  })

  it('flags every session on a dead cwd — a per-id exemption no longer withholds the flag', () => {
    // The exemption (live host) now lives DOWNSTREAM in cwdRowState: the
    // banner needs the raw physical fact for live sessions too.
    const sessions = [row('live', '/work/dead'), row('other', '/work/dead')]
    const annotated = withCwdMissing(sessions, aliveOnly)
    expect(annotated.map((s) => s.cwdMissing)).toEqual([true, true])
  })

  it('preserves input order and never mutates the input array', () => {
    const sessions = [row('b', '/work/dead'), row('a', '/work/alive')]
    const snapshot = sessions.map((s) => ({ ...s }))
    const annotated = withCwdMissing(sessions, aliveOnly)
    expect(annotated.map((s) => s.id)).toEqual(['b', 'a'])
    expect(sessions).toEqual(snapshot)
  })

  it('recovery: the flag clears when the directory reappears (复现恢复)', () => {
    const sessions = [row('a', '/work/dead')]
    expect(withCwdMissing(sessions, aliveOnly)[0]?.cwdMissing).toBe(true)
    // The directory is back: same sessions, fresh stat → clean payload again.
    EXISTS.set('/work/dead', true)
    try {
      const annotated = withCwdMissing(sessions, aliveOnly)
      expect('cwdMissing' in annotated[0]).toBe(false)
    } finally {
      EXISTS.set('/work/dead', false)
    }
  })
})

describe('cwdRowState — the three-state table (死亡 / 活豁免 / 复现恢复)', () => {
  it('normal: alive cwd regardless of a live host', () => {
    expect(cwdRowState(undefined, false)).toBe('normal')
    expect(cwdRowState(undefined, true)).toBe('normal')
    expect(cwdRowState(false, false)).toBe('normal')
  })

  it('warning (活豁免): dead cwd but a live host in this app — banner, never a gray row', () => {
    expect(cwdRowState(true, true)).toBe('warning')
  })

  it('dimmed (死亡): dead cwd with no live host — gray row, ⌘K excluded', () => {
    expect(cwdRowState(true, false)).toBe('dimmed')
  })

  it('recovery restores normal without a manual step', () => {
    expect(cwdRowState(true, false)).toBe('dimmed')
    expect(cwdRowState(undefined, false)).toBe('normal')
  })
})

describe('CWD_MISSING_ROW_TOAST — the gray-row click copy', () => {
  it('is a non-empty English explanation the electron smoke can pin', () => {
    expect(CWD_MISSING_ROW_TOAST.length).toBeGreaterThan(0)
    expect(CWD_MISSING_ROW_TOAST).toMatch(/^[A-Za-z0-9 .,'—-]+$/)
    expect(CWD_MISSING_ROW_TOAST).toContain('working directory')
  })
})
