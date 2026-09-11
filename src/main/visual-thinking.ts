/**
 * Thinking-row visual-QA harness (ticket 61, spec R7). Enabled with
 * PICODE_VISUAL=1 plus PICODE_VISUAL_THINKING=1. NOT part of `npm test` —
 * but like the worked-container harness it ASSERTS its probe results (exit 1
 * on any violation): timer continuity is exact state, not eyeballable.
 *
 * The invariants under test:
 *
 *   1. CHEVRON FOLD LANGUAGE (aligned with the Worked container): the
 *      thinking row shows a RIGHT chevron (›) while collapsed and a DOWN
 *      chevron (⌄) when expanded — the pre-61 baseline was a down-chevron
 *      rotated 180°, i.e. ↓ collapsed / ↑ expanded, the opposite directions.
 *      Live Thinking and settled Thought share the row, hence the shapes.
 *   2. ENTRY-LEVEL TIMER (the pi15-thinking-timer-reset defect: a 7s count
 *      became 3s across a fold/reopen): the seconds derive from the
 *      entry-level start timestamp in reducer state, so folding the
 *      container mid-stream (the body unmounts the row) and reopening it
 *      CONTINUES the count — never below the pre-fold reading.
 *   3. FREEZE PRIORITY: thinking_end's host-measured durationMs freezes the
 *      label (Thought · Ns) — the existing contract.
 *
 * Seeding: the transcript is injected through the contract stream
 * (session_created + live streaming events — the ticket-55/56 precedent, no
 * model call). An isolated session store gets one fake sidebar row so
 * committed frames never show the operator's real sessions; throwaway
 * userData keeps the run off the operator's preferences.
 *
 * Captures (PNGs land in the visual out dir):
 *   th1-thinking-collapsed — live streaming row, collapsed (› chevron)
 *   th2-thinking-expanded  — the same row opened (⌄ chevron, body visible)
 *   th3-thought-frozen     — settled row after thinking_end (frozen label)
 */

import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { emitContractEvent, visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the thinking harness (PICODE_VISUAL_THINKING=1
 * alongside PICODE_VISUAL=1) — every other visual harness stands down. */
export function thinkingVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_THINKING'] === '1'
}

/** Throwaway userData (no-op unless PICODE_VISUAL_THINKING=1). Called from
 * index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateThinkingUserData(): void {
  if (!thinkingVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-thinking-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const SIG = `(() => {
  const row = document.querySelector('.thinking-row')
  const chevron = row?.querySelector('.row-chevron path')?.getAttribute('d') ?? ''
  return {
    rows: document.querySelectorAll('.thinking-row').length,
    label: row?.querySelector('.thinking-row-label')?.textContent ?? '',
    duration: row?.querySelector('.thinking-row-duration')?.textContent ?? '',
    chevron,
    open: document.querySelectorAll('.thinking-row-open').length,
    body: row?.querySelector('.thinking-row-body')?.textContent ?? ''
  }
})()`

interface ThinkingSig {
  rows: number
  label: string
  duration: string
  chevron: string
  open: number
  body: string
}

/** ChevronDownIcon path starts "m6 9.5"; ChevronRightIcon starts "m10 6". */
const CHEVRON_DOWN = 'm6 9.5'
const CHEVRON_RIGHT = 'm10 6'

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

function scrollToBottom(win: BrowserWindow): Promise<boolean> {
  return win.webContents.executeJavaScript(
    `(() => {
      const thread = document.querySelector('.chat-thread')
      if (thread instanceof HTMLElement) thread.scrollTop = thread.scrollHeight
      return true
    })()`
  ) as Promise<boolean>
}

function thinkingSeconds(sig: ThinkingSig): number {
  return parseInt(sig.duration, 10) || 0
}

export function startThinkingVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!thinkingVisualEnabled()) return

  // Committed frames must never show the operator's real sessions: isolate
  // the session store (PICODE_SESSION_DIR) BEFORE the index constructs, and
  // seed one fake row so the sidebar looks natural (same rule as the other
  // store harnesses).
  const store = ensureVisualStore()
  writeVisualSession(store, {
    id: 'visual-thinking-side',
    cwd: ensureVisualProjectDir('refactor'),
    userText: 'Q: refactor the module'
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
      if (!win) throw new Error('thinking visual: no window')
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)
      win.webContents.setBackgroundThrottling(false)

      emitContractEvent({ type: 'session_created', sessionId: 'visual-thinking-row', cwd: tmpdir(), model: 'claude-opus-4-5' })
      emitContractEvent({ type: 'user_message', text: 'Refactor the session module, think it through first.' })
      emitContractEvent({ type: 'agent_start' })
      emitContractEvent({ type: 'message_start' })
      emitContractEvent({
        type: 'thinking_delta',
        delta: 'The session module has grown — I should split the fold logic from the registry routing first, then re-check the turn keys.'
      })

      // ---- th1: live thinking row, COLLAPSED — right chevron + ticking ----
      const collapsedOk = await waitFor(
        win,
        `${SIG}.rows === 1 && ${SIG}.label === 'Thinking' && ${SIG}.open === 0 && ${SIG}.chevron.startsWith('${CHEVRON_RIGHT}')`,
        10_000
      )
      if (!collapsedOk) {
        const state = (await win.webContents.executeJavaScript(SIG).catch(() => '?')) as string
        throw new Error(`thinking visual th1: the live row is not a collapsed Thinking row (state: ${state})`)
      }
      await sleep(2200) // let the entry-level timer earn some seconds
      const collapsed = (await win.webContents.executeJavaScript(SIG)) as ThinkingSig
      if (!collapsed.chevron.startsWith(CHEVRON_RIGHT)) {
        throw new Error(`thinking visual th1: collapsed chevron is not › (path: ${collapsed.chevron})`)
      }
      if (thinkingSeconds(collapsed) < 2) {
        throw new Error(`thinking visual th1: the stamped timer never ticked (saw ${collapsed.duration})`)
      }
      console.log(`VISUAL probe th1: ${JSON.stringify(collapsed)}`)
      await scrollToBottom(win)
      await sleep(300)
      await capture(win, 'th1-thinking-collapsed')

      // ---- th2: EXPANDED — down chevron + visible reasoning body ----
      await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector('.thinking-row-header'); if (el instanceof HTMLElement) el.click(); return true })()`
      )
      const expandedOk = await waitFor(
        win,
        `${SIG}.open === 1 && ${SIG}.chevron.startsWith('${CHEVRON_DOWN}') && ${SIG}.body !== ''`,
        10_000
      )
      if (!expandedOk) {
        const state = (await win.webContents.executeJavaScript(SIG).catch(() => '?')) as string
        throw new Error(`thinking visual th2: the row did not expand to a ⌄ chevron + body (state: ${state})`)
      }
      const expanded = (await win.webContents.executeJavaScript(SIG)) as ThinkingSig
      console.log(`VISUAL probe th2: ${JSON.stringify(expanded)}`)
      await scrollToBottom(win)
      await sleep(300)
      await capture(win, 'th2-thinking-expanded')

      // ---- timer continuity: fold the container mid-stream, wait, reopen ----
      await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector('.thinking-row-header'); if (el instanceof HTMLElement) el.click(); return true })()`
      )
      const beforeFold = thinkingSeconds((await win.webContents.executeJavaScript(SIG)) as ThinkingSig)
      await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector('.turn-container-header'); if (el instanceof HTMLElement) el.click(); return true })()`
      )
      const foldedOk = await waitFor(win, `${SIG}.rows === 0`, 10_000)
      if (!foldedOk) throw new Error('thinking visual: the container did not fold on click')
      await sleep(2600) // the old defect: the remounted row restarted from ~1s
      await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector('.turn-container-header'); if (el instanceof HTMLElement) el.click(); return true })()`
      )
      const reopenedOk = await waitFor(win, `${SIG}.rows === 1 && ${SIG}.label === 'Thinking'`, 10_000)
      if (!reopenedOk) throw new Error('thinking visual: the folded container did not reopen on click')
      const afterReopen = thinkingSeconds((await win.webContents.executeJavaScript(SIG)) as ThinkingSig)
      // Entry-level timestamp: the count kept running across the fold (and
      // the fold itself took ~2.6s). A restart would land at 1–2s — below.
      if (afterReopen < beforeFold + 2) {
        throw new Error(`thinking visual: the timer reset across fold/reopen (${beforeFold}s → ${afterReopen}s)`)
      }
      console.log(`VISUAL probe timer-continuity: ${beforeFold}s → ${afterReopen}s (continued, not reset)`)

      // ---- th3: freeze priority — thinking_end freezes the settled label ----
      emitContractEvent({ type: 'thinking_end', durationMs: 41_900 })
      const frozenOk = await waitFor(
        win,
        `${SIG}.label === 'Thought' && ${SIG}.duration === '42s' && ${SIG}.open === 0 && ${SIG}.chevron.startsWith('${CHEVRON_RIGHT}')`,
        10_000
      )
      if (!frozenOk) {
        const state = (await win.webContents.executeJavaScript(SIG).catch(() => '?')) as string
        throw new Error(`thinking visual th3: the label did not freeze to Thought · 42s (state: ${state})`)
      }
      const frozen = (await win.webContents.executeJavaScript(SIG)) as ThinkingSig
      console.log(`VISUAL probe th3: ${JSON.stringify(frozen)}`)
      await scrollToBottom(win)
      await sleep(300)
      await capture(win, 'th3-thought-frozen')

      // Leave a quiet session (settle the run).
      emitContractEvent({ type: 'text_delta', delta: 'Plan is set — splitting the module now.' })
      emitContractEvent({ type: 'message_end' })
      emitContractEvent({ type: 'agent_end' })

      console.log('VISUAL thinking-row done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL thinking-row FAIL', err)
      app.exit(1)
    }
  })()
}
