import { describe, expect, it } from 'vitest'
import {
  baselineReadStates,
  isSessionUnread,
  markSessionRead,
  setManualUnread,
  unreadSessionIds,
  type ReadStates
} from '../../src/shared/sessions/unread'

const READ: ReadStates = { 's-a': { watermarkMs: 1000, manualUnread: false } }

describe('isSessionUnread — unread projection (ticket 28)', () => {
  it.each([
    // state | modifiedAt | onView | archived | expected
    [undefined, 1000, false, false, false], // never seen = read until baselined
    [{ watermarkMs: 1000, manualUnread: false }, 1000, false, false, false], // watermark == mtime
    [{ watermarkMs: 1000, manualUnread: false }, 1001, false, false, true], // growth past the watermark
    [{ watermarkMs: 1000, manualUnread: false }, 999, false, false, false], // backdated mtime reads as read
    [{ watermarkMs: 1000, manualUnread: true }, 1000, false, false, true], // manual override forces unread
    [{ watermarkMs: 1000, manualUnread: true }, 5000, false, false, true], // manual survives growth
    [{ watermarkMs: 1000, manualUnread: true }, 1000, true, false, false], // the view on screen is being read
    [{ watermarkMs: 1000, manualUnread: false }, 5000, true, false, false], // on view beats growth
    [{ watermarkMs: 1000, manualUnread: false }, 5000, false, true, false], // archived rows never show unread
    [{ watermarkMs: 1000, manualUnread: true }, 5000, false, true, false], // archive beats even the manual bit
    [{ watermarkMs: 1000, manualUnread: false }, 5000, true, true, false]
  ])(
    'state=%p modifiedAt=%p onView=%p archived=%p → %p',
    (state, modifiedAt, onView, archived, expected) => {
      expect(
        isSessionUnread(
          state as ReadStates[string] | undefined,
          modifiedAt as number,
          onView as boolean,
          archived as boolean
        )
      ).toBe(expected)
    }
  )
})

describe('baselineReadStates — first sighting counts as read', () => {
  it('baselines unseen sessions at their current mtime', () => {
    const { next, changed } = baselineReadStates({}, [
      { id: 's-a', modifiedAt: 1000 },
      { id: 's-b', modifiedAt: 2000 }
    ])
    expect(changed).toBe(true)
    expect(next).toEqual({
      's-a': { watermarkMs: 1000, manualUnread: false },
      's-b': { watermarkMs: 2000, manualUnread: false }
    })
  })

  it('keeps existing entries untouched and only adds the missing ones', () => {
    const { next, changed } = baselineReadStates(READ, [
      { id: 's-a', modifiedAt: 9999 },
      { id: 's-b', modifiedAt: 2000 }
    ])
    expect(changed).toBe(true)
    expect(next).toEqual({
      's-a': { watermarkMs: 1000, manualUnread: false }, // not re-baselined
      's-b': { watermarkMs: 2000, manualUnread: false }
    })
  })

  it('is a no-op when every session has an entry (no preference write)', () => {
    const { next, changed } = baselineReadStates(READ, [{ id: 's-a', modifiedAt: 9999 }])
    expect(changed).toBe(false)
    expect(next).toBe(READ)
  })

  it('keeps a manual unread override through re-sightings', () => {
    const manual: ReadStates = { 's-a': { watermarkMs: 1000, manualUnread: true } }
    const { next, changed } = baselineReadStates(manual, [{ id: 's-a', modifiedAt: 9999 }])
    expect(changed).toBe(false)
    expect(next).toBe(manual)
  })
})

describe('markSessionRead — the view on screen chases the file mtime', () => {
  it('creates the entry for a first read', () => {
    const { next, changed } = markSessionRead({}, 's-a', 5000)
    expect(changed).toBe(true)
    expect(next).toEqual({ 's-a': { watermarkMs: 5000, manualUnread: false } })
  })

  it('advances a stale watermark (the file grew while being watched)', () => {
    const { next, changed } = markSessionRead(READ, 's-a', 5000)
    expect(changed).toBe(true)
    expect(next['s-a']?.watermarkMs).toBe(5000)
  })

  it('clears the manual override — reading is the only way to make it read', () => {
    const manual: ReadStates = { 's-a': { watermarkMs: 1000, manualUnread: true } }
    const { next, changed } = markSessionRead(manual, 's-a', 1000)
    expect(changed).toBe(true)
    expect(next).toEqual({ 's-a': { watermarkMs: 1000, manualUnread: false } })
  })

  it('is a no-op when the watermark is current and no override is set', () => {
    const { next, changed } = markSessionRead(READ, 's-a', 1000)
    expect(changed).toBe(false)
    expect(next).toBe(READ)
  })

  it('leaves other sessions untouched', () => {
    const two: ReadStates = {
      's-a': { watermarkMs: 1000, manualUnread: false },
      's-b': { watermarkMs: 2000, manualUnread: false }
    }
    const { next } = markSessionRead(two, 's-a', 5000)
    expect(next['s-b']).toEqual({ watermarkMs: 2000, manualUnread: false })
  })
})

describe('setManualUnread — the override bit (menu entry ships in ticket 35)', () => {
  it('marks a session unread from nothing', () => {
    const { next, changed } = setManualUnread({}, 's-a', true, 5000)
    expect(changed).toBe(true)
    expect(next).toEqual({ 's-a': { watermarkMs: 5000, manualUnread: true } })
  })

  it('marks a read session unread without moving the watermark', () => {
    const { next, changed } = setManualUnread(READ, 's-a', true, 5000)
    expect(changed).toBe(true)
    expect(next).toEqual({ 's-a': { watermarkMs: 1000, manualUnread: true } })
  })

  it('mark-as-read clears the override and advances the watermark', () => {
    const manual: ReadStates = { 's-a': { watermarkMs: 1000, manualUnread: true } }
    const { next, changed } = setManualUnread(manual, 's-a', false, 5000)
    expect(changed).toBe(true)
    expect(next).toEqual({ 's-a': { watermarkMs: 5000, manualUnread: false } })
  })

  it('is a no-op when the bit already matches', () => {
    expect(setManualUnread(READ, 's-a', false, 1000).changed).toBe(false)
    const manual: ReadStates = { 's-a': { watermarkMs: 1000, manualUnread: true } }
    expect(setManualUnread(manual, 's-a', true, 1000).changed).toBe(false)
  })
})

describe('unreadSessionIds — sidebar projection (ticket 28)', () => {
  const sessions = [
    { id: 's-grow', file: '/f-grow', modifiedAt: 5000 }, // grew past its watermark
    { id: 's-read', file: '/f-read', modifiedAt: 1000 }, // watermark current
    { id: 's-manual', file: '/f-manual', modifiedAt: 1000 }, // manual override
    { id: 's-view', file: '/f-view', modifiedAt: 9000 }, // focused; grew but is on screen
    { id: 's-followed', file: '/f-followed', modifiedAt: 9000 }, // followed; grew but is on screen
    { id: 's-archived', file: '/f-archived', modifiedAt: 9000 } // archived (ticket 35 reserves the slot)
  ]
  const states: ReadStates = {
    's-grow': { watermarkMs: 1000, manualUnread: false },
    's-read': { watermarkMs: 1000, manualUnread: false },
    's-manual': { watermarkMs: 1000, manualUnread: true },
    's-view': { watermarkMs: 1000, manualUnread: false },
    's-followed': { watermarkMs: 1000, manualUnread: false },
    's-archived': { watermarkMs: 1000, manualUnread: true }
  }
  const archived = new Set(['s-archived'])

  it('treats the focused session as the view on screen when Follow is inactive', () => {
    expect(unreadSessionIds(sessions, states, 's-view', null, archived)).toEqual(
      new Set(['s-grow', 's-manual', 's-followed'])
    )
  })

  it('while Follow is active the focused session is NOT on screen — its growth counts', () => {
    expect(unreadSessionIds(sessions, states, null, '/f-followed', archived)).toEqual(
      new Set(['s-grow', 's-manual', 's-view'])
    )
  })

  it('the followed file itself is the view on screen (never unread while watched)', () => {
    const only: ReadStates = { 's-followed': { watermarkMs: 1000, manualUnread: true } }
    expect(unreadSessionIds(sessions, only, null, '/f-followed', archived)).toEqual(new Set())
  })

  it('is empty for a fresh install (nothing baselined, nothing grown)', () => {
    expect(unreadSessionIds(sessions, {}, null, null, archived)).toEqual(new Set())
  })
})
