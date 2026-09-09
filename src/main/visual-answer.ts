/**
 * Turn-answer-split visual-QA harness (ticket 53, spec R4). Enabled with
 * PICODE_VISUAL=1 plus PICODE_VISUAL_ANSWER=1. NOT part of `npm test` — but
 * like the fold/codeblock harnesses it ASSERTS its probe results (exit 1 on
 * any violation): the split shape is exact state, not eyeballable.
 *
 * The invariants under test (the Seam-1 groupTurns split, rendered):
 *
 *   1. The settled turn's answer is its LAST text block only — to compare
 *      against the operator's evidence frame
 *      `.scratch/compare/pi14-narration-in-answer.png` (a narration wall
 *      drowning the final answer; the fix shows the tail block alone).
 *   2. The earlier text blocks are interim narration INSIDE the fold
 *      container: hidden while collapsed, visible as work rows when opened.
 *   3. The tool that ran AFTER the answer stays visible below it, outside
 *      the fold, in both states (ZCode rule, Q11a).
 *   4. The container starts collapsed on a settled replay (ticket 23
 *      memory rule — zero regression).
 *
 * Seeding: the settled long turn is injected through the contract stream
 * (session_created(resumed) + history_loaded — the visual-perf precedent,
 * the same AnswerBlock → Markdown path the live transcript uses). An
 * isolated session store gets one fake sidebar row so committed frames
 * never show the operator's real sessions; throwaway userData keeps the run
 * off the operator's preferences.
 *
 * Captures (PNGs land in the visual out dir):
 *   as1-answer-split-settled — collapsed: Worked row + tail-block answer +
 *                              trailing tool below
 *   as2-answer-split-open    — container opened: narration rows visible
 *                              inside, answer unchanged
 */

import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { emitContractEvent, visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the answer-split harness (PICODE_VISUAL_ANSWER=1
 * alongside PICODE_VISUAL=1) — every other visual harness stands down. */
export function answerVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_ANSWER'] === '1'
}

/** Throwaway userData (no-op unless PICODE_VISUAL_ANSWER=1). Called from
 * index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateAnswerUserData(): void {
  if (!answerVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-answer-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Distinct probes for the three text blocks (never rendered together in
 * the answer — the whole point of the split). */
const NARRATION_ONE_SNIPPET = 'root cause is confirmed'
const NARRATION_TWO_SNIPPET = 'Three problems, fixed one by one'
const ANSWER_SNIPPET = 'All four viewports pass'

/** The pi14-narration-in-answer scenario, compressed: a follow-up turn whose
 * long task narrates between tools, then answers, then runs one trailing
 * tool (the Q11a row). */
const HISTORY_ITEMS = [
  {
    role: 'user' as const,
    id: 'as-u1',
    text: 'Continue.',
    timestamp: '2026-09-09T10:00:00.000Z',
    skillName: null
  },
  {
    role: 'assistant' as const,
    id: 'as-a1',
    timestamp: '2026-09-09T10:00:12.000Z',
    text: 'Continuing. The root cause is confirmed: the viewBox aspect ratio sits below the adaptive-layout threshold, so every desktop viewport overflows.',
    parts: [
      {
        kind: 'text' as const,
        text: 'Continuing. The root cause is confirmed: the viewBox aspect ratio sits below the adaptive-layout threshold, so every desktop viewport overflows.'
      }
    ]
  },
  {
    role: 'tool' as const,
    id: 'as-t1',
    timestamp: '2026-09-09T10:00:40.000Z',
    name: 'bash',
    args: { command: 'npm run layout:probe' },
    output: 'probe 1440x900 FAIL\nprobe 1600x1000 FAIL\nprobe 1920x1080 FAIL',
    isError: false
  },
  {
    role: 'assistant' as const,
    id: 'as-a2',
    timestamp: '2026-09-09T10:01:20.000Z',
    text: 'Three problems, fixed one by one: compress vertically, widen horizontally, and drop the smallest-font risk tag.',
    parts: [
      {
        kind: 'thinking' as const,
        text: 'Re-plan the geometry: vertical compression first, then the horizontal widening, then the tag.',
        durationMs: null
      },
      {
        kind: 'text' as const,
        text: 'Three problems, fixed one by one: compress vertically, widen horizontally, and drop the smallest-font risk tag.'
      }
    ]
  },
  {
    role: 'tool' as const,
    id: 'as-t2',
    timestamp: '2026-09-09T10:02:00.000Z',
    name: 'edit',
    args: { path: 'src/shared/layout.ts' },
    output: 'Patched src/shared/layout.ts',
    isError: false
  },
  {
    role: 'assistant' as const,
    id: 'as-a3',
    timestamp: '2026-09-09T10:02:30.000Z',
    text: 'All four viewports pass: 1440×900, 1600×1000, 1920×1080 and 2048×1320 stay inside the height budget — the adaptive reading width is enabled everywhere. Ready for review.',
    parts: [
      {
        kind: 'text' as const,
        text: 'All four viewports pass: 1440×900, 1600×1000, 1920×1080 and 2048×1320 stay inside the height budget — the adaptive reading width is enabled everywhere. Ready for review.'
      }
    ]
  },
  {
    role: 'tool' as const,
    id: 'as-t3',
    timestamp: '2026-09-09T10:02:45.000Z',
    name: 'bash',
    args: { command: 'git status --short' },
    output: 'M src/shared/layout.ts',
    isError: false
  }
]

const SIG = `(() => ({
  turns: document.querySelectorAll('.turn-container').length,
  open: document.querySelectorAll('.turn-container-open').length,
  answers: document.querySelectorAll('.msg-assistant').length,
  answerBlocks: document.querySelectorAll('.msg-assistant .md').length,
  answerText: document.querySelector('.msg-assistant .md')?.textContent ?? '',
  narrationRows: document.querySelectorAll('.turn-narration-row').length,
  narrationVisible:
    [...document.querySelectorAll('.turn-narration-row')].filter((el) => el.offsetHeight > 0).length,
  afterTools: document.querySelectorAll('.turn-after-answer .tool-card').length,
  foldedTools: document.querySelectorAll('.turn-container .tool-card').length
}))()`

interface AnswerSig {
  turns: number
  open: number
  answers: number
  answerBlocks: number
  answerText: string
  narrationRows: number
  narrationVisible: number
  afterTools: number
  foldedTools: number
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

export function startAnswerVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!answerVisualEnabled()) return

  // Committed frames must never show the operator's real sessions: isolate
  // the session store (PICODE_SESSION_DIR) BEFORE the index constructs, and
  // seed one fake row so the sidebar looks natural (same rule as the other
  // store harnesses).
  const store = ensureVisualStore()
  writeVisualSession(store, {
    id: 'visual-answer-side',
    cwd: ensureVisualProjectDir('layout-fix'),
    userText: 'Continue the layout fix'
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
      if (!win) throw new Error('answer visual: no window')
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)
      win.webContents.setBackgroundThrottling(false)

      emitContractEvent({
        type: 'session_created',
        sessionId: 'visual-answer-split',
        cwd: tmpdir(),
        model: 'claude-opus-4-5',
        resumed: true
      })
      emitContractEvent({ type: 'history_loaded', items: HISTORY_ITEMS })
      await sleep(700)

      // ---- settled + collapsed (the replay memory rule, ticket 23) ----
      const settled = (await win.webContents.executeJavaScript(SIG)) as AnswerSig
      const settledProblems: string[] = []
      if (settled.turns !== 1) settledProblems.push(`turns ${settled.turns} !== 1`)
      if (settled.open !== 0) settledProblems.push(`open ${settled.open} !== 0`)
      if (settled.answers !== 1) settledProblems.push(`answers ${settled.answers} !== 1`)
      if (settled.answerBlocks !== 1) settledProblems.push(`answerBlocks ${settled.answerBlocks} !== 1`)
      if (!settled.answerText.includes(ANSWER_SNIPPET)) settledProblems.push('answer misses the tail text')
      if (settled.answerText.includes(NARRATION_ONE_SNIPPET) || settled.answerText.includes(NARRATION_TWO_SNIPPET)) {
        settledProblems.push('the answer leaks narration text')
      }
      if (settled.narrationRows !== 0) settledProblems.push(`narration rows visible while folded: ${settled.narrationRows}`)
      if (settled.afterTools !== 1) settledProblems.push(`after-answer tools ${settled.afterTools} !== 1`)
      if (settled.foldedTools !== 0) settledProblems.push(`folded tools leaked: ${settled.foldedTools}`)
      if (settledProblems.length > 0) throw new Error(`answer visual as1: ${settledProblems.join('; ')}`)
      console.log(`VISUAL probe as1: ${JSON.stringify(settled)}`)

      await win.webContents.executeJavaScript(
        `(() => {
          const thread = document.querySelector('.chat-thread')
          if (thread instanceof HTMLElement) thread.scrollTop = thread.scrollHeight
          return true
        })()`
      )
      await sleep(300)
      await capture(win, 'as1-answer-split-settled')

      // ---- container opened: the narration rows surface inside the fold ----
      await win.webContents.executeJavaScript(
        `(() => {
          document.querySelectorAll('.turn-container-header').forEach((el) => (el instanceof HTMLElement ? el.click() : undefined))
          return true
        })()`
      )
      await sleep(400)
      const opened = (await win.webContents.executeJavaScript(SIG)) as AnswerSig
      const openedProblems: string[] = []
      if (opened.open !== 1) openedProblems.push(`open ${opened.open} !== 1`)
      if (opened.answerBlocks !== 1) openedProblems.push(`answerBlocks ${opened.answerBlocks} !== 1`)
      if (opened.narrationRows !== 2) openedProblems.push(`narration rows ${opened.narrationRows} !== 2`)
      if (opened.narrationVisible !== 2) openedProblems.push(`visible narration rows ${opened.narrationVisible} !== 2`)
      if (!opened.answerText.includes(ANSWER_SNIPPET)) openedProblems.push('answer text changed when the fold opened')
      if (opened.afterTools !== 1) openedProblems.push(`after-answer tools ${opened.afterTools} !== 1`)
      if (openedProblems.length > 0) throw new Error(`answer visual as2: ${openedProblems.join('; ')}`)
      console.log(`VISUAL probe as2: ${JSON.stringify(opened)}`)

      await win.webContents.executeJavaScript(
        `(() => {
          document.querySelector('.turn-container-header')?.scrollIntoView({ block: 'start' })
          return true
        })()`
      )
      await sleep(300)
      await capture(win, 'as2-answer-split-open')

      console.log('VISUAL answer-split done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL answer-split FAIL', err)
      app.exit(1)
    }
  })()
}
