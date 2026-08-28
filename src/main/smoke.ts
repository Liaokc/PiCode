/**
 * Real-Electron smoke of the live chat loop (ticket 02 acceptance). Enabled
 * only with PICODE_SMOKE=1; drives the supervisor directly so the whole
 * main→host→Pi SDK→streaming pipeline runs for real:
 *
 *   create session → prompt → first text deltas → abort → agent_end
 *   → second prompt → streamed text → host SIGKILL → host_exit(!clean)
 *   → rebuild session → clean shutdown → quit(0)
 *
 * Any missed step times out and exits non-zero. Progress logs as
 * `SMOKE <step>` lines on stdout. Not part of `npm test`.
 */

import os from 'node:os'
import { app, type BrowserWindow } from 'electron'
import type { HostSupervisor } from './host-supervisor'
import type { HostToParent } from '../shared/contract'

const STEP_TIMEOUT_MS = 90_000
const ABORT_AFTER_DELTAS = 3

export function smokeEnabled(): boolean {
  return process.env['PICODE_SMOKE'] === '1'
}

interface Waiter {
  match: (event: HostToParent) => boolean
  label: string
  resolve: (event: HostToParent) => void
  timer: NodeJS.Timeout
}

/**
 * Drive the smoke sequence against `supervisor` and return a tap for host
 * events (waiters only; the caller keeps forwarding events to the renderer).
 * Returns null when PICODE_SMOKE is unset.
 */
export function startSmokeIfEnabled(
  supervisor: HostSupervisor,
  getWindow: () => BrowserWindow | null
): ((event: HostToParent) => void) | null {
  if (!smokeEnabled()) return null
  const cwd = process.env['PICODE_SMOKE_CWD'] || os.tmpdir()
  const waiters = new Set<Waiter>()
  const log = (step: string, detail = ''): void => console.log(`SMOKE ${step}${detail ? ` ${detail}` : ''}`)

  const fail: (message: string) => never = (message) => {
    console.error(`SMOKE FAIL ${message}`)
    app.exit(1)
    throw new Error(`SMOKE FAIL ${message}`)
  }

  function onHostEvent(event: HostToParent): void {
    for (const waiter of [...waiters]) {
      if (waiter.match(event)) {
        clearTimeout(waiter.timer)
        waiters.delete(waiter)
        waiter.resolve(event)
      }
    }
  }

  function waitFor(match: (event: HostToParent) => boolean, label: string): Promise<Extract<HostToParent, { type: string }>> {
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        match,
        label,
        resolve: resolve as (event: HostToParent) => void,
        timer: setTimeout(() => {
          waiters.delete(waiter)
          reject(new Error(`${label} timed out after ${STEP_TIMEOUT_MS}ms`))
        }, STEP_TIMEOUT_MS)
      }
      waiter.timer.unref?.()
      waiters.add(waiter)
    })
  }

  async function waitForDeltas(count: number): Promise<void> {
    for (let seen = 0; seen < count; seen++) {
      await waitFor((event) => event.type === 'text_delta', 'text_delta')
    }
  }

  async function main(): Promise<void> {
    log('start', `cwd=${cwd} pid=${process.pid}`)

    // Round 1: stream a few deltas, then abort mid-flight.
    supervisor.createSession(cwd)
    const created = (await waitFor((e) => e.type === 'session_created', 'session_created')) as Extract<
      HostToParent,
      { type: 'session_created' }
    >
    log('session_created', `sessionId=${created.sessionId} model=${created.model ?? '?'}`)

    const agentStarted = waitFor((e) => e.type === 'agent_start', 'agent_start')
    supervisor.handleParentCommand({ type: 'prompt', text: 'Count slowly from one to twenty, one number per sentence.' })
    await agentStarted
    log('agent_start')

    await waitForDeltas(ABORT_AFTER_DELTAS)
    log('deltas_collected', `count=${ABORT_AFTER_DELTAS}`)

    supervisor.handleParentCommand({ type: 'abort_turn' })
    await waitFor((e) => e.type === 'agent_end', 'agent_end after abort')
    log('aborted_ok')

    // Round 2: a full turn completes.
    supervisor.handleParentCommand({ type: 'prompt', text: 'Reply with exactly: PICODE_SMOKE_OK' })
    await waitFor((e) => e.type === 'agent_end', 'agent_end round 2')
    log('second_turn_ok')

    // The renderer loop must be alive too: preload bridge → reducer → DOM.
    await withWindow(getWindow, async (win) => {
      const rendered = await waitForDom(win)
      if (!rendered) fail('renderer never rendered the streamed exchange into the DOM')
      log('renderer_dom_ok')
    })

    // Crash isolation: SIGKILL the host; supervisor must report it unclean.
    const pid = supervisor.hostPid
    if (!pid) fail('no host pid to kill')
    process.kill(pid, 'SIGKILL')
    const exitEvent = (await waitFor((e) => e.type === 'host_exit', 'host_exit')) as Extract<
      HostToParent,
      { type: 'host_exit' }
    >
    if (exitEvent.clean) fail('host_exit should be unclean after SIGKILL')
    log('host_exit', `code=${exitEvent.code} signal=${exitEvent.signal ?? '-'}`)

    // Rebuild on the same cwd, then shut the whole thing down cleanly.
    supervisor.createSession(cwd)
    await waitFor((e) => e.type === 'session_created', 'rebuild session_created')
    log('rebuild_ok')

    supervisor.shutdownAll()
    log('done')
    app.exit(0)
  }

  main().catch((err: unknown) => {
    fail(err instanceof Error ? err.message : String(err))
  })

  return onHostEvent
}

async function withWindow(
  getWindow: () => BrowserWindow | null,
  body: (win: BrowserWindow) => Promise<void>
): Promise<void> {
  const win = getWindow()
  if (!win) throw new Error('smoke window missing')
  await body(win)
}

/** Evaluated inside the page: both sides of the last exchange present? */
const DOM_EXCHANGE_PROBE = `(() => {
  const user = document.querySelector('.msg-user')?.textContent ?? ''
  const assistant = document.querySelector('.msg-assistant')?.textContent ?? ''
  return user.length > 0 && assistant.trim().length > 0
})()`

/** Poll `win` until the DOM probe passes (max 5s). */
function waitForDom(win: BrowserWindow): Promise<boolean> {
  return new Promise((resolve) => {
    let elapsed = 0
    const poll = async (): Promise<void> => {
      const ok = (await win.webContents.executeJavaScript(DOM_EXCHANGE_PROBE).catch(() => false)) as boolean
      if (ok || elapsed >= 5000) {
        resolve(ok)
        return
      }
      elapsed += 100
      setTimeout(poll, 100)
    }
    void poll()
  })
}
