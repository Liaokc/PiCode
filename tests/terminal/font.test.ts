import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TERMINAL_FONT_STACK,
  NERD_FONT_CANDIDATES,
  pickNerdFont,
  terminalFontStack
} from '../../src/shared/terminal/font'

describe('pickNerdFont', () => {
  it('returns the first candidate the probe reports as available', () => {
    const picked = pickNerdFont((font) => font === 'JetBrainsMono Nerd Font')
    expect(picked).toBe('JetBrainsMono Nerd Font')
  })

  it('prefers higher-priority candidates (Meslo first — the starship recommendation)', () => {
    expect(NERD_FONT_CANDIDATES[0]).toBe('MesloLGS NF')
    const picked = pickNerdFont((font) => font === 'MesloLGS NF' || font === 'Hack Nerd Font')
    expect(picked).toBe('MesloLGS NF')
  })

  it('returns null when no candidate is installed', () => {
    expect(pickNerdFont(() => false)).toBeNull()
  })
})

describe('terminalFontStack', () => {
  it('puts the detected nerd font first so starship glyphs resolve', () => {
    const stack = terminalFontStack('JetBrainsMono Nerd Font')
    expect(stack.startsWith("'JetBrainsMono Nerd Font',")).toBe(true)
    expect(stack).toContain('ui-monospace')
  })

  it('falls back to the plain mono stack without a nerd font', () => {
    expect(terminalFontStack(null)).toBe(DEFAULT_TERMINAL_FONT_STACK)
  })
})
