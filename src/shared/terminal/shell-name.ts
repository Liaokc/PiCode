/**
 * Display name for the user's login shell (ticket 18): the dock tab strip
 * shows 「Terminal | <shell> | <session>」 like ZCode. Derived from the same
 * environment the pty factory uses to pick the shell program — kept as a
 * pure function so preload (which owns process.env) stays trivial and the
 * rule is unit-testable.
 */

/** Windows shells come from the factory's win32 default, not $SHELL. */
function windowsShellName(): string {
  return 'powershell'
}

export function shellDisplayName(env: { SHELL?: string }, platform: string): string {
  if (platform === 'win32') return windowsShellName()
  const base = env['SHELL']?.split('/').pop() ?? ''
  return base === '' ? 'zsh' : base
}
