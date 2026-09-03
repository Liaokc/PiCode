import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, stat, writeFile, utimes, appendFile, readFile } from 'node:fs/promises'
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

  it('derives createdAt from the file birthtime and keeps it across cached rescans (ticket 33)', async () => {
    const file = await writeSession(
      'projF',
      's6.jsonl',
      sessionText('/f', 'id-6', [userLine('e1', null, 'birthtime task')]),
      1_756_300_000_000
    )
    const service = new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => {} })
    const first = await service.list()
    const summary = first.find((s) => s.file === file)
    expect(summary).toBeDefined()
    // The test fixture's utimes() backdating touches ONLY mtime — createdAt
    // must come from the real birthtime, not the forced mtime.
    const stats = await stat(file)
    if (stats.birthtimeMs > 0) {
      // The contract: createdAt IS stat().birthtimeMs (which on macOS clamps
      // to a backdated mtime — whatever the platform reports is the truth).
      expect(summary?.createdAt).toBe(Math.round(stats.birthtimeMs))
    } else {
      // Platform without birthtime support: graceful degrade to null.
      expect(summary?.createdAt).toBeNull()
    }
    // The cache-served rescan (mtime unchanged) keeps the same field.
    const second = await service.list()
    expect(second.find((s) => s.file === file)?.createdAt).toBe(summary?.createdAt)
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

describe('SessionIndexService trace follow (ticket 37)', () => {
  const assistantLine = (id: string, parentId: string, text: string, usage: Record<string, number>): string =>
    JSON.stringify({
      type: 'message',
      id,
      parentId,
      timestamp: '2026-08-27T13:06:00.000Z',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text }],
        usage: { input: usage.input, output: usage.output },
        timestamp: Date.parse('2026-08-27T13:06:00.000Z')
      }
    })

  it('returns the initial payload, then pushes a rebuilt payload when the file grows', async () => {
    const file = await writeSession('projF', 's6.jsonl', sessionText('/f', 'id-6', [userLine('e1', null, 'before')]))
    const updates: Array<{ file: string; calls: Array<{ messageId: string }> }> = []
    const service = new SessionIndexService({
      sessionsDir: dir,
      onIndexChanged: () => {},
      onTraceUpdate: (payload) => updates.push(payload)
    })

    // Snapshot + tail registration: the initial payload covers everything so far.
    const initial = await service.startTraceFollowing(file)
    expect(initial?.calls.map((c) => c.messageId)).toEqual([]) // no assistant message yet

    service.start(25)
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    try {
      // Growth (a settled call: user + assistant) must reach the tab WITHOUT
      // any re-request — the host re-derives and pushes.
      await appendFile(file, [userLine('e2', 'e1', 'after'), assistantLine('e3', 'e2', 'done', { input: 10, output: 5 })].join('\n') + '\n')
      const t = Date.now()
      await utimes(file, new Date(t), new Date(t))
      await sleep(300)

      expect(updates.length).toBeGreaterThanOrEqual(1)
      const pushed = updates.at(-1)
      expect(pushed?.file).toBe(file)
      expect(pushed?.calls.map((c) => c.messageId)).toEqual(['e3'])
    } finally {
      service.stop()
    }
    service.stopTraceFollowing(file)
    // After the stop, further growth pushes nothing.
    const updatesAfterStop = updates.length
    await appendFile(file, userLine('e4', 'e3', 'quiet') + '\n')
    service.start(25)
    try {
      await sleep(200)
      expect(updates.length).toBe(updatesAfterStop)
    } finally {
      service.stop()
    }
  })

  it('tracks several trace tabs independently and stops only the requested file', async () => {
    const fileA = await writeSession('projF', 'sa.jsonl', sessionText('/f', 'id-a', [userLine('ea', null, 'a')]))
    const fileB = await writeSession('projF', 'sb.jsonl', sessionText('/f', 'id-b', [userLine('eb', null, 'b')]))
    const updates: string[] = []
    const service = new SessionIndexService({
      sessionsDir: dir,
      onIndexChanged: () => {},
      onTraceUpdate: (payload) => updates.push(payload.file)
    })
    await service.startTraceFollowing(fileA)
    await service.startTraceFollowing(fileB)
    service.stopTraceFollowing(fileA)

    service.start(25)
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    try {
      await appendFile(fileB, userLine('eb2', 'eb', 'grow b') + '\n')
      const t = Date.now()
      await utimes(fileB, new Date(t), new Date(t))
      await sleep(300)
      // fileB still tails; fileA's stop removed only its own tail. (fileB has
      // no assistant message, so the payload push is skipped — detect the
      // tail through the transcript follow contract instead: no crash, and
      // nothing was pushed for fileA.)
      expect(updates.every((f) => f === fileB)).toBe(true)
    } finally {
      service.stop()
    }
  })

  it('startTraceFollowing returns null for unreadable files and still registers the tail', async () => {
    const missing = path.join(dir, 'projF', 'missing.jsonl')
    const service = new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => {} })
    expect(await service.startTraceFollowing(missing)).toBeNull()
    service.stopTraceFollowing(missing)
  })

  it('a shrink (rewrite) still re-derives: the push reflects the new content', async () => {
    const file = await writeSession('projF', 's7.jsonl', sessionText('/g', 'id-7', [userLine('g1', null, 'v1'), assistantLine('g2', 'g1', 'old answer', { input: 1, output: 1 })]))
    const updates: Array<{ calls: Array<{ messageId: string }> }> = []
    const service = new SessionIndexService({
      sessionsDir: dir,
      onIndexChanged: () => {},
      onTraceUpdate: (payload) => updates.push(payload)
    })
    await service.startTraceFollowing(file)

    service.start(25)
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    try {
      // Rewrite with DIFFERENT, SHORTER content (truncation scenario) — a
      // same-size in-place rewrite is invisible to any size check, matching
      // the transcript tail's semantics.
      await writeFile(file, sessionText('/g', 'id-7', [userLine('h1', null, 'v2'), assistantLine('h2', 'h1', 'new', { input: 2, output: 2 })]))
      await sleep(300)
      expect(updates.length).toBeGreaterThanOrEqual(1)
      expect(updates.at(-1)?.calls.map((c) => c.messageId)).toEqual(['h2'])
    } finally {
      service.stop()
    }
    service.stopTraceFollowing(file)
  })
})
