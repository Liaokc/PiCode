import { describe, expect, it } from 'vitest'
import { shellDisplayName } from '../../src/shared/terminal/shell-name'

describe('shellDisplayName', () => {
  it('uses the login shell basename from $SHELL', () => {
    expect(shellDisplayName({ SHELL: '/bin/zsh' }, 'darwin')).toBe('zsh')
    expect(shellDisplayName({ SHELL: '/usr/local/bin/fish' }, 'darwin')).toBe('fish')
    expect(shellDisplayName({ SHELL: '/opt/homebrew/bin/nu' }, 'darwin')).toBe('nu')
  })

  it('falls back to zsh when $SHELL is unset or empty', () => {
    expect(shellDisplayName({}, 'darwin')).toBe('zsh')
    expect(shellDisplayName({ SHELL: '' }, 'linux')).toBe('zsh')
  })

  it('names the Windows default shell powershell', () => {
    expect(shellDisplayName({}, 'win32')).toBe('powershell')
    expect(shellDisplayName({ SHELL: '/bin/zsh' }, 'win32')).toBe('powershell')
  })
})
