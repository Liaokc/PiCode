/**
 * Image-preview overlay visual harness (ticket 91). Enabled with
 * PICODE_VISUAL=1 plus PICODE_VISUAL_IMAGE_PREVIEW=1. Like the
 * composer-layout harness it ASSERTS its probe results (exit 1 on any
 * violation) and captures the review frames:
 *
 *   c91-a-overlay-open — the fullscreen mask over the 3-image strip: the
 *                        second image fills the viewport at contain-fit,
 *                        the position chip reads 2/3, the ❌ sits top-right
 *                        (the checkerboard edges stay crisp — the frame is
 *                        the human-legible blur check the smoke can't make)
 *   c91-b-nav-next     — after ArrowRight: 3/3 and the phase-flipped
 *                        payload (the wrap-walk visibly swaps the image)
 *
 * The scene: an isolated store with one backdated session (fresh mtime
 * would take the Live Follow path, whose view has no composer), one draft
 * line typed into the in-session composer, then 3 real 1200×900
 * checkerboard PNGs pasted through the ticket-74 DataTransfer driver. The
 * overlay is opened by a REAL mouse click on the 2nd thumbnail, and the
 * Space exit is probed for the focus-return + zero-disturbance contract.
 *
 * Seeding: throwaway userData (like every harness that drives real
 * prefs-adjacent UI) keeps the default view.
 */

import { mkdirSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { checkerboardPaint, pngBase64 } from './png-fixture'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the image-preview harness — every other visual
 * harness stands down when it is set. */
export function imagePreviewVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_IMAGE_PREVIEW'] === '1'
}

/** Throwaway userData, like every harness that drives real prefs-adjacent
 * UI. Called from index.ts at module scope, BEFORE app.whenReady reads
 * userData. */
export function isolateImagePreviewUserData(): void {
  if (!imagePreviewVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-image-preview-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(getWindow: () => BrowserWindow | null, probe: string, budgetMs: number): Promise<boolean> {
  const win = getWindow()
  if (!win) return false
  for (let waited = 0; waited < budgetMs; waited += 100) {
    const ok = (await win.webContents.executeJavaScript(probe).catch(() => false)) as boolean
    if (ok) return true
    await sleep(100)
  }
  return false
}

async function capture(win: BrowserWindow, name: string, state: string): Promise<void> {
  const { writeFileSync } = await import('node:fs')
  const png = await win.webContents.capturePage()
  writeFileSync(path.join(visualOutDir(), `${name}.png`), png.toPNG())
  console.log(`VISUAL captured ${name}.png state=${state}`)
}

/** The scene: one draft line + 3 large fixture images. The middle one
 * phase-flips the checkerboard so the nav frame shows a REAL payload swap
 * (the data URLs genuinely differ). */
const DRAFT_LINE = 'Ticket 91: preview the attached screenshots before sending.'
const ATTACH_COUNT = 3
const FIXTURE_W = 1200
const FIXTURE_H = 900

export function startImagePreviewVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!imagePreviewVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const file = writeVisualSession(store, {
    id: 'image-preview-91',
    cwd: ensureVisualProjectDir('image-preview-demo'),
    userText: 'Preview the attached screenshots before sending'
  })
  // Backdate: a fresh mtime would take the Live Follow path (no composer).
  const then = new Date(Date.now() - 60 * 60 * 1_000)
  utimesSync(file, then, then)

  void (async () => {
    const failures: string[] = []
    const check = (ok: boolean, message: string): void => {
      if (ok) console.log(`VISUAL ok: ${message}`)
      else {
        console.error(`VISUAL FAIL: ${message}`)
        failures.push(message)
      }
    }
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('image-preview visual: no window')
      win.show()
      win.focus()
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(getWindow, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)

      // Open the seeded session by a real sidebar-row click (expand precedent).
      const rowExpr = `document.querySelector('[data-file="${file}"]')`
      if (!(await waitFor(getWindow, `${rowExpr} !== null`, 20_000))) {
        throw new Error('image-preview visual: the seeded session never reached the sidebar')
      }
      await win.webContents.executeJavaScript(
        `${rowExpr}?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      const chatTa = `document.querySelector('.chat-dock textarea.composer-input')`
      if (!(await waitFor(getWindow, `${chatTa} !== null && ${chatTa}.clientHeight === 74`, 10_000))) {
        throw new Error('image-preview visual: the chat view composer never settled at the 74px floor')
      }

      // Draft line first, then the paste (the ticket-74 driver, real bytes).
      await win.webContents.executeJavaScript(`(() => {
        const ta = document.querySelector('.chat-dock textarea.composer-input')
        if (!(ta instanceof HTMLTextAreaElement)) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
        setter.call(ta, ${JSON.stringify(DRAFT_LINE)})
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      const pngA = pngBase64(FIXTURE_W, FIXTURE_H, checkerboardPaint)
      const pngB = pngBase64(FIXTURE_W, FIXTURE_H, (x, y) => checkerboardPaint(x + 8, y))
      const pasted = (await win.webContents.executeJavaScript(`(() => {
        const ta = document.querySelector('.chat-dock textarea.composer-input')
        if (!(ta instanceof HTMLTextAreaElement)) return false
        const decode = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
        const dt = new DataTransfer()
        for (const b64 of [${JSON.stringify(pngA)}, ${JSON.stringify(pngB)}, ${JSON.stringify(pngA)}]) {
          dt.items.add(new File([decode(b64)], 'screenshot.png', { type: 'image/png' }))
        }
        ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
        return true
      })()`)) as boolean
      if (!pasted) throw new Error('image-preview visual: the composer textarea is missing for the paste')
      if (
        !(await waitFor(
          getWindow,
          `document.querySelectorAll('.chat-dock .composer-attachment').length === ${ATTACH_COUNT}`,
          10_000
        ))
      ) {
        throw new Error('image-preview visual: the 3 pasted images never rendered attachment cards')
      }
      console.log('VISUAL scene staged: 1 draft line + 3 fixture images')

      // Open the overlay with a REAL mouse click on the 2nd thumbnail.
      const thumb = JSON.parse(
        String(
          await win.webContents.executeJavaScript(`(() => {
          const el = document.querySelectorAll('.chat-dock .composer-attachment-thumb')[1]
          if (!(el instanceof HTMLElement)) return null
          const r = el.getBoundingClientRect()
          return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) })
        })()`).catch(() => 'null')
        )
      ) as { x: number; y: number } | null
      if (thumb === null) throw new Error('image-preview visual: the 2nd thumbnail is missing')
      await win.webContents.sendInputEvent({ type: 'mouseDown', x: thumb.x, y: thumb.y, button: 'left', clickCount: 1 })
      await sleep(60)
      await win.webContents.sendInputEvent({ type: 'mouseUp', x: thumb.x, y: thumb.y, button: 'left', clickCount: 1 })
      if (!(await waitFor(getWindow, `document.querySelector('.image-preview-count')?.textContent === '2/3'`, 5_000))) {
        check(false, 'the real thumbnail click never opened the overlay at 2/3')
      }

      // The open-state probe: full-resolution source, contain-fit box,
      // dialog semantics, top-right ❌.
      const overlay = JSON.parse(
        String(
          await win.webContents.executeJavaScript(`(() => {
          const backdrop = document.querySelector('.image-preview-backdrop')
          const img = document.querySelector('.image-preview-img')
          const stage = document.querySelector('.image-preview-stage')
          const close = document.querySelector('.image-preview-close')
          if (!(backdrop instanceof HTMLElement) || !(img instanceof HTMLImageElement)) return null
          const r = img.getBoundingClientRect()
          return JSON.stringify({
            naturalW: img.naturalWidth, naturalH: img.naturalHeight,
            boxW: Math.round(r.width), boxH: Math.round(r.height),
            maxW: Math.round(window.innerWidth * 0.9), maxH: Math.round(window.innerHeight * 0.84),
            dialog: stage instanceof HTMLElement && stage.getAttribute('role') === 'dialog' && stage.getAttribute('aria-modal') === 'true',
            hasClose: close instanceof HTMLElement,
            closeTop: close instanceof HTMLElement ? Math.round(close.getBoundingClientRect().top) : null,
            closeRight: close instanceof HTMLElement ? Math.round(window.innerWidth - close.getBoundingClientRect().right) : null
          })
        })()`).catch(() => 'null')
        )
      ) as {
        naturalW: number
        naturalH: number
        boxW: number
        boxH: number
        maxW: number
        maxH: number
        dialog: boolean
        hasClose: boolean
        closeTop: number | null
        closeRight: number | null
      } | null
      if (overlay === null) throw new Error('image-preview visual: the overlay probe never returned')
      check(overlay.naturalW === FIXTURE_W && overlay.naturalH === FIXTURE_H, `the overlay renders the FULL-resolution payload (natural ${overlay.naturalW}×${overlay.naturalH})`)
      check(overlay.boxW <= overlay.maxW + 1 && overlay.boxH <= overlay.maxH + 1, `the displayed box fits its contain-fit caps (box ${overlay.boxW}×${overlay.boxH} within ${overlay.maxW}×${overlay.maxH})`)
      check(overlay.dialog, 'the overlay carries dialog semantics (role=dialog + aria-modal)')
      check(overlay.hasClose && overlay.closeTop !== null && overlay.closeTop <= 30 && overlay.closeRight !== null && overlay.closeRight <= 30, `the ❌ sits at the window's top-right corner (top ${String(overlay.closeTop)}, right ${String(overlay.closeRight)})`)
      await capture(win, 'c91-a-overlay-open', 'fullscreen mask at 2/3, checkerboard crisp, ❌ top-right, draft + 3 attachments intact below')

      // ArrowRight: the wrap-walk to 3/3 — the phase-flipped payload.
      await win.webContents.executeJavaScript(
        `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); true`
      )
      if (!(await waitFor(getWindow, `document.querySelector('.image-preview-count')?.textContent === '3/3'`, 5_000))) {
        check(false, 'ArrowRight never walked 2/3 → 3/3')
      }
      await capture(win, 'c91-b-nav-next', 'after ArrowRight: 3/3 with the phase-flipped payload')

      // Space exit: mask down, caret back on the input, scene untouched.
      await win.webContents.executeJavaScript(
        `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })); true`
      )
      if (!(await waitFor(getWindow, `document.querySelector('.image-preview-backdrop') === null`, 5_000))) {
        check(false, 'Space never closed the overlay')
      }
      if (!(await waitFor(getWindow, `document.activeElement === ${chatTa}`, 5_000))) {
        check(false, 'after the Space exit the caret never returned to the composer input')
      }
      const intact = JSON.parse(
        (await win.webContents.executeJavaScript(`(() => {
          const ta = document.querySelector('.chat-dock textarea.composer-input')
          return JSON.stringify({
            value: ta instanceof HTMLTextAreaElement ? ta.value : null,
            attachments: document.querySelectorAll('.chat-dock .composer-attachment').length
          })
        })()`).catch(() => '{}')) as string
      ) as { value: string | null; attachments: number }
      check(intact.value === DRAFT_LINE && intact.attachments === ATTACH_COUNT, `the composer survived the preview untouched (value ${intact.value === DRAFT_LINE ? 'intact' : 'CHANGED'}, attachments ${intact.attachments})`)

      if (failures.length > 0) {
        console.error(`VISUAL image-preview done with ${failures.length} failure(s)`)
        app.exit(1)
      } else {
        console.log('VISUAL image-preview done — all checks green')
        app.exit(0)
      }
    } catch (err) {
      console.error('VISUAL image-preview FAIL', err)
      app.exit(1)
    }
  })()
}
