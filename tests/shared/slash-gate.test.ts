import { describe, expect, it } from 'vitest'
import { RETIRED_SLASH_GUIDANCE, gateSlashCommand } from '../../src/shared/composer/slash-gate'

/**
 * Ticket 38 (spec R10): the six built-in slash commands PiCode supersedes
 * with better UI are retired — the `/` menu drops them and typing them
 * (bare or with arguments) is gated with a pointer toast instead of
 * producing a garbage model round. The gate is a table-driven pure
 * function (Seam-1, keymap.ts precedent): text → { hint } | null.
 */
describe('gateSlashCommand (the retired-slash send gate)', () => {
  it('intercepts every retired command typed bare', () => {
    for (const name of Object.keys(RETIRED_SLASH_GUIDANCE)) {
      const decision = gateSlashCommand(`/${name}`)
      expect(decision, `/${name} must be gated`).not.toBeNull()
      expect(decision!.hint).toBe(`/${name} — ${RETIRED_SLASH_GUIDANCE[name]}`)
    }
  })

  it('intercepts the with-arguments form', () => {
    expect(gateSlashCommand('/name my task')).toEqual({
      hint: `/name — ${RETIRED_SLASH_GUIDANCE['name']}`
    })
    expect(gateSlashCommand('/model sonnet')).not.toBeNull()
    expect(gateSlashCommand('/new --force')).not.toBeNull()
  })

  it('trims surrounding whitespace before judging', () => {
    expect(gateSlashCommand('  /copy  ')).not.toBeNull()
    expect(gateSlashCommand('/tree\n')).not.toBeNull()
  })

  it('keeps /compact sendable (the one retained built-in)', () => {
    expect(gateSlashCommand('/compact')).toBeNull()
    expect(gateSlashCommand('/compact now')).toBeNull()
  })

  it('ignores commands that merely share a prefix', () => {
    expect(gateSlashCommand('/modelx')).toBeNull()
    expect(gateSlashCommand('/nameplate')).toBeNull()
    expect(gateSlashCommand('/copy2')).toBeNull()
  })

  it('leaves unknown and prompt-template commands untouched', () => {
    expect(gateSlashCommand('/review')).toBeNull()
    expect(gateSlashCommand('/skill:researcher')).toBeNull()
    expect(gateSlashCommand('/login')).toBeNull()
  })

  it('only judges leading commands, not mentions in prose', () => {
    expect(gateSlashCommand('remember to run /model later')).toBeNull()
    expect(gateSlashCommand('the /new command is nice')).toBeNull()
  })

  it('passes plain text through', () => {
    expect(gateSlashCommand('fix the flaky auth test')).toBeNull()
    expect(gateSlashCommand('')).toBeNull()
    expect(gateSlashCommand('/')).toBeNull()
  })
})
