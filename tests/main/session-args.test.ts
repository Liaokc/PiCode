import { describe, expect, it } from 'vitest'
import { DEFAULTS_ARG_PREFIX, encodeSessionArgs, parseSessionArgs } from '../../src/host/session-args.ts'
import type { SessionDefaults } from '../../src/shared/preferences.ts'

describe('encodeSessionArgs / parseSessionArgs', () => {
  it('round-trips a plain create (cwd only) with no sentinel — unchanged legacy shape', () => {
    expect(encodeSessionArgs('/tmp/proj', null, null)).toEqual(['/tmp/proj'])
    const parsed = parseSessionArgs(['node', 'host.js', '/tmp/proj'])
    expect(parsed).toEqual({ cwd: '/tmp/proj', resumeFile: null, defaults: null })
  })

  it('round-trips a resume (cwd + session file)', () => {
    const argv = encodeSessionArgs('/tmp/proj', '/store/s.jsonl', null)
    expect(argv).toEqual(['/tmp/proj', '/store/s.jsonl'])
    expect(parseSessionArgs(['node', 'host.js', ...argv])).toEqual({
      cwd: '/tmp/proj',
      resumeFile: '/store/s.jsonl',
      defaults: null
    })
  })

  it('round-trips create defaults via the sentinel argument', () => {
    const defaults: SessionDefaults = { providerId: 'bella', modelId: 'GLM-5.3', thinkingLevel: 'high' }
    const argv = encodeSessionArgs('/tmp/proj', null, defaults)
    expect(argv).toHaveLength(2)
    expect(argv[1]?.startsWith(DEFAULTS_ARG_PREFIX)).toBe(true)
    expect(parseSessionArgs(['node', 'host.js', ...argv])).toEqual({
      cwd: '/tmp/proj',
      resumeFile: null,
      defaults
    })
  })

  it('encodes resume + defaults together (sentinel goes last, resume wins the file slot)', () => {
    const argv = encodeSessionArgs('/tmp/proj', '/store/s.jsonl', { thinkingLevel: 'off' })
    expect(parseSessionArgs(['node', 'host.js', ...argv])).toEqual({
      cwd: '/tmp/proj',
      resumeFile: '/store/s.jsonl',
      defaults: { thinkingLevel: 'off' }
    })
  })

  it('omits the sentinel when defaults carry no usable field', () => {
    expect(encodeSessionArgs('/tmp/proj', null, {})).toEqual(['/tmp/proj'])
    expect(parseSessionArgs(['node', 'host.js', '/tmp/proj', `${DEFAULTS_ARG_PREFIX}{bad json`])).toEqual({
      cwd: '/tmp/proj',
      resumeFile: null,
      defaults: null
    })
  })

  it('requires a cwd', () => {
    expect(() => parseSessionArgs(['node', 'host.js'])).toThrow()
  })
})
