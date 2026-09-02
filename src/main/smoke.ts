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
 * Ticket 20 adds the multi-active-sessions stage: several hosts stay alive
 * while focus switches (registry semantics, ADR-0006), a background session
 * keeps streaming, the sidebar shows fixed-slot dot states, switching back
 * is a same-pid focus change with a caught-up transcript and no duplicates,
 * a targeted abort settles it, a SIGKILLed host isolates its crash to its
 * own session, and shutdownAll leaves zero orphaned processes.
 *
 * Ticket 25 adds the background-approval stage: a gate hit in a background
 * session parks the pill inside that session (the agent stays suspended —
 * nothing auto-approves), lights the sidebar's orange badge, and requests
 * the OS notification; the notification's click path foregrounds the window
 * and focuses the session, where the SAME approve/deny controls work as in
 * the foreground — Approve & Remember sticks (no second ask), and deny
 * terminates the round, round-trips the reason, and updates the transcript.
 *
 * Ticket 27 adds the keymap-remap stage: the four titlebar tooltips carry
 * R1 keycaps (⌘B / ⌥⌘B / ⌘J / ⌥⌘J) and the four chords — dispatched as
 * physical-key events (code + modifiers only) — toggle sidebar, side
 * panel, terminal dock and bridge dock.
 *
 * Ticket 28 adds the selection-follows-view and unread assertions: the
 * followed row carries the selected styling while the focused row reverts
 * (clicking the focused row exits Follow and the highlight follows back), a
 * running-in-background row keeps its animated dot with a plain background,
 * and a background turn lights the indigo unread dot once settled — masked
 * by the animated dot while in flight — until the session is focused again.
 *
 * Ticket 35 adds the context-menu + archive stage: hovering a settled row
 * reveals the archive button in the dot slot (real-input hover — the CSS
 * gate follows real moves only), archiving hides the row from both sidebar
 * views (toast confirms), the trash button swaps to the archive view where
 * one click restores the row, the right-click menu shows the nine entries
 * in ZCode order, and the copy actions fire the read-only context-action
 * IPC (asserted against main's bounded action log).
 *
 * Any missed step times out and exits non-zero. Progress logs as
 * `SMOKE <step>` lines on stdout. Not part of `npm test`.
 */

import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { app, type BrowserWindow } from 'electron'
import type { HostSupervisor } from './host-supervisor'
import { focusSessionFromNotification, type ApprovalNotice } from './notifications'
import type { HostToParent, SessionScopedEvent } from '../shared/contract'
import { FOLLOW_TAKEOVER_REJECTED_TOAST } from '../shared/sessions/group'
import type { SessionContextActionService } from './sessions/context-actions'

const STEP_TIMEOUT_MS = 90_000
const ABORT_AFTER_DELTAS = 3

/** Marker prompt of the ticket-20 multi-session stage (unique in the DOM). */
const MULTI_MARKER = 'PICODE_MULTI_SESSION_ONE'

/** Markers of the ticket-25 background-approval stage. */
const BG_APPROVAL_MARKER = 'PICODE_BG_APPROVAL'
const BG_REMEMBER_MARKER = 'PICODE_BG_REMEMBERED'
const BG_DENY_MARKER = 'PICODE_BG_DENY'
const BG_DENY_REASON = 'No new files today.'

export function smokeEnabled(): boolean {
  return process.env['PICODE_SMOKE'] === '1'
}

/** What the smoke exposes to main (index.ts): the host-event tap plus the
 * notification-notice tap (ticket 25 asserts the notification pipeline). */
export interface SmokeHooks {
  onHostEvent: (event: HostToParent) => void
  onApprovalNotice: (notice: ApprovalNotice) => void
}

/** Every event the smoke sees carries its session scope: the supervisor
 * wraps host events in `session_event` (ticket 20), and the tap flattens
 * that onto the scoped event so matchers can address a session. */
type Scoped = SessionScopedEvent & { sessionId: string }

interface Waiter {
  match: (event: Scoped) => boolean
  label: string
  resolve: (event: Scoped) => void
  timer: NodeJS.Timeout
}

/**
 * Drive the smoke sequence against `supervisor` and return hooks for host
 * events and approval notices (waiters only; the caller keeps forwarding
 * events to the renderer). `actions` is the ticket-35 context-action
 * service: the smoke asserts the session-row menu's copy/reveal IPC
 * actually fired. Returns null when PICODE_SMOKE is unset.
 */
export function startSmokeIfEnabled(
  supervisor: HostSupervisor,
  getWindow: () => BrowserWindow | null,
  actions?: SessionContextActionService | null
): SmokeHooks | null {
  if (!smokeEnabled()) return null
  const cwd = process.env['PICODE_SMOKE_CWD'] || os.tmpdir()
  const waiters = new Set<Waiter>()
  const approvalNotices: ApprovalNotice[] = []
  const log = (step: string, detail = ''): void => console.log(`SMOKE ${step}${detail ? ` ${detail}` : ''}`)

  const fail: (message: string) => never = (message) => {
    console.error(`SMOKE FAIL ${message}`)
    console.error(`SMOKE FAIL recent events: ${recentEvents.join(' | ') || '(none)'}`)
    app.exit(1)
    throw new Error(`SMOKE FAIL ${message}`)
  }

  /** Ring buffer of the last scoped events — dumped on failure so a timeout
   * says WHAT actually arrived instead of just what never did. */
  const recentEvents: string[] = []
  const noteEvent = (scoped: Scoped): void => {
    const detail = scoped.type === 'approval_resolved' ? `(${String(scoped.approved)}:${scoped.reason ?? '-'})` : ''
    recentEvents.push(`${scoped.sessionId.slice(-6)}:${scoped.type}${detail}`)
    if (recentEvents.length > 40) recentEvents.shift()
  }

  /** Stage-local observers (ticket 25 negative assertions need to SEE that
   * an event never came, not just wait for ones that must). */
  const observers: Array<(event: Scoped) => void> = []

  function onHostEvent(event: HostToParent): void {
    // Flatten the ticket-20 wrapping: scoped events reach matchers tagged
    // with the session they belong to.
    const scoped: Scoped = (
      event.type === 'session_event' ? { ...event.event, sessionId: event.sessionId } : { ...event, sessionId: '' }
    ) as Scoped
    for (const waiter of [...waiters]) {
      if (waiter.match(scoped)) {
        clearTimeout(waiter.timer)
        waiters.delete(waiter)
        waiter.resolve(scoped)
      }
    }
    noteEvent(scoped)
    for (const observe of observers) observe(scoped)
  }

  function waitFor(match: (event: Scoped) => boolean, label: string): Promise<Scoped> {
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        match,
        label,
        resolve: resolve as (event: Scoped) => void,
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
      Scoped,
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

    // Crash isolation: SIGKILL the host; supervisor must report it unclean —
    // and scoped to exactly the session that died (ticket 20).
    const pid = supervisor.hostPid
    if (!pid) fail('no host pid to kill')
    process.kill(pid, 'SIGKILL')
    const exitEvent = (await waitFor(
      (e) => e.type === 'host_exit' && e.sessionId === created.sessionId,
      'host_exit'
    )) as Extract<Scoped, { type: 'host_exit' }>
    if (exitEvent.clean) fail('host_exit should be unclean after SIGKILL')
    log('host_exit', `session=${exitEvent.sessionId} code=${exitEvent.code} signal=${exitEvent.signal ?? '-'}`)

    // Rebuild on the same cwd, give it one real turn (a fresh session file is
    // only written on the first assistant response), then exercise ticket 04's
    // Live Follow.
    supervisor.createSession(cwd)
    const rebuilt = (await waitFor((e) => e.type === 'session_created', 'rebuild session_created')) as Extract<
      Scoped,
      { type: 'session_created' }
    >
    log('rebuild_ok')

    supervisor.handleParentCommand({ type: 'prompt', text: 'Reply with exactly: PICODE_SMOKE_OK' })
    await waitFor((e) => e.type === 'agent_end', 'agent_end rebuild turn')
    log('rebuild_turn_ok')

    // Round 3: open a third session so the rebuilt one becomes inactive —
    // Live Follow targets sessions running elsewhere, never the active one.
    // A warm turn gives it a session file on disk, so its row exists in the
    // sidebar: the ticket-28 selection assertions click it to exit Follow.
    supervisor.createSession(cwd)
    const round3 = (await waitFor((e) => e.type === 'session_created', 'round 3 session_created')) as Extract<
      Scoped,
      { type: 'session_created' }
    >
    supervisor.handleParentCommand({ type: 'prompt', text: 'Reply with exactly: PICODE_SMOKE_OK' })
    await waitFor((e) => e.type === 'agent_end', 'agent_end round 3 warm turn')
    const round3SessionFile = round3.sessionFile
    if (!round3SessionFile) fail('round 3 session did not announce its file')
    log('round3_ok', round3SessionFile)

    // Registry semantics (ticket 20) keep EVERY host alive — including the
    // rebuilt session's. The follow stage needs a session that is NOT hosted
    // in this app (the α world's precondition: switching killed it), so the
    // smoke SIGKILLs the rebuilt host before following its file. Its death
    // must be scoped to that session alone.
    const rebuiltPid = supervisor.pidForSession(rebuilt.sessionId)
    if (!rebuiltPid) fail('rebuilt host pid missing')
    process.kill(rebuiltPid, 'SIGKILL')
    await waitFor(
      (e) => e.type === 'host_exit' && e.sessionId === rebuilt.sessionId,
      'rebuilt host_exit before follow stage'
    )
    log('rebuilt_host_killed', rebuilt.sessionId)

    // Live Follow: simulate the TUI appending to the (now host-less) session
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

      // Ticket 28: selection follows the view. The followed row carries the
      // selected styling while the focused row (round 3) reverts to plain —
      // and the followed row KEEPS its green dot: selection and running
      // state are decoupled.
      if (!round3SessionFile) fail('round 3 session did not report its file')
      const focusedRow = `[data-file="${round3SessionFile}"]`
      const selected = await waitForProbe(
        win,
        `(() => {
          const followed = document.querySelector('${rowSelector}')
          const focused = document.querySelector('${focusedRow}')
          if (!followed || !focused) return false
          return (
            followed.classList.contains('sb-task-active') &&
            followed.querySelector('.sb-live-dot') !== null &&
            !focused.classList.contains('sb-task-active')
          )
        })()`,
        10_000
      )
      if (!selected) fail('followed row never took the selected styling (ticket 28 selection follows the view)')
      log('follow_selection_ok')

      // Clicking the focused row again exits Follow: the highlight returns
      // to it and the follow view closes; clicking the followed row re-opens
      // the view with the followed row selected again.
      const exited = await clickSelector(win, focusedRow)
      if (!exited) fail('round 3 row never appeared to click for the follow exit')
      const backOnFocused = await waitForProbe(
        win,
        `(() => {
          const followed = document.querySelector('${rowSelector}')
          const focused = document.querySelector('${focusedRow}')
          return (
            document.querySelector('.follow-badge') === null &&
            focused !== null && focused.classList.contains('sb-task-active') &&
            followed !== null && !followed.classList.contains('sb-task-active')
          )
        })()`,
        10_000
      )
      if (!backOnFocused) fail('clicking the focused row did not exit Follow and restore its highlight (ticket 28)')
      log('follow_exit_ok')
      const reopened = await clickSelector(win, rowSelector)
      if (!reopened) fail('followed row never appeared to click for the re-follow')
      const reselected = await waitForProbe(
        win,
        `(() => {
          const followed = document.querySelector('${rowSelector}')
          return (
            document.querySelector('.follow-badge') !== null &&
            followed !== null && followed.classList.contains('sb-task-active')
          )
        })()`,
        10_000
      )
      if (!reselected) fail('re-opening the follow view did not restore the followed row selection (ticket 28)')
      log('follow_reselected_ok')
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
    const replayed = (await replayPromise) as Extract<Scoped, { type: 'history_loaded' }>
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
    ) as Promise<Extract<Scoped, { type: 'session_created' }>>
    const firstPrompt = waitFor(
      (e) => e.type === 'user_message' && e.text.includes(NEWTASK_MARKER),
      'newtask first prompt delivered'
    )
    await withWindow(getWindow, async (win) => {
      // ⌘N → the chip empty state replaces the open session view. The
      // event carries the PHYSICAL code (ticket 27): the resolver reads
      // code + modifiers, never the derived character.
      await win.webContents.executeJavaScript(
        `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', metaKey: true, bubbles: true }))`
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

    // ---- ticket 20: multi-active sessions (registry semantics) ----
    log('multi_session_start')
    supervisor.createSession(cwd)
    const ms1 = (await waitFor((e) => e.type === 'session_created', 'multi session_created 1')) as Extract<
      Scoped,
      { type: 'session_created' }
    >
    supervisor.createSession(cwd)
    const ms2 = (await waitFor((e) => e.type === 'session_created', 'multi session_created 2')) as Extract<
      Scoped,
      { type: 'session_created' }
    >
    if (ms1.sessionId === ms2.sessionId) fail('distinct sessions must announce distinct ids')
    const ms1Pid = supervisor.pidForSession(ms1.sessionId)
    if (!ms1Pid) fail('multi session 1 host pid missing')
    if (!ms1.sessionFile || !ms2.sessionFile) fail('multi sessions did not report their files')

    // Session 2 gets a quick settled turn so its file exists: after this it is
    // the "in-app idle" row (fresh mtime, but its dot slot stays EMPTY — an
    // in-app session never shows the TUI green dot).
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: ms2.sessionId,
      command: { type: 'prompt', text: 'Reply with exactly: PICODE_SMOKE_OK' }
    })
    await waitFor((e) => e.type === 'agent_end' && e.sessionId === ms2.sessionId, 'multi agent_end 2')

    // Session 1 gets a warm-up turn so ITS file exists too (the sidebar row
    // must be present while the next turn streams).
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: ms1.sessionId,
      command: { type: 'prompt', text: `Reply with exactly: ${MULTI_MARKER}` }
    })
    await waitFor((e) => e.type === 'agent_end' && e.sessionId === ms1.sessionId, 'multi warm agent_end 1')
    const ms1SizeWarm = statSync(ms1.sessionFile).size

    // Session 1 starts a LONG streaming run. The dot probe below starts in
    // the same instant as agent_start — the run state is guaranteed until
    // the model finishes, long after the probe's first poll.
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: ms1.sessionId,
      command: {
        type: 'prompt',
        text: `${MULTI_MARKER}: count from 1 to 150. Output each number on its own line, one number per line. Do not summarize and do not stop early.`
      }
    })
    await waitFor((e) => e.type === 'agent_start' && e.sessionId === ms1.sessionId, 'multi agent_start 1')

    // Sidebar dot states while session 1 runs: run-here for session 1, empty
    // fixed slot for the in-app idle session 2 (fresh mtime but never the
    // TUI green dot).
    await withWindow(getWindow, async (win) => {
      const row2 = `[data-file="${ms2.sessionFile}"]`
      const dots = await waitForProbe(
        win,
        `(() => {
          const row1 = document.querySelector('[data-file="${ms1.sessionFile}"]')
          const row2 = document.querySelector('${row2}')
          if (!row1 || !row2) return false
          return (
            row1.querySelector('.sb-run-dot') !== null &&
            row1.querySelector('.sb-live-dot') === null &&
            row2.querySelector('.sb-run-dot') === null &&
            row2.querySelector('.sb-live-dot') === null &&
            row2.querySelector('.sb-dot-slot') !== null
          )
        })()`,
        10_000
      )
      if (!dots) {
        const diag = (await win.webContents.executeJavaScript(
          `JSON.stringify({
            row1: document.querySelector('[data-file="${ms1.sessionFile}"]')?.className ?? null,
            row1Run: document.querySelectorAll('[data-file="${ms1.sessionFile}"] .sb-run-dot').length,
            row1Live: document.querySelectorAll('[data-file="${ms1.sessionFile}"] .sb-live-dot').length,
            row2: document.querySelector('${row2}')?.className ?? null,
            row2Slot: document.querySelectorAll('${row2} .sb-dot-slot').length,
            row2Live: document.querySelectorAll('${row2} .sb-live-dot').length,
            slots: document.querySelectorAll('.sb-dot-slot').length,
            runDots: document.querySelectorAll('.sb-run-dot').length,
            liveDots: document.querySelectorAll('.sb-live-dot').length,
            rows: document.querySelectorAll('.sb-task').length,
            dbg: document.documentElement.dataset['picodeDebug'] ?? null
          })`
        ).catch(() => 'unavailable')) as string
        fail(`sidebar dots: running-here/idle slot states wrong (ticket 20 fixed slot); DOM: ${diag}`)
      }
      log('multi_dot_states_ok')
    })

    // A THIRD session opens while session 1 streams — pure focus switch, the
    // run keeps going in the background (nothing is terminated).
    supervisor.createSession(cwd)
    await waitFor((e) => e.type === 'session_created', 'multi session_created 3')
    await waitFor(
      (e) => e.type === 'text_delta' && e.sessionId === ms1.sessionId,
      'background text_delta after session 3 exists'
    )
    // The background session's file KEEPS GROWING while nothing renders it —
    // the run-start user message is already appended beyond the warm turn.
    const ms1SizeDuring = statSync(ms1.sessionFile).size
    if (ms1SizeDuring <= ms1SizeWarm) fail('background session file did not grow while streaming')
    log('multi_background_streaming_ok')

    // Ticket 28: selection follows the view — session 1 keeps its animated
    // dot while running in the background but its row reverts to a plain
    // background (selection and running state are decoupled; session 3 has
    // no row yet — a fresh session file is only written on the first turn).
    await withWindow(getWindow, async (win) => {
      const decoupled = await waitForProbe(
        win,
        `(() => {
          const running = document.querySelector('[data-file="${ms1.sessionFile}"]')
          return running !== null &&
            running.querySelector('.sb-run-dot') !== null &&
            !running.classList.contains('sb-task-active')
        })()`,
        10_000
      )
      if (!decoupled) fail('background running row stayed selected — selection must follow the view (ticket 28)')
      log('multi_selection_decoupled_ok')
    })

    // Switch BACK to session 1 through its sidebar row: pure focus change —
    // same host process (same pid, no session_created), view remounts caught
    // up with NO duplicate entries, and the live stream resumes on screen.
    await withWindow(getWindow, async (win) => {
      const row1 = `[data-file="${ms1.sessionFile}"]`
      const clicked = await clickSelector(win, row1)
      if (!clicked) fail('sidebar row of the background session never appeared to click')
      const caught = await waitForProbe(
        win,
        `document.querySelector('.follow-badge') === null &&
         document.querySelectorAll('.msg-user').length === 2 && // warm-up + count turns; duplicates would inflate
         document.body.textContent.includes('${MULTI_MARKER}') &&
         document.querySelector('.msg-assistant') !== null`,
        10_000
      )
      if (!caught) fail('switching back to the background session did not show its caught-up transcript')
    })
    if (supervisor.pidForSession(ms1.sessionId) !== ms1Pid) {
      fail('switching back respawned the host — registry semantics broken')
    }
    await waitFor(
      (e) => e.type === 'text_delta' && e.sessionId === ms1.sessionId,
      'text_delta after refocus (stream resumed)'
    )
    log('multi_refocus_ok')

    // Targeted abort settles session 1's run; session 1 stays usable.
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: ms1.sessionId,
      command: { type: 'abort_turn' }
    })
    await waitFor((e) => e.type === 'agent_end' && e.sessionId === ms1.sessionId, 'multi agent_end 1 after abort')
    log('multi_abort_ok')

    // ---- ticket 28: unread dot — a background turn sets it, focus clears it ----
    // Session 1 stays focused while the idle session 2 runs a LONG background
    // turn: growth past its watermark sets unread, the animated dot masks it
    // while the run is in flight, and once the turn settles the indigo dot
    // shows; clicking the row (focus switch) clears unread again.
    log('unread_start')
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: ms2.sessionId,
      command: {
        type: 'prompt',
        text: 'Count from 51 to 150. Output each number on its own line, one number per line. Do not summarize and do not stop early.'
      }
    })
    await waitFor((e) => e.type === 'agent_start' && e.sessionId === ms2.sessionId, 'unread agent_start ms2')
    if (!ms2.sessionFile) fail('multi session 2 did not report its file')
    const ms2Row = `[data-file="${ms2.sessionFile}"]`
    await withWindow(getWindow, async (win) => {
      const masked = await waitForProbe(
        win,
        `(() => {
          const row = document.querySelector('${ms2Row}')
          return row !== null &&
            row.querySelector('.sb-run-dot') !== null &&
            row.querySelector('.sb-unread-dot') === null
        })()`,
        10_000
      )
      if (!masked) fail('unread was not masked by the animated dot while the background run was in flight (ticket 28)')
      log('unread_masked_ok')
    })
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: ms2.sessionId,
      command: { type: 'abort_turn' }
    })
    await waitFor((e) => e.type === 'agent_end' && e.sessionId === ms2.sessionId, 'unread agent_end ms2')
    await withWindow(getWindow, async (win) => {
      const lit = await waitForProbe(
        win,
        `(() => {
          const row = document.querySelector('${ms2Row}')
          const focused = document.querySelector('[data-file="${ms1.sessionFile}"]')
          return row !== null &&
            row.querySelector('.sb-unread-dot') !== null &&
            row.querySelector('.sb-run-dot') === null &&
            focused !== null && focused.querySelector('.sb-unread-dot') === null &&
            focused.classList.contains('sb-task-active')
        })()`,
        10_000
      )
      if (!lit) fail('the settled background turn never lit the indigo unread dot (ticket 28)')
      log('unread_lit_ok')
      const clicked = await clickSelector(win, ms2Row)
      if (!clicked) fail('unread session row never appeared to click')
      const cleared = await waitForProbe(
        win,
        `(() => {
          const row = document.querySelector('${ms2Row}')
          return row !== null && row.querySelector('.sb-unread-dot') === null
        })()`,
        10_000
      )
      if (!cleared) fail('focusing the session never cleared its unread dot (ticket 28)')
      log('unread_cleared_ok')
    })

    // Crash isolation, session-scoped: SIGKILL session 2's host — ONLY that
    // session reports an exit; session 1 keeps working.
    const ms2Pid = supervisor.pidForSession(ms2.sessionId)
    if (!ms2Pid) fail('multi session 2 host pid missing')
    let tripwireFired = false
    void waitFor((e) => e.type === 'host_exit' && e.sessionId === ms1.sessionId, 'tripwire').then(() => {
      tripwireFired = true
    })
    process.kill(ms2Pid, 'SIGKILL')
    const ms2Exit = (await waitFor(
      (e) => e.type === 'host_exit' && e.sessionId === ms2.sessionId,
      'multi session 2 host_exit'
    )) as Extract<Scoped, { type: 'host_exit' }>
    if (ms2Exit.clean) fail('session 2 host_exit should be unclean after SIGKILL')
    if (tripwireFired) fail('session 1 was affected by session 2’s crash (isolation broken)')
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: ms1.sessionId,
      command: { type: 'prompt', text: 'Reply with exactly: PICODE_SMOKE_OK' }
    })
    await waitFor((e) => e.type === 'agent_end' && e.sessionId === ms1.sessionId, 'multi agent_end 1 after isolation')
    log('multi_crash_isolation_ok')

    // ---- ticket 25: background approval — pill parks, badge lights, notification knocks ----
    log('bg_approval_start')
    // A fresh session becomes the foreground view; session 1 (host still
    // alive from the multi stage, gate rules empty) becomes the background
    // session the gate fires in.
    supervisor.createSession(cwd)
    await waitFor((e) => e.type === 'session_created', 'bg foreground session_created')
    const bgId = ms1.sessionId
    if (!ms1.sessionFile) fail('bg session did not report its file')
    const bgFile: string = ms1.sessionFile

    // Stage-local observation: the suspension and remember assertions need
    // to SEE that an event never came, not just wait for ones that must.
    let bgApprovalRequired = 0
    let bgApprovedResolved = false
    let bgDeniedReason: string | null = null
    let bgAgentEnded = 0
    observers.push((event) => {
      if (event.sessionId !== bgId) return
      if (event.type === 'approval_required') bgApprovalRequired += 1
      if (event.type === 'approval_resolved') {
        if (event.approved) bgApprovedResolved = true
        else bgDeniedReason = event.reason
      }
      if (event.type === 'agent_end') bgAgentEnded += 1
    })

    // The background session runs a gated tool call while the view is on
    // the fresh session: the pill must park INSIDE the background session.
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: bgId,
      command: { type: 'prompt', text: `Use the bash tool to run exactly: echo ${BG_APPROVAL_MARKER}` }
    })
    const bgAsk = (await waitFor(
      (e) => e.type === 'approval_required' && e.sessionId === bgId && e.toolName === 'bash',
      'bg approval_required'
    )) as Extract<Scoped, { type: 'approval_required' }>
    log('bg_approval_required', `tool=${bgAsk.toolName} call=${bgAsk.toolCallId}`)

    // The agent is SUSPENDED at the gate: no agent_end may arrive while the
    // pill waits — and nothing approves it on the user's behalf.
    await new Promise((r) => setTimeout(r, 2000))
    if (bgAgentEnded > 0) fail('the agent run ended while parked at the approval gate — the pill must suspend the run')
    log('bg_agent_suspended_ok')

    // Sidebar: the orange badge replaces the animated dot on the background
    // row, and the pill does NOT reach the DOM (the view is elsewhere — it
    // lives in the session's registry state).
    await withWindow(getWindow, async (win) => {
      const badge = await waitForProbe(
        win,
        `(() => {
          const row = document.querySelector('[data-file="${bgFile}"]')
          if (!row) return false
          return row.querySelector('.sb-await-dot') !== null &&
                 row.querySelector('.sb-run-dot') === null &&
                 document.querySelectorAll('.approval-pill-pending').length === 0
        })()`,
        10_000
      )
      if (!badge) fail('background approval never lit the sidebar orange badge (or leaked the pill into the DOM)')
      log('bg_badge_ok')
    })

    // The notification pipeline asked for THIS session's gate hit...
    let notice: ApprovalNotice | undefined
    for (let waited = 0; waited < 10_000; waited += 100) {
      notice = approvalNotices.find((n) => n.sessionId === bgId && n.toolName === 'bash')
      if (notice !== undefined) break
      await new Promise((r) => setTimeout(r, 100))
    }
    if (notice === undefined) fail('no approval notification was requested for the background session')
    log('bg_notification_ok', `title=${notice.title ?? '-'}`)

    // ...and its click path foregrounds the window and focuses the session:
    // the parked pill appears, ready for the same controls a foreground
    // approval always had.
    focusSessionFromNotification(getWindow, bgId)
    await withWindow(getWindow, async (win) => {
      const focused = await waitForProbe(
        win,
        `document.querySelector('[data-file="${bgFile}"]')?.classList.contains('sb-task-active') === true`,
        5_000
      )
      if (!focused) fail('notification click did not focus the background session')
      const pill = await waitForProbe(win, `document.querySelector('.approval-pill-pending[data-tool="bash"]') !== null`, 5_000)
      if (!pill) fail('the refocused session does not render its parked pending pill')
      log('bg_jump_ok')
    })

    // Approve & Remember through the pill's own button — the exact control
    // path a foreground approval uses (sendFocused → session_command). The
    // ack waiters exist BEFORE the click (same anti-race rule as below).
    const approveAck = waitFor(
      (e) => e.type === 'approval_resolved' && e.sessionId === bgId && e.approved === true,
      'bg approval_resolved (approve)'
    )
    const approveToolEnd = waitFor((e) => e.type === 'tool_end' && e.sessionId === bgId, 'bg tool ran after approve')
    const approveEnded = waitFor((e) => e.type === 'agent_end' && e.sessionId === bgId, 'bg agent_end after approve')
    await withWindow(getWindow, async (win) => {
      const clicked = (await win.webContents
        .executeJavaScript(`(() => {
          const pill = document.querySelector('.approval-pill-pending[data-tool="bash"]')
          if (!pill) return false
          const btn = [...pill.querySelectorAll('button')].find((b) => b.textContent?.includes('Remember'))
          if (!btn) return false
          btn.click()
          return true
        })()`)
        .catch(() => false)) as boolean
      if (!clicked) fail('Approve & Remember button not found on the parked pill')
    })
    await approveAck
    await approveToolEnd
    await approveEnded
    if (!bgApprovedResolved) fail('approval_resolved(approve) never reached the stream')
    log('bg_approve_remember_ok')

    // The remember rule sticks under the current tier: the NEXT bash call
    // must not ask again (the gate decides before execution, so any second
    // ask would fire before this agent_end — the wait would hang).
    const asksBeforeRemember = bgApprovalRequired
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: bgId,
      command: { type: 'prompt', text: `Use the bash tool to run exactly: echo ${BG_REMEMBER_MARKER}` }
    })
    await waitFor((e) => e.type === 'agent_end' && e.sessionId === bgId, 'bg agent_end (remembered round)')
    if (bgApprovalRequired !== asksBeforeRemember) fail('remembered bash asked again — the approve+remember rule did not stick')
    log('bg_remember_ok')

    // Deny path in the refocused session: write is NOT remembered, so the
    // gate asks again; denying through the pill UI must terminate the round,
    // round-trip the reason, and update the transcript (no file written).
    supervisor.handleParentCommand({
      type: 'session_command',
      sessionId: bgId,
      command: {
        type: 'prompt',
        text: `Use the write tool to create a file named picode-deny-probe.txt whose content is exactly: ${BG_DENY_MARKER}. Then confirm.`
      }
    })
    const denyAsk = (await waitFor(
      (e) => e.type === 'approval_required' && e.sessionId === bgId && e.toolName === 'write',
      'bg deny approval_required'
    )) as Extract<Scoped, { type: 'approval_required' }>
    log('bg_deny_ask', `call=${denyAsk.toolCallId}`)
    // The ack waiters exist BEFORE the UI click: the renderer→host→renderer
    // round-trip races the DOM script's own return (the host resolves the
    // moment Deny is clicked, while executeJavaScript is still unwinding).
    const denyAck = waitFor(
      (e) => e.type === 'approval_resolved' && e.sessionId === bgId && e.approved === false,
      'bg approval_resolved (deny)'
    )
    const denyEnded = waitFor((e) => e.type === 'agent_end' && e.sessionId === bgId, 'bg agent_end after deny (turn terminated)')
    await withWindow(getWindow, async (win) => {
      // The pill must be on screen first — the smoke's event waiter and the
      // renderer's React commit race, so poll before driving the UI.
      const pillShown = await waitForProbe(win, `document.querySelector('.approval-pill-pending[data-tool="write"]') !== null`, 10_000)
      if (!pillShown) fail('the write pill never rendered after the deny ask')
      const denied = (await win.webContents
        .executeJavaScript(`(async () => {
          const pill = document.querySelector('.approval-pill-pending[data-tool="write"]')
          if (!pill) return 'no-pill'
          const opener = [...pill.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Deny…')
          if (!opener) return 'no-opener'
          opener.click()
          await new Promise((r) => setTimeout(r, 150))
          const input = pill.querySelector('.approval-pill-reason-input')
          if (!input) return 'no-input'
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(input, '${BG_DENY_REASON}')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise((r) => setTimeout(r, 150))
          const denyBtn = [...pill.querySelectorAll('.approval-pill-deny button')].find((b) => b.textContent?.trim() === 'Deny')
          if (!denyBtn || denyBtn.disabled) return 'no-confirm'
          denyBtn.click()
          return true
        })()`)
        .catch(() => 'js-error')) as string | boolean
      if (denied !== true) fail(`could not deny through the parked pill UI (${String(denied)})`)
    })
    const denyResolved = (await denyAck) as Extract<Scoped, { type: 'approval_resolved' }>
    if (denyResolved.reason !== BG_DENY_REASON) fail(`deny reason did not round-trip: ${denyResolved.reason}`)
    await denyEnded
    if (bgDeniedReason !== BG_DENY_REASON) fail('deny ack never reached the stream')
    if (existsSync(path.join(cwd, 'picode-deny-probe.txt'))) fail('the denied write tool executed anyway')
    await withWindow(getWindow, async (win) => {
      // The settled turn auto-folds (ticket 23) and a folded container
      // unmounts its inner rows — the denied pill only exists while the turn
      // streams or the container is open, so open the folds before probing
      // (otherwise this assertion is a first-poll race against the fold).
      await openAllTurnContainers(win)
      const shown = await waitForProbe(
        win,
        `(() => {
          const pill = document.querySelector('.approval-pill-denied[data-tool="write"]')
          return pill !== null && pill.textContent.includes('${BG_DENY_REASON}')
        })()`,
        5_000
      )
      if (!shown) fail('the denied pill did not surface the denial reason in the transcript')
      log('bg_deny_ok')
    })
    log('bg_approval_done')

    // ---- ticket 27: keymap remap — ⌘B sidebar / ⌥⌘B side panel / ⌘J
    // terminal / ⌥⌘J bridge (physical event.code judgment) ----
    log('keymap_start')
    await withWindow(getWindow, async (win) => {
      // R1 keycap tooltips: the four titlebar toggles advertise chords only.
      const tipsRaw = (await win.webContents.executeJavaScript(
        `JSON.stringify({
          sidebar: document.querySelector('button[aria-label="Show sidebar"], button[aria-label="Hide sidebar"]')?.dataset.tipShortcut ?? null,
          sidePanel: document.querySelector('button[aria-label="Open side panel"], button[aria-label="Close side panel"]')?.dataset.tipShortcut ?? null,
          terminal: document.querySelector('button[aria-label="Toggle terminal"]')?.dataset.tipShortcut ?? null,
          bridge: document.querySelector('button[aria-label="Toggle agent bridge"]')?.dataset.tipShortcut ?? null
        })`
      ).catch(() => 'unavailable')) as string
      const tips = JSON.parse(tipsRaw) as Record<string, string | null>
      if (tips.sidebar !== '⌘B' || tips.sidePanel !== '⌥⌘B' || tips.terminal !== '⌘J' || tips.bridge !== '⌥⌘J') {
        fail(`titlebar keycap tooltips wrong: ${JSON.stringify(tips)}`)
      }
      log('keymap_tooltips_ok')

      // Physical-key judgment: the synthetic events carry ONLY code +
      // modifiers — exactly the fields the resolver reads (⌥⌘ rewrites the
      // derived character on macOS, so key-based events would never match).
      const press = (code: string, alt: boolean): Promise<unknown> =>
        win.webContents.executeJavaScript(
          `window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', altKey: ${alt}, metaKey: true, bubbles: true }))`
        )
      /** Sidebar / side-panel presence. */
      const present = (selector: string): string =>
        `document.querySelector('${selector}') !== null`
      /** Dock state string: closed | terminal | bridge | unknown. */
      const DOCK_STATE = `(() => {
        const dock = document.querySelector('.terminal-dock')
        if (!dock || dock.style.display === 'none') return 'closed'
        const panels = Array.from(document.querySelectorAll('.dock-panel'))
        if (panels[0]?.style.display !== 'none') return 'terminal'
        if (panels[1]?.style.display !== 'none') return 'bridge'
        return 'unknown'
      })()`

      // ⌘B flips the sidebar (open↔closed) from whatever state earlier
      // stages left it in.
      const sidebarBefore = (await win.webContents.executeJavaScript(present('.sidebar'))) as boolean
      await press('KeyB', false)
      const sidebarFlipped = await waitForProbe(
        win,
        `(${sidebarBefore} ? !(${present('.sidebar')}) : ${present('.sidebar')})`,
        5_000
      )
      if (!sidebarFlipped) fail(`⌘B never toggled the sidebar (was open: ${sidebarBefore})`)
      log('keymap_cmd_b_sidebar_ok')

      // ⌥⌘B flips the side panel the same way.
      const panelBefore = (await win.webContents.executeJavaScript(present('.side-panel'))) as boolean
      await press('KeyB', true)
      const panelFlipped = await waitForProbe(
        win,
        `(${panelBefore} ? !(${present('.side-panel')}) : ${present('.side-panel')})`,
        5_000
      )
      if (!panelFlipped) fail(`⌥⌘B never toggled the side panel (was open: ${panelBefore})`)
      log('keymap_alt_cmd_b_panel_ok')

      // ⌘J opens the dock showing the terminal / closes it when showing.
      const dockBefore = (await win.webContents.executeJavaScript(DOCK_STATE)) as string
      await press('KeyJ', false)
      const dockAfterJ = await waitForProbe(
        win,
        `${DOCK_STATE} === '${dockBefore === 'terminal' ? 'closed' : 'terminal'}'`,
        5_000
      )
      if (!dockAfterJ) fail(`⌘J dock state went ${dockBefore} → unexpected (expected the toggle)`)
      log('keymap_cmd_j_terminal_ok')

      // ⌥⌘J shows the bridge (from terminal/closed), second press closes.
      await press('KeyJ', true)
      const dockBridge = await waitForProbe(win, `${DOCK_STATE} === 'bridge'`, 5_000)
      if (!dockBridge) fail('⌥⌘J never showed the bridge panel')
      log('keymap_alt_cmd_j_bridge_ok')
      await press('KeyJ', true)
      const dockClosed = await waitForProbe(win, `${DOCK_STATE} === 'closed'`, 5_000)
      if (!dockClosed) fail('second ⌥⌘J never closed the dock')
      log('keymap_bridge_toggle_off_ok')
      // Leave the dock as found: reopen if this stage found it open.
      if (dockBefore !== 'closed') {
        await press('KeyJ', dockBefore === 'bridge')
        await waitForProbe(win, `${DOCK_STATE} === '${dockBefore}'`, 5_000)
      }
    })
    log('keymap_done')

    // ---- ticket 31: preview multi-tab — per-file tabs, the management
    // dropdown, and recently closed persistence across a renderer restart ----
    log('panel_tabs_start')
    const panelSeed = seedPanelWorkspace()
    try {
      await withWindow(getWindow, async (win) => {
        // A focused session anchored at the seeded git workspace gives the
        // Review tab real deep-linkable rows.
        supervisor.createSession(panelSeed)
        const seeded = (await waitFor(
          (e) => e.type === 'session_created' && e.cwd === panelSeed,
          'panel session_created'
        )) as Extract<Scoped, { type: 'session_created' }>
        log('panel_session_ok', `sessionId=${seeded.sessionId}`)

        const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
        /** Panel presence; open with ⌥⌘B when needed. */
        const panelPresent = `(document.querySelector('.side-panel') !== null)`
        if (!((await js(panelPresent)) as boolean)) {
          await js(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', altKey: true, metaKey: true, bubbles: true }))`)
          await waitForProbe(win, panelPresent, 5_000)
        }

        // Open the Review tab through the picker when it is not open.
        const reviewInStrip = `( !!Array.from(document.querySelectorAll('.panel-tab-label span')).find((el) => el.textContent === 'Review') )`
        if (!((await js(reviewInStrip)) as boolean)) {
          await js(`document.querySelector('.panel-add-tab')?.click(); true`)
          for (let waited = 0; waited < 5_000; waited += 100) {
            const picked = (await js(
              `(() => { const card = document.querySelector('.panel-tab-card[aria-label="Open Review tab"]'); if (card instanceof HTMLElement) { card.click(); return true } return false })()`
            )) as boolean
            if (picked) break
            await new Promise((r) => setTimeout(r, 100))
          }
        }
        await waitForProbe(win, `(document.querySelector('.review-tree-file') !== null)`, 15_000)
        log('panel_review_tree_ok')

        /** Click the deep-link chip of the nth changed file row. */
        const clickChip = (row: number): string =>
          `(() => { const rows = document.querySelectorAll('.review-tree-file'); const chip = rows[${row}]?.querySelector('.review-tree-open'); if (chip instanceof HTMLElement) { chip.click(); return true } return false })()`
        /** Number of tabs in the strip. */
        const TAB_COUNT = `document.querySelectorAll('.panel-tab-label span').length`
        const tabLabels = async (): Promise<string[]> =>
          JSON.parse((await js(
            `JSON.stringify(Array.from(document.querySelectorAll('.panel-tab-label span')).map((el) => el.textContent))`
          )) as string) as string[]
        /** Click the strip tab whose label matches, or its close button. */
        const tabWithLabel = (label: string, action: 'activate' | 'close'): string =>
          `(() => {
            for (const tabEl of document.querySelectorAll('.panel-tab')) {
              if (tabEl.querySelector('.panel-tab-label span')?.textContent !== '${label}') continue
              const target = tabEl.querySelector('${action === 'activate' ? '.panel-tab-label' : '.panel-tab-close'}')
              if (target instanceof HTMLElement) { target.click(); return true }
            }
            return false
          })()`

        // Deep-link 1: the first changed file becomes its own tab
        // (strip was [Review] → [Review, file]).
        if (!(await waitForProbe(win, clickChip(0), 5_000))) fail('the first review deep-link chip never rendered')
        if (!(await waitForProbe(win, `(${TAB_COUNT}) === 2`, 5_000))) fail('the first deep link never opened its own file tab')
        log('panel_file_tab_one_ok')

        // In-tab navigation (operator feedback): clicking a crumb INSIDE the
        // preview moves THIS tab to the destination in place — the strip
        // never grows; only sidebar deep links open tabs.
        const dirLabel = path.basename(panelSeed)
        // The crumb lives in the ACTIVE tab's BODY (the strip tab carries no
        // content) — select via the body that is not hidden.
        await js(
          `(() => { const crumb = document.querySelector('.panel-tab-body:not(.panel-tab-body-hidden) button.preview-crumb'); if (crumb instanceof HTMLElement) { crumb.click(); return true } return false })()`
        )
        await waitForProbe(
          win,
          `( (${TAB_COUNT}) === 2 && document.querySelector('.panel-tab-active .panel-tab-label span')?.textContent === '${dirLabel}' )`,
          8_000
        )
        log('panel_retarget_in_place_ok', dirLabel)

        // Deep-link 2: a second file opens a SECOND tab — no replacement.
        if (!(await waitForProbe(win, clickChip(1), 5_000))) fail('the second review deep-link chip never rendered')
        if (!(await waitForProbe(win, `(${TAB_COUNT}) === 3`, 5_000))) fail('the second deep link did not open a second file tab')
        const labels = await tabLabels()
        const fileLabels = labels.slice(1)
        if (fileLabels.length !== 2 || new Set(fileLabels).size !== 2) {
          fail(`expected Review + two distinct file tabs, saw ${labels.join(',')}`)
        }
        log('panel_file_tab_two_ok', labels.join(','))

        // The second deep link left its tab active; switching must not
        // disturb the other file tab.
        await waitForProbe(win, tabWithLabel(fileLabels[0]!, 'activate'), 5_000)
        const switched = (await js(
          `document.querySelector('.panel-tab-active .panel-tab-label span')?.textContent`
        )) as string
        if (switched !== fileLabels[0]) fail(`activation went to '${switched}', expected '${fileLabels[0]}'`)

        // Closing one file tab leaves the other untouched
        // ([Review, alpha, beta] → close alpha → [Review, beta]).
        if (!(await waitForProbe(win, tabWithLabel(fileLabels[0]!, 'close'), 5_000))) fail('the file tab to close never rendered')
        if (!(await waitForProbe(win, `(${TAB_COUNT}) === 2`, 5_000))) fail('closing a file tab did not remove it from the strip')
        if (!((await tabLabels()).includes(fileLabels[1]!))) fail('closing one file tab killed the other')
        log('panel_close_independent_ok')

        // The management dropdown: sections + the closed file under Recently
        // Closed Tabs.
        await js(`document.querySelector('button[aria-label="Manage tabs"]')?.click(); true`)
        await waitForProbe(win, `(document.querySelector('.panel-tab-menu') !== null)`, 5_000)
        const menuHasRecent = `( !!Array.from(document.querySelectorAll('.panel-menu-row .panel-menu-row-label')).find((el) => el.textContent === '${fileLabels[0]}') )`
        if (!((await js(`( document.querySelector('.panel-tab-menu-section')?.textContent === 'Open Tabs' && ${menuHasRecent} )`)) as boolean)) {
          fail('tab dropdown does not show Open Tabs + the recently closed entry')
        }
        log('panel_dropdown_ok')

        // Search: query the closed file's name, then Enter reopens it.
        const typeQuery = (q: string): string =>
          `(() => {
            const input = document.querySelector('.panel-tab-menu-search input')
            if (!(input instanceof HTMLInputElement)) return false
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
            setter.call(input, '${q}')
            input.dispatchEvent(new Event('input', { bubbles: true }))
            return true
          })()`
        await waitForProbe(win, typeQuery(fileLabels[0]!), 5_000)
        await waitForProbe(win, `(document.querySelector('.panel-tab-menu-count') !== null)`, 5_000)
        const countShown = (await js(
          `document.querySelector('.panel-tab-menu-count')?.textContent ?? ''`
        )) as string
        if (!/^1\/1$/.test(countShown)) fail(`search match counter read '${countShown}', expected 1/1`)
        await js(
          `document.querySelector('.panel-tab-menu-search input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); true`
        )
        await js(
          `document.querySelector('.panel-tab-menu-search input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); true`
        )
        if (!(await waitForProbe(win, `(${TAB_COUNT}) === 3`, 5_000))) fail('search+Enter never reopened the recently closed tab')
        log('panel_search_reopen_ok')

        // Close it again, then prove the preference round-trip: the closed
        // entry must reach the persisted preferences document.
        await waitForProbe(win, tabWithLabel(fileLabels[0]!, 'close'), 5_000)
        let closedJson = ''
        for (let waited = 0; waited < 10_000 && !closedJson.includes(fileLabels[0]!); waited += 200) {
          closedJson = (await js(
            `window.picode.settings.get().then((s) => JSON.stringify(s.preferences.recentlyClosedTabs)).catch(() => 'err')`
          )) as string
          if (closedJson.includes(fileLabels[0]!)) break
          await new Promise((r) => setTimeout(r, 200))
        }
        if (!closedJson.includes(fileLabels[0]!)) fail(`recently closed never reached preferences: ${closedJson}`)
        log('panel_preferences_ok')

        // RESTART: a renderer reload re-hydrates the persisted history —
        // the recently closed entry must survive and reopen from scratch.
        await win.webContents.reload()
        await waitForProbe(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
        await new Promise((r) => setTimeout(r, 500))
        // Press-until-present: the fresh renderer's keymap listener may not
        // be attached when the marker first flips.
        await waitForProbe(
          win,
          `(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', altKey: true, metaKey: true, bubbles: true }))
            return document.querySelector('.side-panel') !== null
          })()`,
          5_000
        )
        await js(`document.querySelector('button[aria-label="Manage tabs"]')?.click(); true`)
        await waitForProbe(win, `(document.querySelector('.panel-tab-menu') !== null)`, 5_000)
        await waitForProbe(win, menuHasRecent, 10_000)
        log('panel_restart_keep_ok')

        // Click the persisted entry: it returns as a live tab.
        const clickRecent = `(() => {
          for (const rowEl of document.querySelectorAll('.panel-menu-row')) {
            if (rowEl.querySelector('.panel-menu-row-label')?.textContent !== '${fileLabels[0]}') continue
            const main = rowEl.querySelector('.panel-menu-row-main')
            if (main instanceof HTMLElement) { main.click(); return true }
          }
          return false
        })()`
        await waitForProbe(win, clickRecent, 5_000)
        await waitForProbe(
          win,
          `( !!Array.from(document.querySelectorAll('.panel-tab-label span')).find((el) => el.textContent === '${fileLabels[0]}') )`,
          5_000
        )
        log('panel_reopen_after_restart_ok')

        // Leave a clean preference store behind (the stage's own entries).
        await js(`window.picode.settings.set({ recentlyClosedTabs: [] }); true`)
      })
    } finally {
      rmSync(panelSeed, { recursive: true, force: true })
    }
    log('panel_tabs_done')

    // ---- ticket 35: session-row context menu + archive ----
    // The archive target is ms2: its host was SIGKILLed in the crash-isolation
    // stage, so the row is settled (no host, no run, no gate) and nothing is
    // lost by hiding it. The stage: hover reveals the archive button in the
    // dot slot (REAL input — the CSS :hover gate follows real moves only),
    // clicking it hides the row from both sidebar views, the trash button
    // swaps to the archive view where one click restores the row, and the
    // right-click menu shows the nine entries in ZCode order with the copy
    // actions firing the read-only context-action IPC (main's bounded log is
    // the assertion surface).
    log('context_menu_start')
    if (!ms2.sessionFile) fail('ticket-35 stage: multi session 2 did not report its file')
    const archiveRowSel = `[data-file="${ms2.sessionFile}"]`
    await withWindow(getWindow, async (win) => {
      const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
      if (!(await waitForProbe(win, `document.querySelector('${archiveRowSel}') !== null`, 10_000))) {
        fail('ticket-35 stage: the archive target row never reached the sidebar')
      }

      // Hover the row: the archive button must fade into the dot slot.
      const rowPoint = (await js(`(() => {
        const row = document.querySelector('${archiveRowSel}')
        if (!(row instanceof Element)) return null
        const r = row.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })()`)) as { x: number; y: number } | null
      if (!rowPoint) fail('ticket-35 stage: could not locate the archive target row')
      win.webContents.sendInputEvent({ type: 'mouseMove', x: rowPoint.x, y: rowPoint.y })
      await new Promise((r) => setTimeout(r, 150))
      win.webContents.sendInputEvent({ type: 'mouseMove', x: rowPoint.x, y: rowPoint.y })
      const hoverOk = await waitForProbe(
        win,
        `(() => {
          const btn = document.querySelector('${archiveRowSel} .sb-arch-btn')
          if (!btn) return false
          const s = getComputedStyle(btn)
          return s.visibility === 'visible' && Number(s.opacity) > 0.9
        })()`,
        5_000
      )
      if (!hoverOk) fail('hover never revealed the archive button in the dot slot (ticket 35)')

      // Archive through the hover button: the row leaves both sidebar views
      // and the toast confirms where to undo it.
      await js(
        `document.querySelector('${archiveRowSel} .sb-arch-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      const gone = await waitForProbe(win, `document.querySelector('${archiveRowSel}') === null`, 10_000)
      if (!gone) fail('archiving never removed the row from the sidebar lists (ticket 35)')
      if (!(await waitForProbe(win, `document.body.textContent.includes('Task archived')`, 3_000))) {
        fail('archiving never confirmed with a toast (ticket 35)')
      }
      log('archive_hidden_ok')

      // The trash button swaps the sidebar into the archive view; the
      // archived row is listed there with a one-click restore.
      if (!(await waitForProbe(win, `document.querySelector('button[aria-label="Archived tasks"]') !== null`, 5_000))) {
        fail('ticket-35 stage: the trash button is missing')
      }
      await js(
        `document.querySelector('button[aria-label="Archived tasks"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelector('.sb-archived') !== null`, 5_000))) {
        fail('the trash button never opened the archive view (ticket 35)')
      }
      if (!(await waitForProbe(win, `document.querySelector('.sb-archived ${archiveRowSel}') !== null`, 5_000))) {
        fail('the archived row is not listed in the archive view')
      }
      log('archive_view_ok')

      // One-click restore: the row leaves the archive list; back on the task
      // list it is present again.
      await js(
        `document.querySelector('.sb-archived ${archiveRowSel} .sb-restore-btn')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelector('.sb-archived ${archiveRowSel}') === null`, 10_000))) {
        fail('restore never removed the row from the archive view (ticket 35)')
      }
      await js(
        `document.querySelector('button[aria-label="Back to tasks"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelector('.sb-task${archiveRowSel}') !== null`, 10_000))) {
        fail('the restored row never returned to the task list (ticket 35)')
      }
      log('archive_restore_ok')

      // Right-click the row: the nine-item menu, three groups, ZCode order.
      await js(`(() => {
        const row = document.querySelector('${archiveRowSel}')
        if (!(row instanceof Element)) return
        const r = row.getBoundingClientRect()
        row.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true,
          clientX: Math.round(r.left + 60), clientY: Math.round(r.top + r.height / 2)
        }))
      })(); true`)
      if (!(await waitForProbe(win, `document.querySelector('.sb-context-menu') !== null`, 5_000))) {
        fail('right-click never opened the session context menu (ticket 35)')
      }
      const menuShape = (await js(`(() => {
        const menu = document.querySelector('.sb-context-menu')
        if (!menu) return null
        return {
          groups: menu.querySelectorAll('.sb-context-group').length,
          items: [...menu.querySelectorAll('.sb-context-item')].map((el) => el.textContent)
        }
      })()`)) as { groups: number; items: string[] } | null
      if (!menuShape) fail('the context menu vanished before it could be inspected')
      if (menuShape.groups !== 3) fail(`context menu should have three groups, saw ${menuShape.groups}`)
      const expectedItems = [
        'Pin task', 'Rename task', 'Archive task', 'Mark as Unread',
        'Reveal in Finder', 'Copy task path', 'Copy session file path', 'Copy session ID',
        'View call trace'
      ]
      if (JSON.stringify(menuShape.items) !== JSON.stringify(expectedItems)) {
        fail(`context menu items/order wrong: ${menuShape.items.join(' | ')}`)
      }
      log('context_menu_items_ok')

      // Copy session ID → the read-only context-action IPC must fire (the
      // main-side bounded action log is the assertion surface).
      await js(
        `[...document.querySelectorAll('.sb-context-item')].find((el) => el.textContent === 'Copy session ID')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      let copyIdFired = false
      for (let waited = 0; waited < 5_000 && !copyIdFired; waited += 100) {
        copyIdFired = (actions?.log ?? []).some((a) => a.kind === 'copy' && a.text === ms2.sessionId)
        if (!copyIdFired) await new Promise((r) => setTimeout(r, 100))
      }
      if (!copyIdFired) fail('Copy session ID never fired the context-action IPC (ticket 35)')
      if (!(await waitForProbe(win, `document.querySelector('.sb-context-menu') === null`, 3_000))) {
        fail('the context menu stayed open after running an action')
      }
      log('context_menu_copy_id_ok')

      // Copy task path → the cwd payload round-trips through the same IPC.
      await js(`(() => {
        const row = document.querySelector('${archiveRowSel}')
        if (!(row instanceof Element)) return
        const r = row.getBoundingClientRect()
        row.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true,
          clientX: Math.round(r.left + 60), clientY: Math.round(r.top + r.height / 2)
        }))
      })(); true`)
      if (!(await waitForProbe(win, `document.querySelector('.sb-context-menu') !== null`, 5_000))) {
        fail('the context menu never re-opened for the task-path copy')
      }
      await js(
        `[...document.querySelectorAll('.sb-context-item')].find((el) => el.textContent === 'Copy task path')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      let copyCwdFired = false
      for (let waited = 0; waited < 5_000 && !copyCwdFired; waited += 100) {
        copyCwdFired = (actions?.log ?? []).some((a) => a.kind === 'copy' && a.text === cwd)
        if (!copyCwdFired) await new Promise((r) => setTimeout(r, 100))
      }
      if (!copyCwdFired) fail('Copy task path never fired the context-action IPC with the cwd (ticket 35)')
      log('context_menu_copy_cwd_ok')
    })
    log('context_menu_done')

    // ---- ticket 36: call-trace tab ----
    // Right-click the RICHEST session's row (ms1: warm turn + counting run
    // + the ticket-25 bash approval round + simulated TUI turns) and choose
    // View call trace. The tab opens in the side panel (identity = session
    // file), renders entries fully expanded with usage columns read from the
    // REAL file, refresh keeps them, close removes the tab. Read-only: the
    // host process is never involved.
    log('trace_start')
    if (!ms1.sessionFile) fail('ticket-36 stage: ms1 did not report its file')
    const traceFile: string = ms1.sessionFile
    const traceRowSel = `[data-file="${ms1.sessionFile}"]`
    await withWindow(getWindow, async (win) => {
      const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)
      const openMenu = `(() => {
        const row = document.querySelector('${traceRowSel}')
        if (!(row instanceof Element)) return false
        const r = row.getBoundingClientRect()
        row.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true, cancelable: true,
          clientX: Math.round(r.left + 60), clientY: Math.round(r.top + r.height / 2)
        }))
        return true
      })(); true`
      if (!(await waitForProbe(win, openMenu + ` && document.querySelector('.sb-context-menu') !== null`, 10_000))) {
        fail('ticket-36 stage: the context menu never opened for View call trace')
      }
      await js(
        `[...document.querySelectorAll('.sb-context-item')].find((el) => el.textContent === 'View call trace')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      // The trace tab is open AND active inside the panel framework.
      const traceTabProbe = `(() => {
        const tabs = [...document.querySelectorAll('[data-panel-tab]')]
        return tabs.some((el) => (el.getAttribute('data-panel-tab') ?? '').startsWith('["trace"') && el.classList.contains('panel-tab-active'))
          && document.querySelector('.side-panel .trace-view') !== null
      })()`
      if (!(await waitForProbe(win, traceTabProbe, 10_000))) {
        fail('View call trace never opened an active Trace tab in the side panel (ticket 36)')
      }
      log('trace_tab_open_ok')

      // Entries: at least two model calls from ms1's real traffic, fully
      // expanded — both an Input and an Output section on screen, a usage
      // column (the SDK records usage on every settled call), and the bash
      // round's tool-call block with its tool-name chip.
      if (!(await waitForProbe(win, `document.querySelectorAll('.trace-call').length >= 2`, 10_000))) {
        fail('the trace list never rendered the model calls of the session (ticket 36)')
      }
      const shape = (await js(`(() => {
        const entries = [...document.querySelectorAll('.trace-call')]
        return {
          entries: entries.length,
          expanded: entries.filter((el) => el.querySelector('.trace-section') !== null).length,
          inputSections: document.querySelectorAll('.trace-section-label')?.length ?? 0,
          usageColumns: entries.filter((el) => el.querySelector('.trace-call-usage .trace-num') !== null).length,
          toolChips: [...document.querySelectorAll('.trace-kind-tool-call')].length,
          userBlocks: [...document.querySelectorAll('.trace-kind-user')].length,
          assistantBlocks: [...document.querySelectorAll('.trace-kind-assistant')].length,
          stats: document.querySelector('.trace-stats')?.textContent ?? '',
          title: document.querySelector('.trace-title')?.textContent ?? ''
        }
      })()`)) as {
        entries: number
        expanded: number
        inputSections: number
        usageColumns: number
        toolChips: number
        userBlocks: number
        assistantBlocks: number
        stats: string
        title: string
      } | null
      if (!shape) fail('the trace shape probe failed')
      if (shape.expanded !== shape.entries) fail(`trace entries must render expanded by default (${shape.expanded}/${shape.entries})`)
      if (shape.usageColumns < 1) fail('no entry shows a usage column — the IN/OUT derivation is missing (ticket 36)')
      if (shape.toolChips < 1) fail('the bash approval round is missing its tool-call block')
      if (shape.userBlocks < 1) fail('no user block in any input section')
      if (shape.assistantBlocks < 1) fail('no assistant block in any output section')
      if (!/^\d+ calls/.test(shape.stats)) fail(`header stats line wrong: "${shape.stats}"`)
      if (shape.title === '') fail('header title is empty')
      log('trace_entries_ok', `${shape.entries} entries, stats "${shape.stats.trim()}"`)

      // Refresh: the header's refresh button re-reads the file; entries stay.
      await js(`document.querySelector('button[aria-label="Refresh trace"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      await new Promise((r) => setTimeout(r, 300))
      const afterRefresh = (await js(`document.querySelectorAll('.trace-call').length`)) as number
      if (afterRefresh !== shape.entries) fail(`refresh changed the entry count (${shape.entries} → ${afterRefresh})`)
      log('trace_refresh_ok')

      // ---- ticket 37: live follow — growth refreshes WITHOUT refresh ----
      // Append one settled call (user + assistant, both carrying a unique
      // marker) to ms1's file, exactly like an other-end TUI write. The
      // trace tab must gain the entry through the follow push alone (host
      // re-derives on size change), with NO re-request.
      if (!(await appendTraceGrowthTurn(traceFile))) fail('ticket-37 stage: could not append the growth turn')
      const grown = await waitForProbe(
        win,
        `document.querySelectorAll('.trace-call').length === ${shape.entries + 1}`,
        10_000
      )
      if (!grown) fail(`trace live follow never delivered the appended call (${shape.entries} → ?)`) // poll cadence ~2s
      log('trace_growth_ok')

      // ---- ticket 37: search — count + ↑↓ navigation + hit highlight ----
      await js(
        `document.querySelector('button[aria-label="Search trace"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelector('.trace-search-input') !== null`, 5_000))) {
        fail('the search button never opened the trace search bar (ticket 37)')
      }
      // The count reads 0/0 before typing (ZCode reference frame).
      if ((await js(`document.querySelector('.trace-search-count')?.textContent`)) !== '0/0') {
        fail('the empty search count must read 0/0')
      }
      const typeQuery = `(() => {
        const input = document.querySelector('.trace-search-input')
        if (!(input instanceof HTMLInputElement)) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, 'PICODE_TRACE_GROWTH_37')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })(); true`
      if (!(await waitForProbe(
        win,
        typeQuery + ` && document.querySelector('.trace-search-count')?.textContent === '1/2'`,
        5_000
      ))) {
        fail('typing the growth marker never matched exactly 2 blocks with the count reading 1/2')
      }
      // ↓ navigation wraps to the second match; the hit block highlights.
      await js(`document.querySelector('button[aria-label="Next match"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitForProbe(
        win,
        `document.querySelector('.trace-search-count')?.textContent === '2/2' && document.querySelectorAll('.trace-block-active').length === 1`,
        5_000
      ))) {
        fail('Next match never moved to 2/2 with a highlighted hit block (ticket 37)')
      }
      // ↑ wraps back around to the first match.
      await js(`document.querySelector('button[aria-label="Previous match"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitForProbe(win, `document.querySelector('.trace-search-count')?.textContent === '1/2'`, 5_000))) {
        fail('Previous match never wrapped back to 1/2 (ticket 37)')
      }
      // × closes the bar and clears the highlight.
      await js(`document.querySelector('button[aria-label="Close search"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitForProbe(
        win,
        `document.querySelector('.trace-search-input') === null && document.querySelectorAll('.trace-block-active').length === 0`,
        5_000
      ))) {
        fail('closing the search never removed the bar and the hit highlight (ticket 37)')
      }
      log('trace_search_ok')

      // ---- ticket 37: block-kind toggles (six switches, default all on) ----
      await js(`document.querySelector('button[aria-label="Block types"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitForProbe(win, `document.querySelectorAll('.trace-kind-row').length === 6`, 5_000))) {
        fail('the Block types button never opened the six-kind toggle panel (ticket 37)')
      }
      const userBlocksBefore = (await js(`document.querySelectorAll('.trace-list .trace-kind-user').length`)) as number
      if (userBlocksBefore < 1) fail('expected at least one user block before the toggle round')
      await js(
        `[...document.querySelectorAll('.trace-kind-row')].find((el) => el.textContent === 'User message')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelectorAll('.trace-list .trace-kind-user').length === 0`, 5_000))) {
        fail('toggling User message off never removed the user blocks (ticket 37)')
      }
      await js(
        `[...document.querySelectorAll('.trace-kind-row')].find((el) => el.textContent === 'User message')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelectorAll('.trace-list .trace-kind-user').length === ${userBlocksBefore}`, 5_000))) {
        fail('toggling User message back on never restored the user blocks (ticket 37)')
      }
      // Escape closes the panel.
      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true`)
      if (!(await waitForProbe(win, `document.querySelector('.trace-kind-menu') === null`, 5_000))) {
        fail('Escape never closed the block-type panel (ticket 37)')
      }
      log('trace_kind_toggles_ok')

      // ---- ticket 37: expand-all ↔ collapse-all ----
      // Collapse all: every block folds to its one-line row.
      await js(`document.querySelector('button[aria-label="Collapse all blocks"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitForProbe(
        win,
        `(() => { const all = document.querySelectorAll('.trace-block').length; const c = document.querySelectorAll('.trace-block-collapsed').length; return all > 0 && all === c })()`,
        5_000
      ))) {
        fail('Collapse all never folded every block (ticket 37)')
      }
      // Expand all (the button flips its label with the state).
      await js(`document.querySelector('button[aria-label="Expand all blocks"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitForProbe(win, `document.querySelectorAll('.trace-block-collapsed').length === 0`, 5_000))) {
        fail('Expand all never unfolded every block (ticket 37)')
      }
      // A single block's chevron folds just that block.
      await js(
        `document.querySelector('.trace-block .trace-block-head')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelectorAll('.trace-block-collapsed').length === 1`, 5_000))) {
        fail('a block head click never folded just that block (ticket 37)')
      }
      await js(
        `document.querySelector('.trace-block-collapsed .trace-block-head')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitForProbe(win, `document.querySelectorAll('.trace-block-collapsed').length === 0`, 5_000))) {
        fail('clicking the folded block head never re-expanded it (ticket 37)')
      }
      log('trace_expand_collapse_ok')

      // Close: the tab leaves the panel framework (recently closed tracks it).
      await js(`document.querySelector('.trace-view')?.closest('.side-panel')?.querySelector('button[aria-label="Close trace"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`)
      if (!(await waitForProbe(win, `document.querySelector('.side-panel .trace-view') === null`, 5_000))) {
        fail('the trace close button never removed the tab (ticket 36)')
      }
      log('trace_close_ok')
    })
    log('trace_done')

    // Quit: EVERY remaining host must terminate — no orphans (ticket 20).
    const livePids = supervisor.hostPids
    if (livePids.length < 2) fail(`expected at least 2 live hosts before quit, saw ${livePids.length}`)


    supervisor.shutdownAll()
    for (let waited = 0; waited < 10_000; waited += 100) {
      const alive = livePids.filter((p) => {
        try {
          process.kill(p, 0)
          return true
        } catch {
          return false
        }
      })
      if (alive.length === 0) break
      await new Promise((r) => setTimeout(r, 100))
    }
    const stillAlive = livePids.filter((p) => {
      try {
        process.kill(p, 0)
        return true
      } catch {
        return false
      }
    })
    if (stillAlive.length > 0) fail(`orphaned hosts after shutdownAll: ${stillAlive.join(', ')}`)
    log('multi_shutdown_no_orphans_ok', `${livePids.length} hosts`)
    log('done')
    app.exit(0)
  }

  main().catch((err: unknown) => {
    fail(err instanceof Error ? err.message : String(err))
  })

  return {
    onHostEvent,
    onApprovalNotice: (notice: ApprovalNotice): void => {
      approvalNotices.push(notice)
    }
  }
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
/** Append one settled call (user + assistant, both carrying the ticket-37
 * growth marker) to a session file, chained to its leaf. This is the live-
 * follow assertion's append: the open trace tab must pick it up without
 * any re-request. */
const TRACE_GROWTH_MARKER = 'PICODE_TRACE_GROWTH_37'

async function appendTraceGrowthTurn(file: string): Promise<boolean> {
  const { appendFile, readFile } = await import('node:fs/promises')
  const text = await readFile(file, 'utf8')
  const leafId = lastEntryId(text)
  if (leafId === null) return false
  const t = new Date().toISOString()
  const entries = [
    {
      type: 'message',
      id: `t37u-${Date.now()}`,
      parentId: leafId,
      timestamp: t,
      message: { role: 'user', content: [{ type: 'text', text: `${TRACE_GROWTH_MARKER}: watch this call appear` }] }
    },
    {
      type: 'message',
      id: `t37a-${Date.now()}`,
      parentId: `t37u-${Date.now()}`,
      timestamp: t,
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: `${TRACE_GROWTH_MARKER}: the live-followed call` }],
        usage: { input: 101, output: 23 },
        timestamp: Date.parse(t)
      }
    }
  ]
  const separator = text.endsWith('\n') || text === '' ? '' : '\n'
  await appendFile(file, separator + entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
  return true
}

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
 * Seed the ticket-31 panel stage's disposable git workspace: one committed
 * + modified file and one untracked file, so the Review tab lists two
 * deep-linkable rows. Removed by the stage's finally block.
 */
function seedPanelWorkspace(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'picode-smoke-panel-'))
  const git = (args: string[]): string => execFileSync('git', args, { cwd: dir, stdio: 'pipe' }).toString()
  const gitOpt = (args: string[]): string[] => [
    '-c', 'user.email=smoke@picode.local', '-c', 'user.name=PiCode Smoke', '-c', 'commit.gpgsign=false', ...args
  ]
  git(gitOpt(['init', '-q']))
  writeFileSync(path.join(dir, 'panel_alpha.md'), '# alpha\n\nseeded smoke content\n')
  git(gitOpt(['add', '.']))
  git(gitOpt(['commit', '-q', '-m', 'seed']))
  writeFileSync(path.join(dir, 'panel_alpha.md'), '# alpha\n\nmodified by the panel smoke\n')
  writeFileSync(path.join(dir, 'panel_beta.md'), '# beta\n\nuntracked addition\n')
  return dir
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
