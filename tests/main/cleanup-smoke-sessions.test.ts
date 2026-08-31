/**
 * Smoke-session cleanup matcher (ticket 13): the one-time cleanup script must
 * identify exactly the smoke-tooling leftovers — never real project stores.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findSmokeDirs, isSmokeDirName } from '../../scripts/cleanup-smoke-sessions.ts'

describe('isSmokeDirName', () => {
  it('matches the smoke tooling leftovers', () => {
    expect(isSmokeDirName('--var-folders-x-T-picode-smoke-2eL2KU--')).toBe(true)
    expect(isSmokeDirName('--tmp-picode-lifecycle-smoke--')).toBe(true)
    expect(isSmokeDirName('--tmp-picode-probe--')).toBe(true)
    expect(isSmokeDirName('--var-folders-x-T-picode-diff-e2e-1dVGNw--')).toBe(true)
  })

  it('never matches real project stores', () => {
    expect(isSmokeDirName('--Users-liaokechen-PiCode--')).toBe(false)
    // 2026-08-31 实证：裸 --tmp-- 库里 51 个会话全为 harness 垃圾（cwd=临时目录，无真实项目），纳入清洗
    expect(isSmokeDirName('--tmp--')).toBe(true)
    expect(isSmokeDirName('--Users-liaokechen-work-nlu_offline_dataflow--')).toBe(false)
  })
})

describe('findSmokeDirs', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'picode-cleanup-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('finds only smoke directories and counts their session files', async () => {
    const smoke = join(dir, '--var-folders-x-T-picode-smoke-ABC123--')
    const real = join(dir, '--Users-someone-real-project--')
    await mkdir(smoke, { recursive: true })
    await mkdir(real, { recursive: true })
    await writeFile(join(smoke, '2026-08-30T00-00-00-000Z_s1.jsonl'), 'x\n')
    await writeFile(join(smoke, '2026-08-30T00-00-01-000Z_s2.jsonl'), 'y\n')
    await writeFile(join(smoke, 'notes.txt'), 'not a session file')
    await writeFile(join(real, '2026-08-30T00-00-00-000Z_real.jsonl'), 'real\n')

    const reports = findSmokeDirs(dir)
    expect(reports).toHaveLength(1)
    expect(reports[0].name).toBe('--var-folders-x-T-picode-smoke-ABC123--')
    expect(reports[0].sessionFiles).toBe(2)
    expect(reports[0].bytes).toBeGreaterThan(2)
  })

  it('tolerates a missing sessions directory', () => {
    expect(findSmokeDirs(join(dir, 'does-not-exist'))).toEqual([])
  })
})

describe('isSmokeDirName — temp-cwd prefixes (post-1.0 gap fix)', () => {
  it('flags bare tmp / var-folders stores regardless of picode naming', () => {
    expect(isSmokeDirName('--tmp--')).toBe(true)
    expect(isSmokeDirName('--var-folders-sw-twg7k81s6xbfq1wb18bj_6wr0000gn-T--')).toBe(true)
    expect(isSmokeDirName('--var-folders-sw-twg7k81s6xbfq1wb18bj_6wr0000gn-T-tmp.4SOW0i6cdb--')).toBe(true)
    expect(isSmokeDirName('--private-tmp-foo--')).toBe(true)
  })
  it('never flags real user projects', () => {
    expect(isSmokeDirName('--Users-liaokechen-PiCode--')).toBe(false)
    expect(isSmokeDirName('--Users-liaokechen-Downloads-知识库文件--')).toBe(false)
    expect(isSmokeDirName('--Users-liaokechen-Library-Application Support-AionUi-x--')).toBe(false)
  })
})
