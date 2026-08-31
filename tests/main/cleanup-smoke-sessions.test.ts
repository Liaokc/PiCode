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
    expect(isSmokeDirName('--tmp--')).toBe(false)
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
