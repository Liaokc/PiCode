import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { UsageStore } from '../../src/main/usage/store.ts'
import { buildUsageSnapshot, foldSessionFile } from '../../src/shared/usage/aggregate.ts'
import type { UsageSnapshot } from '../../src/shared/usage/aggregate.ts'

const headerLine = (id: string) =>
  JSON.stringify({ type: 'session', version: 3, id, timestamp: '2026-08-25T00:00:00.000Z', cwd: '/tmp/proj' })

const assistant = (id: string, ts: string, total: number, usd: number, model = 'm1') =>
  JSON.stringify({
    type: 'message',
    id,
    parentId: null,
    timestamp: ts,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: '…' }],
      model,
      usage: { input: total - 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: total, cost: { total: usd } },
      stopReason: 'stop'
    }
  })

const SNAP_OPTS = { timeZone: 'UTC', now: '2026-08-28T12:00:00.000Z' } as const

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'picode-usage-store-'))
  await mkdir(join(dir, '--tmp-proj--'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function writeSession(name: string, content: string): Promise<string> {
  const p = join(dir, '--tmp-proj--', name)
  await writeFile(p, content)
  return p
}

function oneShot(allFiles: { content: string }[]): UsageSnapshot {
  return buildUsageSnapshot(allFiles.map((f) => foldSessionFile(f.content, SNAP_OPTS)), SNAP_OPTS)
}

const fileA_v1 = [headerLine('s-abc'), assistant('a1', '2026-08-25T09:00:00.000Z', 100, 0.001), ''].join('\n')
const fileA_v2 = [
  headerLine('s-abc'),
  assistant('a1', '2026-08-25T09:00:00.000Z', 100, 0.001),
  assistant('a2', '2026-08-26T09:00:00.000Z', 200, 0.002),
  ''
].join('\n')
const fileB = [headerLine('s-def'), assistant('b1', '2026-08-27T09:00:00.000Z', 400, 0.004, 'm2'), ''].join('\n')

describe('UsageStore (incremental scan)', () => {
  it('produces the same snapshot as a one-shot rebuild', async () => {
    await writeSession('a.jsonl', fileA_v1)
    await writeSession('b.jsonl', fileB)

    const store = new UsageStore({ sessionsDir: dir, ...SNAP_OPTS })
    const scanned = await store.scan()
    expect(scanned).toEqual(oneShot([{ content: fileA_v1 }, { content: fileB }]))
  })

  it('is idempotent: repeated scans with no changes do not double count', async () => {
    await writeSession('a.jsonl', fileA_v2)
    const store = new UsageStore({ sessionsDir: dir, ...SNAP_OPTS })

    const first = await store.scan()
    const second = await store.scan()
    const third = await store.scan()

    expect(second).toEqual(first)
    expect(third).toEqual(first)
    expect(third.totalTokens).toBe(300)
  })

  it('picks up appended entries without rescanning the whole file and stays equivalent to a full rebuild', async () => {
    const p = await writeSession('a.jsonl', fileA_v1)
    const store = new UsageStore({ sessionsDir: dir, ...SNAP_OPTS })
    const before = await store.scan()
    expect(before.totalTokens).toBe(100)

    await writeFile(p, fileA_v2)
    const after = await store.scan()

    expect(after.totalTokens).toBe(300)
    expect(after).toEqual(oneShot([{ content: fileA_v2 }, { content: '' }]))
  })

  it('completes a half-written trailing line once the writer finishes it', async () => {
    const p = await writeSession('a.jsonl', fileA_v1 + assistant('a2', '2026-08-26T09:00:00.000Z', 200, 0.002))
    const store = new UsageStore({ sessionsDir: dir, ...SNAP_OPTS })
    const truncated = await store.scan()
    expect(truncated.totalTokens).toBe(100) // half line not consumed

    await writeFile(p, fileA_v2) // the line gets completed (plus trailing newline)
    const done = await store.scan()
    expect(done.totalTokens).toBe(300)
    expect(done).toEqual(oneShot([{ content: fileA_v2 }]))
  })

  it('drops files that disappear between scans', async () => {
    const p = await writeSession('a.jsonl', fileA_v1)
    await writeSession('b.jsonl', fileB)
    const store = new UsageStore({ sessionsDir: dir, ...SNAP_OPTS })
    expect((await store.scan()).sessionCount).toBe(2)

    await rm(p)
    const after = await store.scan()
    expect(after.sessionCount).toBe(1)
    expect(after.totalTokens).toBe(400)
    expect(after).toEqual(oneShot([{ content: fileB }]))
  })

  it('restarts from scratch when a file shrinks below the consumed offset', async () => {
    const p = await writeSession('a.jsonl', fileA_v2)
    const store = new UsageStore({ sessionsDir: dir, ...SNAP_OPTS })
    expect((await store.scan()).totalTokens).toBe(300)

    await writeFile(p, fileA_v1) // rewritten smaller
    const after = await store.scan()
    expect(after.totalTokens).toBe(100)
    expect(after).toEqual(oneShot([{ content: fileA_v1 }]))
  })

  it('scans files nested in per-project subdirectories', async () => {
    const nested = join(dir, '--Users-me--', 'deep', 'deeper')
    await mkdir(nested, { recursive: true })
    await writeFile(join(nested, 's.jsonl'), fileA_v1)
    const store = new UsageStore({ sessionsDir: dir, ...SNAP_OPTS })
    expect((await store.scan()).totalTokens).toBe(100)
  })

  it('tolerates a missing sessions directory', async () => {
    const store = new UsageStore({ sessionsDir: join(dir, 'nope'), ...SNAP_OPTS })
    const snap = await store.scan()
    expect(snap.totalTokens).toBe(0)
    expect(snap.sessionCount).toBe(0)
  })
})
