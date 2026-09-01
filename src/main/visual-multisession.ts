/**
 * Visual-QA harness for ticket 20 (multi-active sessions): sidebar status-dot
 * states, fixed-slot title alignment, and the refocus catch-up. Enabled with
 * PICODE_VISUAL=1 + PICODE_VISUAL_MULTI=1. NOT part of `npm test` — a human
 * compares the PNGs against the ticket's acceptance line.
 *
 * Unlike the transcript harness (which injects unwrapped events for the
 * focused view alone), this one needs SIDEBAR rows, so it seeds an isolated
 * session store (PICODE_SESSION_DIR temp dir) with three fake sessions the
 * index will list:
 *
 *   A "api-server"  — running IN THIS APP (wrapped agent_start + deltas;
 *                     animated accent dot, even while unfocused)
 *   B "web-app"     — written by ANOTHER END (fresh mtime, no registry
 *                     events; static green dot)
 *   C "api-server"  — hosted here but IDLE (fresh mtime; empty slot — an
 *                     in-app session never shows the TUI green dot)
 *
 * Captures:
 *   m1-multi-dots      — C focused (its settled transcript), A streaming in
 *                        the background: all three dot states in one frame
 *   m2-refocus-caughtup— after clicking A's row: same host, caught-up
 *                        transcript with the live stream resumed on screen
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { type BrowserWindow } from 'electron'
import { emitContractEvent, multiSessionVisualEnabled, visualOutDir } from './visual'

export { multiSessionVisualEnabled } from './visual'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const RUNNING_ID = 'multi-visual-running'
const TUI_ID = 'multi-visual-tui'
const IDLE_ID = 'multi-visual-idle'
const API_CWD = '/Users/dev/projects/api-server'
const WEB_CWD = '/Users/dev/projects/web-app'
const STREAM_MARKER = 'Count the deploy checklist from one to twenty, one item per line'

interface FakeSession {
  id: string
  cwd: string
  userText: string
}

/** One minimal Pi session jsonl: header + one user message (the title). */
function fakeSessionFile(dir: string, session: FakeSession): string {
  const now = new Date().toISOString()
  const lines = [
    JSON.stringify({ type: 'session', version: 3, id: session.id, timestamp: now, cwd: session.cwd }),
    JSON.stringify({
      type: 'message',
      id: `${session.id}-u1`,
      parentId: null,
      timestamp: now,
      message: { role: 'user', content: [{ type: 'text', text: session.userText }] }
    })
  ]
  const file = path.join(dir, `visual-${session.id}.jsonl`)
  writeFileSync(file, lines.join('\n') + '\n')
  return file
}

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
      runDots: document.querySelectorAll('.sb-run-dot').length,
      liveDots: document.querySelectorAll('.sb-live-dot').length,
      slots: document.querySelectorAll('.sb-dot-slot').length,
      users: document.querySelectorAll('.msg-user').length,
      assistant: document.querySelectorAll('.msg-assistant').length
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

export function startMultiSessionVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!multiSessionVisualEnabled()) return

  // The session index reads PICODE_SESSION_DIR when it is constructed — this
  // starter runs BEFORE that line in the boot sequence, so setting the env
  // here (when unset) isolates the visual store like the smoke does.
  if (!process.env['PICODE_SESSION_DIR']) {
    process.env['PICODE_SESSION_DIR'] = mkdtempSync(path.join(tmpdir(), 'picode-visual-multi-'))
  }
  const store = process.env['PICODE_SESSION_DIR']
  const runningFile = fakeSessionFile(store, {
    id: RUNNING_ID,
    cwd: API_CWD,
    userText: `${STREAM_MARKER}: migration and rollback steps`
  })
  fakeSessionFile(store, {
    id: TUI_ID,
    cwd: WEB_CWD,
    userText: 'Wire the new checkout form to the payments sandbox'
  })
  const idleFile = fakeSessionFile(store, {
    id: IDLE_ID,
    cwd: API_CWD,
    userText: 'Draft the changelog entry for the 1.1 release'
  })

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        const w = getWindow()
        if (w) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('multi-session visual harness: no window')
      // Events emitted before the renderer attaches its Seam-1 subscription
      // are lost — wait for the same readiness marker the smoke uses.
      for (let waited = 0; waited < 15_000; waited += 100) {
        const ready = (await win.webContents.executeJavaScript(
          "document.documentElement.dataset['chatSubscribed'] === 'true'"
        ).catch(() => false)) as boolean
        if (ready) break
        await sleep(100)
      }

      // Announce the RUNNING session and start its stream (it will never end
      // during the captures — that is the point: a run in flight).
      emitContractEvent({
        type: 'session_event',
        sessionId: RUNNING_ID,
        event: { type: 'session_created', sessionId: RUNNING_ID, cwd: API_CWD, model: 'claude-opus-4-5', sessionFile: runningFile }
      })
      emitContractEvent({
        type: 'session_event',
        sessionId: RUNNING_ID,
        event: { type: 'user_message', text: `${STREAM_MARKER}: migration and rollback steps` }
      })
      emitContractEvent({ type: 'session_event', sessionId: RUNNING_ID, event: { type: 'agent_start' } })
      emitContractEvent({ type: 'session_event', sessionId: RUNNING_ID, event: { type: 'message_start' } })
      for (const delta of ['1. Freeze the release branch. ', '2. Run the full migration in staging. ', '3. Announce the window to the team. ']) {
        emitContractEvent({ type: 'session_event', sessionId: RUNNING_ID, event: { type: 'text_delta', delta } })
        await sleep(60)
      }

      // Announce the IDLE session — focus switches to it (a create always
      // focuses), leaving A streaming in the background.
      emitContractEvent({
        type: 'session_event',
        sessionId: IDLE_ID,
        event: { type: 'session_created', sessionId: IDLE_ID, cwd: API_CWD, model: 'claude-opus-4-5', sessionFile: idleFile }
      })
      emitContractEvent({
        type: 'session_event',
        sessionId: IDLE_ID,
        event: { type: 'user_message', text: 'Draft the changelog entry for the 1.1 release' }
      })
      emitContractEvent({ type: 'session_event', sessionId: IDLE_ID, event: { type: 'agent_start' } })
      emitContractEvent({
        type: 'session_event',
        sessionId: IDLE_ID,
        event: { type: 'message_start' }
      })
      emitContractEvent({
        type: 'session_event',
        sessionId: IDLE_ID,
        event: { type: 'text_delta', delta: 'The 1.1 release focuses on daily usability.' }
      })
      emitContractEvent({ type: 'session_event', sessionId: IDLE_ID, event: { type: 'message_end' } })
      emitContractEvent({ type: 'session_event', sessionId: IDLE_ID, event: { type: 'agent_end' } })

      // The index must list the three seeded rows before any dot can render.
      const rows = await waitFor(
        getWindow,
        `document.querySelectorAll('.sb-task').length >= 3`,
        15_000
      )
      if (!rows) throw new Error('multi-session visual: seeded sessions never reached the sidebar')
      await sleep(500)

      // ---- m1: all three dot states in one frame -------------------------
      // A (unfocused, running) = animated; B (other end, fresh mtime) = green;
      // C (focused, idle in-app) = empty slot. All title left edges align.
      await capture(win, 'm1-multi-dots')

      // ---- m2: refocus the background session ----------------------------
      const clicked = await clickRow(win, runningFile)
      if (!clicked) throw new Error('multi-session visual: running row not clickable')
      const caught = await waitFor(
        getWindow,
        `document.body.textContent.includes('${STREAM_MARKER}') &&
         document.querySelectorAll('.msg-user').length === 1 &&
         document.querySelector('.msg-assistant') !== null`,
        10_000
      )
      if (!caught) throw new Error('multi-session visual: refocus never showed the caught-up transcript')
      await sleep(400)
      await capture(win, 'm2-refocus-caughtup')

      console.log('VISUAL multi-session done')
      const { app } = await import('electron')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL multi-session FAIL', err)
      const { app } = await import('electron')
      app.exit(1)
    }
  })()
}
