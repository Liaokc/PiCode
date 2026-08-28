import { describe, expect, it } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUsageService } from '../../src/main/usage/service.ts'

const assistant = (id: string, total: number) =>
  JSON.stringify({
    type: 'message',
    id,
    timestamp: '2026-08-27T09:00:00.000Z',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: '…' }],
      model: 'm1',
      usage: { input: total - 10, output: 10, totalTokens: total, cost: { total: 0.001 } }
    }
  })

const header = JSON.stringify({ type: 'session', version: 3, id: 's-x', timestamp: '2026-08-27T09:00:00.000Z', cwd: '/tmp' })

async function makeSessionsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'picode-usage-'))
  await writeFile(join(dir, 's1.jsonl'), [header, assistant('a1', 100), ''].join('\n'))
  return dir
}

describe('usage service (main-process seam)', () => {
  it('serves a snapshot from the sessions directory', async () => {
    const service = createUsageService({ sessionsDir: await makeSessionsDir() })
    const snap = await service.snapshot()
    expect(snap.totalTokens).toBe(100)
    expect(snap.sessionCount).toBe(1)
  })

  it('repeated snapshots are idempotent (no double counting)', async () => {
    const service = createUsageService({ sessionsDir: await makeSessionsDir() })
    const first = await service.snapshot()
    const second = await service.snapshot()
    expect(second.totalTokens).toBe(first.totalTokens)
    expect(second.usageEventCount).toBe(first.usageEventCount)
  })

  it('returns an empty snapshot when the sessions dir is missing', async () => {
    const service = createUsageService({ sessionsDir: join(tmpdir(), 'picode-missing-', String(Date.now())) })
    const snap = await service.snapshot()
    expect(snap.totalTokens).toBe(0)
    expect(snap.sessionCount).toBe(0)
  })
})
