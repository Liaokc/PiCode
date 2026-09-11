/**
 * Code-card line-number visual-QA harness (ticket 60, spec R4). Enabled
 * with PICODE_VISUAL=1 plus PICODE_VISUAL_CODECARD=1. NOT part of
 * `npm test` — but like the codeblock/mermaid harnesses it ASSERTS its
 * probe results (exit 1 on any violation): the gutter projection is exact
 * state, not eyeballable.
 *
 * The invariants under test (the Seam-1 fence-meta + line-number
 * projections, rendered live over the contract stream):
 *
 *   1. Line numbers are ON by default: an unannotated fence renders the
 *      gutter 1..N (the operator-approved density change).
 *   2. `startLine=41` in the fence meta shifts the count to 41..N (a file
 *      slice shows its true numbering).
 *   3. `noLineNumbers` in the fence meta drops the gutter entirely — the
 *      model-intended minimal block stays minimal.
 *   4. The chrome coexists: every card still carries wrap + download +
 *      copy, and the gutter never appears on a noLineNumbers card.
 *
 * Seeding: the live turn is injected through the contract stream (the
 * codeblock harness precedent). An isolated session store gets one fake
 * sidebar row so committed frames never show the operator's real sessions;
 * throwaway userData keeps the run off the operator's preferences.
 *
 * Captures (PNGs land in the visual out dir):
 *   cc1-code-line-numbers — the three cards in one frame: default gutter,
 *                           startLine shift, and the gutterless block
 */

import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { emitContractEvent, visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the code-card harness (PICODE_VISUAL_CODECARD=1
 * alongside PICODE_VISUAL=1) — every other visual harness stands down. */
export function codeCardVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_CODECARD'] === '1'
}

/** Throwaway userData (no-op unless PICODE_VISUAL_CODECARD=1). Called
 * from index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateCodeCardUserData(): void {
  if (!codeCardVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-codecard-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const TS_CODE = [
  'export function parseRegistration(body: unknown): Registration {',
  '  const { email, password } = RegistrationSchema.parse(body)',
  '  return { email: email.trim().toLowerCase(), password: assertStrongPassword(password) }',
  '  // the default gutter numbers from 1',
  '}',
  'export const ROUTE = "/registrations"'
].join('\n')
const JS_CODE = ['const gate = (n) => n > 3', 'const done = gate(4)', 'console.log(done)'].join('\n')
const PLAIN_CODE = ['2026-09-10 09:00 boot', '2026-09-10 09:01 ready'].join('\n')

/** The streamed answer: the full gutter projection table in one document. */
const SEGMENTS = [
  'The registrar:\n\n```typescript\n' + TS_CODE + '\n```\n\n',
  'A file slice keeps its true numbering:\n\n```js startLine=41\n' + JS_CODE + '\n```\n\n',
  'A model-intended minimal block stays minimal:\n\n```text noLineNumbers\n' + PLAIN_CODE + '\n```\n'
]

async function waitFor(win: BrowserWindow, probe: string, budgetMs: number): Promise<boolean> {
  for (let waited = 0; waited < budgetMs; waited += 100) {
    const ok = (await win.webContents.executeJavaScript(probe).catch(() => false)) as boolean
    if (ok) return true
    await sleep(100)
  }
  return false
}

export function startCodeCardVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!codeCardVisualEnabled()) return

  // Committed frames must never show the operator's real sessions: isolate
  // the session store (PICODE_SESSION_DIR) BEFORE the index constructs, and
  // seed one fake row so the sidebar looks natural (same rule as the other
  // store harnesses).
  const store = ensureVisualStore()
  writeVisualSession(store, {
    id: 'visual-codecard-side',
    cwd: ensureVisualProjectDir('registration-service'),
    userText: 'Show me the registrar slice with real line numbers'
  })

  void (async () => {
    try {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('codecard visual: no window')
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)
      win.webContents.setBackgroundThrottling(false)

      emitContractEvent({
        type: 'session_created',
        sessionId: 'visual-codecard',
        cwd: tmpdir(),
        model: 'claude-opus-4-5'
      })
      await sleep(200)
      emitContractEvent({ type: 'user_message', text: 'Show the registrar with line numbers.' })
      emitContractEvent({ type: 'agent_start' })
      await sleep(400)
      emitContractEvent({ type: 'message_start' })
      for (const segment of SEGMENTS) {
        emitContractEvent({ type: 'text_delta', delta: segment })
        await sleep(60)
      }
      emitContractEvent({ type: 'message_end' })
      emitContractEvent({ type: 'agent_end' })

      const settled = await waitFor(
        win,
        `document.querySelectorAll('.msg-assistant .md-code-card').length === 3`,
        10_000
      )
      if (!settled) throw new Error('codecard visual: the three code cards never settled into the answer')

      // ---- the probe table (exact, in stream order) ----
      const sig = (await win.webContents.executeJavaScript(
        `(() => ({
          cards: [...document.querySelectorAll('.msg-assistant .md-code-card')].map((card) => ({
            linenos: [...card.querySelectorAll('.md-code-lineno')].map((el) => el.textContent ?? ''),
            numbered: card.querySelector('pre')?.classList.contains('md-code-pre-numbered') ?? false,
            wrap: card.querySelectorAll('button[aria-label="Wrap lines"]').length,
            download: card.querySelectorAll('button[aria-label="Download code"]').length,
            copy: card.querySelectorAll('button[aria-label="Copy code"]').length
          }))
        }))()`
      )) as {
        cards: Array<{ linenos: string[]; numbered: boolean; wrap: number; download: number; copy: number }>
      }
      const problems: string[] = []
      const expectLinenos = (i: number, expected: string[], why: string): void => {
        if (JSON.stringify(sig.cards[i]?.linenos) !== JSON.stringify(expected)) {
          problems.push(`card ${i}: ${why} — linenos ${JSON.stringify(sig.cards[i]?.linenos)} !== ${JSON.stringify(expected)}`)
        }
      }
      expectLinenos(0, ['1', '2', '3', '4', '5', '6'], 'the default gutter must count from 1')
      expectLinenos(1, ['41', '42', '43'], 'startLine=41 must shift the count')
      if (sig.cards[2]?.linenos.length !== 0 || sig.cards[2]?.numbered) {
        problems.push(`card 2: noLineNumbers must render no gutter — got ${JSON.stringify(sig.cards[2]?.linenos)}`)
      }
      for (const [i, card] of sig.cards.entries()) {
        if (card.wrap !== 1 || card.download !== 1 || card.copy !== 1) {
          problems.push(`card ${i}: chrome wrap/download/copy = ${card.wrap}/${card.download}/${card.copy} (expected 1/1/1)`)
        }
        if (i < 2 && !card.numbered) problems.push(`card ${i}: the numbered pre class is missing`)
      }
      if (problems.length > 0) throw new Error(`codecard visual: ${problems.join('; ')}`)
      console.log(`VISUAL probe cc1: ${JSON.stringify(sig)}`)

      await win.webContents.executeJavaScript(
        `(() => {
          document.querySelector('.msg-assistant .md-code-card')?.scrollIntoView({ block: 'start' })
          return true
        })()`
      )
      await sleep(300)
      const png = await win.webContents.capturePage()
      writeFileSync(path.join(visualOutDir(), 'cc1-code-line-numbers.png'), png.toPNG())
      console.log('VISUAL captured cc1-code-line-numbers.png')

      console.log('VISUAL codecard done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL codecard FAIL', err)
      app.exit(1)
    }
  })()
}
