/**
 * Density visual-QA harness (ticket 15). Enabled with PICODE_VISUAL=1 plus
 * PICODE_VISUAL_DENSITY=1 (and it SUPPRESSES the full visual.ts flow so the
 * run is a single deterministic transcript). Injects one settled assistant
 * message carrying a fixed markdown sample (paragraph / bullet list / ordered
 * list / blockquote / heading / table / fenced code), captures a screenshot
 * and dumps DOM geometry (block gaps, list-item pitch, font tokens) so the
 * density regression is measurable, not just eyeballable:
 *
 *   d-density-sample.png   — the fixed sample settled in the transcript
 *   d-density-measure.json — per-block geometry + computed font/line tokens
 *
 *   (Manual archive convention: a run's outputs are copied to d0-*-before /
 *   d1-*-after for the before/after trail; d2-* is the contact sheet.)
 *
 * PNGs/JSON land in the visual out dir (default <cwd>/.scratch/visual/). Not
 * part of `npm test`; a human compares against the ZCode live baseline.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { emitContractEvent, visualOutDir } from './visual'
import type { HostToParent } from '../shared/contract'

export function densityVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_DENSITY'] === '1'
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForChatSubscription(getWindow: () => BrowserWindow | null): Promise<BrowserWindow | null> {
  for (let waited = 0; waited < 15_000; waited += 100) {
    const win = getWindow()
    if (win) {
      const ready = await win.webContents
        .executeJavaScript("document.documentElement.dataset['chatSubscribed'] === 'true'")
        .catch(() => false)
      if (ready === true) return win
    }
    await sleep(100)
  }
  return getWindow()
}

/**
 * The fixed calibration sample. One construct per density token: multi-line
 * paragraph (line pitch), tight bullet list (item pitch), ordered list,
 * blockquote, heading, table (cell padding), fenced code (pre semantics),
 * and a trailing paragraph (block gap). Content stays stable across runs so
 * before/after and PiCode/ZCode captures are directly comparable.
 */
const SAMPLE = [
  'Density calibration sample. The paragraph below wraps across at least two',
  'lines at the default thread width so the line pitch inside a single block',
  'can be measured: the quick brown fox jumps over the lazy dog and keeps',
  'going until the line breaks somewhere around this part of the sentence.',
  '',
  '- Single-line bullet one',
  '- Single-line bullet two',
  '- Single-line bullet three',
  '- A longer bullet that carries inline code `register.ts` plus **bold** to',
  '  mirror what real answers look like',
  '',
  '1. First ordered item',
  '2. Second ordered item',
  '',
  '> A blockquote line for vertical rhythm reference.',
  '',
  '### Heading three',
  '',
  '| Column | Before | After |',
  '| --- | --- | --- |',
  '| Model | deepseek-v4-flash | GLM-5.3-flash |',
  '| Provider | bella-8000 | bella |',
  '',
  'Closing paragraph after the table. The gap above this sentence is the',
  'paragraph pitch to calibrate against the reference.',
  '',
  '```ts',
  'export function parseRegistration(body: unknown): Registration {',
  '  const { email, password } = RegistrationSchema.parse(body)',
  '  return { email: email.trim().toLowerCase(), password: assertStrongPassword(password) }',
  '}',
  '```'
].join('\n')

/** In-page probe: geometry of every block under the last assistant `.md`. */
const MEASURE_SCRIPT = `(() => {
  const md = [...document.querySelectorAll('.msg-assistant .md')].pop()
  if (!md) return { error: 'no assistant .md found' }
  const rect = (el) => {
    const r = el.getBoundingClientRect()
    return { top: Math.round(r.top * 10) / 10, height: Math.round(r.height * 10) / 10 }
  }
  const blocks = [...md.children].map((el) => ({ tag: el.tagName.toLowerCase(), ...rect(el) }))
  const gaps = []
  for (let i = 1; i < blocks.length; i++) {
    gaps.push({
      between: blocks[i - 1].tag + '->' + blocks[i].tag,
      gap: Math.round((blocks[i].top - (blocks[i - 1].top + blocks[i - 1].height)) * 10) / 10
    })
  }
  const items = [...md.querySelectorAll(':scope > ul > li, :scope > ol > li')].map((li) => rect(li))
  const itemPitch = []
  for (let i = 1; i < items.length; i++) {
    itemPitch.push(Math.round((items[i].top - items[i - 1].top) * 10) / 10)
  }
  const p = md.querySelector(':scope > p')
  const pStyle = p ? getComputedStyle(p) : null
  const pre = md.querySelector(':scope > pre')
  return {
    blocks,
    blockGaps: gaps,
    bulletItems: items,
    bulletPitch: itemPitch,
    tokens: {
      paragraphFontSize: pStyle ? pStyle.fontSize : null,
      paragraphLineHeight: pStyle ? pStyle.lineHeight : null,
      paragraphWhiteSpace: pStyle ? pStyle.whiteSpace : null,
      paragraphMarginBottom: pStyle ? pStyle.marginBottom : null,
      mdWhiteSpace: getComputedStyle(md).whiteSpace,
      preWhiteSpace: pre ? getComputedStyle(pre).whiteSpace : null
    }
  }
})()`

export function startDensityVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!densityVisualEnabled()) return

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      const win = await waitForChatSubscription(getWindow)
      if (!win) throw new Error('density visual harness: no window')

      emitContractEvent({
        type: 'session_created',
        sessionId: 'density-visual-session',
        cwd: '/Users/dev/projects/api-server',
        model: 'claude-opus-4-5'
      })
      await sleep(300)
      emitContractEvent({ type: 'user_message', text: 'Show me the density calibration sample.' } satisfies HostToParent)
      emitContractEvent({ type: 'agent_start' })
      await sleep(300)
      emitContractEvent({ type: 'message_start' })
      // Stream in a few coarse chunks (same shape as a real answer), then settle.
      const text = SAMPLE
      const third = Math.ceil(text.length / 3)
      for (const chunk of [text.slice(0, third), text.slice(third, 2 * third), text.slice(2 * third)]) {
        emitContractEvent({ type: 'text_delta', delta: chunk })
        await sleep(60)
      }
      emitContractEvent({ type: 'message_end' })
      emitContractEvent({ type: 'agent_end' })
      await sleep(700)

      const png = await win.webContents.capturePage()
      const pngPath = path.join(visualOutDir(), 'd-density-sample.png')
      writeFileSync(pngPath, png.toPNG())
      // The sample is taller than one viewport — also capture the lower half
      // (table / code block) so the human pass sees every construct.
      await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector('.chat-scroll'); if (el) el.scrollTop = el.scrollHeight; return true })()`
      )
      await sleep(200)
      const png2 = await win.webContents.capturePage()
      const png2Path = path.join(visualOutDir(), 'd-density-sample-bottom.png')
      writeFileSync(png2Path, png2.toPNG())
      const measure = (await win.webContents.executeJavaScript(MEASURE_SCRIPT)) as unknown
      const jsonPath = path.join(visualOutDir(), 'd-density-measure.json')
      writeFileSync(jsonPath, JSON.stringify(measure, null, 2))
      console.log(`VISUAL captured ${pngPath}`)
      console.log(`VISUAL captured ${png2Path}`)
      console.log(`VISUAL measured ${jsonPath}`)
      console.log(JSON.stringify(measure, null, 2))

      console.log('VISUAL density done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL FAIL', err)
      app.exit(1)
    }
  })()
}
