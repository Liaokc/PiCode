/**
 * Real-Electron smoke of the live chat loop (ticket 02 acceptance). Enabled
 * only with PICODE_SMOKE=1; drives the supervisor directly so the whole
 * main→host→Pi SDK→streaming pipeline runs for real:
 *
 *   create session → prompt → first text deltas → abort → agent_end
 *   → second prompt → streamed text → host SIGKILL → host_exit(!clean)
 *   → rebuild session → clean shutdown → quit(0)
 *
 * Ticket 14 adds the structured-replay stage: a simulated TUI turn carrying
 * thinking + tool traffic is appended to the rebuilt session file, the session
 * is RESUMED through the supervisor, and the replayed transcript must render
 * isomorphic to live — collapsed thinking rows, settled tool cards (the failed
 * one in the error style), degraded thinking durations (no ticking seconds).
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

    // Ticket 04: the session index must reach the sidebar — the session this
    // smoke just created (same store the TUI writes) appears as a Task row.
    await withWindow(getWindow, async (win) => {
      const listed = await waitForSidebarRows(win)
      if (!listed) fail('sidebar never listed the session created by this smoke')
      log('sidebar_index_ok')
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

    // Rebuild on the same cwd, give it one real turn (a fresh session file is
    // only written on the first assistant response), then exercise ticket 04's
    // Live Follow.
    supervisor.createSession(cwd)
    const rebuilt = (await waitFor((e) => e.type === 'session_created', 'rebuild session_created')) as Extract<
      HostToParent,
      { type: 'session_created' }
    >
    log('rebuild_ok')

    supervisor.handleParentCommand({ type: 'prompt', text: 'Reply with exactly: PICODE_SMOKE_OK' })
    await waitFor((e) => e.type === 'agent_end', 'agent_end rebuild turn')
    log('rebuild_turn_ok')

    // Round 3: open a third session so the rebuilt one becomes inactive —
    // Live Follow targets sessions running elsewhere, never the active one.
    supervisor.createSession(cwd)
    await waitFor((e) => e.type === 'session_created', 'round 3 session_created')
    log('round3_ok')

    // Live Follow: simulate the TUI appending to the (now inactive) session
    // file, open it from the sidebar, and watch the line appear read-only.
    // The row is addressed by data-file so real sessions on this machine
    // (also live within the 120s window) can never steal the click.
    if (!rebuilt.sessionFile) fail('rebuilt session did not report its file')
    const appended = await appendSimulatedTuiTurn(rebuilt.sessionFile)
    if (!appended) fail('could not find the leaf entry of the rebuilt session')
    const rowSelector = `[data-file="${rebuilt.sessionFile}"]`
    await withWindow(getWindow, async (win) => {
      // The live dot proves the refreshed index (fresh mtime) reached the DOM.
      const live = await waitForProbe(win, `document.querySelector('${rowSelector} .sb-live-dot') !== null`, 10_000)
      if (!live) {
        const diag = (await win.webContents.executeJavaScript(
          `JSON.stringify({
            rowExists: document.querySelector('${rowSelector}') !== null,
            rowText: document.querySelector('${rowSelector}')?.textContent ?? null,
            rowDots: document.querySelectorAll('${rowSelector} .sb-live-dot').length,
            dotRows: document.querySelectorAll('.sb-task .sb-live-dot').length,
            activeRow: document.querySelector('.sb-task-active')?.getAttribute('data-file') ?? null,
            rowClasses: document.querySelector('${rowSelector}')?.className ?? null
          })`,
        ).catch(() => 'unavailable')) as string
        fail(`appended session never showed live state; DOM: ${diag}`)
      }
      log('follow_live_state_ok')
      const opened = await clickSessionRow(win, rowSelector)
      if (!opened) fail('clicking the live session row never opened the Live Follow view')
      log('follow_view_opened')
      const streamed = await waitForProbe(
        win,
        `document.querySelector('.follow-badge') !== null &&
         document.body.textContent.includes('${TUI_MARKER}')`,
        10_000
      )
      if (!streamed) {
        const diag = (await win.webContents.executeJavaScript(
          `JSON.stringify({
            badge: document.querySelector('.follow-badge')?.textContent ?? null,
            dotRows: document.querySelectorAll('.sb-task .sb-live-dot').length,
            taskCount: document.querySelectorAll('.sb-task').length,
            markerInBody: document.body.textContent.includes('${TUI_MARKER}'),
            userMsgs: document.querySelectorAll('.msg-user').length
          })`,
        ).catch(() => 'unavailable')) as string
        fail(`follow view did not stream the TUI turn; DOM: ${diag}`)
      }
      log('follow_streamed_ok')
    })

    // Ticket 14: structured replay. A simulated TUI turn with thinking + tool
    // traffic goes into the rebuilt session file; a RESUME must replay it as
    // collapsed thinking rows + settled tool cards, exactly like the live path.
    const structured = await appendSimulatedStructuredTurn(rebuilt.sessionFile)
    if (!structured) fail('could not append the simulated structured turn')
    const resumedPromise = waitFor((e) => e.type === 'session_created' && e.resumed === true, 'resume session_created')
    const replayPromise = waitFor((e) => e.type === 'history_loaded', 'replay history_loaded')
    supervisor.handleParentCommand({ type: 'resume_session', sessionFile: rebuilt.sessionFile, cwd })
    await resumedPromise
    log('resume_ok')
    const replayed = (await replayPromise) as Extract<HostToParent, { type: 'history_loaded' }>
    const replayItems = replayed.items
    if (!Array.isArray(replayItems) || replayItems.length < 5) {
      fail(`replayed history too small: ${replayItems?.length}`)
    }
    if (!replayItems.some((i) => i.role === 'user' && i.text.includes(STRUCTURED_MARKER))) {
      fail('replayed history must carry the simulated structured-turn user message')
    }
    if (!replayItems.some((i) => i.role === 'assistant' && i.parts.some((p) => p.kind === 'thinking'))) {
      fail('replayed history must carry thinking parts (ticket 14)')
    }
    if (!replayItems.some((i) => i.role === 'tool' && i.isError === true)) {
      fail('replayed history must carry the failed tool call (ticket 14)')
    }
    log('replay_payload_ok', `${replayItems.length} structured items`)
    await withWindow(getWindow, async (win) => {
      const rendered = await waitForProbe(
        win,
        `document.querySelectorAll('.thinking-row').length >= 2 &&
         document.querySelectorAll('.tool-card').length >= 2`,
        10_000
      )
      if (!rendered) fail('replayed thinking rows / tool cards never reached the DOM')
      // Collapsed by default; exactly one error card; replayed thinking has
      // no duration label (the session file does not record durations).
      const shaped = await waitForProbe(
        win,
        `document.querySelectorAll('.thinking-row-open').length === 0 &&
         document.querySelectorAll('.tool-card-open').length === 0 &&
         document.querySelectorAll('.tool-card-error').length === 1 &&
         document.querySelectorAll('.thinking-row .thinking-row-duration').length === 0`,
        5_000
      )
      if (!shaped) {
        const diag = (await win.webContents.executeJavaScript(
          `JSON.stringify({
            thinkingRows: document.querySelectorAll('.thinking-row').length,
            thinkingOpen: document.querySelectorAll('.thinking-row-open').length,
            thinkingDurations: document.querySelectorAll('.thinking-row .thinking-row-duration').length,
            toolCards: document.querySelectorAll('.tool-card').length,
            toolOpen: document.querySelectorAll('.tool-card-open').length,
            toolError: document.querySelectorAll('.tool-card-error').length
          })`
        ).catch(() => 'unavailable')) as string
        fail(`replayed transcript is not collapsed/error-marked/degraded; DOM: ${diag}`)
      }
      log('replay_dom_ok')
    })

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

/** Marker text appended as a simulated TUI turn (distinctive, English). */
const TUI_MARKER = 'PICODE_TUI_SIMULATED_TURN'

/** Marker for the simulated structured turn (ticket 14 replay stage). */
const STRUCTURED_MARKER = 'PICODE_REPLAY_STRUCTURED_TURN'

/** Append one user message entry to a session file, chained to its leaf. */
async function appendSimulatedTuiTurn(file: string): Promise<boolean> {
  const { appendFile, readFile } = await import('node:fs/promises')
  const text = await readFile(file, 'utf8')
  const leafId = lastEntryId(text)
  if (leafId === null) return false
  const entry = {
    type: 'message',
    id: 'tuisim01',
    parentId: leafId,
    timestamp: new Date().toISOString(),
    message: { role: 'user', content: [{ type: 'text', text: `${TUI_MARKER}: still counting over here` }] }
  }
  const separator = text.endsWith('\n') || text === '' ? '' : '\n'
  await appendFile(file, separator + `${JSON.stringify(entry)}\n`)
  return true
}

/** Id of the LAST parseable non-header entry line (the current leaf). */
function lastEntryId(text: string): string | null {
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i] as string) as { type?: string; id?: string }
      if (entry.type !== 'session' && typeof entry.id === 'string') return entry.id
    } catch {
      // half-written tail — keep looking upward
    }
  }
  return null
}

/**
 * Append one simulated TUI turn carrying the FULL structured shape (ticket
 * 14): user message, assistant message with thinking + toolCall + text, its
 * successful toolResult, then a second thinking + toolCall assistant message
 * whose toolResult failed. Resuming the session must replay all of it.
 */
async function appendSimulatedStructuredTurn(file: string): Promise<boolean> {
  const { appendFile, readFile } = await import('node:fs/promises')
  const text = await readFile(file, 'utf8')
  const leafId = lastEntryId(text)
  if (leafId === null) return false
  const t = new Date().toISOString()
  const entries = [
    {
      type: 'message',
      id: 'simt14u1',
      parentId: leafId,
      timestamp: t,
      message: { role: 'user', content: [{ type: 'text', text: `${STRUCTURED_MARKER}: replay me with full structure` }] }
    },
    {
      type: 'message',
      id: 'simt14a1',
      parentId: 'simt14u1',
      timestamp: t,
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Simulated replay thinking: check the tool path first.', thinkingSignature: 'sim' },
          { type: 'toolCall', id: 'call_simt14_ok', name: 'bash', arguments: { command: 'echo picode_replay_tool' } },
          { type: 'text', text: 'Checking the replay tool path.' }
        ]
      }
    },
    {
      type: 'message',
      id: 'simt14r1',
      parentId: 'simt14a1',
      timestamp: t,
      message: {
        role: 'toolResult',
        toolCallId: 'call_simt14_ok',
        toolName: 'bash',
        content: [{ type: 'text', text: 'picode_replay_tool' }],
        isError: false,
        timestamp: Date.now()
      }
    },
    {
      type: 'message',
      id: 'simt14a2',
      parentId: 'simt14r1',
      timestamp: t,
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Simulated replay thinking: now the failing call.', thinkingSignature: 'sim' },
          { type: 'toolCall', id: 'call_simt14_err', name: 'bash', arguments: { command: 'exit 1' } }
        ]
      }
    },
    {
      type: 'message',
      id: 'simt14r2',
      parentId: 'simt14a2',
      timestamp: t,
      message: {
        role: 'toolResult',
        toolCallId: 'call_simt14_err',
        toolName: 'bash',
        content: [{ type: 'text', text: 'boom: simulated replay failure' }],
        isError: true,
        timestamp: Date.now()
      }
    }
  ]
  const separator = text.endsWith('\n') || text === '' ? '' : '\n'
  await appendFile(file, separator + entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
  return true
}

/** Click a specific session row (addressed by its data-file attribute). */
const clickSessionRow = (win: BrowserWindow, rowSelector: string): Promise<boolean> =>
  waitForProbe(
    win,
    `(() => {
      const row = document.querySelector('${rowSelector}')
      if (!row) return false
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return true
    })()`,
    2_000
  )

/** Poll `win` until the DOM probe passes (max 5s). */
function waitForDom(win: BrowserWindow): Promise<boolean> {
  return waitForProbe(win, DOM_EXCHANGE_PROBE, 5000)
}

/** Sidebar probe: any Task row (or the empty hint) means the index reached the DOM. */
const SIDEBAR_ROWS_PROBE = `(() => {
  const rows = document.querySelectorAll('.sb-task').length
  const emptyHint = document.querySelector('.sb-empty-hint')
  return rows > 0 || emptyHint !== null
})()`

/** Poll `win` until a Task row appears (max 8s — index poll runs at 2s). */
function waitForSidebarRows(win: BrowserWindow): Promise<boolean> {
  return waitForProbe(win, SIDEBAR_ROWS_PROBE, 8000)
}

function waitForProbe(win: BrowserWindow, probe: string, budgetMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let elapsed = 0
    const poll = async (): Promise<void> => {
      const ok = (await win.webContents.executeJavaScript(probe).catch(() => false)) as boolean
      if (ok || elapsed >= budgetMs) {
        resolve(ok)
        return
      }
      elapsed += 100
      setTimeout(poll, 100)
    }
    void poll()
  })
}
