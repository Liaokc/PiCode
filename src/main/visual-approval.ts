/**
 * Visual-QA harness for ticket 25 (background approval UX): the orange
 * awaiting-approval badge, the pill parking inside a background session,
 * and the deny story in the settled transcript. Enabled with PICODE_VISUAL=1
 * + PICODE_VISUAL_APPROVAL=1. NOT part of `npm test` — a human compares the
 * PNGs against the ticket's acceptance line.
 *
 * Modeled on the ticket-20 harness (visual-multisession): it seeds an
 * isolated session store (PICODE_SESSION_DIR temp dir) with two fake
 * sessions the index will list, then injects wrapped `session_event`s:
 *
 *   BG "api-server" — hits the approval gate while the view is on FG;
 *                     the pill parks in ITS registry state (orange badge)
 *   FG "web-app"    — the focused, idle foreground view (empty slot)
 *
 * Captures:
 *   a1-bg-approval-badge — BG parked at the gate, unfocused: orange badge
 *                          on its row, NO pill anywhere in the DOM (the
 *                          pill lives in the session, never auto-resolved).
 *                          The App also raises the REAL OS notification at
 *                          this moment — OS banners are not part of the
 *                          captured web contents, but the operator sees the
 *                          actual knock on their desktop (smoke asserts the
 *                          notification pipeline end to end).
 *   a2-bg-approval-pill  — after clicking BG's row (the notification-click
 *                          deep link drives the same focus_session): the
 *                          parked pending pill on screen, same controls a
 *                          foreground approval always had.
 *   a3-bg-deny-transcript— the deny story settled and opened: turn 1's
 *                          approved bash tool card + turn 2's denied write
 *                          pill carrying the round-tripped reason.
 */

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { type BrowserWindow } from 'electron'
import { approvalVisualEnabled, emitContractEvent, visualOutDir } from './visual'
import { ensureVisualStore, writeVisualSession } from './visual-store'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const BG_ID = 'approval-visual-bg'
const FG_ID = 'approval-visual-fg'
const API_CWD = '/Users/dev/projects/api-server'
const WEB_CWD = '/Users/dev/projects/web-app'
const BG_PROMPT = 'Deploy the API server to staging'
const FG_PROMPT = 'Wire the new checkout form to the payments sandbox'
const DENY_PROMPT = 'Create picode-deny-probe.txt with the word nope'
const DENY_REASON = 'No new files today.'

async function waitFor(getWindow: () => BrowserWindow | null, probe: string, budgetMs: number): Promise<boolean> {
  const win = getWindow()
  if (!win) return false
  for (let waited = 0; waited < budgetMs; waited += 100) {
    const ok = (await win.webContents.executeJavaScript(probe).catch(() => false)) as boolean
    if (ok) return true
    await sleep(100)
  }
  return false
}

async function capture(win: BrowserWindow, name: string): Promise<void> {
  const { writeFileSync } = await import('node:fs')
  const png = await win.webContents.capturePage()
  writeFileSync(path.join(visualOutDir(), `${name}.png`), png.toPNG())
  const sig = (await win.webContents.executeJavaScript(
    `JSON.stringify((() => ({
      awaitDots: document.querySelectorAll('.sb-await-dot').length,
      runDots: document.querySelectorAll('.sb-run-dot').length,
      pendingPills: document.querySelectorAll('.approval-pill-pending').length,
      deniedPills: document.querySelectorAll('.approval-pill-denied').length,
      toolCards: document.querySelectorAll('.tool-card').length
    }))())`
  ).catch(() => 'unavailable')) as string
  console.log(`VISUAL captured ${name}.png ${sig}`)
}

async function clickRow(win: BrowserWindow, file: string): Promise<boolean> {
  return (await win.webContents.executeJavaScript(
    `(() => {
      const row = document.querySelector('[data-file="${file}"]')
      if (!row) return false
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return true
    })()`
  ).catch(() => false)) as boolean
}

/** Open every folded turn container so the settled deny story is visible
 * (ticket 23 folds settled turns; the shot shows what opening reveals). */
async function openAllTurnContainers(win: BrowserWindow): Promise<void> {
  for (let round = 0; round < 10; round++) {
    const state = (await win.webContents.executeJavaScript(
      `JSON.stringify({
        all: document.querySelectorAll('.turn-container').length,
        open: document.querySelectorAll('.turn-container-open').length
      })`
    ).catch(() => '{"all":0,"open":0}')) as string
    const counts = JSON.parse(state) as { all: number; open: number }
    if (counts.all > 0 && counts.open === counts.all) return
    await win.webContents.executeJavaScript(
      `document
        .querySelectorAll('.turn-container:not(.turn-container-open) > .turn-container-header')
        .forEach((el) => (el instanceof HTMLElement ? el.click() : undefined)); true`
    ).catch(() => undefined)
    await sleep(200)
  }
}

export function startApprovalVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!approvalVisualEnabled()) return

  // The session index reads PICODE_SESSION_DIR when it is constructed — this
  // starter runs BEFORE that line in the boot sequence, so seeding here
  // isolates the visual store like the smoke does.
  const store = ensureVisualStore()
  const bgFile = writeVisualSession(store, { id: BG_ID, cwd: API_CWD, userText: BG_PROMPT })
  const fgFile = writeVisualSession(store, { id: FG_ID, cwd: WEB_CWD, userText: FG_PROMPT })

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        const w = getWindow()
        if (w) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('approval visual harness: no window')
      // Events emitted before the renderer attaches its Seam-1 subscription
      // are lost — wait for the same readiness marker the smoke uses.
      for (let waited = 0; waited < 15_000; waited += 100) {
        const ready = (await win.webContents.executeJavaScript(
          "document.documentElement.dataset['chatSubscribed'] === 'true'"
        ).catch(() => false)) as boolean
        if (ready) break
        await sleep(100)
      }

      // BG announces and starts a run (focused first — announces focus).
      emitContractEvent({
        type: 'session_event',
        sessionId: BG_ID,
        event: { type: 'session_created', sessionId: BG_ID, cwd: API_CWD, model: 'claude-opus-4-5', sessionFile: bgFile }
      })
      emitContractEvent({ type: 'session_event', sessionId: BG_ID, event: { type: 'user_message', text: BG_PROMPT } })
      emitContractEvent({ type: 'session_event', sessionId: BG_ID, event: { type: 'agent_start' } })
      emitContractEvent({ type: 'session_event', sessionId: BG_ID, event: { type: 'message_start' } })
      emitContractEvent({
        type: 'session_event',
        sessionId: BG_ID,
        event: { type: 'text_delta', delta: 'Deploying to staging — checking the pipeline first.' }
      })
      emitContractEvent({ type: 'session_event', sessionId: BG_ID, event: { type: 'message_end' } })

      // FG announces — focus switches to the foreground view, leaving BG's
      // run in flight in the background (ticket 20 registry semantics).
      emitContractEvent({
        type: 'session_event',
        sessionId: FG_ID,
        event: { type: 'session_created', sessionId: FG_ID, cwd: WEB_CWD, model: 'claude-opus-4-5', sessionFile: fgFile }
      })
      emitContractEvent({ type: 'session_event', sessionId: FG_ID, event: { type: 'user_message', text: FG_PROMPT } })
      emitContractEvent({ type: 'session_event', sessionId: FG_ID, event: { type: 'agent_start' } })
      emitContractEvent({ type: 'session_event', sessionId: FG_ID, event: { type: 'message_start' } })
      emitContractEvent({
        type: 'session_event',
        sessionId: FG_ID,
        event: { type: 'text_delta', delta: 'The checkout form is wired to the payments sandbox.' }
      })
      emitContractEvent({ type: 'session_event', sessionId: FG_ID, event: { type: 'message_end' } })
      emitContractEvent({ type: 'session_event', sessionId: FG_ID, event: { type: 'agent_end' } })

      const rows = await waitFor(getWindow, `document.querySelectorAll('.sb-task').length >= 2`, 15_000)
      if (!rows) throw new Error('approval visual: seeded sessions never reached the sidebar')
      await sleep(400)

      // ---- a1: the gate fires in the BACKGROUND session ------------------
      // The App raises the real OS notification here (the session is not the
      // focused view). The pill parks in BG's registry state; the sidebar
      // lights the orange badge; nothing auto-approves.
      emitContractEvent({
        type: 'session_event',
        sessionId: BG_ID,
        event: {
          type: 'approval_required',
          toolCallId: 'call_bg_gate_bash',
          toolName: 'bash',
          args: { command: 'npm run deploy --stage=prod' }
        }
      })
      const badge = await waitFor(
        getWindow,
        `(() => {
          const row = document.querySelector('[data-file="${bgFile}"]')
          if (!row) return false
          return row.querySelector('.sb-await-dot') !== null &&
                 row.querySelector('.sb-run-dot') === null &&
                 document.querySelectorAll('.approval-pill-pending').length === 0
        })()`,
        10_000
      )
      if (!badge) throw new Error('approval visual: orange badge never lit (or the pill leaked into the DOM)')
      await sleep(400)
      await capture(win, 'a1-bg-approval-badge')

      // ---- a2: the notification click path — focus the parked session ----
      // focusSessionFromNotification ends in the same focus_session routing;
      // the row click here is the identical view change.
      const clicked = await clickRow(win, bgFile)
      if (!clicked) throw new Error('approval visual: BG row not clickable')
      const pill = await waitFor(
        getWindow,
        `document.querySelector('.approval-pill-pending[data-tool="bash"]') !== null`,
        10_000
      )
      if (!pill) throw new Error('approval visual: the parked pending pill never rendered after refocus')
      await sleep(400)
      await capture(win, 'a2-bg-approval-pill')

      // ---- approve the bash call so the frame moves on -------------------
      // approval_resolved ack (ticket 25 host addition) → the tool runs →
      // the pill converts into the tool card in place → the run settles.
      emitContractEvent({
        type: 'session_event',
        sessionId: BG_ID,
        event: { type: 'approval_resolved', toolCallId: 'call_bg_gate_bash', approved: true, reason: null }
      })
      emitContractEvent({
        type: 'session_event',
        sessionId: BG_ID,
        event: { type: 'tool_start', toolCallId: 'call_bg_gate_bash', name: 'bash', args: { command: 'npm run deploy --stage=prod' } }
      })
      emitContractEvent({
        type: 'session_event',
        sessionId: BG_ID,
        event: { type: 'tool_update', toolCallId: 'call_bg_gate_bash', partial: '> prod deploy started\n' }
      })
      emitContractEvent({
        type: 'session_event',
        sessionId: BG_ID,
        event: { type: 'tool_end', toolCallId: 'call_bg_gate_bash', output: '> prod deploy started', isError: false }
      })
      emitContractEvent({ type: 'session_event', sessionId: BG_ID, event: { type: 'agent_end' } })
      await waitFor(
        getWindow,
        `document.querySelector('.approval-pill-pending[data-tool="bash"]') === null &&
         document.querySelectorAll('.tool-card').length >= 1`,
        10_000
      )

      // ---- a3: the deny story, settled and opened ------------------------
      // A second gate hit (write is not remembered), denied WITH a reason:
      // the ack round-trips the reason, the run terminates, and the settled
      // transcript keeps the denied pill telling that story.
      emitContractEvent({ type: 'session_event', sessionId: BG_ID, event: { type: 'user_message', text: DENY_PROMPT } })
      emitContractEvent({ type: 'session_event', sessionId: BG_ID, event: { type: 'agent_start' } })
      emitContractEvent({
        type: 'session_event',
        sessionId: BG_ID,
        event: {
          type: 'approval_required',
          toolCallId: 'call_bg_gate_write',
          toolName: 'write',
          args: { path: 'picode-deny-probe.txt', content: 'nope' }
        }
      })
      await waitFor(
        getWindow,
        `document.querySelector('.approval-pill-pending[data-tool="write"]') !== null`,
        10_000
      )
      emitContractEvent({
        type: 'session_event',
        sessionId: BG_ID,
        event: { type: 'approval_resolved', toolCallId: 'call_bg_gate_write', approved: false, reason: DENY_REASON }
      })
      emitContractEvent({ type: 'session_event', sessionId: BG_ID, event: { type: 'agent_end' } })
      const denied = await waitFor(
        getWindow,
        `document.querySelector('.approval-pill-denied[data-tool="write"]') !== null`,
        10_000
      )
      if (!denied) throw new Error('approval visual: the denied pill never rendered')
      // The settled turn folds (ticket 23) — open it so the shot shows the
      // story a human sees when auditing the turn.
      await openAllTurnContainers(win)
      await sleep(400)
      await capture(win, 'a3-bg-deny-transcript')

      console.log('VISUAL approval done')
      const { app } = await import('electron')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL approval FAIL', err)
      const { app } = await import('electron')
      app.exit(1)
    }
  })()
}
