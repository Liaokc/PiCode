import { describe, expect, it } from 'vitest'
import { grayRowMenuGroups, sessionMenuGroups, sessionMenuLabels } from '../../src/shared/sessions/context-menu.ts'

describe('sessionMenuGroups — the nine-item context menu (ticket 35, z-context-menu.png)', () => {
  it('shows the nine items in ZCode group order with separators as group boundaries', () => {
    const groups = sessionMenuGroups(false, false)
    expect(groups).toHaveLength(3) // two separators → three groups
    expect(sessionMenuLabels(groups)).toEqual([
      'Pin task',
      'Rename task',
      'Archive task',
      'Mark as Unread',
      'Reveal in Finder',
      'Copy task path',
      'Copy session file path',
      'Copy session ID',
      'View call trace'
    ])
  })

  it('flips the pin entry for a pinned session (Unpin task)', () => {
    const groups = sessionMenuGroups(true, false)
    expect(groups[0]?.map((e) => e.label)).toEqual(['Unpin task', 'Rename task', 'Archive task', 'Mark as Unread'])
  })

  it('flips the unread entry for an unread session (Mark as Read)', () => {
    const groups = sessionMenuGroups(false, true)
    expect(groups[0]?.map((e) => e.label)).toEqual(['Pin task', 'Rename task', 'Archive task', 'Mark as Read'])
    expect(groups[1]?.map((e) => e.action)).toEqual([
      'reveal-in-finder',
      'copy-task-path',
      'copy-session-file',
      'copy-session-id'
    ])
    expect(groups[2]?.map((e) => e.label)).toEqual(['View call trace'])
  })

  it('keeps every entry label in English (vocabulary constraint)', () => {
    for (const group of sessionMenuGroups(true, true)) {
      for (const entry of group) expect(entry.label).toMatch(/^[A-Za-z ]+$/)
    }
  })
})

describe('grayRowMenuGroups — the dimmed row menu, harmless entries only (ticket 54)', () => {
  it('offers exactly the four harmless entries in two groups: Archive plus the three copies', () => {
    const groups = grayRowMenuGroups()
    expect(groups).toHaveLength(2)
    expect(sessionMenuLabels(groups)).toEqual([
      'Archive task',
      'Copy task path',
      'Copy session file path',
      'Copy session ID'
    ])
  })

  it('never offers an open-type action — no Reveal in Finder, no View call trace', () => {
    const actions = grayRowMenuGroups().flat().map((e) => e.action)
    expect(actions).not.toContain('reveal-in-finder')
    expect(actions).not.toContain('view-trace')
    // And no resume-shaped entry of any kind (resume on a deleted cwd makes
    // the host exit(1) — the gray row is a pure display state).
    expect(actions.every((a) => a === 'archive' || a.startsWith('copy-'))).toBe(true)
  })

  it('keeps every entry label in English (vocabulary constraint)', () => {
    for (const group of grayRowMenuGroups()) {
      for (const entry of group) expect(entry.label).toMatch(/^[A-Za-z ]+$/)
    }
  })
})
