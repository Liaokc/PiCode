import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  deleteSkillEntry,
  entryKindOf,
  normalizeEntryPath,
  readPiSettings,
  writeSkillOverride,
  type DeleteOutcome
} from '../../src/main/settings/pi-settings-editor'

function sandbox(): string {
  return mkdtempSync(path.join(tmpdir(), 'picode-pisettings-'))
}

describe('readPiSettings', () => {
  it('returns an empty document for a missing or corrupt file', () => {
    const dir = sandbox()
    expect(readPiSettings(path.join(dir, 'settings.json'))).toEqual({})
    const file = path.join(dir, 'broken.json')
    writeFileSync(file, '{ nope')
    expect(readPiSettings(file)).toEqual({})
  })

  it('returns the parsed document', () => {
    const file = path.join(sandbox(), 'settings.json')
    writeFileSync(file, JSON.stringify({ theme: 'dark', skills: ['x'] }))
    expect(readPiSettings(file)).toEqual({ theme: 'dark', skills: ['x'] })
  })
})

describe('writeSkillOverride (the toggle write, pi config format)', () => {
  it('creates the file with just the skills array when none exists', async () => {
    const file = path.join(sandbox(), 'nested', 'settings.json')
    await writeSkillOverride(file, (doc) => ({ ...doc, skills: ['-skills/alpha/SKILL.md'] }))
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ skills: ['-skills/alpha/SKILL.md'] })
  })

  it('preserves unrelated keys byte-shape (parse → mutate → serialize)', async () => {
    const file = path.join(sandbox(), 'settings.json')
    writeFileSync(
      file,
      JSON.stringify({
        lastChangelogVersion: '0.85.1',
        defaultModel: 'GLM-5.3-flash',
        retry: { enabled: true, maxRetries: 6 }
      })
    )
    await writeSkillOverride(file, (doc) => ({ ...doc, skills: ['+skills/alpha/SKILL.md'] }))
    const after = JSON.parse(readFileSync(file, 'utf-8'))
    expect(after.lastChangelogVersion).toBe('0.85.1')
    expect(after.defaultModel).toBe('GLM-5.3-flash')
    expect(after.retry).toEqual({ enabled: true, maxRetries: 6 })
    expect(after.skills).toEqual(['+skills/alpha/SKILL.md'])
  })
})

describe('normalizeEntryPath (the rm -rf trailing-separator trap)', () => {
  it('strips trailing separators so lstat sees the LINK, not its target', () => {
    expect(normalizeEntryPath('/a/skills/alpha/')).toBe('/a/skills/alpha')
    expect(normalizeEntryPath('/a/skills/alpha//')).toBe('/a/skills/alpha')
    expect(normalizeEntryPath('/a/skills/alpha')).toBe('/a/skills/alpha')
  })
})

describe('entryKindOf', () => {
  it('classifies with lstat: symlinks stay symlinks, real dirs/files stay real', () => {
    const dir = sandbox()
    const target = path.join(dir, 'target')
    mkdirSync(target)
    writeFileSync(path.join(target, 'SKILL.md'), '---\nname: t\n---\n')
    const link = path.join(dir, 'link')
    symlinkSync(target, link)
    const realDir = path.join(dir, 'real-dir')
    mkdirSync(realDir)
    const realFile = path.join(dir, 'real.md')
    writeFileSync(realFile, '---\nname: r\n---\n')
    const dangling = path.join(dir, 'dangling')
    symlinkSync(path.join(dir, 'gone'), dangling)

    expect(entryKindOf(link)).toBe('symlink')
    expect(entryKindOf(realDir)).toBe('real-dir')
    expect(entryKindOf(realFile)).toBe('real-file')
    // A dangling link is still a symlink classification (the caller stats to
    // detect the broken state separately).
    expect(entryKindOf(dangling)).toBe('symlink')
    expect(entryKindOf(path.join(dir, 'missing'))).toBeNull()
  })
})

describe('deleteSkillEntry (the ticket-63 red line, exercised for real)', () => {
  function setup(): { root: string; piSkills: string; settingsFile: string; target: string } {
    const root = sandbox()
    const piSkills = path.join(root, 'pi-agent', 'skills')
    mkdirSync(piSkills, { recursive: true })
    const settingsFile = path.join(root, 'pi-agent', 'settings.json')
    writeFileSync(settingsFile, JSON.stringify({ theme: 'dark' }))
    const target = path.join(root, 'agents-skills', 'alpha')
    mkdirSync(target, { recursive: true })
    writeFileSync(path.join(target, 'SKILL.md'), '---\nname: alpha\n---\nThe alpha skill.')
    return { root, piSkills, settingsFile, target }
  }

  it('deleting a symlinked entry unlinks ONLY the link — the real directory survives byte-for-byte', async () => {
    const t = setup()
    const link = path.join(t.piSkills, 'alpha')
    symlinkSync(t.target, link)
    const before = readFileSync(path.join(t.target, 'SKILL.md'), 'utf-8')

    const outcome = await deleteSkillEntry({ path: link, piSkillsDir: t.piSkills })

    expect(outcome.ok).toBe(true)
    expect(existsSync(link)).toBe(false)
    // THE assertion: the SSOT target is untouched.
    expect(existsSync(t.target)).toBe(true)
    expect(readFileSync(path.join(t.target, 'SKILL.md'), 'utf-8')).toBe(before)
    expect((outcome as Extract<DeleteOutcome, { ok: true }>).kind).toBe('symlink')
  })

  it('a trailing separator cannot smuggle the delete into the target', async () => {
    const t = setup()
    const link = path.join(t.piSkills, 'alpha')
    symlinkSync(t.target, link)

    const outcome = await deleteSkillEntry({ path: `${link}/`, piSkillsDir: t.piSkills })

    expect(outcome.ok).toBe(true)
    expect(existsSync(link)).toBe(false)
    expect(existsSync(t.target)).toBe(true)
  })

  it('deleting a dangling link removes the link and nothing else', async () => {
    const t = setup()
    const dangling = path.join(t.piSkills, 'dead')
    symlinkSync(path.join(t.root, 'vanished'), dangling)
    const sibling = path.join(t.piSkills, 'sibling-link')
    symlinkSync(t.target, sibling)

    const outcome = await deleteSkillEntry({ path: dangling, piSkillsDir: t.piSkills })

    expect(outcome.ok).toBe(true)
    expect(existsSync(dangling)).toBe(false)
    expect(existsSync(t.target)).toBe(true)
    expect(existsSync(sibling)).toBe(true)
  })

  it('deleting a real directory under the pi dir removes it, not its neighbors', async () => {
    const t = setup()
    const realDir = path.join(t.piSkills, 'local-skill')
    mkdirSync(realDir)
    writeFileSync(path.join(realDir, 'SKILL.md'), '---\nname: local\n---\n')
    const sibling = path.join(t.piSkills, 'other')
    mkdirSync(sibling)

    const outcome = await deleteSkillEntry({ path: realDir, piSkillsDir: t.piSkills })

    expect(outcome.ok).toBe(true)
    expect(existsSync(realDir)).toBe(false)
    expect(existsSync(sibling)).toBe(true)
    expect(existsSync(t.target)).toBe(true)
  })

  it('REJECTS paths outside the pi skills dir (the SSOT real dir, absolute paths, traversal)', async () => {
    const t = setup()
    // The real ~/.agents-style SSOT directory — even when handed over
    // directly, the containment check refuses.
    const outside = await deleteSkillEntry({ path: t.target, piSkillsDir: t.piSkills })
    expect(outside.ok).toBe(false)
    expect(existsSync(t.target)).toBe(true)

    // A lexical sibling that only LOOKS like the skills dir.
    const lookalike = path.join(t.root, 'pi-agent', 'skills-backup', 'alpha')
    mkdirSync(path.dirname(lookalike), { recursive: true })
    mkdirSync(lookalike)
    const rejected = await deleteSkillEntry({ path: lookalike, piSkillsDir: t.piSkills })
    expect(rejected.ok).toBe(false)
    expect(existsSync(lookalike)).toBe(true)
  })

  it('REJECTS the skills dir itself and non-existent entries', async () => {
    const t = setup()
    expect((await deleteSkillEntry({ path: t.piSkills, piSkillsDir: t.piSkills })).ok).toBe(false)
    expect((await deleteSkillEntry({ path: path.join(t.piSkills, 'nope'), piSkillsDir: t.piSkills })).ok).toBe(false)
  })

  it('a symlink whose target sits outside the skills dir is still deleted as a link', async () => {
    const t = setup()
    const link = path.join(t.piSkills, 'alpha')
    symlinkSync(t.target, link)
    const outcome = await deleteSkillEntry({ path: link, piSkillsDir: t.piSkills })
    expect(outcome.ok).toBe(true)
    expect(existsSync(t.target)).toBe(true)
  })

  it('cleanup works: rmSync leaves nothing behind', () => {
    const t = setup()
    rmSync(t.piSkills, { recursive: true, force: true })
    expect(existsSync(t.piSkills)).toBe(false)
  })
})
