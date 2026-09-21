import { describe, expect, it } from 'vitest'
import {
  announcePending,
  dropFailedPending,
  makePendingCreate,
  mergePendingCreates,
  pendingTitle,
  reconcilePending,
  stripPendingGroups,
  PENDING_FILE_PREFIX,
  type PendingCreate
} from '../../src/shared/sessions/pending-create.ts'
import { groupSessions } from '../../src/shared/sessions/group.ts'
import type { GroupedSessions } from '../../src/shared/sessions/group.ts'
import type { SessionSummary } from '../../src/shared/sessions/types.ts'
import { isProvisionalSessionId } from '../../src/shared/contract.ts'

function session(
  file: string,
  cwd: string,
  modifiedAt: number,
  title = `Task ${file}`,
  id = file
): SessionSummary {
  return {
    file,
    id,
    cwd,
    name: null,
    title,
    startedAt: '',
    modifiedAt,
    createdAt: null,
    messageCount: 1
  }
}

/** Index with one settled session in /proj (1h old). */
const INDEX = [session('/s/a.jsonl', '/proj', 1_000_000, 'Older task', 'pi-uuid-a')]

describe('pendingTitle (ticket 106 — the placeholder card shows only what is known)', () => {
  it('projects the typed first message the same way the scanner will title the real card', () => {
    expect(pendingTitle('Count slowly\n  from one   to twenty.')).toBe('Count slowly from one to twenty.')
  })

  it('truncates long input at the sidebar budget with the ellipsis', () => {
    const long = 'x'.repeat(120)
    expect(pendingTitle(long)).toBe(`${'x'.repeat(80)}…`)
  })

  it('falls back to the scanner New Task fallback when nothing was typed', () => {
    expect(pendingTitle('')).toBe('New Task')
    expect(pendingTitle('   \n  ')).toBe('New Task')
  })
})

describe('makePendingCreate (ticket 106 — the optimistic placeholder row)', () => {
  it('carries only the known facts: synthetic id, cwd, projected title, dispatch clock', () => {
    const pending = makePendingCreate('pending-create-1', '/fresh', 'Plan the garden', 5_000)
    expect(pending).toEqual({
      id: 'pending-create-1',
      cwd: '/fresh',
      title: 'Plan the garden',
      dispatchedAt: 5_000,
      announcedSessionId: null
    })
  })

  it('never claims message data — messageCount stays 0 and name stays null in the merged row', () => {
    const merged = mergePendingCreates([], [makePendingCreate('pending-create-1', '/fresh', 'Hi', 5_000)])
    expect(merged).toHaveLength(1)
    expect(merged[0]!.messageCount).toBe(0)
    expect(merged[0]!.name).toBeNull()
    expect(merged[0]!.file).toBe(`${PENDING_FILE_PREFIX}pending-create-1`)
  })
})

describe('mergePendingCreates (ticket 106 — registry merge: existing grouping/sort semantics apply)', () => {
  it('lands the placeholder in its cwd group, newest-first by the dispatch clock', () => {
    const pending = [makePendingCreate('pending-create-1', '/proj', 'Newest task', 2_000_000)]
    const merged = mergePendingCreates(INDEX, pending)
    expect(merged).toHaveLength(2)
    const grouped = groupSessions(merged, new Set(), 'updated')
    expect(grouped.groups).toHaveLength(1)
    expect(grouped.groups[0]!.cwd).toBe('/proj')
    // The pending card sorts ABOVE the settled session — where the real
    // card will land once the file indexes.
    expect(grouped.groups[0]!.sessions[0]!.id).toBe('pending-create-1')
    expect(grouped.groups[0]!.sessions[1]!.id).toBe('pi-uuid-a')
  })

  it('opens a brand-new project group for a first session in an unseen cwd', () => {
    const merged = mergePendingCreates(INDEX, [makePendingCreate('p1', '/brand-new', 'Hi', 1)])
    const grouped = groupSessions(merged, new Set(), 'updated')
    expect(grouped.groups.map((g) => g.cwd).sort()).toEqual(['/brand-new', '/proj'])
  })

  it('keeps an UNANNOUNCED pending even when the index already has sessions in that cwd', () => {
    const merged = mergePendingCreates(INDEX, [makePendingCreate('p1', '/proj', 'Hi', 1)])
    expect(merged.some((s) => s.id === 'p1')).toBe(true)
  })

  it('drops a pending whose announced session id has reached the index — the real card replaces it', () => {
    const pending: PendingCreate[] = [{ ...makePendingCreate('p1', '/proj', 'Hi', 1), announcedSessionId: 'pi-uuid-a' }]
    const merged = mergePendingCreates(INDEX, pending)
    expect(merged.some((s) => s.id === 'p1')).toBe(false)
    expect(merged).toEqual(INDEX)
  })

  it('keeps an announced pending whose file has not been indexed yet (no flicker)', () => {
    const pending: PendingCreate[] = [{ ...makePendingCreate('p1', '/proj', 'Hi', 1), announcedSessionId: 'pi-uuid-later' }]
    expect(mergePendingCreates(INDEX, pending)).toHaveLength(2)
  })
})

describe('announcePending (ticket 106 — session_created reconciliation bookkeeping)', () => {
  it('stamps the real session id on the oldest unannounced pending with a matching cwd', () => {
    const first = makePendingCreate('p1', '/proj', 'First', 1)
    const second = makePendingCreate('p2', '/other', 'Second', 2)
    const announced = announcePending([first, second], 'pi-uuid-real', '/proj')
    expect(announced[0]!.announcedSessionId).toBe('pi-uuid-real')
    expect(announced[1]!.announcedSessionId).toBeNull()
  })

  it('never consumes a pending whose cwd does not match the announcement (forks announce too)', () => {
    const pending = [makePendingCreate('p1', '/proj', 'First', 1)]
    expect(announcePending(pending, 'pi-uuid-real', '/elsewhere')).toBe(pending)
  })

  it('never re-announces an already-announced pending', () => {
    const pending: PendingCreate[] = [{ ...makePendingCreate('p1', '/proj', 'First', 1), announcedSessionId: 'pi-one' }]
    expect(announcePending(pending, 'pi-two', '/proj')).toBe(pending)
  })
})

describe('reconcilePending (ticket 106 — the index is the confirmation source)', () => {
  it('drops exactly the pendings the index has confirmed, keeps the rest', () => {
    const pending: PendingCreate[] = [
      { ...makePendingCreate('p1', '/proj', 'A', 1), announcedSessionId: 'pi-uuid-a' },
      { ...makePendingCreate('p2', '/proj', 'B', 2), announcedSessionId: 'pi-uuid-b' },
      makePendingCreate('p3', '/proj', 'C', 3)
    ]
    const reconciled = reconcilePending(INDEX, pending)
    expect(reconciled.map((p) => p.id)).toEqual(['p2', 'p3'])
  })

  it('returns the same reference when nothing is confirmed yet', () => {
    const pending = [makePendingCreate('p1', '/proj', 'A', 1)]
    expect(reconcilePending(INDEX, pending)).toBe(pending)
  })
})

describe('dropFailedPending (ticket 106 — boot failure removes the placeholder, no ghost)', () => {
  it('a provisional-id failure consumes the oldest UNANNOUNCED pending', () => {
    const announced: PendingCreate = { ...makePendingCreate('p1', '/proj', 'A', 1), announcedSessionId: 'pi-one' }
    const booting = makePendingCreate('p2', '/other', 'B', 2)
    const { pending, dropped } = dropFailedPending([announced, booting], 'pending-7')
    expect(dropped?.id).toBe('p2')
    expect(pending).toEqual([announced])
  })

  it('a real-id failure consumes the pending that announced that id (crashed before indexing)', () => {
    const announced: PendingCreate = { ...makePendingCreate('p1', '/proj', 'A', 1), announcedSessionId: 'pi-one' }
    const { pending, dropped } = dropFailedPending([announced], 'pi-one')
    expect(dropped?.id).toBe('p1')
    expect(pending).toEqual([])
  })

  it('a failure matching no pending changes nothing (resume failures keep today\'s behavior)', () => {
    const pending = [makePendingCreate('p1', '/proj', 'A', 1)]
    const result = dropFailedPending(pending, 'pi-unknown')
    expect(result.dropped).toBeNull()
    expect(result.pending).toBe(pending)
  })

  it('a provisional-id failure with no booting pending changes nothing', () => {
    const announced: PendingCreate = { ...makePendingCreate('p1', '/proj', 'A', 1), announcedSessionId: 'pi-one' }
    const result = dropFailedPending([announced], 'pending-7')
    expect(result.dropped).toBeNull()
    expect(result.pending).toEqual([announced])
  })
})

describe('stripPendingGroups (ticket 106 × 84 — placeholders never enter the manual arrangement)', () => {
  it('removes pending rows from every group so a first drag cannot snapshot a synthetic id', () => {
    const pendingRow = { ...session('/s/pending:x', '/proj', 9, 'Pending', 'p1') }
    const grouped: GroupedSessions = {
      pinned: [],
      groups: [{ cwd: '/proj', project: 'proj', sessions: [pendingRow, INDEX[0]!] }]
    }
    const stripped = stripPendingGroups(grouped, new Set(['p1']))
    expect(stripped.groups[0]!.sessions).toEqual([INDEX[0]!])
  })
})

describe('isProvisionalSessionId (ticket 106 — the supervisor\'s boot-failure id shape)', () => {
  it('matches the supervisor provisional ids and nothing else', () => {
    expect(isProvisionalSessionId('pending-1')).toBe(true)
    expect(isProvisionalSessionId('pending-42')).toBe(true)
    expect(isProvisionalSessionId('pending-create-1')).toBe(false)
    expect(isProvisionalSessionId('pi-uuid-a')).toBe(false)
    expect(isProvisionalSessionId('')).toBe(false)
  })
})
