/**
 * The ONE place a real pseudo-terminal is created inside the app (Seam-3
 * guardrail): node-pty behind the shared PtyFactory seam. Runs in the main
 * process only; the renderer sees bytes over IPC, never this module.
 * The smoke script (scripts/smoke/pty-smoke.mjs) is the only other consumer
 * of node-pty in the repository.
 */
import { spawn as ptySpawn } from 'node-pty'
import type { PtyFactory, PtyHandle } from '../../shared/terminal/pty'

function defaultShell(): string {
  return process.env['SHELL'] ?? (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh')
}

function shellEnvironment(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  // Never leak the Electron helper flag into the user's shell.
  delete env['ELECTRON_RUN_AS_NODE']
  env['TERM'] = 'xterm-256color'
  env['COLORTERM'] = 'truecolor'
  return env
}

export function nodePtyFactory(): PtyFactory {
  return ({ cwd, cols, rows }) => {
    const term = ptySpawn(defaultShell(), process.platform === 'win32' ? [] : ['--login'], {
      name: 'xterm-256color',
      cwd,
      cols,
      rows,
      env: shellEnvironment()
    })

    const handle: PtyHandle = {
      get pid(): number | null {
        return term.pid ?? null
      },
      write: (data) => {
        term.write(data)
      },
      resize: (nextCols, nextRows) => {
        term.resize(nextCols, nextRows)
      },
      kill: () => {
        try {
          term.kill()
        } catch {
          // Killing an already-dead pty (exit teardown double-kills) must not
          // throw out of the exit handler.
        }
      },
      onData: (listener) => {
        const disposable = term.onData((data) => listener(data))
        return () => disposable.dispose()
      },
      onExit: (listener) => {
        const disposable = term.onExit(({ exitCode, signal }) => {
          listener({ exitCode, signal: signal === undefined || signal === 0 ? null : String(signal) })
        })
        return () => disposable.dispose()
      }
    }
    return handle
  }
}
