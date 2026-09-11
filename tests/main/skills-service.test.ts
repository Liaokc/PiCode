import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SkillsService, type SkillsProbe } from '../../src/main/settings/skills-service'
import type { AuthProbeReport } from '../../src/shared/auth-status'
import type { SkillCatalogRow } from '../../src/shared/skills-management'

const AGENT_DIR = '/Users/op/.pi/agent'

function probeReport(rows: SkillCatalogRow[], error: string | null = null): AuthProbeReport {
  return {
    scannedAt: 1_800_000_000_000,
    providers: [],
    models: [],
    commands: [],
    skills: rows,
    skillsError: error,
    skillsScannedAt: 1_800_000_000_000,
    skillsCwd: null,
    error: null
  }
}

function row(overrides: Partial<SkillCatalogRow>): SkillCatalogRow {
  return {
    path: `${AGENT_DIR}/skills/alpha/SKILL.md`,
    entryPath: `${AGENT_DIR}/skills/alpha`,
    entryKind: 'symlink',
    realPath: '/Users/op/.agents/skills/alpha',
    name: 'alpha',
    description: 'The alpha skill',
    enabled: true,
    scope: 'user',
    origin: 'top-level',
    source: 'auto',
    baseDir: AGENT_DIR,
    broken: false,
    ...overrides
  }
}

function service(probe: SkillsProbe, agentDir?: string): SkillsService {
  return new SkillsService({ probe, agentDirOverride: agentDir ?? null })
}

describe('SkillsService — list cache', () => {
  it('probes once per directory and serves the cache afterwards', async () => {
    let calls = 0
    const svc = service(async () => {
      calls += 1
      return probeReport([row({})])
    })
    const first = await svc.listSkills(null)
    const second = await svc.listSkills(null)
    expect(calls).toBe(1)
    expect(first.rows).toHaveLength(1)
    expect(second).toBe(first)
  })

  it('force bypasses the cache and refreshes it', async () => {
    let calls = 0
    const svc = service(async () => {
      calls += 1
      return probeReport([row({ name: `v${calls}` })])
    })
    await svc.listSkills(null)
    const fresh = await svc.listSkills(null, true)
    expect(calls).toBe(2)
    expect(fresh.rows[0]?.name).toBe('v2')
  })

  it('degrades a failed probe into an error report', async () => {
    const svc = service(async () => {
      throw new Error('probe boom')
    })
    const report = await svc.listSkills(null)
    expect(report.rows).toEqual([])
    expect(report.error).toBe('probe boom')
  })

  it('reports an error when the probe carried no skills enumeration', async () => {
    const svc = service(async () => ({ scannedAt: 1, providers: [], models: [], error: null }))
    const report = await svc.listSkills(null)
    expect(report.rows).toEqual([])
    expect(report.error).toContain('no enumeration')
  })
})

describe('SkillsService — toggle writes Pi settings (sandboxed)', () => {
  function sandbox(): { dir: string; file: string } {
    const dir = mkdtempSync(path.join(tmpdir(), 'picode-skills-svc-'))
    mkdirSync(path.join(dir, 'skills'), { recursive: true })
    const file = path.join(dir, 'settings.json')
    writeFileSync(file, JSON.stringify({ theme: 'dark' }))
    return { dir, file }
  }

  it('disable writes the -pattern exclusion and preserves other keys', async () => {
    const t = sandbox()
    const svc = service(async () => probeReport([row({})]), t.dir)
    const outcome = await svc.toggleSkill(row({}), false)
    expect(outcome).toEqual({ ok: true })
    const doc = JSON.parse(readFileSync(t.file, 'utf-8'))
    expect(doc.theme).toBe('dark')
    expect(doc.skills).toEqual(['-skills/alpha/SKILL.md'])
  })

  it('enable appends the +pattern force-include', async () => {
    const t = sandbox()
    const svc = service(async () => probeReport([row({})]), t.dir)
    await svc.toggleSkill(row({}), true)
    const doc = JSON.parse(readFileSync(t.file, 'utf-8'))
    expect(doc.skills).toEqual(['+skills/alpha/SKILL.md'])
  })

  it('a broken row is refused without touching the file', async () => {
    const t = sandbox()
    const svc = service(async () => probeReport([row({})]), t.dir)
    const outcome = await svc.toggleSkill(row({ broken: true, enabled: false }), false)
    expect(outcome.ok).toBe(false)
    expect(JSON.parse(readFileSync(t.file, 'utf-8')).skills).toBeUndefined()
  })
})

describe('SkillsService — delete through the scoped editor (sandboxed)', () => {
  function sandboxWithLink(): { dir: string; file: string; target: string; link: string } {
    const dir = mkdtempSync(path.join(tmpdir(), 'picode-skills-del-'))
    const skillsDir = path.join(dir, 'skills')
    mkdirSync(skillsDir, { recursive: true })
    const target = path.join(dir, 'ssot', 'alpha')
    mkdirSync(target, { recursive: true })
    writeFileSync(path.join(target, 'SKILL.md'), '---\nname: alpha\n---\nbody')
    const link = path.join(skillsDir, 'alpha')
    symlinkSync(target, link)
    return { dir, file: path.join(dir, 'settings.json'), target, link }
  }

  it('deleting a link keeps the target directory (red line)', async () => {
    const t = sandboxWithLink()
    const svc = service(async () => probeReport([row({})]), t.dir)
    const outcome = await svc.deleteSkillEntry(t.link)
    expect(outcome).toEqual({ ok: true })
    expect(existsSync(t.link)).toBe(false)
    expect(existsSync(t.target)).toBe(true)
    expect(existsSync(path.join(t.target, 'SKILL.md'))).toBe(true)
  })

  it('refuses entries outside the skills dir', async () => {
    const t = sandboxWithLink()
    const svc = service(async () => probeReport([row({})]), t.dir)
    const outcome = await svc.deleteSkillEntry(t.target)
    expect(outcome.ok).toBe(false)
    expect(existsSync(t.target)).toBe(true)
  })
})
