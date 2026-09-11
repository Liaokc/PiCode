/**
 * Worked-container permanence visual-QA harness (ticket 55, spec R5).
 * Enabled with PICODE_VISUAL=1 plus PICODE_VISUAL_WORKED=1. NOT part of
 * `npm test` — but like the answer-split harness it ASSERTS its probe
 * results (exit 1 on any violation): permanence and inertness are exact
 * state, not eyeballable.
 *
 * The invariants under test (the Seam-1 groupTurns presence + the
 * TurnContainer inert row, rendered) — the operator-approved ZCode
 * deviation: every turn with a user bubble owns its container row:
 *
 *   1. A REPLAYED zero-work turn (pure-text answer) keeps its "Worked" row
 *      after settling — the settled half of the operator's evidence frame
 *      `.scratch/compare/pi15-empty-worked-container.png` (the row used to
 *      vanish entirely). Replayed rows carry no duration (ticket 14 rule).
 *   2. The empty body is NOT expandable: no chevron, click no-op,
 *      aria-disabled (Q12 ruling A — expandable ⇔ body non-empty).
 *   3. A LIVE zero-work turn shows "Working · Ns" through the silent period
 *      (before any part streams) and keeps the row as "Worked · Ns" after
 *      settling — the live half of the same evidence frame.
 *
 * Seeding: the transcript is injected through the contract stream
 * (session_created(resumed) + history_loaded + live streaming events — the
 * visual-perf precedent, no model call). An isolated session store gets one
 * fake sidebar row so committed frames never show the operator's real
 * sessions; throwaway userData keeps the run off the operator's preferences.
 *
 * Captures (PNGs land in the visual out dir):
 *   wc1-worked-replayed  — replayed zero-work turn: bare inert "Worked" row
 *   wc2-worked-silent    — live silent period: bare inert "Working · 1s" row
 *   wc3-worked-settled   — settled streamed turn: "Worked · 1s" row persists
 */

import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { emitContractEvent, visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the worked-container harness (PICODE_VISUAL_WORKED=1
 * alongside PICODE_VISUAL=1) — every other visual harness stands down. */
export function workedVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_WORKED'] === '1'
}

/** Throwaway userData (no-op unless PICODE_VISUAL_WORKED=1). Called from
 * index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateWorkedUserData(): void {
  if (!workedVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-worked-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** The transcript, compressed from the evidence session 01a0810d: one
 * replayed zero-work turn (user + a single text part — no thinking, no
 * tools, no narration; entries 272→273 of the evidence session). */
const HISTORY_ITEMS = [
  { role: 'user' as const, id: 'wc-u1', text: 'Q: quick hello', timestamp: '2026-09-10T09:00:00.000Z', skillName: null },
  {
    role: 'assistant' as const,
    id: 'wc-a1',
    timestamp: '2026-09-10T09:00:05.000Z',
    text: 'Hello! Ask me anything about this workspace.',
    parts: [{ kind: 'text' as const, text: 'Hello! Ask me anything about this workspace.' }]
  }
]

const SIG = `(() => ({
  turns: document.querySelectorAll('.turn-container').length,
  open: document.querySelectorAll('.turn-container-open').length,
  chevrons: document.querySelectorAll('.turn-container-chevron').length,
  durations: document.querySelectorAll('.turn-container-duration').length,
  labels: [...document.querySelectorAll('.turn-container-label')].map((el) => el.textContent ?? ''),
  inert: [...document.querySelectorAll('.turn-container-header')].map((el) => el.getAttribute('aria-disabled') === 'true'),
  answers: document.querySelectorAll('.msg-assistant .md').length
}))()`

interface WorkedSig {
  turns: number
  open: number
  chevrons: number
  durations: number
  labels: string[]
  inert: boolean[]
  answers: number
}

async function waitFor(win: BrowserWindow, probe: string, budgetMs: number): Promise<boolean> {
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
  console.log(`VISUAL captured ${name}.png`)
}

export function startWorkedVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!workedVisualEnabled()) return

  // Committed frames must never show the operator's real sessions: isolate
  // the session store (PICODE_SESSION_DIR) BEFORE the index constructs, and
  // seed one fake row so the sidebar looks natural (same rule as the other
  // store harnesses).
  const store = ensureVisualStore()
  writeVisualSession(store, {
    id: 'visual-worked-side',
    cwd: ensureVisualProjectDir('greetings'),
    userText: 'Q: quick hello'
  })

  void (async () => {
    try {
      const { mkdirSync } = await import('node:fs')
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('worked visual: no window')
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)
      win.webContents.setBackgroundThrottling(false)

      emitContractEvent({
        type: 'session_created',
        sessionId: 'visual-worked-container',
        cwd: tmpdir(),
        model: 'claude-opus-4-5',
        resumed: true
      })
      emitContractEvent({ type: 'history_loaded', items: HISTORY_ITEMS })
      await sleep(700)

      // ---- wc1: the replayed zero-work turn keeps its bare "Worked" row ----
      const replayed = (await win.webContents.executeJavaScript(SIG)) as WorkedSig
      const replayedProblems: string[] = []
      if (replayed.turns !== 1) replayedProblems.push(`turns ${replayed.turns} !== 1`)
      if (replayed.open !== 0) replayedProblems.push(`open ${replayed.open} !== 0`)
      if (replayed.chevrons !== 0) replayedProblems.push(`chevrons ${replayed.chevrons} !== 0`)
      if (replayed.durations !== 0) replayedProblems.push(`durations ${replayed.durations} !== 0`)
      if (replayed.labels.join() !== 'Worked') replayedProblems.push(`labels ${replayed.labels.join()} !== 'Worked'`)
      if (replayed.inert.join() !== 'true') replayedProblems.push('the empty row is not aria-disabled')
      if (replayed.answers !== 1) replayedProblems.push(`answers ${replayed.answers} !== 1`)
      if (replayedProblems.length > 0) throw new Error(`worked visual wc1: ${replayedProblems.join('; ')}`)
      console.log(`VISUAL probe wc1: ${JSON.stringify(replayed)}`)

      await win.webContents.executeJavaScript(
        `(() => {
          const thread = document.querySelector('.chat-thread')
          if (thread instanceof HTMLElement) thread.scrollTop = thread.scrollHeight
          return true
        })()`
      )
      await sleep(300)
      await capture(win, 'wc1-worked-replayed')

      // ---- wc2: the live silent period keeps its bare "Working · 1s" row ----
      emitContractEvent({ type: 'user_message', text: 'And a live hello.' })
      emitContractEvent({ type: 'agent_start' })
      const silentOk = await waitFor(
        win,
        `${SIG}.turns === 2 && ${SIG}.labels.join() === 'Worked,Working' && ${SIG}.open === 0 &&
         ${SIG}.chevrons === 0 && ${SIG}.inert.join() === 'true,true'`,
        10_000
      )
      if (!silentOk) {
        const state = (await win.webContents.executeJavaScript(SIG).catch(() => '?')) as string
        throw new Error(`worked visual wc2: the silent period lost its Working row (state: ${state})`)
      }
      await sleep(1200) // let the container timer earn its 1s tick
      const silent = (await win.webContents.executeJavaScript(SIG)) as WorkedSig
      if (silent.durations !== 1) throw new Error(`worked visual wc2: silent-period duration rows ${silent.durations} !== 1`)
      console.log(`VISUAL probe wc2: ${JSON.stringify(silent)}`)

      await win.webContents.executeJavaScript(
        `(() => {
          const thread = document.querySelector('.chat-thread')
          if (thread instanceof HTMLElement) thread.scrollTop = thread.scrollHeight
          return true
        })()`
      )
      await sleep(300)
      await capture(win, 'wc2-worked-silent')

      // ---- wc3: settled — the streamed row persists as "Worked · Ns" ----
      emitContractEvent({ type: 'message_start' })
      emitContractEvent({ type: 'text_delta', delta: 'Hello live!' })
      emitContractEvent({ type: 'message_end' })
      await sleep(300)
      emitContractEvent({ type: 'agent_end' })
      const settledOk = await waitFor(
        win,
        `${SIG}.turns === 2 && ${SIG}.labels.join() === 'Worked,Worked' && ${SIG}.durations === 1 &&
         ${SIG}.open === 0 && ${SIG}.chevrons === 0 && ${SIG}.answers === 2 && ${SIG}.inert.join() === 'true,true'`,
        10_000
      )
      if (!settledOk) {
        const state = (await win.webContents.executeJavaScript(SIG).catch(() => '?')) as string
        throw new Error(`worked visual wc3: the settled turn did not keep its Worked row (state: ${state})`)
      }
      const settled = (await win.webContents.executeJavaScript(SIG)) as WorkedSig
      console.log(`VISUAL probe wc3: ${JSON.stringify(settled)}`)

      await win.webContents.executeJavaScript(
        `(() => {
          const thread = document.querySelector('.chat-thread')
          if (thread instanceof HTMLElement) thread.scrollTop = thread.scrollHeight
          return true
        })()`
      )
      await sleep(300)
      await capture(win, 'wc3-worked-settled')

      console.log('VISUAL worked-container done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL worked-container FAIL', err)
      app.exit(1)
    }
  })()
}
