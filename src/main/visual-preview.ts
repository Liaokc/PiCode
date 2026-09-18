/**
 * File-preview dual-view visual-QA harness (ticket 88). Enabled with
 * PICODE_VISUAL=1 plus PICODE_VISUAL_PREVIEW=1. NOT part of `npm test` —
 * but like the file-bar harness it ASSERTS its probe results (exit 1 on any
 * violation): the classification, the sandbox contract and the relative
 * resource base are exact, not eyeballable.
 *
 * The frames (acceptance: visual 渲染帧):
 *
 *   1. c88-html-rendered  — an HTML report opens RENDERED by default inside
 *      the sandboxed iframe (allow-scripts only): its inline script RAN
 *      (heading rewritten + postMessage probe), the relative stylesheet
 *      paints the peach body, and the relative image decoded — the frame's
 *      base is the file's own directory;
 *   2. c88-html-source    — the Source segment shows highlighted HTML with
 *      the wrap toggle back;
 *   3. c88-svg-rendered   — an SVG opens RENDERED as a static img data-URL
 *      (scripts never run in an img context), Source shows the markup;
 *   4. c88-png-rendered   — a png displays directly (single state: no
 *      segmented control, no wrap toggle, no source).
 *
 * Sandbox assertions (safety 存档, run live): the probe reports
 * typeof require/process/window.picode all 'undefined' inside the frame;
 * the parent page cannot read the frame's contentDocument (opaque origin);
 * the iframe element carries exactly sandbox="allow-scripts" and a
 * preview-file://local/ src.
 *
 * Seeding: an isolated store gets one fake sidebar row whose cwd is the
 * fixture directory (ensureVisualProjectDir — REAL files on disk), so the
 * sidebar "View files" action opens the file browser over the fixtures and
 * file rows deep-link into preview tabs. Throwaway userData keeps the run
 * off the operator's preferences.
 */

import { tmpdir } from 'node:os'
import path from 'node:path'
import { writeFileSync } from 'node:fs'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** A real 24×12 solid-blue PNG (no fixture deps). */
const PNG_24X12 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABgAAAAMCAIAAAD3UuoiAAAAF0lEQVR4nGPwr/lPFcQwatCoQaMG4UMAAIsDX/fiMDsAAAAASUVORK5CYII=',
  'base64'
)

const FIXTURE_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>PICODE88 report</title>
<link rel="stylesheet" href="report.css">
</head>
<body>
<h1 class="p88-head">PENDING</h1>
<img id="p88-img" alt="dot" src="dot.png">
<p>PICODE88 relative css + img + inline script</p>
<script>
  (function () {
    var img = document.getElementById('p88-img')
    var probe = {
      probe: 'picode-88',
      ran: true,
      node: typeof require,
      proc: typeof process,
      picode: typeof window.picode,
      title: document.title,
      css: getComputedStyle(document.body).backgroundColor,
      img: img !== null && img.naturalWidth > 0
    }
    try { parent.postMessage(JSON.stringify(probe), '*') } catch (e) {}
    var head = document.querySelector('.p88-head')
    if (head) head.textContent = 'PICODE88_SCRIPT_RAN'
  })()
</script>
</body>
</html>
`

const FIXTURE_CSS = `body { background-color: rgb(255, 240, 224); font-family: sans-serif; }
.p88-head { color: #b45309; }
`

const FIXTURE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80" viewBox="0 0 160 80">
  <rect x="2" y="2" width="156" height="76" rx="10" fill="#eef2ff" stroke="#4f7cff" stroke-width="2"/>
  <text x="80" y="46" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#1e3a8a">PICODE88 SVG</text>
</svg>
`

const FIXTURE_MD = '# PICODE88 notes\n\nSome **bold** and `code`.\n'

/** Exclusive gate of the preview harness (PICODE_VISUAL_PREVIEW=1 alongside
 * PICODE_VISUAL=1) — every other visual harness stands down. */
export function previewVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_PREVIEW'] === '1'
}

/** Throwaway userData (no-op unless PICODE_VISUAL_PREVIEW=1). Called from
 * index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolatePreviewUserData(): void {
  if (!previewVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-preview-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function seedFixtureDir(): string {
  const dir = ensureVisualProjectDir('preview88')
  writeFileSync(path.join(dir, 'report.html'), FIXTURE_HTML)
  writeFileSync(path.join(dir, 'report.css'), FIXTURE_CSS)
  writeFileSync(path.join(dir, 'dot.png'), PNG_24X12)
  writeFileSync(path.join(dir, 'diagram.svg'), FIXTURE_SVG)
  writeFileSync(path.join(dir, 'notes.md'), FIXTURE_MD)
  writeFileSync(path.join(dir, 'logo.bin'), Buffer.from([0x00, 0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a]))
  return dir
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
  const png = await win.webContents.capturePage()
  writeFileSync(path.join(visualOutDir(), `${name}.png`), png.toPNG())
  console.log(`VISUAL captured ${name}.png`)
}

const js = (win: BrowserWindow, script: string): Promise<unknown> => win.webContents.executeJavaScript(script)

/** The active preview body (open tab bodies stay mounted — hidden ones carry
 * panel-tab-body-hidden — so every content probe scopes to the active one). */
const ACTIVE_BODY = `.panel-tab-body:not(.panel-tab-body-hidden)`

/** Click the file-browser row with this exact name (root listing). */
const CLICK_ROW = (name: string): string =>
  `(() => {
    for (const row of document.querySelectorAll('.fb-row')) {
      if (row.querySelector('.fb-row-name')?.textContent !== '${name}') continue
      row.click()
      return true
    }
    return false
  })()`

/** Click the named segment (Rendered/Source) in the ACTIVE body; a no-op
 * (still true) when that view is already active. */
const CLICK_SEGMENT = (view: 'rendered' | 'source'): string =>
  `(() => {
    const body = document.querySelector('${ACTIVE_BODY}')
    const want = '${view === 'rendered' ? 'Rendered' : 'Source'}'
    for (const button of body?.querySelectorAll('.review-segmented button') ?? []) {
      if (!(button.textContent ?? '').includes(want)) continue
      if (button.getAttribute('aria-selected') !== 'true') button.click()
      return true
    }
    return false
  })()`

export function startPreviewVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!previewVisualEnabled()) return

  // Committed frames must never show the operator's real sessions: isolate
  // the session store (PICODE_SESSION_DIR) BEFORE the index constructs, and
  // seed one fake row pointing at the fixture directory (same rule as the
  // other store harnesses).
  const store = ensureVisualStore()
  const fixtureDir = seedFixtureDir()
  writeVisualSession(store, {
    id: 'visual-preview-88',
    cwd: fixtureDir,
    userText: 'Preview the ticket-88 fixtures.'
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
      if (!win) throw new Error('preview visual: no window')
      await waitFor(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)
      win.webContents.setBackgroundThrottling(false)

      const problems: string[] = []

      // ---- open the file browser over the fixtures via the sidebar
      // group's "View files" action (ticket 26 hover actions). ----
      const viewFiles = `(() => {
        const btn = document.querySelector('[aria-label="View files in preview88"]')
        if (btn instanceof HTMLElement) { btn.click(); return true }
        return false
      })()`
      if (!(await waitFor(win, viewFiles, 10_000))) {
        throw new Error('preview visual: the preview88 group never offered "View files"')
      }
      if (!(await waitFor(win, `document.querySelector('.fb-browser') !== null`, 10_000))) {
        throw new Error('preview visual: the file browser never opened')
      }

      // Arm the frame-message collector BEFORE the html preview loads.
      await js(
        win,
        `window.__p88msgs = [];
         window.addEventListener('message', (e) => { window.__p88msgs.push(String(e.data)) });
         true`
      )

      const clickAndWaitTab = async (name: string): Promise<boolean> => {
        const clicked = await waitFor(win, CLICK_ROW(name), 10_000)
        if (!clicked) return false
        return waitFor(
          win,
          `[...document.querySelectorAll('.panel-tab-label span')].some((el) => el.textContent === '${name}')`,
          10_000
        )
      }

      // ---- ① HTML: opens RENDERED inside the sandboxed iframe ----
      if (!(await clickAndWaitTab('report.html'))) throw new Error('preview visual: report.html never opened a preview tab')
      const htmlFrameOk = await waitFor(
        win,
        `(() => {
          const frame = document.querySelector('${ACTIVE_BODY} .preview-html-frame')
          return frame !== null
            && frame.getAttribute('sandbox') === 'allow-scripts'
            && (frame.getAttribute('src') ?? '').startsWith('preview-file://local/')
            && frame.contentDocument === null
        })()`,
        10_000
      )
      if (!htmlFrameOk) throw new Error('preview visual: the html iframe is missing or violates the sandbox contract (sandbox/src/contentDocument)')
      console.log('VISUAL probe html-frame: sandbox=allow-scripts src=preview-file://local/ contentDocument=null (opaque origin)')

      const probeArrived = await waitFor(
        win,
        `(window.__p88msgs ?? []).some((m) => String(m).includes('"probe":"picode-88"'))`,
        10_000
      )
      if (!probeArrived) throw new Error('preview visual: the in-frame probe never posted a message')
      const probe = JSON.parse(
        ((await js(win, `(window.__p88msgs ?? []).find((m) => String(m).includes('"probe":"picode-88"'))`)) as string) ??
          '{}'
      ) as Record<string, unknown>
      if (probe['ran'] !== true) problems.push('frame inline script did not run')
      if (probe['node'] !== 'undefined') problems.push(`require visible in frame: ${String(probe['node'])}`)
      if (probe['proc'] !== 'undefined') problems.push(`process visible in frame: ${String(probe['proc'])}`)
      if (probe['picode'] !== 'undefined') problems.push(`preload bridge visible in frame: ${String(probe['picode'])}`)
      if (probe['title'] !== 'PICODE88 report') problems.push(`document title wrong: ${String(probe['title'])}`)
      // Relative resources loaded against the file directory (base = 文件目录).
      if (probe['css'] !== 'rgb(255, 240, 224)') problems.push(`relative css not applied: ${String(probe['css'])}`)
      if (probe['img'] !== true) problems.push('relative image did not decode')
      if (problems.length > 0) throw new Error(`preview visual html probe: ${problems.join('; ')}`)
      console.log('VISUAL probe html-frame content:', JSON.stringify(probe))
      await sleep(400)
      await capture(win, 'c88-html-rendered')

      // ---- ② HTML source: segmented control, wrap toggle back, iframe gone ----
      if (!(await js(win, CLICK_SEGMENT('source')))) throw new Error('preview visual: the html Source segment never rendered')
      if (
        !(await waitFor(
          win,
          `document.querySelector('${ACTIVE_BODY} .preview-html-frame') === null
           && document.querySelector('${ACTIVE_BODY} .preview-src, ${ACTIVE_BODY} .code-view, ${ACTIVE_BODY} pre') !== null
           && document.querySelector('.preview-wrap-toggle') !== null`,
          10_000
        ))
      ) {
        throw new Error('preview visual: html Source never showed highlighted code with the wrap toggle')
      }
      await sleep(300)
      await capture(win, 'c88-html-source')
      if (!(await js(win, CLICK_SEGMENT('rendered')))) throw new Error('preview visual: the Rendered segment never rendered')
      await waitFor(win, `document.querySelector('${ACTIVE_BODY} .preview-html-frame') !== null`, 10_000)

      // ---- ③ SVG: rendered-first as a static img data-URL, Source shows markup ----
      if (!(await clickAndWaitTab('diagram.svg'))) throw new Error('preview visual: diagram.svg never opened a preview tab')
      const svgOk = await waitFor(
        win,
        `(() => {
          const img = document.querySelector('${ACTIVE_BODY} .preview-media img')
          return img !== null && (img.getAttribute('src') ?? '').startsWith('data:image/svg+xml;base64,')
        })()`,
        10_000
      )
      if (!svgOk) throw new Error('preview visual: the svg never rendered as an img data-URL by default')
      if (
        !(await waitFor(
          win,
          `document.querySelector('${ACTIVE_BODY} .review-segmented') !== null
           && document.querySelector('.preview-wrap-toggle') === null`,
          5_000
        ))
      ) {
        throw new Error('preview visual: svg rendered state must show the segmented control and hide the wrap toggle')
      }
      await sleep(300)
      await capture(win, 'c88-svg-rendered')
      if (!(await js(win, CLICK_SEGMENT('source')))) throw new Error('preview visual: the svg Source segment never rendered')
      if (!(await waitFor(win, `document.querySelector('${ACTIVE_BODY} .preview-media img') === null`, 10_000))) {
        throw new Error('preview visual: svg Source never left the rendered image')
      }
      if (!(await js(win, CLICK_SEGMENT('rendered')))) throw new Error('preview visual: the svg Rendered segment never rendered')

      // ---- ④ PNG: direct display, single state (no segmented, no wrap) ----
      if (!(await clickAndWaitTab('dot.png'))) throw new Error('preview visual: dot.png never opened a preview tab')
      const pngOk = await waitFor(
        win,
        `(() => {
          const img = document.querySelector('${ACTIVE_BODY} .preview-media img')
          return img !== null && (img.getAttribute('src') ?? '').startsWith('data:image/png;base64,')
        })()`,
        10_000
      )
      if (!pngOk) throw new Error('preview visual: the png never displayed from its data URL')
      if (
        !(await waitFor(
          win,
          `document.querySelector('${ACTIVE_BODY} .review-segmented') === null
           && document.querySelector('.preview-wrap-toggle') === null`,
          5_000
        ))
      ) {
        throw new Error('preview visual: png must be single-state — no segmented control, no wrap toggle')
      }
      await sleep(300)
      await capture(win, 'c88-png-rendered')

      // ---- ⑤ markdown dual-state zero-regression ----
      if (!(await clickAndWaitTab('notes.md'))) throw new Error('preview visual: notes.md never opened a preview tab')
      if (!(await waitFor(win, `document.querySelector('${ACTIVE_BODY} .preview-md') !== null`, 10_000))) {
        throw new Error('preview visual: markdown never opened rendered (regression)')
      }
      if (!(await js(win, CLICK_SEGMENT('source')))) throw new Error('preview visual: the markdown Source segment never rendered')
      if (!(await waitFor(win, `document.querySelector('${ACTIVE_BODY} .preview-md') === null`, 10_000))) {
        throw new Error('preview visual: markdown Source never left the rendered view')
      }
      if (!(await js(win, CLICK_SEGMENT('rendered')))) throw new Error('preview visual: the markdown Rendered segment never rendered')

      // ---- ⑥ binary refusal zero-regression (non-image binary) ----
      if (!(await clickAndWaitTab('logo.bin'))) throw new Error('preview visual: logo.bin never opened a preview tab')
      if (
        !(await waitFor(
          win,
          `(() => {
            const body = document.querySelector('${ACTIVE_BODY}')
            return body?.textContent?.includes('Binary file') === true
              && body.querySelector('.preview-media img') === null
              && body.querySelector('.review-segmented') === null
          })()`,
          10_000
        ))
      ) {
        throw new Error('preview visual: the binary notice never showed for logo.bin (regression)')
      }

      if (problems.length > 0) throw new Error(`preview visual: ${problems.join('; ')}`)
      console.log('VISUAL ticket-88 preview dual-view done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL ticket-88 preview FAIL', err)
      app.exit(1)
    }
  })()
}
