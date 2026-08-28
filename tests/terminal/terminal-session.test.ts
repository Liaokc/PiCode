/**
 * Seam-3 tests (spec: PTY abstraction seam) for the terminal session
 * controller: given fake-pty byte replays, assert projection into the view,
 * input relay, resize propagation, and exit handling. No real pty and no
 * xterm here — the controller only knows the minimal seam interfaces.
 */
import { describe, expect, it } from 'vitest'
import {
  TerminalSession,
  isCleanExit,
  terminalExitFrame
} from '../../src/shared/terminal/terminal-session'
import { StringView, fakePtyFactory } from './fake-pty'

const SPAWN = { cwd: '/tmp/project', cols: 80, rows: 24 }

/** Fresh session with its fixtures: factory instances + the view sink. */
function makeSession(onLifecycleChange?: (state: { phase: string }) => void): {
  session: TerminalSession
  instances: ReturnType<typeof fakePtyFactory>['instances']
  view: StringView
} {
  const { factory, instances } = fakePtyFactory()
  const view = new StringView()
  const session = new TerminalSession(factory, view, onLifecycleChange)
  session.start(SPAWN)
  return { session, instances, view }
}

describe('TerminalSession — projection (pty → view)', () => {
  it('replays pty output bytes into the view in arrival order', () => {
    const { session, instances, view } = makeSession()

    instances[0].emit('hello\r\n')
    instances[0].emit('\x1b[32mgreen\x1b[0m$ ')

    expect(session.state).toEqual({ phase: 'running' })
    expect(view.written).toEqual(['hello\r\n', '\x1b[32mgreen\x1b[0m$ '])
  })

  it('spawns the pty in the requested working directory and size', () => {
    const { instances } = makeSession()

    expect(instances).toHaveLength(1)
    expect(instances[0].spawnOptions).toEqual(SPAWN)
  })

  it('start is idempotent while a pty is already running', () => {
    const { factory, instances } = fakePtyFactory()
    const session = new TerminalSession(factory, new StringView())
    session.start(SPAWN)
    session.start({ cwd: '/elsewhere', cols: 10, rows: 10 })

    expect(instances).toHaveLength(1)
    expect(instances[0].spawnOptions?.cwd).toBe('/tmp/project')
  })
})

describe('TerminalSession — input (view → pty, user pane only)', () => {
  it('relays user keystrokes to the spawned pty', () => {
    const { session, instances } = makeSession()

    session.handleInput('echo hi\r')
    expect(instances[0].text).toBe('echo hi\r')
  })

  it('ignores input once the pty has exited', () => {
    const { session, instances } = makeSession()
    instances[0].emitExit({ exitCode: 0, signal: null })

    session.handleInput('late\r')
    expect(instances[0].text).toBe('')
  })
})

describe('TerminalSession — resize', () => {
  it('propagates new cols/rows to the pty', () => {
    const { session, instances } = makeSession()

    session.resize(120, 40)
    expect(instances[0].lastResize).toEqual({ cols: 120, rows: 40 })
  })

  it('ignores degenerate sizes and non-integers', () => {
    const { session, instances } = makeSession()

    session.resize(1, 24)
    session.resize(80, 0)
    session.resize(Number.NaN, 24)
    session.resize(80.5, 24)
    expect(instances[0].resizeCount).toBe(0)

    session.resize(2, 2)
    expect(instances[0].lastResize).toEqual({ cols: 2, rows: 2 })
  })

  it('ignores resize after exit', () => {
    const { session, instances } = makeSession()
    instances[0].emitExit({ exitCode: 0, signal: null })

    session.resize(100, 30)
    expect(instances[0].resizeCount).toBe(0)
  })
})

describe('TerminalSession — exit', () => {
  it('marks a clean exit and prints a status frame into the view', () => {
    const { session, instances, view } = makeSession()

    instances[0].emit('work\r\n')
    instances[0].emitExit({ exitCode: 0, signal: null })

    expect(session.state).toEqual({ phase: 'exited', exitCode: 0, signal: null })
    expect(isCleanExit(session.state)).toBe(true)
    expect(view.text).toContain('Session ended')
    expect(view.text).not.toContain('exit code')
  })

  it('marks an unclean exit with the exit code', () => {
    const { session, instances, view } = makeSession()

    instances[0].emitExit({ exitCode: 1, signal: null })

    expect(isCleanExit(session.state)).toBe(false)
    expect(view.text).toContain('exit code 1')
  })

  it('reports a signal death', () => {
    const { instances, view } = makeSession()

    instances[0].emitExit({ exitCode: 1, signal: '9' })

    expect(view.text).toContain('9')
  })

  it('restart() spawns a fresh pty with the same options and returns to running', () => {
    const { session, instances, view } = makeSession()
    instances[0].emitExit({ exitCode: 0, signal: null })

    session.restart()

    expect(instances).toHaveLength(2)
    expect(instances[1].spawnOptions).toEqual(SPAWN)
    expect(session.state).toEqual({ phase: 'running' })

    instances[1].emit('fresh shell\r\n')
    expect(view.text).toContain('fresh shell')
  })
})

describe('TerminalSession — lifecycle notifications', () => {
  it('notifies the observer of spawn and exit phases', () => {
    const seen: string[] = []
    const { session, instances } = makeSession((state) => seen.push(state.phase))
    expect(seen).toEqual(['running'])

    instances[0].emitExit({ exitCode: 0, signal: null })
    expect(seen).toEqual(['running', 'exited'])

    session.restart()
    // restart = kill (idle) + spawn (running): the transient idle phase is
    // part of the lifecycle contract.
    expect(seen).toEqual(['running', 'exited', 'idle', 'running'])
  })
})

describe('terminalExitFrame', () => {
  it('formats clean and unclean endings distinctly', () => {
    const clean = terminalExitFrame({ phase: 'exited', exitCode: 0, signal: null })
    expect(clean).toContain('Session ended')
    expect(clean).not.toContain('exit code')

    const failed = terminalExitFrame({ phase: 'exited', exitCode: 127, signal: null })
    expect(failed).toContain('exit code 127')
  })
})

describe('TerminalSession — teardown', () => {
  it('dispose kills the pty and unsubscribes listeners', () => {
    const { session, instances, view } = makeSession()

    session.dispose()
    expect(instances[0].killed).toBe(true)

    // Late events after dispose must not reach the view or resurrect state.
    instances[0].emit('ghost\r\n')
    instances[0].emitExit({ exitCode: 0, signal: null })
    expect(view.text).toBe('')
    expect(session.state.phase).toBe('idle')
  })
})
