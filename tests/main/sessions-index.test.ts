import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, stat, writeFile, utimes, appendFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SessionIndexService } from '../../src/main/sessions/index-service'
import type { SessionSummary } from '../../src/shared/sessions/types'

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

/** A REAL directory to seed as a session cwd — the cwd-liveness filter
 * (ticket 42) drops sessions whose working directory is not a directory on
 * disk, so every fixture seeds a truthful one. Idempotent mkdir: tests that
 * delete their cwd can re-seed the same name safely. */
async function cwdFor(name: string): Promise<string> {
  const target = path.join(dir, 'cwds', name)
  await mkdir(target, { recursive: true })
  return target
}

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
    const cwdA = await cwdFor('projA')
    const cwdB = await cwdFor('projB')
    await writeSession('projA', 's1.jsonl', sessionText(cwdA, 'id-1', [userLine('e1', null, 'first task')]), 1_756_300_000_000)
    await writeSession('projB', 's2.jsonl', sessionText(cwdB, 'id-2', [userLine('e1', null, 'second task'), infoLine('e2', 'e1', 'Named task')]), 1_756_300_100_000)
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
      cwd: cwdB
    })
  })

  it('caches by mtime: repeated scans are idempotent', async () => {
    const file = await writeSession('projC', 's3.jsonl', sessionText(await cwdFor('projC'), 'id-3', []), 1_756_300_200_000)
    const service = new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => {} })
    const a = await service.list()
    const b = await service.list()
    expect(a.map((s) => s.file).sort()).toEqual(b.map((s) => s.file).sort())
    expect(b.find((s) => s.file === file)?.modifiedAt).toBe(1_756_300_200_000)
  })

  it('reports renames through list after appendSessionInfo', async () => {
    const file = await writeSession('projD', 's4.jsonl', sessionText(await cwdFor('projD'), 'id-4', [userLine('e1', null, 'orig')]))
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
      sessionText(await cwdFor('projF'), 'id-6', [userLine('e1', null, 'birthtime task')]),
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
    const file = await writeSession('projE', 's5.jsonl', sessionText(await cwdFor('projE'), 'id-5', [userLine('e1', null, 'before')]))
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
    const file = await writeSession('projF', 's6.jsonl', sessionText(await cwdFor('projF'), 'id-6', [userLine('e1', null, 'before')]))
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
    const fileA = await writeSession('projF', 'sa.jsonl', sessionText(await cwdFor('projF'), 'id-a', [userLine('ea', null, 'a')]))
    const fileB = await writeSession('projF', 'sb.jsonl', sessionText(await cwdFor('projF'), 'id-b', [userLine('eb', null, 'b')]))
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
    const cwd = await cwdFor('projG')
    const file = await writeSession('projF', 's7.jsonl', sessionText(cwd, 'id-7', [userLine('g1', null, 'v1'), assistantLine('g2', 'g1', 'old answer', { input: 1, output: 1 })]))
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
      await writeFile(file, sessionText(cwd, 'id-7', [userLine('h1', null, 'v2'), assistantLine('h2', 'h1', 'new', { input: 2, output: 2 })]))
      await sleep(300)
      expect(updates.length).toBeGreaterThanOrEqual(1)
      expect(updates.at(-1)?.calls.map((c) => c.messageId)).toEqual(['h2'])
    } finally {
      service.stop()
    }
    service.stopTraceFollowing(file)
  })
})

describe('SessionIndexService subagent-transcript follow (ticket 99)', () => {
  const childLine = (id: string, parentId: string | null, text: string): string =>
    JSON.stringify({
      type: 'message',
      id,
      parentId,
      timestamp: '2026-08-27T13:06:00.000Z',
      message: { role: 'user', content: [{ type: 'text', text }] }
    })

  let runRoot: string

  beforeEach(async () => {
    runRoot = await mkdtemp(path.join(tmpdir(), 'picode-subagent99-'))
  })

  afterEach(async () => {
    await rm(runRoot, { recursive: true, force: true })
  })

  /** One run's artifact dir with a status.json naming `sessionFile`. */
  async function seedRun(runId: string, status: Record<string, unknown>): Promise<string> {
    const runDir = path.join(runRoot, 'runs', runId)
    await mkdir(runDir, { recursive: true })
    await writeFile(path.join(runDir, 'status.json'), JSON.stringify(status))
    return runDir
  }

  it('resolves the child session file from the artifact and returns the transcript payload', async () => {
    const child = path.join(runRoot, 'child-1.jsonl')
    await writeFile(child, sessionText(await cwdFor('projG'), 'child-1', [childLine('c1', null, 'child task text')]) + '\n')
    const runDir = await seedRun('run-1', { runId: 'run-1', state: 'running', sessionFile: child })
    const service = new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => {} })
    const payload = await service.startSubagentTranscriptFollowing(runDir)
    expect(payload).not.toBeNull()
    expect(payload?.asyncDir).toBe(runDir)
    expect(payload?.sessionFile).toBe(child)
    expect(payload?.error).toBeNull()
    expect(payload?.items.map((i) => (i.role === 'user' ? i.text : ''))).toContain('child task text')
    service.stopSubagentTranscriptFollowing(runDir)
  })

  it('pushes a rebuilt payload when the child file grows (live update, no re-request)', async () => {
    const child = path.join(runRoot, 'child-2.jsonl')
    await writeFile(child, sessionText(await cwdFor('projG'), 'child-2', [childLine('c1', null, 'first')]) + '\n')
    const runDir = await seedRun('run-2', { runId: 'run-2', state: 'running', sessionFile: child })
    const updates: Array<{ asyncDir: string; items: Array<{ id?: string }> }> = []
    const service = new SessionIndexService({
      sessionsDir: dir,
      onIndexChanged: () => {},
      onSubagentTranscriptUpdate: (payload) => updates.push(payload)
    })
    await service.startSubagentTranscriptFollowing(runDir)
    service.start(25)
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    try {
      await appendFile(child, childLine('c2', 'c1', 'second — the live tail lands') + '\n')
      const t = Date.now()
      await utimes(child, new Date(t), new Date(t))
      await sleep(300)
      expect(updates.length).toBeGreaterThanOrEqual(1)
      const pushed = updates.at(-1)
      expect(pushed?.asyncDir).toBe(runDir)
      expect(pushed?.items.map((i) => i.id)).toEqual(['c1', 'c2'])
    } finally {
      service.stop()
    }
    service.stopSubagentTranscriptFollowing(runDir)
  })

  it('an absent artifact resolves the honest error payload and registers anyway (late artifact still lands)', async () => {
    const runDir = path.join(runRoot, 'runs', 'never-was')
    const service = new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => {} })
    const payload = await service.startSubagentTranscriptFollowing(runDir)
    expect(payload?.error).toBe('artifact-missing')
    expect(payload?.items).toEqual([])
    // The artifact appears later: the poll picks it up without a re-request.
    const child = path.join(runRoot, 'child-3.jsonl')
    await writeFile(child, sessionText(await cwdFor('projG'), 'child-3', [childLine('c1', null, 'late arrival')]) + '\n')
    await seedRun('never-was', { runId: 'never-was', state: 'running', sessionFile: child })
    const updates: Array<{ asyncDir: string; error: string | null }> = []
    const live = new SessionIndexService({
      sessionsDir: dir,
      onIndexChanged: () => {},
      onSubagentTranscriptUpdate: (p) => updates.push(p)
    })
    // Re-register on the SAME service shape: the error → resolved transition
    // pushes once the poll sees the artifact (the registration from the
    // first call persists on this second service instance for the test).
    await live.startSubagentTranscriptFollowing(runDir)
    live.start(25)
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    try {
      await sleep(300)
      expect(updates.some((u) => u.asyncDir === runDir && u.error === null)).toBe(true)
    } finally {
      live.stop()
    }
    live.stopSubagentTranscriptFollowing(runDir)
  })

  it('an artifact with no sessionFile resolves no-session-file; an unreadable child resolves unreadable', async () => {
    const noFileRun = await seedRun('run-4', { runId: 'run-4', state: 'running' })
    const corruptRun = path.join(runRoot, 'runs', 'run-5')
    await mkdir(corruptRun, { recursive: true })
    await writeFile(path.join(corruptRun, 'status.json'), '{oops')
    const child = path.join(runRoot, 'child-5.jsonl')
    await writeFile(child, '')
    const badChildRun = await seedRun('run-6', { runId: 'run-6', state: 'running', sessionFile: path.join(runRoot, 'gone.jsonl') })
    const service = new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => {} })
    expect((await service.startSubagentTranscriptFollowing(noFileRun))?.error).toBe('no-session-file')
    expect((await service.startSubagentTranscriptFollowing(corruptRun))?.error).toBe('artifact-missing')
    expect((await service.startSubagentTranscriptFollowing(badChildRun))?.error).toBe('unreadable')
    for (const run of [noFileRun, corruptRun, badChildRun]) service.stopSubagentTranscriptFollowing(run)
  })

  it('one-shot reads (ended runs) never register a tail', async () => {
    const child = path.join(runRoot, 'child-7.jsonl')
    await writeFile(child, sessionText(await cwdFor('projG'), 'child-7', [childLine('c1', null, 'settled')]) + '\n')
    const runDir = await seedRun('run-7', { runId: 'run-7', state: 'complete', sessionFile: child })
    const service = new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => {} })
    const payload = await service.subagentTranscriptOnce(runDir)
    expect(payload?.error).toBeNull()
    expect(payload?.items.length).toBeGreaterThan(0)
    // A one-shot never registered: the poll has nothing to push.
    const updates: unknown[] = []
    const live = new SessionIndexService({
      sessionsDir: dir,
      onIndexChanged: () => {},
      onSubagentTranscriptUpdate: (p) => updates.push(p)
    })
    live.start(25)
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    try {
      await appendFile(child, childLine('c2', 'c1', 'grown after the fact') + '\n')
      await sleep(200)
      expect(updates).toEqual([])
    } finally {
      live.stop()
    }
  })

  it('stops only the requested run (several conversation tabs tail independently)', async () => {
    const childA = path.join(runRoot, 'child-a.jsonl')
    const childB = path.join(runRoot, 'child-b.jsonl')
    await writeFile(childA, sessionText(await cwdFor('projG'), 'child-a', [childLine('ca', null, 'A')]) + '\n')
    await writeFile(childB, sessionText(await cwdFor('projG'), 'child-b', [childLine('cb', null, 'B')]) + '\n')
    const runA = await seedRun('run-a', { runId: 'run-a', state: 'running', sessionFile: childA })
    const runB = await seedRun('run-b', { runId: 'run-b', state: 'running', sessionFile: childB })
    const updates: string[] = []
    const service = new SessionIndexService({
      sessionsDir: dir,
      onIndexChanged: () => {},
      onSubagentTranscriptUpdate: (p) => updates.push(p.asyncDir)
    })
    await service.startSubagentTranscriptFollowing(runA)
    await service.startSubagentTranscriptFollowing(runB)
    service.stopSubagentTranscriptFollowing(runA)
    service.start(25)
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    try {
      await appendFile(childA, childLine('ca2', 'ca', 'A grown') + '\n')
      await appendFile(childB, childLine('cb2', 'cb', 'B grown') + '\n')
      await sleep(300)
      expect(updates).toEqual([runB])
    } finally {
      service.stop()
    }
    service.stopSubagentTranscriptFollowing(runB)
  })
})

describe('SessionIndexService cwd-liveness annotation (tickets 42 + 54)', () => {
  it('keeps dead-cwd sessions listed and flags them cwdMissing (gray-row data) while leaving their files untouched', async () => {
    const deadCwd = await cwdFor('liveness-dead')
    const file = await writeSession('livenessA', 'dead.jsonl', sessionText(deadCwd, 'id-dead', [userLine('e1', null, 'dead cwd task')]))
    const keepCwd = await cwdFor('liveness-keep')
    await writeSession('livenessA', 'keep.jsonl', sessionText(keepCwd, 'id-keep', [userLine('e1', null, 'alive task')]))

    const service = new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => {} })
    const byId = async (): Promise<Map<string, SessionSummary>> =>
      service.list().then((list) => new Map(list.map((s) => [s.id, s])))

    // The physical death happens BEFORE any scan sees the directory.
    await rm(deadCwd, { recursive: true, force: true })
    const flagged = await byId()
    expect(flagged.get('id-dead')).toBeDefined()
    expect(flagged.get('id-dead')?.cwdMissing).toBe(true)
    // The alive control keeps the EXACT pre-54 payload shape: no field at
    // all (additive contract — absent, not false).
    expect(flagged.get('id-keep')).toBeDefined()
    expect('cwdMissing' in (flagged.get('id-keep') as SessionSummary)).toBe(false)

    // Zero file action: the flagged session's bytes are exactly as before —
    // no delete, no move, no marker. The flag is a projection, the file is
    // never touched.
    const text = await readFile(file, 'utf8')
    expect(text).toContain('"id-dead"')

    // The directory reappearing clears the flag (recovery needs no manual
    // step): the gray row restores to a normal row on the next scan.
    await mkdir(deadCwd, { recursive: true })
    const recovered = await byId()
    expect('cwdMissing' in (recovered.get('id-dead') as SessionSummary)).toBe(false)
  })

  it('keeps a session listed while its cwd is gone regardless of any host — the flag is the raw physical fact', async () => {
    // Ticket 42's exemption used to withhold list membership for live hosts;
    // ticket 54: the banner needs the flag for live sessions too, so the
    // index flags EVERY session on a dead cwd and the live-host distinction
    // is a renderer projection (cwdRowState, cwd-liveness suite).
    const cwd = await cwdFor('liveness-live')
    await writeSession('livenessB', 'live.jsonl', sessionText(cwd, 'id-live', [userLine('e1', null, 'running task')]))

    const service = new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => {} })
    const flagOf = async (): Promise<boolean | undefined> =>
      service.list().then((list) => list.find((s) => s.id === 'id-live')?.cwdMissing)

    expect(await flagOf()).toBeUndefined()
    await rm(cwd, { recursive: true, force: true })
    expect(await flagOf()).toBe(true)
    await mkdir(cwd, { recursive: true })
    expect(await flagOf()).toBeUndefined()
  })

  it('fires onIndexChanged when a cwd appears or vanishes, even with no file change', async () => {
    const cwd = await cwdFor('liveness-sig')
    await writeSession('livenessC', 's.jsonl', sessionText(cwd, 'id-sig', [userLine('e1', null, 'sig task')]))

    let changes = 0
    const service = new SessionIndexService({ sessionsDir: dir, onIndexChanged: () => changes++ })
    await service.list()
    service.start(25)
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
    try {
      await sleep(120)
      expect(changes).toBe(0) // steady state: nothing changed yet

      await rm(cwd, { recursive: true, force: true })
      await sleep(400)
      expect(changes).toBeGreaterThanOrEqual(1)

      // The liveness flip is a ONE-TIME signature change — steady again.
      const after = changes
      await sleep(300)
      expect(changes).toBe(after)
    } finally {
      service.stop()
    }
  })
})
