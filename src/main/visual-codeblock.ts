/**
 * Code-card language-label visual-QA harness (ticket 50, spec R5). Enabled
 * with PICODE_VISUAL=1 plus PICODE_VISUAL_CODEBLOCK=1. NOT part of
 * `npm test` — but like the fold harness it ASSERTS its probe results
 * (exit 1 on any violation): the label table is exact state, not eyeballable.
 *
 * The invariants under test (the Seam-1 codeLanguageLabel projection,
 * rendered):
 *
 *   1. An untagged (bare) fenced block shows the fallback label 'text' —
 *      the ticket-50 fix, to compare against the operator's evidence frame
 *      `.scratch/compare/pi14-untagged-codeblocks.png`.
 *   2. Tagged fences keep their exact language ('typescript', 'json') —
 *      zero regression.
 *   3. The card chrome is untouched: every card still carries exactly the
 *      wrap + copy controls, and each label chip holds only the existing
 *      code glyph — no file icon added (Q8 minimal alignment).
 *
 * Seeding: the transcript is injected through the contract stream (one live
 * turn, one text part with four fenced blocks: two tagged, two bare). An
 * isolated session store gets one fake sidebar row so committed frames never
 * show the operator's real sessions; throwaway userData keeps the run off
 * the operator's preferences.
 *
 * Captures (PNGs land in the visual out dir):
 *   cb1-untagged-codeblocks — the settled answer with all four code cards,
 *                             bare fences labeled 'text'
 */

import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { emitContractEvent, visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the codeblock harness (PICODE_VISUAL_CODEBLOCK=1
 * alongside PICODE_VISUAL=1) — every other visual harness stands down. */
export function codeblockVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_CODEBLOCK'] === '1'
}

/** Throwaway userData (no-op unless PICODE_VISUAL_CODEBLOCK=1). Called
 * from index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateCodeblockUserData(): void {
  if (!codeblockVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-codeblock-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** The streamed answer: two tagged fences (zero-regression rows) around two
 * bare fences (the fallback rows) — mirroring the operator's untagged
 * evidence session at a compact height. */
const ANSWER = [
  'Here is the guard, both variants side by side:\n\n',
  '```typescript\n',
  'export function parseRegistration(body: unknown): Registration {\n',
  '  const { email, password } = RegistrationSchema.parse(body)\n',
  '  return { email: email.trim().toLowerCase(), password: assertStrongPassword(password) }\n',
  '}\n',
  '```\n\n',
  'The captured session log has no language tag on the fence:\n\n',
  '```\n',
  '2026-09-09 20:48:11 fork request received\n',
  '2026-09-09 20:48:11 waiting for the host to acknowledge\n',
  '2026-09-09 20:48:12 child session created\n',
  '```\n\n',
  'The sandbox report arrives as JSON:\n\n',
  '```json\n',
  '{ "ok": true, "checks": 12, "failed": 0 }\n',
  '```\n\n',
  'And the raw paste is untagged too:\n\n',
  '```\n',
  'plain notes without a fence tag\n',
  '```\n'
]

/** The exact label table the rendered cards must match, in stream order. */
const EXPECTED_LABELS = ['typescript', 'text', 'json', 'text']

async function waitFor(win: BrowserWindow, probe: string, budgetMs: number): Promise<boolean> {
  for (let waited = 0; waited < budgetMs; waited += 100) {
    const ok = (await win.webContents.executeJavaScript(probe).catch(() => false)) as boolean
    if (ok) return true
    await sleep(100)
  }
  return false
}

export function startCodeblockVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!codeblockVisualEnabled()) return

  // Committed frames must never show the operator's real sessions: isolate
  // the session store (PICODE_SESSION_DIR) BEFORE the index constructs, and
  // seed one fake row so the sidebar looks natural (same rule as the other
  // store harnesses).
  const store = ensureVisualStore()
  writeVisualSession(store, {
    id: 'visual-codeblock-side',
    cwd: ensureVisualProjectDir('api-server'),
    userText: 'Wire the new checkout form to the payments sandbox'
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
      if (!win) throw new Error('codeblock visual: no window')
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)
      win.webContents.setBackgroundThrottling(false)

      emitContractEvent({
        type: 'session_created',
        sessionId: 'visual-codeblock',
        cwd: tmpdir(),
        model: 'claude-opus-4-5'
      })
      await sleep(200)
      emitContractEvent({ type: 'user_message', text: 'Show the captured log and the sandbox report.' })
      emitContractEvent({ type: 'agent_start' })
      await sleep(400)
      emitContractEvent({ type: 'message_start' })
      for (const chunk of ANSWER) {
        emitContractEvent({ type: 'text_delta', delta: chunk })
        await sleep(20)
      }
      emitContractEvent({ type: 'message_end' })
      emitContractEvent({ type: 'agent_end' })

      // Settled: the turn folds and the single text part renders as the
      // answer block below it — the four cards must all be there.
      const settled = await waitFor(
        win,
        `document.querySelectorAll('.msg-assistant .md-code-card').length === ${EXPECTED_LABELS.length}`,
        10_000
      )
      if (!settled) throw new Error('codeblock visual: the four code cards never settled into the answer')

      // ---- the probe table (exact, in stream order) ----
      const sig = (await win.webContents.executeJavaScript(
        `(() => ({
          labels: [...document.querySelectorAll('.msg-assistant .md-code-card .md-code-lang')].map((el) => (el.textContent ?? '').trim()),
          buttons: [...document.querySelectorAll('.msg-assistant .md-code-card')].map((card) => card.querySelectorAll('.md-block-btn').length),
          iconGlyphs: [...document.querySelectorAll('.msg-assistant .md-code-lang')].map((el) => el.querySelectorAll('svg').length)
        }))()`
      )) as { labels: string[]; buttons: number[]; iconGlyphs: number[] }
      const problems: string[] = []
      if (JSON.stringify(sig.labels) !== JSON.stringify(EXPECTED_LABELS)) {
        problems.push(`labels ${JSON.stringify(sig.labels)} !== ${JSON.stringify(EXPECTED_LABELS)}`)
      }
      for (const [i, buttons] of sig.buttons.entries()) {
        if (buttons !== 2) problems.push(`card ${i}: ${buttons} chrome buttons (expected wrap + copy = 2)`)
      }
      for (const [i, glyphs] of sig.iconGlyphs.entries()) {
        if (glyphs !== 1) problems.push(`card ${i}: ${glyphs} icon glyphs in the label (expected exactly the code glyph)`)
      }
      if (problems.length > 0) throw new Error(`codeblock visual: ${problems.join('; ')}`)
      console.log(`VISUAL probe cb1: ${JSON.stringify(sig)}`)

      await win.webContents.executeJavaScript(
        `(() => {
          document.querySelector('.msg-assistant .md-code-card')?.scrollIntoView({ block: 'start' })
          return true
        })()`
      )
      await sleep(300)
      const png = await win.webContents.capturePage()
      writeFileSync(path.join(visualOutDir(), 'cb1-untagged-codeblocks.png'), png.toPNG())
      console.log('VISUAL captured cb1-untagged-codeblocks.png')

      console.log('VISUAL codeblock done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL codeblock FAIL', err)
      app.exit(1)
    }
  })()
}
