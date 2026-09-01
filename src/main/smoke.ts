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
 * thinking + tool traffic is appended to a session file and must replay —
 * through the Live Follow view first, then through a full resume — as
 * collapsed turn containers with settled thinking rows and tool cards,
 * isomorphic to live. Ticket 23 adds the turn-fold gate: replayed AND
 * followed turns arrive as collapsed "Worked · Ns ›" containers; the stages
 * open them before auditing the inner rows.
 * Ticket 24 extends the Live Follow stage into the takeover chain: the follow
 * view renders the structured turn (markdown / thinking / tool cards), shows
 * no Open while the session is live, shows Open once it goes quiet, REJECTS
 * a click with a toast when the TUI woke up again (fresh-mtime re-check),
 * and otherwise resumes the session in full — auto-switching to the chat
 * view with no duplicate content.
 *
 * Any missed step times out and exits non-zero. Progress logs as
 * `SMOKE <step>` lines on stdout. Not part of `npm test`.
 */

import os from 'node:os'
import { utimesSync } from 'node:fs'
import { app, type BrowserWindow } from 'electron'
import type { HostSupervisor } from './host-supervisor'
import type { HostToParent } from '../shared/contract'
import { FOLLOW_TAKEOVER_REJECTED_TOAST } from '../shared/sessions/group'

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
    const followedFile: string = rebuilt.sessionFile
    const appended = await appendSimulatedTuiTurn(followedFile)
    if (!appended) fail('could not find the leaf entry of the rebuilt session')
    const rowSelector = `[data-file="${followedFile}"]`
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
      const opened = await clickSelector(win, rowSelector)
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

    // Ticket 24 ①: structured rendering inside the follow view. The appended
    // turn carries thinking + tool traffic; the follow badge must stay and
    // the SAME turn architecture as the chat view must appear (ticket 23:
    // folded containers first) — while the session is STILL live (fresh
    // mtime), so no Open button yet.
    const structured = await appendSimulatedStructuredTurn(followedFile)
    if (!structured) fail('could not append the simulated structured turn')
    await withWindow(getWindow, async (win) => {
      // Ticket 23 gate, follow edition: the structured turn renders as a
      // FOLDED container — no inner rows until it is opened.
      const folded = await waitForProbe(
        win,
        `document.querySelector('.follow-badge') !== null &&
         document.body.textContent.includes('${STRUCTURED_MARKER}') &&
         document.querySelectorAll('.turn-container').length >= 1 &&
         document.querySelectorAll('.turn-container-open').length === 0 &&
         document.querySelectorAll('.thinking-row').length === 0`,
        10_000
      )
      if (!folded) fail('follow view never rendered the structured turn as a folded container')
      await openAllTurnContainers(win)
      const rendered = await waitForProbe(
        win,
        `document.querySelectorAll('.thinking-row').length >= 2 &&
         document.querySelectorAll('.tool-card').length >= 2`,
        10_000
      )
      if (!rendered) fail('follow view never rendered the structured TUI turn')
      // Inner rows closed by default; exactly one error card; followed
      // thinking has no duration label (the file does not record durations).
      const shaped = await waitForProbe(
        win,
        `document.querySelectorAll('.thinking-row-open').length === 0 &&
         document.querySelectorAll('.tool-card-open').length === 0 &&
         document.querySelectorAll('.tool-card-error').length === 1 &&
         document.querySelectorAll('.thinking-row .thinking-row-duration').length === 0`,
        5_000
      )
      if (!shaped) fail('follow view transcript is not collapsed/error-marked/degraded')
      // Negative sampling: poll for the button's APPEARANCE for 3s; seeing
      // none while the session is live is the assertion.
      const openAppeared = await waitForProbe(win, `document.querySelector('.follow-open-btn') !== null`, 3_000)
      if (openAppeared) fail('Open button showed while the followed session was still live')
      log('follow_structured_ok')
    })

    // Ticket 24 ② (reject path): backdate the followed file's mtime so the
    // session reads as quiet (>120s), then poke a DIFFERENT session file so
    // the index emits an event and the App re-renders — Open must appear.
    // The TUI then wakes up again; the click's fresh-scan re-check must
    // reject the takeover with a toast and keep the follow view open.
    if (!created.sessionFile) fail('first session did not report its file')
    const pokeFile: string = created.sessionFile
    backdateMtime(followedFile)
    await appendSimulatedTuiTurn(pokeFile)
    await withWindow(getWindow, async (win) => {
      const openShown = await waitForProbe(win, `document.querySelector('.follow-open-btn') !== null`, 15_000)
      if (!openShown) fail('Open never appeared after the followed session went quiet')
      log('follow_open_shown')
      // Wake the other end between render and click — a few-ms window before
      // the next index poll would hide the button again.
      await appendSimulatedTuiTurn(followedFile)
      const clicked = await clickSelector(win, '.follow-open-btn')
      if (!clicked) fail('Open button vanished before the takeover click could land')
      const rejected = await waitForProbe(
        win,
        `document.body.textContent.includes('${FOLLOW_TAKEOVER_REJECTED_TOAST}')`,
        3_000
      )
      if (!rejected) fail('takeover click on a live session was not rejected with a toast')
      const stillFollowing = await waitForProbe(win, `document.querySelector('.follow-badge') !== null`, 2_000)
      if (!stillFollowing) fail('follow view closed even though the takeover was rejected')
      log('follow_open_rejected_ok')
    })

    // Ticket 24 ② (accept path): quiet again → Open → resume. This resume IS
    // the ticket-14 structured replay, driven end-to-end through the renderer:
    // session_created(resumed) + structured history_loaded, the follow view
    // hands over to the chat view, and the replayed transcript renders
    // isomorphic to live — collapsed thinking rows, settled tool cards (the
    // failed one in the error style), degraded thinking durations.
    backdateMtime(followedFile)
    await appendSimulatedTuiTurn(pokeFile)
    const resumedPromise = waitFor((e) => e.type === 'session_created' && e.resumed === true, 'takeover session_created')
    const replayPromise = waitFor((e) => e.type === 'history_loaded', 'takeover history_loaded')
    await withWindow(getWindow, async (win) => {
      const openShown = await waitForProbe(win, `document.querySelector('.follow-open-btn') !== null`, 15_000)
      if (!openShown) fail('Open never re-appeared for the takeover resume')
      const clicked = await clickSelector(win, '.follow-open-btn')
      if (!clicked) fail('takeover Open click failed')
    })
    await resumedPromise
    log('takeover_resumed_ok')
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
      // Ticket 23: replayed turns render as FOLDED "Worked · Ns ›" containers
      // — nothing inner reaches the DOM until a container is opened.
      const folded = await waitForProbe(
        win,
        `document.querySelectorAll('.turn-container').length >= 1 &&
         document.querySelectorAll('.turn-container-open').length === 0 &&
         document.querySelectorAll('.thinking-row').length === 0`,
        10_000
      )
      if (!folded) fail('replayed turns did not render collapsed (ticket 23 memory rule)')
      await openAllTurnContainers(win)
      const rendered = await waitForProbe(
        win,
        `document.querySelectorAll('.thinking-row').length >= 2 &&
         document.querySelectorAll('.tool-card').length >= 2`,
        10_000
      )
      if (!rendered) fail('replayed thinking rows / tool cards never reached the DOM')
      // Inner rows closed by default; exactly one error card; replayed
      // thinking has no duration label (the file does not record durations);
      // a skill-driven marker row would have rendered inside too.
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
            turns: document.querySelectorAll('.turn-container').length,
            turnsOpen: document.querySelectorAll('.turn-container-open').length,
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
      // Ticket 24: the follow view must be gone — the takeover auto-switched
      // to the chat view (checked last, after the collapse-gate audit).
      const switched = await waitForProbe(win, `document.querySelector('.follow-badge') === null`, 10_000)
      if (!switched) fail('follow view never handed over to the resumed session view')
      log('replay_dom_ok')
    })

    // Ticket 17: the new-task empty state. ⌘N must open the chip empty state
    // (no system folder dialog), the chip preselects the active session's
    // project, the dropdown exposes search + recent workspaces + the
    // "Open folder…" entry, and the first send creates the session in the
    // chip's project with the typed message delivered via the pending chain.
    const NEWTASK_MARKER = 'PICODE_NEWTASK_FIRST_MSG'
    const started = waitFor(
      (e) => e.type === 'session_created' && e.cwd === cwd,
      'newtask session_created'
    ) as Promise<Extract<HostToParent, { type: 'session_created' }>>
    const firstPrompt = waitFor(
      (e) => e.type === 'user_message' && e.text.includes(NEWTASK_MARKER),
      'newtask first prompt delivered'
    )
    await withWindow(getWindow, async (win) => {
      // ⌘N → the chip empty state replaces the open session view.
      await win.webContents.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))`
      )
      const chipShown = await waitForProbe(
        win,
        `document.querySelector('.empty-state') !== null && document.querySelector('.newtask-chip') !== null`,
        10_000
      )
      if (!chipShown) fail('⌘N never opened the new-task empty state with the project chip')
      // The chip preselects the ACTIVE session's project (= this smoke's cwd).
      const chipLabel = (await win.webContents.executeJavaScript(
        `document.querySelector('.newtask-chip span')?.textContent ?? ''`
      )) as string
      const expectedProject = cwd.split('/').filter(Boolean).pop() ?? cwd
      if (!chipLabel.includes(expectedProject)) {
        fail(`project chip shows "${chipLabel}" instead of the active session's project (${expectedProject})`)
      }
      log('newtask_chip_default_ok', chipLabel)
      // Dropdown: search box + recent workspaces (current one checked) +
      // the bottom "Open folder…" entry.
      await clickSelector(win, '.newtask-chip')
      const dropdown = await waitForProbe(
        win,
        `document.querySelector('.newtask-pop .newtask-search input') !== null &&
         document.querySelector('.newtask-pop .newtask-openfolder') !== null &&
         document.body.textContent.includes('Open folder…') &&
         document.querySelector('.newtask-pop .newtask-row-current') !== null`,
        5_000
      )
      if (!dropdown) fail('chip dropdown never showed search + current-checked workspace + Open folder…')
      log('newtask_dropdown_ok')
      // Close the dropdown, then type the first message and send it.
      await win.webContents.executeJavaScript(
        `document.querySelector('.newtask-pop .newtask-search input')
           ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`
      )
      const typed = await win.webContents.executeJavaScript(
        `(async () => {
          const ta = document.querySelector('.empty-state textarea.composer-input')
          if (!ta) return false
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, '${NEWTASK_MARKER}: start me in the chip project')
          ta.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 100))
          ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
          return true
        })()`
      )
      if (!typed) fail('could not type into the empty-state composer')
    })
    const createdNow = await started
    log('newtask_session_created', `sessionId=${createdNow.sessionId}`)
    await firstPrompt
    log('newtask_first_prompt_ok')
    // Stop the agent turn the marker message started, then finish clean.
    supervisor.handleParentCommand({ type: 'abort_turn' })
    await waitFor((e) => e.type === 'agent_end', 'agent_end after newtask abort')
    log('newtask_turn_aborted_ok')

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

/** Append one user message entry to a session file, chained to its leaf.
 * The entry id is unique per call — this helper may append several times to
 * the same file (follow stream, wake-for-reject, poke turns), and a session
 * jsonl with duplicate entry ids is rejected by the resume host. */
async function appendSimulatedTuiTurn(file: string): Promise<boolean> {
  const { appendFile, readFile } = await import('node:fs/promises')
  const { randomUUID } = await import('node:crypto')
  const text = await readFile(file, 'utf8')
  const leafId = lastEntryId(text)
  if (leafId === null) return false
  const entry = {
    type: 'message',
    id: `tuisim-${randomUUID().slice(0, 8)}`,
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

/**
 * Backdate a session file's mtime past the 120s liveness window WITHOUT
 * touching its content — the only way the smoke can present a quiet session
 * (and thus the Open button) without really waiting two minutes.
 */
function backdateMtime(file: string): void {
  const past = new Date(Date.now() - 5 * 60_000)
  utimesSync(file, past, past)
}

/** Open every folded turn container in the current view (ticket 23 gate:
 * inner rows render only inside an open container; shared by the follow
 * and the replay audit stages). */
const openAllTurnContainers = (win: BrowserWindow): Promise<unknown> =>
  win.webContents.executeJavaScript(
    `(async () => {
      // Containers may mount across several follow/replay updates — click the
      // still-closed ones each round until EVERY container is open.
      for (let round = 0; round < 20; round++) {
        const containers = document.querySelectorAll('.turn-container').length
        const open = document.querySelectorAll('.turn-container-open').length
        if (containers > 0 && open === containers) return 'all-open'
        document
          .querySelectorAll('.turn-container:not(.turn-container-open) > .turn-container-header')
          .forEach((el) => (el instanceof HTMLElement ? el.click() : undefined))
        await new Promise((r) => setTimeout(r, 200))
      }
      return 'timeout'
    })()`
  )

/** Click a specific element (session rows by data-file, the follow Open btn). */
const clickSelector = (win: BrowserWindow, selector: string): Promise<boolean> =>
  waitForProbe(
    win,
    `(() => {
      const row = document.querySelector('${selector}')
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
