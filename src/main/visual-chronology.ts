/**
 * Turn-chronology visual-QA harness (ticket 82, spec R15 — live 回合纯时间序,
 * revising the ticket-56 harness). Enabled with PICODE_VISUAL=1 plus
 * PICODE_VISUAL_CHRONOLOGY=1. NOT part of `npm test` — but like the
 * worked-container harness it ASSERTS its probe results (exit 1 on any
 * violation): the two-state same-slot rule is exact geometry, not
 * eyeballable.
 *
 * A scripted LIVE turn (contract-stream injection, no model call — the
 * ticket-55 harness precedent) streams past the approval gate:
 *
 *   text streams → gate asks → approve → tool runs → thinking → settle
 *
 * The LIVE half renders as a pure chronological single stream inside the
 * expanded container: the text block inline where it streamed, the pending
 * pill inline at the very slot its tool card will occupy, the thinking
 * inline below the tool — no promoted answer below the container, no
 * after-answer segment while live, nothing re-splits while streaming. At
 * settle the ticket-53/56 composition appears in one move: the answer below
 * the collapsed container, the tool + thinking in the segment below it
 * (常显段).
 *
 * Captures (PNGs land in the visual out dir; live/落定两态帧, the fixed
 * forms of the operator evidence frames pi17-container-collapsed/-expanded):
 *
 *   tc1-live-stream-inline    — the streaming text is INLINE inside the open
 *                               container with the pending pill parked in the
 *                               stream (fixes pi17-container-collapsed: the
 *                               in-progress body no longer hangs above the
 *                               container)
 *   tc2-tool-same-slot        — after the approve, the tool card occupies
 *                               the pill's exact stream slot (two states, one
 *                               slot, zero jump — asserted on geometry ±2px)
 *   tc3-live-stream-thinking  — the thinking block that streamed after the
 *                               tool result renders inline below the tool
 *                               (pi15-post-answer-thinking-misplaced stays
 *                               fixed, now in-stream)
 *   tc4-settled-same-position — after settling, the answer sits below the
 *                               collapsed container and the segment keeps
 *                               stream order — 落定态维持现状 (ZCode 构图)
 */

import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { emitContractEvent, visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the chronology harness (PICODE_VISUAL_CHRONOLOGY=1
 * alongside PICODE_VISUAL=1) — every other visual harness stands down. */
export function chronologyVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_CHRONOLOGY'] === '1'
}

/** Throwaway userData (no-op unless PICODE_VISUAL_CHRONOLOGY=1). Called from
 * index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateChronologyUserData(): void {
  if (!chronologyVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-chronology-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const ANSWER = 'The deploy plan is ready — approving runs it.'
const PROMPT = 'Deploy the staging service.'

const SIG = `(() => ({
  open: document.querySelectorAll('.turn-container-open').length,
  answers: document.querySelectorAll('.msg-assistant .md').length,
  streamTexts: document.querySelectorAll('.turn-container .turn-stream-text .md').length,
  streamText: document.querySelector('.turn-container .turn-stream-text .md')?.textContent ?? '',
  segPills: document.querySelectorAll('.turn-after-answer .approval-pill-pending').length,
  segApproved: document.querySelectorAll('.turn-after-answer .approval-pill-approved').length,
  segTools: document.querySelectorAll('.turn-after-answer .tool-card').length,
  segThinking: document.querySelectorAll('.turn-after-answer .thinking-row').length,
  foldPills: document.querySelectorAll('.turn-container .approval-pill-pending').length,
  foldTools: document.querySelectorAll('.turn-container .tool-card').length,
  foldThinking: document.querySelectorAll('.turn-container .thinking-row').length,
  turns: document.querySelectorAll('.turn-container').length
}))()`

interface ChronoSig {
  open: number
  answers: number
  streamTexts: number
  streamText: string
  segPills: number
  segApproved: number
  segTools: number
  segThinking: number
  foldPills: number
  foldTools: number
  foldThinking: number
  turns: number
}

/** The DOM signature as typed state; -1 fields mean the probe itself failed. */
async function readSig(win: BrowserWindow): Promise<ChronoSig> {
  const raw = (await win.webContents.executeJavaScript(SIG).catch(() => null)) as ChronoSig | null
  return (
    raw ?? {
      open: -1,
      answers: -1,
      streamTexts: -1,
      streamText: '',
      segPills: -1,
      segApproved: -1,
      segTools: -1,
      segThinking: -1,
      foldPills: -1,
      foldTools: -1,
      foldThinking: -1,
      turns: -1
    }
  )
}

async function waitFor(win: BrowserWindow, probe: string, budgetMs: number): Promise<boolean> {
  for (let waited = 0; waited < budgetMs; waited += 100) {
    const ok = (await win.webContents.executeJavaScript(probe).catch(() => false)) as boolean
    if (ok) return true
    await sleep(100)
  }
  return false
}

/** Geometry + parent child index of one row (null when absent); the parent
 * is the container body while live and the after-answer segment when settled. */
async function readSlot(win: BrowserWindow, selector: string, container: string): Promise<{ top: number; left: number; index: number } | null> {
  const raw = (await win.webContents.executeJavaScript(
    `(() => {
      const el = document.querySelector('${selector}')
      if (!(el instanceof Element)) return null
      const seg = el.closest('${container}')
      const r = el.getBoundingClientRect()
      return JSON.stringify({ top: r.top, left: r.left, index: seg ? Array.prototype.indexOf.call(seg.children, el) : -1 })
    })()`
  ).catch(() => null)) as string | null
  if (raw === null || raw === 'null') return null
  try {
    return JSON.parse(raw) as { top: number; left: number; index: number }
  } catch {
    return null
  }
}

async function capture(win: BrowserWindow, name: string): Promise<void> {
  const { writeFileSync } = await import('node:fs')
  const png = await win.webContents.capturePage()
  writeFileSync(path.join(visualOutDir(), `${name}.png`), png.toPNG())
  const sig = await readSig(win)
  console.log(`VISUAL captured ${name}.png ${JSON.stringify(sig)}`)
}

export function startChronologyVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!chronologyVisualEnabled()) return

  // Committed frames must never show the operator's real sessions: isolate
  // the session store (PICODE_SESSION_DIR) BEFORE the index constructs, and
  // seed one fake row so the sidebar looks natural (same rule as the other
  // store harnesses).
  const store = ensureVisualStore()
  writeVisualSession(store, {
    id: 'visual-chronology-side',
    cwd: ensureVisualProjectDir('deploy-console'),
    userText: PROMPT
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
      if (!win) throw new Error('chronology visual: no window')
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)
      win.webContents.setBackgroundThrottling(false)

      emitContractEvent({
        type: 'session_created',
        sessionId: 'visual-turn-chronology',
        cwd: tmpdir(),
        model: 'claude-opus-4-5',
        resumed: true
      })

      // The live turn: the answer text streams first — inline in the
      // container's chronological stream — then the gate asks.
      emitContractEvent({ type: 'user_message', text: PROMPT })
      emitContractEvent({ type: 'agent_start' })
      emitContractEvent({ type: 'message_start' })
      emitContractEvent({ type: 'text_delta', delta: ANSWER })
      emitContractEvent({ type: 'message_end' })
      emitContractEvent({ type: 'approval_required', toolCallId: 'chrono-gate-1', toolName: 'bash', args: { command: 'deploy' } })

      // ---- tc1: the text is INLINE in the open container, the pending pill
      // parked in the stream — no promoted answer below, no segment ----
      const streamOk = await waitFor(
        win,
        `${SIG}.open === 1 && ${SIG}.answers === 0 && ${SIG}.streamTexts === 1 &&
         ${SIG}.streamText.includes('${ANSWER}') && ${SIG}.foldPills === 1 &&
         ${SIG}.segPills === 0 && ${SIG}.segTools === 0 && ${SIG}.foldTools === 0`,
        10_000
      )
      if (!streamOk) {
        const state = await readSig(win)
        throw new Error(`chronology visual tc1: the live turn is not a pure chronological single stream (state: ${JSON.stringify(state)})`)
      }
      const pillSlot = await readSlot(win, '.turn-container .approval-pill-pending', '.turn-container-body')
      if (pillSlot === null) throw new Error('chronology visual tc1: the pending pill vanished before its slot was read')
      console.log(`VISUAL probe tc1: pill top ${pillSlot.top} idx ${pillSlot.index}`)
      await win.webContents.executeJavaScript(
        `(() => { const t = document.querySelector('.chat-thread'); if (t instanceof HTMLElement) t.scrollTop = t.scrollHeight; return true })()`
      )
      await sleep(300)
      await capture(win, 'tc1-live-stream-inline')

      // ---- tc2: approve → the tool card takes the pill's exact stream slot ----
      emitContractEvent({ type: 'approval_resolved', toolCallId: 'chrono-gate-1', approved: true, reason: null })
      emitContractEvent({ type: 'tool_start', toolCallId: 'chrono-gate-1', name: 'bash', args: { command: 'deploy' } })
      emitContractEvent({ type: 'tool_end', toolCallId: 'chrono-gate-1', output: 'deployed', isError: false })
      const toolOk = await waitFor(
        win,
        `${SIG}.foldTools === 1 && ${SIG}.foldPills === 0 && ${SIG}.segApproved === 0 && ${SIG}.segTools === 0`,
        10_000
      )
      if (!toolOk) {
        const state = await readSig(win)
        throw new Error(`chronology visual tc2: the tool card never took the pill's stream slot (state: ${JSON.stringify(state)})`)
      }
      const toolSlot = await readSlot(win, '.turn-container .tool-card', '.turn-container-body')
      if (toolSlot === null) throw new Error('chronology visual tc2: the tool card vanished before its slot was read')
      if (toolSlot.index !== pillSlot.index || Math.abs(toolSlot.top - pillSlot.top) > 2 || Math.abs(toolSlot.left - pillSlot.left) > 2) {
        throw new Error(`chronology visual tc2: two-state jump — pill top ${pillSlot.top}/idx ${pillSlot.index} vs tool top ${toolSlot.top}/idx ${toolSlot.index}`)
      }
      console.log(`VISUAL probe tc2: tool top ${toolSlot.top} idx ${toolSlot.index} (pill top ${pillSlot.top} idx ${pillSlot.index})`)
      await win.webContents.executeJavaScript(
        `(() => { const t = document.querySelector('.chat-thread'); if (t instanceof HTMLElement) t.scrollTop = t.scrollHeight; return true })()`
      )
      await sleep(300)
      await capture(win, 'tc2-tool-same-slot')

      // ---- tc3: thinking that streams after the tool renders inline below it ----
      emitContractEvent({ type: 'message_start' })
      emitContractEvent({ type: 'thinking_delta', delta: 'The health check passed — wrap the turn up.' })
      emitContractEvent({ type: 'thinking_end', durationMs: 4800 })
      emitContractEvent({ type: 'message_end' })
      const thinkingOk = await waitFor(
        win,
        `${SIG}.foldThinking === 1 && ${SIG}.segThinking === 0 && ${SIG}.foldTools === 1`,
        10_000
      )
      if (!thinkingOk) {
        const state = await readSig(win)
        throw new Error(`chronology visual tc3: the post-tool thinking never rendered inline below the tool (state: ${JSON.stringify(state)})`)
      }
      const thinkingSlot = await readSlot(win, '.turn-container .thinking-row', '.turn-container-body')
      if (thinkingSlot === null || thinkingSlot.index !== 2) {
        throw new Error(`chronology visual tc3: the thinking row must trail the tool in the stream (idx ${String(thinkingSlot?.index ?? 'missing')})`)
      }
      console.log(`VISUAL probe tc3: thinking top ${thinkingSlot.top} idx ${thinkingSlot.index}`)
      await win.webContents.executeJavaScript(
        `(() => { const t = document.querySelector('.chat-thread'); if (t instanceof HTMLElement) t.scrollTop = t.scrollHeight; return true })()`
      )
      await sleep(300)
      await capture(win, 'tc3-live-stream-thinking')

      // ---- tc4: settled — the answer lifts below the folded container, the
      // segment keeps stream order (tool leading, thinking trailing). NOTE:
      // settling adds the answer's persistent action row (ticket-44/53
      // settled rendering, pre-existing), so absolute Y is NOT comparable
      // across settle — the zero-jump geometry assertion lives in tc2, where
      // the pill→tool conversion happens without any other layout change.
      emitContractEvent({ type: 'agent_end' })
      const settledOk = await waitFor(
        win,
        `${SIG}.answers === 1 && ${SIG}.streamTexts === 0 && ${SIG}.open === 0 &&
         ${SIG}.segTools === 1 && ${SIG}.segThinking === 1 && ${SIG}.segPills === 0 &&
         ${SIG}.foldTools === 0 && ${SIG}.foldThinking === 0`,
        10_000
      )
      if (!settledOk) {
        const state = await readSig(win)
        throw new Error(`chronology visual tc4: settling did not produce the answer + segment composition (state: ${JSON.stringify(state)})`)
      }
      const settledSlot = await readSlot(win, '.turn-after-answer .tool-card', '.turn-after-answer')
      if (settledSlot === null || settledSlot.index !== 0) {
        throw new Error(`chronology visual tc4: the tool must lead the segment after settling (idx ${String(settledSlot?.index ?? 'missing')})`)
      }
      const settledThinkingSlot = await readSlot(win, '.turn-after-answer .thinking-row', '.turn-after-answer')
      if (settledThinkingSlot === null || settledThinkingSlot.index !== 1) {
        throw new Error(`chronology visual tc4: the thinking must trail the tool after settling (idx ${String(settledThinkingSlot?.index ?? 'missing')})`)
      }
      console.log(`VISUAL probe tc4: settled tool idx ${settledSlot.index}, thinking idx ${settledThinkingSlot.index}`)
      await win.webContents.executeJavaScript(
        `(() => { const t = document.querySelector('.chat-thread'); if (t instanceof HTMLElement) t.scrollTop = t.scrollHeight; return true })()`
      )
      await sleep(300)
      await capture(win, 'tc4-settled-same-position')

      console.log('VISUAL chronology done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL chronology FAIL', err)
      app.exit(1)
    }
  })()
}
