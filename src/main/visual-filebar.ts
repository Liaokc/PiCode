/**
 * Turn file bar visual-QA harness (ticket 78). Enabled with PICODE_VISUAL=1
 * plus PICODE_VISUAL_FILEBAR=1. NOT part of `npm test` — but like the
 * worked-container harness it ASSERTS its probe results (exit 1 on any
 * violation): the collapsed/expanded states are exact, not eyeballable.
 *
 * The frames (composition reference: pi16-zcode-turn-filebar collapsed /
 * pi16-zcode-turn-filebar-expanded):
 *
 *   1. fb1-filebar-collapsed — a settled mixed turn (fold-internal edit +
 *      post-answer edit + read + write) shows the collapsed "2 files changed
 *      +2 −1" bar at the end of the after-answer segment, below the answer;
 *      a clean turn (read + text only) shows NO bar (no file changes, no bar);
 *   2. fb2-filebar-expanded — the bar expanded: per-file rows (icon + name +
 *      path + ± counts, the write as "+new") with Review / Open affordances.
 *
 * Seeding: the transcript is injected through the contract stream
 * (session_created(resumed) + history_loaded — the ticket-53/55 precedent,
 * no model call). An isolated session store gets one fake sidebar row so
 * committed frames never show the operator's real sessions; throwaway
 * userData keeps the run off the operator's preferences.
 */

import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { emitContractEvent, visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the file-bar harness (PICODE_VISUAL_FILEBAR=1 alongside
 * PICODE_VISUAL=1) — every other visual harness stands down. */
export function filebarVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_FILEBAR'] === '1'
}

/** Throwaway userData (no-op unless PICODE_VISUAL_FILEBAR=1). Called from
 * index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateFilebarUserData(): void {
  if (!filebarVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-filebar-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** The Pi edit tool's display diff shape (details.diff): sign + padded line
 * number + one separator space + verbatim content; `      ...` marks a
 * skipped context region. */
const DIFF_A = [
  '       ...',
  '  3   const a = 1;',
  '- 4   const b = 2;',
  '+ 4   const b = 20;',
  '  5   export { a, b }'
].join('\n')
const DIFF_B = '+ 9   const c = 3'

const ANSWER = 'Constants updated and verified. Both files are in the expected shape now.'

const HISTORY_ITEMS = [
  { role: 'user' as const, id: 'fb-u1', text: 'Update the constants in this workspace.', timestamp: '2026-09-18T09:00:00.000Z', skillName: null },
  {
    role: 'tool' as const,
    id: 'fb-t1',
    timestamp: '2026-09-18T09:00:04.000Z',
    name: 'edit',
    args: { path: 'src/constants.ts' },
    output: 'Successfully replaced 1 block(s) in src/constants.ts.',
    isError: false,
    diff: DIFF_A
  },
  {
    role: 'assistant' as const,
    id: 'fb-a1',
    timestamp: '2026-09-18T09:00:10.000Z',
    text: ANSWER,
    parts: [{ kind: 'text' as const, text: ANSWER }]
  },
  {
    role: 'tool' as const,
    id: 'fb-t2',
    timestamp: '2026-09-18T09:00:14.000Z',
    name: 'edit',
    args: { path: 'src/constants.ts' },
    output: 'Successfully replaced 1 block(s) in src/constants.ts.',
    isError: false,
    diff: DIFF_B
  },
  {
    role: 'tool' as const,
    id: 'fb-t3',
    timestamp: '2026-09-18T09:00:16.000Z',
    name: 'read',
    args: { path: 'src/constants.ts' },
    output: 'const a = 1;\nconst b = 20;\nexport { a, b }',
    isError: false
  },
  {
    role: 'tool' as const,
    id: 'fb-t4',
    timestamp: '2026-09-18T09:00:18.000Z',
    name: 'write',
    args: { path: 'docs/notes.md' },
    output: 'Successfully wrote to docs/notes.md',
    isError: false
  }
]

const SIG = `(() => ({
  bars: document.querySelectorAll('.turn-filebar').length,
  expanded: document.querySelectorAll('.turn-filebar[data-expanded]').length,
  summary: document.querySelector('.turn-filebar-summary')?.textContent ?? '',
  adds: [...document.querySelectorAll('.turn-filebar-header .file-stat-add')].map((el) => el.textContent ?? ''),
  dels: [...document.querySelectorAll('.turn-filebar-header .file-stat-del')].map((el) => el.textContent ?? ''),
  fileRows: document.querySelectorAll('.turn-filebar-file').length,
  fileNames: [...document.querySelectorAll('.turn-filebar-file-name')].map((el) => el.textContent ?? ''),
  newStats: [...document.querySelectorAll('.turn-filebar-file .file-stat-new')].map((el) => el.textContent ?? ''),
  answers: [...document.querySelectorAll('.msg-assistant .md')].map((el) => el.textContent ?? '')
}))()`

interface FilebarSig {
  bars: number
  expanded: number
  summary: string
  adds: string[]
  dels: string[]
  fileRows: number
  fileNames: string[]
  newStats: string[]
  answers: string[]
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

export function startFilebarVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!filebarVisualEnabled()) return

  // Committed frames must never show the operator's real sessions: isolate
  // the session store (PICODE_SESSION_DIR) BEFORE the index constructs, and
  // seed one fake row so the sidebar looks natural (same rule as the other
  // store harnesses).
  const store = ensureVisualStore()
  writeVisualSession(store, {
    id: 'visual-filebar-side',
    cwd: ensureVisualProjectDir('constants'),
    userText: 'Update the constants in this workspace.'
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
      if (!win) throw new Error('filebar visual: no window')
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)
      win.webContents.setBackgroundThrottling(false)

      emitContractEvent({
        type: 'session_created',
        sessionId: 'visual-turn-filebar',
        cwd: tmpdir(),
        model: 'claude-opus-4-5',
        resumed: true
      })
      emitContractEvent({ type: 'history_loaded', items: HISTORY_ITEMS })
      await sleep(700)

      // ---- fb1: the collapsed bar under the answer; counts exact ----
      const collapsed = (await win.webContents.executeJavaScript(SIG)) as FilebarSig
      const problems: string[] = []
      if (collapsed.bars !== 1) problems.push(`bars ${collapsed.bars} !== 1`)
      if (collapsed.expanded !== 0) problems.push(`expanded ${collapsed.expanded} !== 0`)
      if (collapsed.summary !== '2 files changed') problems.push(`summary ${collapsed.summary} !== '2 files changed'`)
      if (collapsed.adds.join() !== '+2') problems.push(`adds ${collapsed.adds.join()} !== '+2'`)
      if (collapsed.dels.join() !== '−1') problems.push(`dels ${collapsed.dels.join()} !== '−1'`)
      if (collapsed.fileRows !== 0) problems.push(`fileRows ${collapsed.fileRows} !== 0`)
      if (collapsed.answers.length !== 1 || !collapsed.answers[0].includes('Constants updated')) {
        problems.push(`answers ${JSON.stringify(collapsed.answers)}`)
      }
      if (problems.length > 0) throw new Error(`filebar visual fb1: ${problems.join('; ')}`)
      console.log(`VISUAL probe fb1: ${JSON.stringify(collapsed)}`)

      await win.webContents.executeJavaScript(
        `(() => {
          const thread = document.querySelector('.chat-thread')
          if (thread instanceof HTMLElement) thread.scrollTop = thread.scrollHeight
          return true
        })()`
      )
      await sleep(300)
      await capture(win, 'fb1-filebar-collapsed')

      // ---- fb2: expanded — per-file rows with the +new write row ----
      await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector('.turn-filebar-header'); if (el instanceof HTMLElement) el.click(); return true })()`
      )
      const expandedOk = await waitFor(
        win,
        `${SIG}.bars === 1 && ${SIG}.expanded === 1 && ${SIG}.fileRows === 2 &&
         ${SIG}.fileNames.join() === 'constants.ts,notes.md' && ${SIG}.newStats.join() === '+new'`,
        10_000
      )
      if (!expandedOk) {
        const state = (await win.webContents.executeJavaScript(SIG).catch(() => '?')) as string
        throw new Error(`filebar visual fb2: the expanded bar never showed 2 file rows (state: ${state})`)
      }
      const expanded = (await win.webContents.executeJavaScript(SIG)) as FilebarSig
      console.log(`VISUAL probe fb2: ${JSON.stringify(expanded)}`)

      await win.webContents.executeJavaScript(
        `(() => {
          const thread = document.querySelector('.chat-thread')
          if (thread instanceof HTMLElement) thread.scrollTop = thread.scrollHeight
          return true
        })()`
      )
      await sleep(300)
      await capture(win, 'fb2-filebar-expanded')

      console.log('VISUAL turn-filebar done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL turn-filebar FAIL', err)
      app.exit(1)
    }
  })()
}
