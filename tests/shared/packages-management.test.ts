import { describe, expect, it } from 'vitest'
import {
  derivePackageEntryToggle,
  derivePackagesArrayToggle,
  deriveProjectTrust,
  hasProjectTrustResources,
  isPackageEntryDisabled,
  isPackageRow,
  isPackagesOpDescriptor,
  isPackagesReport,
  packageCountsLabel,
  packageEntrySource,
  packagesOpRefusal,
  parsePackageSourceKind,
  projectPackageRows,
  savedTrustDecision,
  PACKAGES_UNTRUSTED_BANNER,
  PROJECT_UNTRUSTED_ERROR,
  type PackageComponentCounts,
  type PackageRow
} from '../../src/shared/packages-management'
import type { PiPackageSource } from '../../src/shared/skills-management'

/** Row builder with the common shape filled in. */
function row(overrides: Partial<PackageRow>): PackageRow {
  return {
    source: 'npm:@demo/pi-clipboard',
    kind: 'npm',
    entry: 'npm:@demo/pi-clipboard',
    autoload: null,
    counts: { extensions: 1, skills: 2, prompts: 0, themes: 1 },
    installedPath: '/Users/op/.pi/agent/npm/node_modules/@demo/pi-clipboard',
    scope: 'user',
    ...overrides
  }
}

describe('parsePackageSourceKind (source badges)', () => {
  it('classifies the three source families the SDK parses', () => {
    expect(parsePackageSourceKind('npm:@foo/bar@1.0.0')).toBe('npm')
    expect(parsePackageSourceKind('npm:pkg')).toBe('npm')
  })

  it('classifies git: shorthands and protocol URLs as git', () => {
    expect(parsePackageSourceKind('git:github.com/user/repo@v1')).toBe('git')
    expect(parsePackageSourceKind('git:git@github.com:user/repo')).toBe('git')
    expect(parsePackageSourceKind('https://github.com/user/repo')).toBe('git')
    expect(parsePackageSourceKind('http://github.com/user/repo')).toBe('git')
    expect(parsePackageSourceKind('ssh://git@github.com/user/repo@v1')).toBe('git')
    expect(parsePackageSourceKind('git://github.com/user/repo')).toBe('git')
    expect(parsePackageSourceKind('github:user/repo')).toBe('git')
  })

  it('classifies everything else as a local path (SDK parseSource fallback)', () => {
    expect(parsePackageSourceKind('/absolute/path/to/package')).toBe('local')
    expect(parsePackageSourceKind('./relative/path')).toBe('local')
    expect(parsePackageSourceKind('../up/path')).toBe('local')
    // Bare names fall through to local in the SDK (isLocalPath has no
    // objection) — the settings.md example relies on package identity, the
    // badge is informational only.
    expect(parsePackageSourceKind('pi-skills')).toBe('local')
  })
})

describe('packageEntrySource / isPackageEntryDisabled (启停 projection)', () => {
  it('reads the source from both entry forms', () => {
    expect(packageEntrySource('npm:x')).toBe('npm:x')
    expect(packageEntrySource({ source: 'npm:x', skills: [] })).toBe('npm:x')
  })

  it('disabled ⇔ object form with all four filter arrays present and empty', () => {
    expect(isPackageEntryDisabled('npm:x')).toBe(false)
    expect(isPackageEntryDisabled({ source: 'npm:x' })).toBe(false)
    expect(isPackageEntryDisabled({ source: 'npm:x', skills: [] })).toBe(false)
    expect(
      isPackageEntryDisabled({ source: 'npm:x', extensions: [], skills: [], prompts: [], themes: [] })
    ).toBe(true)
    // Non-empty filters load something → on.
    expect(
      isPackageEntryDisabled({ source: 'npm:x', extensions: [], skills: ['a.md'], prompts: [], themes: [] })
    ).toBe(false)
  })
})

describe('derivePackageEntryToggle (pi-config format derivation)', () => {
  it('disable: string entry → object form with all four arrays emptied', () => {
    const { entry, changed } = derivePackageEntryToggle('npm:@demo/pkg', false)
    expect(changed).toBe(true)
    expect(entry).toEqual({ source: 'npm:@demo/pkg', extensions: [], skills: [], prompts: [], themes: [] })
  })

  it('disable: object entry keeps other keys (autoload) and overwrites filters', () => {
    const { entry, changed } = derivePackageEntryToggle(
      { source: 'npm:@demo/pkg', autoload: false, skills: ['a.md'] },
      false
    )
    expect(changed).toBe(true)
    expect(entry).toEqual({
      source: 'npm:@demo/pkg',
      autoload: false,
      extensions: [],
      skills: [],
      prompts: [],
      themes: []
    })
  })

  it('disable: already-disabled entry is a no-op (same reference)', () => {
    const entry: PiPackageSource = { source: 'npm:x', extensions: [], skills: [], prompts: [], themes: [] }
    const { entry: next, changed } = derivePackageEntryToggle(entry, false)
    expect(changed).toBe(false)
    expect(next).toBe(entry)
  })

  it('enable: strips the empty arrays and collapses to the string form', () => {
    const disabled: PiPackageSource = {
      source: 'npm:@demo/pkg',
      extensions: [],
      skills: [],
      prompts: [],
      themes: []
    }
    const { entry, changed } = derivePackageEntryToggle(disabled, true)
    expect(changed).toBe(true)
    expect(entry).toBe('npm:@demo/pkg')
  })

  it('enable: an autoload key keeps the object form (nothing is lost)', () => {
    const disabled: PiPackageSource = {
      source: 'npm:@demo/pkg',
      autoload: false,
      extensions: [],
      skills: [],
      prompts: [],
      themes: []
    }
    const { entry, changed } = derivePackageEntryToggle(disabled, true)
    expect(changed).toBe(true)
    expect(entry).toEqual({ source: 'npm:@demo/pkg', autoload: false })
  })

  it('enable: non-empty filters survive the strip (only empty arrays go)', () => {
    const entry: PiPackageSource = { source: 'npm:x', skills: [], prompts: ['p.md'] }
    const { entry: next, changed } = derivePackageEntryToggle(entry, true)
    expect(changed).toBe(true)
    expect(next).toEqual({ source: 'npm:x', prompts: ['p.md'] })
  })

  it('enable: string / already-on entries are no-ops (same reference)', () => {
    expect(derivePackageEntryToggle('npm:x', true)).toEqual({ entry: 'npm:x', changed: false })
    const entry: PiPackageSource = { source: 'npm:x', skills: ['a.md'] }
    const { entry: next, changed } = derivePackageEntryToggle(entry, true)
    expect(changed).toBe(false)
    expect(next).toBe(entry)
  })
})

describe('derivePackagesArrayToggle (settings change derivation)', () => {
  const doc: PiPackageSource[] = ['npm:alpha', { source: 'git:github.com/u/r', themes: [] }, '/local/pkg']

  it('rewrites only the matching entry, preserving the rest', () => {
    const { packages, changed } = derivePackagesArrayToggle(doc, 'npm:alpha', false)
    expect(changed).toBe(true)
    expect(packages[0]).toEqual({ source: 'npm:alpha', extensions: [], skills: [], prompts: [], themes: [] })
    expect(packages[1]).toBe(doc[1])
    expect(packages[2]).toBe('/local/pkg')
  })

  it('finds object-form entries by their source string', () => {
    const { packages, changed } = derivePackagesArrayToggle(doc, 'git:github.com/u/r', true)
    expect(changed).toBe(true)
    expect(packages[1]).toBe('git:github.com/u/r')
  })

  it('is a no-op when the source is absent (removed elsewhere mid-flight)', () => {
    const { packages, changed } = derivePackagesArrayToggle(doc, 'npm:vanishes', true)
    expect(changed).toBe(false)
    expect(packages).toEqual(doc)
  })

  it('is a no-op when the state already matches', () => {
    const { packages, changed } = derivePackagesArrayToggle(doc, '/local/pkg', true)
    expect(changed).toBe(false)
    expect(packages).toEqual(doc)
  })
})

describe('projectPackageRows (list projection: 来源/作用域/启停)', () => {
  it('labels badges, projects disable state, and sorts npm → git → local', () => {
    const views = projectPackageRows([
      row({ source: '/zoo/pkg', kind: 'local', entry: '/zoo/pkg' }),
      row({ source: 'git:github.com/u/r', kind: 'git', entry: 'git:github.com/u/r' }),
      row({ source: 'npm:aaa', kind: 'npm', entry: 'npm:aaa' }),
      row({ source: 'npm:bbb', kind: 'npm', entry: 'npm:bbb' })
    ])
    expect(views.map((v) => v.source)).toEqual(['npm:aaa', 'npm:bbb', 'git:github.com/u/r', '/zoo/pkg'])
    expect(views.map((v) => v.badgeLabel)).toEqual(['NPM', 'NPM', 'Git', 'Local'])
    expect(views.every((v) => v.disabled === false)).toBe(true)
  })

  it('carries the disabled flag from the entry shape', () => {
    const views = projectPackageRows([
      row({
        entry: { source: 'npm:@demo/pi-clipboard', extensions: [], skills: [], prompts: [], themes: [] }
      })
    ])
    expect(views[0]?.disabled).toBe(true)
  })

  it('renders counts labels with pluralization, omitting zero types', () => {
    const counts: PackageComponentCounts = { extensions: 2, skills: 1, prompts: 0, themes: 3 }
    expect(packageCountsLabel(counts)).toBe('2 extensions · 1 skill · 3 themes')
    expect(packageCountsLabel({ extensions: 0, skills: 0, prompts: 0, themes: 0 })).toBe('')
  })

  it('unresolved rows carry a presence note by kind (not installed vs missing)', () => {
    const views = projectPackageRows([
      row({ source: 'npm:ghost', counts: null, installedPath: null }),
      row({ source: '/gone/pkg', kind: 'local', counts: null, installedPath: null })
    ])
    expect(views[0]?.statusNote).toBe('Not installed')
    expect(views[0]?.countsLabel).toBeNull()
    expect(views[1]?.statusNote).toBe('Source missing')
  })
})

describe('deriveProjectTrust (信任态派生 — ask-无决策 = untrusted)', () => {
  it('a saved decision always wins', () => {
    expect(
      deriveProjectTrust({ savedDecision: true, defaultProjectTrust: 'never', hasResources: true })
    ).toEqual({ decision: 'trusted', trusted: true, hasResources: true })
    expect(
      deriveProjectTrust({ savedDecision: false, defaultProjectTrust: 'always', hasResources: true })
    ).toEqual({ decision: 'untrusted', trusted: false, hasResources: true })
  })

  it('no decision + ask (the default) derives untrusted', () => {
    expect(
      deriveProjectTrust({ savedDecision: null, defaultProjectTrust: 'ask', hasResources: true })
    ).toEqual({ decision: 'none', trusted: false, hasResources: true })
  })

  it('no decision + never derives untrusted; always derives trusted', () => {
    expect(
      deriveProjectTrust({ savedDecision: null, defaultProjectTrust: 'never', hasResources: false }).trusted
    ).toBe(false)
    expect(
      deriveProjectTrust({ savedDecision: null, defaultProjectTrust: 'always', hasResources: false }).trusted
    ).toBe(true)
  })

  it('an unknown/absent default derives untrusted (safe default)', () => {
    expect(deriveProjectTrust({ savedDecision: null, defaultProjectTrust: null, hasResources: true }).trusted).toBe(
      false
    )
    expect(deriveProjectTrust({ savedDecision: null, defaultProjectTrust: 'bogus', hasResources: true }).trusted).toBe(
      false
    )
  })
})

describe('savedTrustDecision (trust.json nearest-parent walk)', () => {
  const doc = {
    '/Users/op': false,
    '/Users/op/Projects': null,
    '/Users/op/Projects/picode': true
  }

  it('the cwd itself first, then the nearest parent', () => {
    expect(savedTrustDecision(doc, '/Users/op/Projects/picode')).toBe(true)
    expect(savedTrustDecision(doc, '/Users/op/Projects/picode/src')).toBe(true)
    expect(savedTrustDecision(doc, '/Users/op/Projects/other')).toBe(false)
    expect(savedTrustDecision(doc, '/Users/op/Projects/other/deep')).toBe(false)
  })

  it('null decisions are skipped (they mean "cleared")', () => {
    expect(savedTrustDecision(doc, '/Users/op/Projects/other')).toBe(false)
    expect(savedTrustDecision(doc, '/Users/op/Projects/other/deep')).toBe(false)
  })

  it('no decision anywhere → null', () => {
    expect(savedTrustDecision(doc, '/etc')).toBeNull()
    expect(savedTrustDecision({}, '/Users/op')).toBeNull()
  })

  it('trailing separators do not break the walk', () => {
    expect(savedTrustDecision(doc, '/Users/op/Projects/picode/')).toBe(true)
  })

  it('root without a decision terminates the walk', () => {
    expect(savedTrustDecision(doc, '/opt')).toBeNull()
  })
})

describe('hasProjectTrustResources (trust-gated resource check)', () => {
  it('trust-requiring entries under cwd/.pi count', () => {
    const existing = new Set(['/proj/.pi/settings.json'])
    const exists = (p: string): boolean => existing.has(p)
    expect(hasProjectTrustResources('/proj', '/Users/op', exists)).toBe(true)
  })

  it('.agents/skills in the cwd or an ancestor counts', () => {
    const existing = new Set(['/proj/.agents/skills'])
    const exists = (p: string): boolean => existing.has(p)
    expect(hasProjectTrustResources('/proj/sub', '/Users/op', exists)).toBe(true)
  })

  it('the user ~/.agents/skills never counts', () => {
    const existing = new Set(['/Users/op/.agents/skills'])
    const exists = (p: string): boolean => existing.has(p)
    expect(hasProjectTrustResources('/Users/op/proj', '/Users/op', exists)).toBe(false)
  })

  it('nothing present → false', () => {
    expect(hasProjectTrustResources('/proj', '/Users/op', () => false)).toBe(false)
  })
})

describe('PACKAGES_UNTRUSTED_BANNER (the honest banner copy)', () => {
  it('states that Pi is not loading the project resources and where to decide', () => {
    expect(PACKAGES_UNTRUSTED_BANNER).toContain('not loaded by Pi')
    expect(PACKAGES_UNTRUSTED_BANNER).toContain('/trust')
  })
})

describe('packagesOpRefusal (the pi install -l gate, pure)', () => {
  it('global ops never need trust', () => {
    expect(packagesOpRefusal(false, false)).toBeNull()
    expect(packagesOpRefusal(false, true)).toBeNull()
  })

  it('project ops are refused for untrusted projects with the pi-tone message', () => {
    expect(packagesOpRefusal(true, false)).toBe(PROJECT_UNTRUSTED_ERROR)
    expect(PROJECT_UNTRUSTED_ERROR).toContain('not trusted')
    expect(PROJECT_UNTRUSTED_ERROR).toContain('/trust')
  })

  it('project ops pass for trusted projects', () => {
    expect(packagesOpRefusal(true, true)).toBeNull()
  })
})

describe('isPackagesOpDescriptor (op host argv guard)', () => {
  it('accepts well-formed descriptors and rejects junk', () => {
    expect(
      isPackagesOpDescriptor({ op: 'install', source: 'npm:x', local: false, cwd: '/p', agentDir: null })
    ).toBe(true)
    expect(
      isPackagesOpDescriptor({ op: 'remove', source: '/pkg', local: true, cwd: '/p', agentDir: '/sandbox' })
    ).toBe(true)
    expect(isPackagesOpDescriptor(null)).toBe(false)
    expect(isPackagesOpDescriptor({ op: 'update', source: 'npm:x', local: false, cwd: '/p', agentDir: null })).toBe(
      false
    )
    expect(isPackagesOpDescriptor({ op: 'install', source: '  ', local: false, cwd: '/p', agentDir: null })).toBe(
      false
    )
    expect(isPackagesOpDescriptor({ op: 'install', source: 'npm:x', local: false, cwd: '', agentDir: null })).toBe(
      false
    )
  })
})

describe('structural guards (probe → main IPC)', () => {
  it('isPackageRow accepts well-formed rows and rejects junk', () => {
    expect(isPackageRow(row({}))).toBe(true)
    expect(isPackageRow(row({ entry: { source: 'npm:x', skills: [] } }))).toBe(true)
    expect(isPackageRow(row({ counts: null }))).toBe(true)
    expect(isPackageRow(null)).toBe(false)
    expect(isPackageRow({ ...row({}), kind: 'bogus' })).toBe(false)
    expect(isPackageRow({ ...row({}), source: 42 })).toBe(false)
    expect(isPackageRow({ ...row({}), counts: { extensions: 'x', skills: 0, prompts: 0, themes: 0 } })).toBe(false)
    expect(isPackageRow({ ...row({}), scope: 'temporary' })).toBe(false)
  })

  it('isPackagesReport accepts well-formed reports and rejects junk', () => {
    expect(
      isPackagesReport({
        cwd: '/proj',
        scannedAt: 1,
        global: [row({})],
        project: [],
        trust: { decision: 'none', trusted: false, hasResources: true },
        error: null
      })
    ).toBe(true)
    expect(isPackagesReport({ cwd: null, scannedAt: 1, global: [], project: [], trust: null, error: null })).toBe(true)
    expect(isPackagesReport(null)).toBe(false)
    expect(
      isPackagesReport({ cwd: null, scannedAt: 1, global: [{}], project: [], trust: null, error: null })
    ).toBe(false)
    expect(
      isPackagesReport({ cwd: null, scannedAt: 1, global: [], project: [], trust: { decision: 'bogus' }, error: null })
    ).toBe(false)
  })
})
