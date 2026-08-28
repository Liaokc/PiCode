import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile, utimes, appendFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SessionIndexService } from '../../src/main/sessions/index-service'

/**
 * Fixture layout mirrors ~/.pi/agent/sessions/<encoded-cwd>/<session>.jsonl.
 */

function sessionText(cwd: string, id: string, lines: string[]): string {
  const header = JSON.stringify({ type: 'session', version: 3, id, timestamp: '2026-08-27T13:00:00.000Z', cwd })
  return [header, ...lines].join('\n')
}

const userLine = (id: string, parentId: string | null, text: string): string =>
  JSON.stringify({ type: 'message', id, parentId, timestamp: '2026-08-27T13:05:00.000Z', message: { role: 'user', content: [{ type: 'text', text }] } })

const infoLine = (id: string, parentId: string, name: string): string =>
  JSON.stringify({ type: 'session_info', id, parentId, timestamp: '2026-08-27T13:06:00.000Z', name })

let dir: string

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'picode-sessions-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function writeSession(project: string, file: string, text: string, mtimeMs?: number): Promise<string> {
  const projectDir = path.join(dir, `--${project}--`)
  await mkdir(projectDir, { recursive: true })
  const full = path.join(projectDir, file)
  await writeFile(full, text)
  if (mtimeMs !== undefined) await utimes(full, new Date(mtimeMs), new Date(mtimeMs))
  return full
}

describe('SessionIndexService.list', () => {
  it('finds sessions across project dirs and summarizes them', async () => {
    await writeSession('projA', 's1.jsonl', sessionText('/work/projA', 'id-1', [userLine('e1', null, 'first task')]), 1_756_300_000_000)
    await writeSession('projB', 's2.jsonl', sessionText('/work/projB', 'id-2', [userLine('e1', null, 'second task'), infoLine('e2', 'e1', 'Named task')]), 1_756_300_100_000)
    await writeFile(path.join(dir, '--projA--', 'notes.txt'), 'not a session')

    const service = new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => {} })
    const list = await service.list()
    const summaries = new Map(list.map((s) => [s.file, s]))

    expect(list).toHaveLength(2)
    expect(summaries.get(path.join(dir, '--projA--', 's1.jsonl'))?.title).toBe('first task')
    expect(summaries.get(path.join(dir, '--projB--', 's2.jsonl'))).toMatchObject({
      id: 'id-2',
      name: 'Named task',
      title: 'Named task',
      cwd: '/work/projB'
    })
  })

  it('caches by mtime: repeated scans are idempotent', async () => {
    const file = await writeSession('projC', 's3.jsonl', sessionText('/c', 'id-3', []), 1_756_300_200_000)
    const service = new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => {} })
    const a = await service.list()
    const b = await service.list()
    expect(a.map((s) => s.file).sort()).toEqual(b.map((s) => s.file).sort())
    expect(b.find((s) => s.file === file)?.modifiedAt).toBe(1_756_300_200_000)
  })

  it('reports renames through list after appendSessionInfo', async () => {
    const file = await writeSession('projD', 's4.jsonl', sessionText('/d', 'id-4', [userLine('e1', null, 'orig')]))
    const service = new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => {} })
    await service.list()

    const renamed = await service.renameSession(file, 'fresh label')
    expect(renamed?.name).toBe('fresh label')
    expect(renamed?.title).toBe('fresh label')

    // The appended line must be present in the file on disk.
    const text = await readFile(file, 'utf8')
    expect(text).toContain('"type":"session_info"')
    expect(text.split('\n').filter((l) => l.trim() !== '').length).toBe(3) // header + user + info

    // And a fresh scan sees it too.
    const list = await service.list()
    expect(list.find((s) => s.file === file)?.name).toBe('fresh label')
  })

  it('renameSession returns null for unreadable files', async () => {
    const service = new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => {} })
    expect(await service.renameSession(path.join(dir, 'missing.jsonl'), 'x')).toBeNull()
  })
})

describe('SessionIndexService polling + follow', () => {
  it('fires onIndexChanged when a file changes and pushes follow tail items', async () => {
    const file = await writeSession('projE', 's5.jsonl', sessionText('/e', 'id-5', [userLine('e1', null, 'before')]))
    let changes = 0
    const updates: Array<{ file: string; items: Array<{ id: string }> }> = []
    const service = new SessionIndexService({
      sessionsDir: dir,
      onIndexChanged: () => changes++,
      onFollowUpdate: (payload) => updates.push(payload)
    })
    await service.list()
    await service.startFollowing(file)
    const snapshot = await service.followSnapshot()
    expect(snapshot?.items.map((i) => i.id)).toEqual(['e1'])

    service.start(25)
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    try {
      await sleep(120)
      expect(changes).toBe(0) // nothing changed yet

      await appendFile(file, userLine('e2', 'e1', 'after') + '\n')
      const t = Date.now()
      await utimes(file, new Date(t + 5_000), new Date(t + 5_000))
      await sleep(200)

      expect(changes).toBeGreaterThanOrEqual(1)
      // Follow tail delivered only the NEW items.
      expect(updates.length).toBeGreaterThanOrEqual(1)
      const delivered = updates.flatMap((u) => u.items.map((i) => i.id))
      expect(delivered).toEqual(['e2'])
      expect(updates[0]?.file).toBe(file)
    } finally {
      service.stop()
    }
    service.stopFollowing()
  })

  it('followSnapshot returns null for unreadable files', async () => {
    const service = new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => {} })
    expect(await service.followSnapshot(path.join(dir, 'nope.jsonl'))).toBeNull()
  })
})
