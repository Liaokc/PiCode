import { describe, expect, it } from 'vitest'
import {
  basenamePath,
  buildSkillCatalogRow,
  deriveSkillSettingsChange,
  dirnamePath,
  filterSkillRows,
  isSkillCatalogRow,
  isSkillsReport,
  isUnderPiSkillsDir,
  overrideEntryTarget,
  packageSkillPatternFor,
  partitionSkillRows,
  peekSkillIdentity,
  projectSkillRows,
  relativePath,
  skillDeleteCopy,
  skillDeleteKind,
  skillPatternFor,
  skillSourceBadge,
  type PiPackageSource,
  type SkillCatalogRow
} from '../../src/shared/skills-management'

const PI_DIR = '/Users/op/.pi/agent/skills'
const AGENT_DIR = '/Users/op/.pi/agent'

/** Row builder with the common shape filled in. */
function row(overrides: Partial<SkillCatalogRow>): SkillCatalogRow {
  return {
    path: `${PI_DIR}/alpha/SKILL.md`,
    entryPath: null,
    entryKind: null,
    realPath: null,
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

describe('skillSourceBadge', () => {
  it('maps origin/scope to the three badges (Q10=A)', () => {
    expect(skillSourceBadge({ origin: 'package', scope: 'user' })).toBe('package')
    expect(skillSourceBadge({ origin: 'package', scope: 'project' })).toBe('package')
    expect(skillSourceBadge({ origin: 'top-level', scope: 'project' })).toBe('project')
    expect(skillSourceBadge({ origin: 'top-level', scope: 'user' })).toBe('user')
    expect(skillSourceBadge({ origin: 'top-level', scope: 'temporary' })).toBe('user')
  })
})

describe('isUnderPiSkillsDir / skillDeleteKind (delete scope red line)', () => {
  it('accepts the dir itself and entries inside it', () => {
    expect(isUnderPiSkillsDir(PI_DIR, PI_DIR)).toBe(true)
    expect(isUnderPiSkillsDir(`${PI_DIR}/alpha/SKILL.md`, PI_DIR)).toBe(true)
    expect(isUnderPiSkillsDir(`${PI_DIR}/alpha`, PI_DIR)).toBe(true)
  })

  it('rejects look-alike siblings and outside paths', () => {
    expect(isUnderPiSkillsDir(`${PI_DIR}-backup/alpha`, PI_DIR)).toBe(false)
    expect(isUnderPiSkillsDir('/Users/op/.agents/skills/alpha/SKILL.md', PI_DIR)).toBe(false)
    expect(isUnderPiSkillsDir('/Users/op/.pi/agent/skills.doc/x', PI_DIR)).toBe(false)
    expect(isUnderPiSkillsDir('/etc/passwd', PI_DIR)).toBe(false)
  })

  it('deletes only pi-dir entries; package skills are never deletable', () => {
    // The machine's real shape: a symlink under the pi dir pointing at the
    // ~/.agents SSOT — the link is deletable, the target path is NOT.
    expect(skillDeleteKind(row({ entryPath: `${PI_DIR}/alpha`, entryKind: 'symlink', realPath: '/Users/op/.agents/skills/alpha' }))).toBe('link')
    expect(skillDeleteKind(row({ entryPath: `${PI_DIR}/alpha`, entryKind: 'symlink', realPath: null, broken: true }))).toBe('link')
    expect(skillDeleteKind(row({ entryPath: `${PI_DIR}/alpha`, entryKind: 'real-dir' }))).toBe('real')
    expect(skillDeleteKind(row({ entryPath: `${PI_DIR}/alpha.md`, entryKind: 'real-file', path: `${PI_DIR}/alpha.md` }))).toBe('real')
    // The SSOT real directory itself: not a pi-dir entry → untouchable.
    expect(skillDeleteKind(row({ path: '/Users/op/.agents/skills/alpha/SKILL.md', entryPath: null, entryKind: null, baseDir: '/Users/op/.agents' }))).toBeNull()
    // Package rows: deletion never appears even if installed under the dir.
    expect(
      skillDeleteKind(
        row({ origin: 'package', source: 'npm:acme/skills', entryPath: `${PI_DIR}/alpha`, entryKind: 'real-dir' })
      )
    ).toBeNull()
    // Unknown classification → conservative null.
    expect(skillDeleteKind(row({ entryPath: `${PI_DIR}/alpha`, entryKind: null }))).toBeNull()
  })
})

describe('skillDeleteCopy (type-split confirm copy, ZCode semantics)', () => {
  it('link copy names the preserved real directory', () => {
    const copy = skillDeleteCopy('link', '/Users/op/.agents/skills/alpha')
    expect(copy).toContain('only the link')
    expect(copy).toContain('/Users/op/.agents/skills/alpha')
    expect(copy).toContain('is not touched')
  })

  it('broken-link copy makes clear nothing else is touched', () => {
    expect(skillDeleteCopy('link', null)).toContain('broken link')
  })

  it('real-directory copy warns it is irreversible', () => {
    const copy = skillDeleteCopy('real', null)
    expect(copy).toContain('removed from disk')
    expect(copy).toContain('cannot be undone')
  })
})

describe('projectSkillRows (list projection: badge/path/enabled dimensions)', () => {
  it('groups user → package → project and sorts by name inside each group', () => {
    const view = projectSkillRows([
      row({ name: 'zeta', path: `${PI_DIR}/zeta/SKILL.md` }),
      row({ name: 'beta', origin: 'package', source: 'npm:acme', baseDir: '/pkg/acme' }),
      row({ name: 'mid', scope: 'project', baseDir: '/work/.pi', path: '/work/.pi/skills/mid/SKILL.md' }),
      row({ name: 'alpha' })
    ])
    expect(view.map((v) => `${v.badge}:${v.name}`)).toEqual([
      'user:alpha',
      'user:zeta',
      'package:beta',
      'project:mid'
    ])
    expect(view.every((v) => v.badgeLabel.length > 0)).toBe(true)
  })

  it('carries enabled and broken flags through verbatim (truthful echo)', () => {
    const view = projectSkillRows([
      row({ name: 'on' }),
      row({ name: 'off', enabled: false }),
      row({ name: 'dead', enabled: false, broken: true, entryPath: `${PI_DIR}/dead`, entryKind: 'symlink', path: `${PI_DIR}/dead`, description: null })
    ])
    const byName = new Map(view.map((v) => [v.name, v]))
    expect(byName.get('on')?.enabled).toBe(true)
    expect(byName.get('off')?.enabled).toBe(false)
    expect(byName.get('dead')?.broken).toBe(true)
    expect(byName.get('dead')?.deleteKind).toBe('link')
  })
})

describe('overrideEntryTarget / patterns', () => {
  it('strips the three override markers only', () => {
    expect(overrideEntryTarget('-skills/alpha/SKILL.md')).toBe('skills/alpha/SKILL.md')
    expect(overrideEntryTarget('+skills/alpha/SKILL.md')).toBe('skills/alpha/SKILL.md')
    expect(overrideEntryTarget('!skills/alpha/SKILL.md')).toBe('skills/alpha/SKILL.md')
    expect(overrideEntryTarget('skills/alpha/SKILL.md')).toBe('skills/alpha/SKILL.md')
  })

  it('patterns are relative to the metadata baseDir (pi config rule)', () => {
    expect(skillPatternFor(row({ baseDir: AGENT_DIR }), AGENT_DIR)).toBe('skills/alpha/SKILL.md')
    // ~/.agents rows anchor at their own baseDir.
    expect(
      skillPatternFor(
        row({ path: '/Users/op/.agents/skills/alpha/SKILL.md', baseDir: '/Users/op/.agents' }),
        AGENT_DIR
      )
    ).toBe('skills/alpha/SKILL.md')
    // Missing metadata → the agent dir anchors.
    expect(skillPatternFor(row({ baseDir: null }), AGENT_DIR)).toBe('skills/alpha/SKILL.md')
    // Package rows anchor at the package root.
    expect(packageSkillPatternFor(row({ path: '/pkg/acme/skills/alpha/SKILL.md', baseDir: '/pkg/acme' }))).toBe(
      'skills/alpha/SKILL.md'
    )
  })

  it('relativePath handles the pure-POSIX cases the patterns hit', () => {
    expect(relativePath('/a/b', '/a/b/c/d')).toBe('c/d')
    expect(relativePath('/a/b/c', '/a/b/x')).toBe('../x')
    expect(relativePath('/a/b', '/a/b')).toBe('.')
  })

  it('dirnamePath/basenamePath cover the entry derivations', () => {
    expect(dirnamePath('/a/b/SKILL.md')).toBe('/a/b')
    expect(basenamePath('/a/b/SKILL.md')).toBe('SKILL.md')
  })
})

describe('deriveSkillSettingsChange (top-level rows → settings.skills)', () => {
  const alpha = row({ baseDir: AGENT_DIR })

  it('disable appends the -pattern exclusion, pi-config format', () => {
    const { settings, changed } = deriveSkillSettingsChange({ skills: [] }, alpha, false, AGENT_DIR)
    expect(changed).toBe(true)
    expect(settings.skills).toEqual(['-skills/alpha/SKILL.md'])
  })

  it('enable appends the +pattern force-include', () => {
    const { settings } = deriveSkillSettingsChange({ skills: [] }, alpha, true, AGENT_DIR)
    expect(settings.skills).toEqual(['+skills/alpha/SKILL.md'])
  })

  it('strips every existing override form for the same pattern first', () => {
    const { settings } = deriveSkillSettingsChange(
      { skills: ['-skills/alpha/SKILL.md', '!skills/alpha/SKILL.md', 'unrelated'] },
      alpha,
      true,
      AGENT_DIR
    )
    expect(settings.skills).toEqual(['unrelated', '+skills/alpha/SKILL.md'])
  })

  it('is idempotent when the desired state is already the whole array', () => {
    const { settings, changed } = deriveSkillSettingsChange(
      { skills: ['-skills/alpha/SKILL.md'] },
      alpha,
      false,
      AGENT_DIR
    )
    expect(changed).toBe(false)
    expect(settings.skills).toEqual(['-skills/alpha/SKILL.md'])
  })

  it('preserves unrelated entries and their order', () => {
    const { settings } = deriveSkillSettingsChange(
      { skills: ['skills/keep/**', '-other/SKILL.md'] },
      alpha,
      false,
      AGENT_DIR
    )
    expect(settings.skills).toEqual(['skills/keep/**', '-other/SKILL.md', '-skills/alpha/SKILL.md'])
  })

  it('works when the settings have no skills key yet', () => {
    const { settings, changed } = deriveSkillSettingsChange({}, alpha, false, AGENT_DIR)
    expect(changed).toBe(true)
    expect(settings.skills).toEqual(['-skills/alpha/SKILL.md'])
    expect(settings.packages).toBeUndefined()
  })
})

describe('deriveSkillSettingsChange (package rows → packages entry filter)', () => {
  const pkgRow = row({
    origin: 'package',
    source: 'npm:acme/pi-skills',
    path: '/install/acme/skills/alpha/SKILL.md',
    baseDir: '/install/acme'
  })

  it('promotes a string package entry to object form with the filter (pi config format)', () => {
    const packages: PiPackageSource[] = ['npm:acme/pi-skills', 'git:example/other']
    const { settings, changed } = deriveSkillSettingsChange({ packages }, pkgRow, false, AGENT_DIR)
    expect(changed).toBe(true)
    expect(settings.packages).toEqual([
      { source: 'npm:acme/pi-skills', skills: ['-skills/alpha/SKILL.md'] },
      'git:example/other'
    ])
  })

  it('keeps existing filters and autoload on an object entry', () => {
    const packages: PiPackageSource[] = [
      { source: 'npm:acme/pi-skills', autoload: false, prompts: ['+prompts/x.md'] }
    ]
    const { settings } = deriveSkillSettingsChange({ packages }, pkgRow, false, AGENT_DIR)
    expect(settings.packages).toEqual([
      { source: 'npm:acme/pi-skills', autoload: false, prompts: ['+prompts/x.md'], skills: ['-skills/alpha/SKILL.md'] }
    ])
  })

  it('toggles an existing filter in place (strips then appends)', () => {
    const packages: PiPackageSource[] = [{ source: 'npm:acme/pi-skills', skills: ['-skills/alpha/SKILL.md'] }]
    const { settings } = deriveSkillSettingsChange({ packages }, pkgRow, true, AGENT_DIR)
    expect(settings.packages).toEqual([{ source: 'npm:acme/pi-skills', skills: ['+skills/alpha/SKILL.md'] }])
  })

  it('stays in object form when the desired filter is already the whole array (idempotent)', () => {
    // The derivation always appends, so pi config's empty-filter cleanup is
    // unreachable here — the observable contract is: a satisfied toggle is a
    // no-op that returns the same shape.
    const packages: PiPackageSource[] = [{ source: 'npm:acme/pi-skills', skills: ['+skills/alpha/SKILL.md'] }]
    const { settings, changed } = deriveSkillSettingsChange({ packages }, pkgRow, true, AGENT_DIR)
    expect(changed).toBe(false)
    expect(settings.packages).toEqual([{ source: 'npm:acme/pi-skills', skills: ['+skills/alpha/SKILL.md'] }])
  })

  it('leaves settings untouched when the package is not configured', () => {
    const settings: PiResourceSettingsInput = { skills: ['x'] }
    const { settings: next, changed } = deriveSkillSettingsChange(settings, pkgRow, false, AGENT_DIR)
    expect(changed).toBe(false)
    expect(next).toBe(settings)
  })

  it('leaves settings untouched when the source matches but identity differs', () => {
    const packages: PiPackageSource[] = ['git:example/other']
    const { changed } = deriveSkillSettingsChange({ packages }, pkgRow, false, AGENT_DIR)
    expect(changed).toBe(false)
  })
})

type PiResourceSettingsInput = Parameters<typeof deriveSkillSettingsChange>[0]

describe('peekSkillIdentity (frontmatter fallback for unloaded rows)', () => {
  it('reads name and description scalars', () => {
    expect(
      peekSkillIdentity('---\nname: my-skill\ndescription: Does things well.\n---\n\n# Body\n')
    ).toEqual({ name: 'my-skill', description: 'Does things well.' })
  })

  it('unquotes values and tolerates missing keys', () => {
    expect(peekSkillIdentity("---\nname: 'quoted'\n---\nbody")).toEqual({ name: 'quoted', description: null })
    expect(peekSkillIdentity('no frontmatter here')).toEqual({ name: null, description: null })
    expect(peekSkillIdentity('---\nbroken')).toEqual({ name: null, description: null })
  })
})

describe('buildSkillCatalogRow (identity fallback chain + as-loaded truth)', () => {
  const resource = {
    path: `${PI_DIR}/alpha/SKILL.md`,
    enabled: true,
    scope: 'user',
    origin: 'top-level',
    source: 'auto',
    baseDir: AGENT_DIR
  }

  it('prefers the loaded face, then frontmatter, then the directory name', () => {
    const loaded = buildSkillCatalogRow(resource, {
      loaded: { name: 'loaded-name', description: 'loaded description' },
      entryPath: `${PI_DIR}/alpha`,
      entryKind: 'symlink',
      realPath: '/Users/op/.agents/skills/alpha'
    })
    expect(loaded.name).toBe('loaded-name')
    expect(loaded.enabled).toBe(true)
    expect(loaded.realPath).toBe('/Users/op/.agents/skills/alpha')

    const peeked = buildSkillCatalogRow(resource, {
      frontmatter: { name: 'fm-name', description: null },
      entryPath: `${PI_DIR}/alpha`,
      entryKind: 'symlink',
      realPath: '/Users/op/.agents/skills/alpha'
    })
    expect(peeked.name).toBe('fm-name')
    expect(peeked.description).toBeNull()

    const fallback = buildSkillCatalogRow(resource, {})
    expect(fallback.name).toBe('alpha')
  })

  it('marks broken rows disabled regardless of the enabled flag', () => {
    const brokenRow = buildSkillCatalogRow(resource, {
      entryPath: PI_DIR,
      entryKind: 'symlink',
      realPath: null,
      broken: true
    })
    expect(brokenRow.broken).toBe(true)
    expect(brokenRow.enabled).toBe(false)
  })

  it('enabled is true only when the resource is enabled AND actually loaded', () => {
    const shadowed = buildSkillCatalogRow(resource, { frontmatter: { name: 'x', description: null } })
    expect(shadowed.enabled).toBe(false)
  })

  it('falls back to temporary/top-level for unknown scope/origin strings', () => {
    const weird = buildSkillCatalogRow({ ...resource, scope: '??', origin: '??' }, {})
    expect(weird.scope).toBe('temporary')
    expect(weird.origin).toBe('top-level')
  })
})

describe('isSkillCatalogRow / report guard', () => {
  it('accepts a valid row and rejects junk', async () => {
    const valid = buildSkillCatalogRow(
      { path: '/p/SKILL.md', enabled: true, scope: 'user', origin: 'top-level', source: 'auto' },
      {}
    )
    expect(isSkillCatalogRow(valid)).toBe(true)
    expect(isSkillCatalogRow({ ...valid, enabled: 'yes' })).toBe(false)
    expect(isSkillCatalogRow(null)).toBe(false)
    expect(isSkillCatalogRow({ ...valid, scope: 'galaxy' })).toBe(false)
    const { isSkillsReport } = await import('../../src/shared/skills-management')
    expect(isSkillsReport({ cwd: null, scannedAt: 1, rows: [valid], error: null })).toBe(true)
    expect(isSkillsReport({ cwd: null, scannedAt: 1, rows: ['x'], error: null })).toBe(false)
  })
})

describe('partitionSkillRows + filterSkillRows (ticket 67: two-card split + skill search)', () => {
  const views = projectSkillRows([
    row({ name: 'user-skill', path: `${PI_DIR}/user-skill/SKILL.md`, scope: 'user', origin: 'top-level' }),
    row({ name: 'pkg-skill', path: '/install/pkg/skills/pkg-skill/SKILL.md', scope: 'user', origin: 'package', source: 'npm:@demo/pkg' }),
    row({ name: 'proj-skill', path: '/proj/.pi/skills/proj-skill/SKILL.md', scope: 'project', origin: 'top-level' }),
    row({ name: 'proj-pkg-skill', path: '/proj/.pi/npm/pkg/skills/x/SKILL.md', scope: 'project', origin: 'package', source: 'npm:@proj/pkg' })
  ])

  it('splits by scope: global = user+package, project = project', () => {
    const { global, project } = partitionSkillRows(views)
    expect(global.map((r) => r.name)).toEqual(['user-skill', 'pkg-skill'])
    expect(project.map((r) => r.name)).toEqual(['proj-pkg-skill', 'proj-skill'])
  })

  it('the union of both cards is the full loading surface', () => {
    const { global, project } = partitionSkillRows(views)
    expect([...global, ...project].length).toBe(views.length)
  })

  it('empty query returns every row (same order, copied)', () => {
    expect(filterSkillRows(views, '')).toHaveLength(4)
    expect(filterSkillRows(views, '   ')).toHaveLength(4)
  })

  it('matches name, description, and path case-insensitively', () => {
    expect(filterSkillRows(views, 'PROJ-SKILL').map((r) => r.name)).toEqual(['proj-skill'])
    expect(filterSkillRows(views, 'clipboard').map((r) => r.name)).toEqual([])
    const described = projectSkillRows([row({ name: 'alpha', description: 'Runs the nightly Suite' })])
    expect(filterSkillRows(described, 'nightly').map((r) => r.name)).toEqual(['alpha'])
    expect(filterSkillRows(views, '/proj/.pi').map((r) => r.name)).toEqual(['proj-pkg-skill', 'proj-skill'])
  })

  it('the search applies to BOTH cards (the one entry filters everything)', () => {
    const { global, project } = partitionSkillRows(views)
    expect(filterSkillRows(global, 'pkg')).toHaveLength(1)
    expect(filterSkillRows(project, 'pkg')).toHaveLength(1)
  })

  it('the report guard accepts the optional trust field (ticket 67, additive)', () => {
    const base = { cwd: '/p', scannedAt: 1, rows: [], error: null }
    expect(isSkillsReport(base)).toBe(true)
    expect(isSkillsReport({ ...base, trust: { decision: 'none', trusted: false, hasResources: true } })).toBe(true)
    expect(isSkillsReport({ ...base, trust: null })).toBe(true)
    expect(isSkillsReport({ ...base, trust: { decision: 'bogus' } })).toBe(false)
  })
})
