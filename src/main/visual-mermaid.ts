/**
 * Mermaid diagram-card visual-QA harness (ticket 59, spec R4). Enabled with
 * PICODE_VISUAL=1 plus PICODE_VISUAL_MERMAID=1. NOT part of `npm test` — but
 * like the codeblock/answer harnesses it ASSERTS its probe results (exit 1
 * on any violation): the card-type table is exact state, not eyeballable.
 *
 * The invariants under test (the Seam-1 fenceCardKind projection, rendered
 * live over the contract stream):
 *
 *   1. A closed, parse-ok mermaid fence renders a diagram card: lowercase
 *      mono 'mermaid' chip, sticky action group (download SVG/PNG/MMD menu,
 *      copy source, fullscreen) and a pan/zoom body over the rendered SVG.
 *      The diagram appears WHILE the turn is still streaming (the fence is
 *      closed before message_end).
 *   2. A broken closed fence (parse failure) falls back to the source card
 *      with the mermaid label intact — no error toast (operator ruling Q7).
 *   3. An unclosed fence at the text tail (the streaming shape) stays a
 *      source card — mermaid needs the full text.
 *   4. Copy source carries the exact fence text (stubbed pasteboard — the
 *      real-pasteboard round-trip is the electron smoke's job).
 *   5. Fullscreen opens a ROOT-level overlay and Esc closes it.
 *
 * Seeding: the live turn is injected through the contract stream (the
 * codeblock harness precedent). An isolated session store gets one fake
 * sidebar row so committed frames never show the operator's real sessions;
 * throwaway userData keeps the run off the operator's preferences.
 *
 * Captures (PNGs land in the visual out dir):
 *   mm1-diagram-card        — the diagram card with the download menu open
 *   mm2-diagram-fullscreen  — the root-level fullscreen overlay
 *   mm3-mermaid-fallbacks   — the broken + unclosed fences as source cards
 */

import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { emitContractEvent, visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the mermaid harness (PICODE_VISUAL_MERMAID=1 alongside
 * PICODE_VISUAL=1) — every other visual harness stands down. */
export function mermaidVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_MERMAID'] === '1'
}

/** Throwaway userData (no-op unless PICODE_VISUAL_MERMAID=1). Called from
 * index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateMermaidUserData(): void {
  if (!mermaidVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-mermaid-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** The streamed answer: a valid closed flowchart (the diagram row), a broken
 * closed fence (the parse-failure row) and an unclosed fence at the tail
 * (the streaming row) — the full fenceCardKind table in one document. */
const GOOD = 'flowchart TD\n  A[Start] --> B{Gate}\n  B -->|yes| C[Done]\n  B -->|no| A'
const BAD = 'flowchart TD\n  A --> B {'
const UNCLOSED = 'flowchart TD\n  A --> B'
const SEGMENTS = [
  'The deploy flow:\n\n```mermaid\n' + GOOD + '\n```\n\n',
  'A broken definition falls back to source:\n\n```mermaid\n' + BAD + '\n```\n\n',
  'And one still streaming:\n\n```mermaid\n' + UNCLOSED
]

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

export function startMermaidVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!mermaidVisualEnabled()) return

  // Committed frames must never show the operator's real sessions: isolate
  // the session store (PICODE_SESSION_DIR) BEFORE the index constructs, and
  // seed one fake row so the sidebar looks natural (same rule as the other
  // store harnesses).
  const store = ensureVisualStore()
  writeVisualSession(store, {
    id: 'visual-mermaid-side',
    cwd: ensureVisualProjectDir('deploy-pipeline'),
    userText: 'Draw the deploy flow as a mermaid diagram'
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
      if (!win) throw new Error('mermaid visual: no window')
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)
      win.webContents.setBackgroundThrottling(false)

      emitContractEvent({
        type: 'session_created',
        sessionId: 'visual-mermaid',
        cwd: tmpdir(),
        model: 'claude-opus-4-5'
      })
      await sleep(200)
      emitContractEvent({ type: 'user_message', text: 'Draw the deploy flow.' })
      emitContractEvent({ type: 'agent_start' })
      await sleep(300)
      emitContractEvent({ type: 'message_start' })
      for (const segment of SEGMENTS) {
        emitContractEvent({ type: 'text_delta', delta: segment })
        await sleep(120)
      }

      // ① The diagram card appears WHILE the turn streams: the first fence
      // closed mid-stream, the lazily-loaded mermaid family parsed and
      // rendered it (generous budget — the chunk loads on this first fence).
      const cardSig = `(() => ({
        cards: document.querySelectorAll('.md-diagram-card').length,
        svgs: document.querySelectorAll('.md-diagram-card .md-diagram-canvas svg').length,
        chip: document.querySelector('.md-diagram-card .md-code-lang')?.textContent ?? '',
        download: document.querySelectorAll('.md-diagram-card button[aria-label="Download diagram"]').length,
        copy: document.querySelectorAll('.md-diagram-card button[aria-label="Copy diagram source"]').length,
        fullscreen: document.querySelectorAll('.md-diagram-card button[aria-label="Open diagram fullscreen"]').length,
        zoom:
          document.querySelectorAll('.md-diagram-card button[aria-label="Zoom in"], .md-diagram-card button[aria-label="Zoom out"], .md-diagram-card button[aria-label="Reset zoom"]').length
      }))()`
      const streamed = await waitFor(
        win,
        `(() => { const s = ${cardSig}; return s.cards === 1 && s.svgs === 1 && s.chip === 'mermaid' &&
             s.download === 1 && s.copy === 1 && s.fullscreen === 1 && s.zoom === 3 })()`,
        20_000
      )
      if (!streamed) {
        const diag = (await win.webContents.executeJavaScript(cardSig).catch(() => 'unavailable')) as string
        throw new Error(`mermaid visual mm1: the diagram card never rendered mid-stream; DOM: ${diag}`)
      }
      console.log(`VISUAL probe mm1-streaming-card: diagram card live while streaming`)

      emitContractEvent({ type: 'message_end' })
      emitContractEvent({ type: 'agent_end' })
      await sleep(600)

      // ② The fallback rows: broken (parse failure) + unclosed (streaming)
      // stay source cards with the mermaid label; no error toast (Q7).
      const fallbackSig = `(() => ({
        cards: [...document.querySelectorAll('.md-code-card')].filter((c) => c.querySelector('.md-code-lang')?.textContent === 'mermaid').length,
        diagrams: document.querySelectorAll('.md-diagram-card').length,
        toasts: [...document.querySelectorAll('.toast-message')].filter((n) => /mermaid|parse|diagram/i.test(n.textContent ?? '')).length
      }))()`
      const fallbacks = await waitFor(
        win,
        `(() => { const s = ${fallbackSig}; return s.cards === 2 && s.diagrams === 1 && s.toasts === 0 })()`,
        5_000
      )
      if (!fallbacks) {
        const diag = (await win.webContents.executeJavaScript(fallbackSig).catch(() => 'unavailable')) as string
        throw new Error(`mermaid visual mm3: the fallback rows are wrong; DOM: ${diag}`)
      }
      console.log('VISUAL probe mm3-fallbacks: broken + unclosed stay source cards, zero toasts')

      // ③ Copy source with a stubbed pasteboard (the real-pasteboard
      // round-trip is the electron smoke's job): payload + ✓ feedback.
      await win.webContents.executeJavaScript(
        `(() => {
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: (text) => { window.__mermaidCopy = String(text); return Promise.resolve() } }
          })
          const btn = document.querySelector('.md-diagram-card button[aria-label="Copy diagram source"]')
          if (!(btn instanceof HTMLElement)) return false
          btn.click()
          return true
        })()`
      )
      await sleep(250)
      const copySig = (await win.webContents.executeJavaScript(
        `(() => ({
          payload: window.__mermaidCopy ?? '',
          copied: document.querySelectorAll('.md-diagram-card .md-copy-copied').length
        }))()`
      )) as { payload: string; copied: number }
      // The markdown pipeline (rehype-highlight) normalizes the code text
      // with one trailing newline — the copy payload carries exactly that.
      if (copySig.payload !== GOOD + '\n' || copySig.copied !== 1) {
        throw new Error(`mermaid visual copy: ${JSON.stringify(copySig)}`)
      }
      console.log('VISUAL probe mm-copy: exact fence source + ✓ feedback')

      // ④ Frame 1: the diagram card with the download menu open — the whole
      // action group in one shot.
      await win.webContents.executeJavaScript(
        `(() => {
          document.querySelector('.md-diagram-card')?.scrollIntoView({ block: 'center' })
          const btn = document.querySelector('.md-diagram-card button[aria-label="Download diagram"]')
          if (!(btn instanceof HTMLElement)) return false
          btn.click()
          return true
        })()`
      )
      const menuOpen = await waitFor(
        win,
        `(() => {
          const items = [...document.querySelectorAll('.md-diagram-menu .md-diagram-menu-item')].map((n) => n.textContent ?? '')
          return items.join('|') === 'Download SVG|Download PNG|Download MMD'
        })()`,
        3_000
      )
      if (!menuOpen) throw new Error('mermaid visual mm1: the download menu never offered SVG/PNG/MMD')
      console.log('VISUAL probe mm1-menu: Download SVG | PNG | MMD')
      await sleep(250)
      await capture(win, 'mm1-diagram-card')
      await win.webContents.executeJavaScript(
        `(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`
      )
      await sleep(200)

      // ⑤ Fullscreen: a ROOT-level overlay; Esc closes it. Frame 2 inside.
      await win.webContents.executeJavaScript(
        `(() => {
          const btn = document.querySelector('.md-diagram-card button[aria-label="Open diagram fullscreen"]')
          if (!(btn instanceof HTMLElement)) return false
          btn.click()
          return true
        })()`
      )
      const fsOpen = await waitFor(
        win,
        `(() => {
          const overlay = document.querySelector('body > .md-diagram-fs')
          return overlay !== null && overlay.getAttribute('role') === 'dialog' &&
            overlay.querySelectorAll('.md-diagram-canvas svg').length === 1
        })()`,
        3_000
      )
      if (!fsOpen) throw new Error('mermaid visual mm2: fullscreen never opened as a root-level overlay')
      console.log('VISUAL probe mm2-fullscreen: root-level overlay open')
      await sleep(300)
      await capture(win, 'mm2-diagram-fullscreen')
      await win.webContents.executeJavaScript(
        `(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`
      )
      const fsClosed = await waitFor(win, `document.querySelector('body > .md-diagram-fs') === null`, 3_000)
      if (!fsClosed) throw new Error('mermaid visual mm2: Escape did not close the fullscreen overlay')
      console.log('VISUAL probe mm2-esc: overlay closed on Escape')

      // Frame 3: the two fallback source cards.
      await win.webContents.executeJavaScript(
        `(() => {
          const cards = [...document.querySelectorAll('.md-code-card')]
          cards[cards.length - 1]?.scrollIntoView({ block: 'center' })
          return true
        })()`
      )
      await sleep(300)
      await capture(win, 'mm3-mermaid-fallbacks')

      console.log('VISUAL mermaid done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL mermaid FAIL', err)
      app.exit(1)
    }
  })()
}
