/**
 * Ticket 134 (spec R21): the PATH-composition pure model, table-driven per
 * the acceptance list — login-shell snapshot / static probe points / dedup
 * and order / failure degradation / a good existing PATH never degrades.
 */

import { describe, expect, it } from 'vitest'
import { compareVersionStrings, composeSpawnPath, normalizePathEntry, resolveNvmVersion } from '../../src/shared/spawn-path'

describe('composeSpawnPath', () => {
  it('appends login-shell-only and probe-only entries after the current PATH, in order', () => {
    const composed = composeSpawnPath({
      currentPath: '/usr/bin:/bin',
      loginShellPath: '/nvm/bin:/opt/homebrew/bin:/usr/bin',
      probePaths: ['/usr/local/bin', '/usr/local/bin', '/pi/bin']
    })
    expect(composed).toBe('/usr/bin:/bin:/nvm/bin:/opt/homebrew/bin:/usr/local/bin:/pi/bin')
  })

  it('deduplicates exact entries across all three sources', () => {
    const composed = composeSpawnPath({
      currentPath: '/a:/b:/c',
      loginShellPath: '/b:/a:/d',
      probePaths: ['/c', '/d', '/e']
    })
    expect(composed).toBe('/a:/b:/c:/d:/e')
  })

  it('a probe dir with a trailing slash deduplicates against the same bare entry', () => {
    const composed = composeSpawnPath({
      currentPath: '/opt/homebrew/bin:/usr/bin',
      loginShellPath: undefined,
      probePaths: ['/opt/homebrew/bin/', '/usr/local/bin/']
    })
    expect(composed).toBe('/opt/homebrew/bin:/usr/bin:/usr/local/bin')
  })

  it.each([
    ['login shell failed', { currentPath: '/usr/bin:/bin', loginShellPath: undefined, probePaths: ['/nvm/bin'] }],
    ['login shell returned garbage', { currentPath: '/usr/bin:/bin', loginShellPath: '   ', probePaths: ['/nvm/bin'] }],
    ['no probes found', { currentPath: '/usr/bin:/bin', loginShellPath: '/nvm/bin:/usr/bin', probePaths: [] }]
  ])('degrades gracefully when %s', (_label, composition) => {
    const composed = composeSpawnPath(composition)
    expect(composed.startsWith('/usr/bin:/bin')).toBe(true)
    expect(composed).not.toContain('::')
  })

  it('every input failed → the current PATH passes through unchanged', () => {
    expect(
      composeSpawnPath({ currentPath: '/usr/bin:/bin:/usr/sbin:/sbin', loginShellPath: undefined, probePaths: [] })
    ).toBe('/usr/bin:/bin:/usr/sbin:/sbin')
  })

  it('no PATH at all and no inputs → empty composition', () => {
    expect(composeSpawnPath({ currentPath: undefined, loginShellPath: undefined, probePaths: [] })).toBe('')
  })

  it('a good existing PATH is never degraded: everything findable stays findable, order intact', () => {
    // The terminal-launch shape: the app's PATH already carries nvm first.
    const current = '/nvm/v24/bin:/opt/homebrew/bin:/usr/bin:/bin'
    const composed = composeSpawnPath({
      currentPath: current,
      loginShellPath: '/nvm/v22/bin:/opt/homebrew/bin:/usr/bin:/bin',
      probePaths: ['/usr/local/bin', '/pi/bin']
    })
    // Current entries keep their exact positions; additions only extend.
    expect(composed).toBe('/nvm/v24/bin:/opt/homebrew/bin:/usr/bin:/bin:/nvm/v22/bin:/usr/local/bin:/pi/bin')
    // The property, not just the string: every prefix lookup result of the
    // current PATH is preserved (a pure superset in order).
    expect(composed.split(':').slice(0, 4)).toEqual(current.split(':'))
  })

  it('empty PATH slots are dropped (never inject a cwd-meaning empty entry)', () => {
    const composed = composeSpawnPath({
      currentPath: '/a::/b:',
      loginShellPath: ':/c: :',
      probePaths: []
    })
    expect(composed).toBe('/a:/b:/c')
  })

  it('a single-entry current PATH still composes', () => {
    expect(composeSpawnPath({ currentPath: '/usr/bin', loginShellPath: '/nvm/bin', probePaths: ['/pi/bin'] })).toBe(
      '/usr/bin:/nvm/bin:/pi/bin'
    )
  })
})

describe('resolveNvmVersion', () => {
  it('a full default version resolves that version', () => {
    expect(resolveNvmVersion('22.19.0', ['v22.19.0', 'v24.13.0'])).toBe('v22.19.0')
  })

  it('a v-prefixed default version resolves too', () => {
    expect(resolveNvmVersion('v22.19.0', ['v22.19.0', 'v24.13.0'])).toBe('v22.19.0')
  })

  it('a major-only default resolves the HIGHEST installed version of that major', () => {
    expect(resolveNvmVersion('22', ['v22.19.0', 'v22.9.1', 'v24.13.0'])).toBe('v22.19.0')
  })

  it('a major.minor default resolves within that minor', () => {
    expect(resolveNvmVersion('22.19', ['v22.19.0', 'v22.20.1', 'v24.13.0'])).toBe('v22.19.0')
  })

  it('an unknown alias content degrades to the highest installed version', () => {
    expect(resolveNvmVersion('garbage', ['v22.19.0', 'v24.13.0'])).toBe('v24.13.0')
  })

  it.each([
    ['undefined alias', undefined],
    ['empty alias', ''],
    ['node alias (newest)', 'node'],
    ['stable alias (newest)', 'stable']
  ])('%s resolves the highest installed version', (_label, alias) => {
    expect(resolveNvmVersion(alias, ['v22.19.0', 'v24.13.0'])).toBe('v24.13.0')
  })

  it('no installed versions → null (nvm absent or empty)', () => {
    expect(resolveNvmVersion('22', [])).toBeNull()
    expect(resolveNvmVersion(undefined, [])).toBeNull()
  })

  it('a default naming an uninstalled version falls back to the highest installed', () => {
    expect(resolveNvmVersion('23.1.0', ['v22.19.0', 'v24.13.0'])).toBe('v24.13.0')
  })
})

describe('compareVersionStrings', () => {
  it.each([
    ['equal', '22.19.0', '22.19.0', 0],
    ['major wins', '23.0.0', '22.99.99', 1],
    ['minor wins', '22.20.0', '22.19.9', 1],
    ['patch wins', '22.19.1', '22.19.0', 1],
    ['v prefix tolerated', 'v22.19.0', '22.19.0', 0],
    ['missing parts count as zero', '22.19', '22.19.0', 0],
    ['non-numeric tails tie', '22.19.0-x', '22.19.0-y', 0]
  ])('%s', (_label, a, b, expected) => {
    expect(Math.sign(compareVersionStrings(a, b))).toBe(expected)
  })
})

describe('normalizePathEntry', () => {
  it('strips trailing slashes (posix and windows)', () => {
    expect(normalizePathEntry('/opt/homebrew/bin/')).toBe('/opt/homebrew/bin')
    expect(normalizePathEntry('/opt/homebrew/bin//')).toBe('/opt/homebrew/bin')
    expect(normalizePathEntry('C:\\tools\\bin\\')).toBe('C:\\tools\\bin')
  })

  it('keeps a root slash', () => {
    expect(normalizePathEntry('/')).toBe('/')
  })
})
