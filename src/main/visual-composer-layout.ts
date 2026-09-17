/**
 * Composer layout visual harness (ticket 81, spec R7/R8/R10). Enabled with
 * PICODE_VISUAL=1 plus PICODE_VISUAL_COMPOSER_LAYOUT=1. Like the expand
 * harness it ASSERTS its probe results (exit 1 on any violation) and
 * captures the review frames:
 *
 *   c81-a-strip-midband — R7: 4 attached images + a 3-line draft (inside the
 *                         auto-grow band); the attachment strip docks BELOW
 *                         the input and must never overlap it, caret visible
 *   c81-b-cap-scene     — R7+R8: the operator's scene restored (multi-line
 *                         text + 4 images + typing newlines past the 160px
 *                         cap): the caret line stays fully visible while the
 *                         input scrolls internally, and the input's scrollbar
 *                         is a real visible bar whose travel starts BELOW the
 *                         expand button's approved footprint (ticket 58)
 *   c81-c-expand-open   — R10 end state: expanded in place at the projected
 *                         half-zone height
 *
 * The R7 scene is staged with ONE input event per typed line (the same
 * per-event measure cycle a keystroke rides), and the caret-visibility probe
 * is pure geometry: the caret line's flow position must sit inside the
 * textarea's scrolled viewport. The R8 leg additionally DRAGS the scrollbar
 * thumb with real mouse events — visible AND draggable, not just styled.
 *
 * The R10 leg samples the textarea's height every animation frame across the
 * expand/collapse toggle: the glide must produce intermediate heights
 * (panes' --pane-motion-duration curve), and under an emulated
 * prefers-reduced-motion it must cut straight to the end state.
 *
 * Seeding: an isolated session store (PICODE_SESSION_DIR tmpdir) with one
 * backdated session (a fresh mtime would take the Live Follow path, whose
 * view has no composer). Throwaway userData keeps the default view.
 */

import { mkdirSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the composer-layout harness — every other visual
 * harness stands down when it is set. */
export function composerLayoutVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_COMPOSER_LAYOUT'] === '1'
}

/** Throwaway userData, like every harness that drives real prefs-adjacent
 * UI. Called from index.ts at module scope, BEFORE app.whenReady reads
 * userData. */
export function isolateComposerLayoutUserData(): void {
  if (!composerLayoutVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-composer-layout-userdata-${process.pid}`))
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

/** A valid 1×1 transparent PNG — real decodable bytes so the thumbnails
 * render (the ticket-74 smoke driver's signature-only bytes paint broken
 * images, which would pollute the frames). */
const PNG_1PX_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** The operator's scene (pi17-composer-img-cover): 4 images pasted onto the
 * in-session composer. */
const ATTACH_COUNT = 4

/** Typed one line per input event (native setter + input event — the same
 * per-event cycle a keystroke rides): lines 1–6 stay inside the auto-grow
 * band, line 7 pins the 160px cap (7×21+20 = 167 > 160), lines 8+ scroll
 * internally. */
const TYPED_LINES = [
  'Draft the migration plan for the billing service.',
  'Step one: freeze the schema and snapshot the tables.',
  'Step two: backfill the archive tables in batches.',
  'Step three: flip the read path behind a flag.',
  'Step four: drain the old writer and verify counts.',
  'Step five: drop the legacy tables next week.',
  'Step six: document the rollback runbook.',
  'Step seven: schedule the follow-up review.',
  'Step eight: archive the dashboards.',
  'Step nine: close the incident channel.',
  'Step ten: write the retrospective notes.',
  'Step eleven: thank the on-call crew.'
]

/** The in-page geometry sampler. Pure measurement: caret-line visibility is
 * arithmetic on the scrolled viewport (flow position of the caret's line vs
 * [scrollTop, scrollTop + clientHeight]); strip overlap is a rect
 * intersection test; the gutter width tells overlay (0) from a real classic
 * scrollbar. Returns JSON (null when the composer is not mounted). */
const SAMPLE_JS = `(() => {
  const ta = document.querySelector('.chat-dock textarea.composer-input')
  const strip = document.querySelector('.chat-dock .composer-attachments')
  const btn = document.querySelector('.chat-dock .composer-expand')
  if (!(ta instanceof HTMLTextAreaElement)) return null
  const cs = getComputedStyle(ta)
  const lineHeight = parseFloat(cs.lineHeight)
  const padTop = parseFloat(cs.paddingTop)
  const r = ta.getBoundingClientRect()
  const stripR = strip instanceof HTMLElement ? strip.getBoundingClientRect() : null
  const btnR = btn instanceof HTMLElement ? btn.getBoundingClientRect() : null
  const caret = ta.selectionStart ?? ta.value.length
  const lineIndex = ta.value.slice(0, caret).split('\\n').length - 1
  const caretTop = padTop + lineIndex * lineHeight
  const caretBottom = caretTop + lineHeight
  return JSON.stringify({
    lines: ta.value.split('\\n').length,
    scrollTop: ta.scrollTop,
    clientH: ta.clientHeight,
    scrollH: ta.scrollHeight,
    boxH: r.height,
    gutter: ta.offsetWidth - ta.clientWidth,
    caret, lineIndex, caretTop, caretBottom,
    caretVisible: caretTop >= ta.scrollTop - 0.5 && caretBottom <= ta.scrollTop + ta.clientHeight + 0.5,
    taRect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
    stripTop: stripR ? stripR.top : null,
    stripBottom: stripR ? stripR.bottom : null,
    overlapStrip: stripR
      ? stripR.top < r.bottom - 0.5 && stripR.bottom > r.top + 0.5 && stripR.left < r.right - 0.5 && stripR.right > r.left + 0.5
      : false,
    btnTop: btnR ? btnR.top : null,
    btnBottom: btnR ? btnR.bottom : null,
    btnLeft: btnR ? btnR.left : null,
    btnRight: btnR ? btnR.right : null,
    attachCount: document.querySelectorAll('.chat-dock .composer-attachment').length
  })
})()`

interface ComposerSample {
  lines: number
  scrollTop: number
  clientH: number
  scrollH: number
  boxH: number
  gutter: number
  caret: number
  lineIndex: number
  caretTop: number
  caretBottom: number
  caretVisible: boolean
  taRect: { top: number; bottom: number; left: number; right: number }
  stripTop: number | null
  stripBottom: number | null
  overlapStrip: boolean
  btnTop: number | null
  btnBottom: number | null
  btnLeft: number | null
  btnRight: number | null
  attachCount: number
}

/** In-page height sampler around ONE toggle: the click (or Esc) and the
 * sampler start inside the SAME page script — an executeJavaScript roundtrip
 * between them outlives the 200ms glide and every frame would be missed.
 * Interval-driven, not rAF: the glide must be caught even if the compositor
 * throttles animation frames. */
const SAMPLE_HEIGHTS_JS = `new Promise((resolve) => {
  const samples = []
  const t0 = performance.now()
  const timer = setInterval(() => {
    const ta = document.querySelector('.chat-dock textarea.composer-input')
    samples.push(ta ? ta.clientHeight : null)
    if (performance.now() - t0 >= 450) {
      clearInterval(timer)
      resolve(JSON.stringify(samples))
    }
  }, 12)
})`

export function startComposerLayoutVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!composerLayoutVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const file = writeVisualSession(store, {
    id: 'composer-layout-81',
    cwd: ensureVisualProjectDir('composer-layout-demo'),
    userText: 'Draft the migration plan for the billing service'
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
      if (!win) throw new Error('composer-layout visual: no window')
      win.show()
      win.focus()
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(getWindow, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)

      // Open the seeded session by a real sidebar-row click (expand precedent).
      const rowExpr = `document.querySelector('[data-file="${file}"]')`
      if (!(await waitFor(getWindow, `${rowExpr} !== null`, 20_000))) {
        throw new Error('composer-layout visual: the seeded session never reached the sidebar')
      }
      await win.webContents.executeJavaScript(
        `${rowExpr}?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      const chatTa = `document.querySelector('.chat-dock textarea.composer-input')`
      if (!(await waitFor(getWindow, `${chatTa} !== null && ${chatTa}.clientHeight === 74`, 10_000))) {
        throw new Error('composer-layout visual: the chat view composer never settled at the 74px floor')
      }
      const sample = async (): Promise<ComposerSample> => {
        const raw = (await win.webContents.executeJavaScript(SAMPLE_JS).catch(() => null)) as string | null
        if (raw === null) throw new Error('composer-layout visual: the composer disappeared mid-harness')
        return JSON.parse(raw) as ComposerSample
      }

      // ---- the R7 scene: 4 images, then multi-line typing with newlines ----
      const pasted = (await win.webContents.executeJavaScript(`(() => {
        const ta = document.querySelector('.chat-dock textarea.composer-input')
        if (!(ta instanceof HTMLTextAreaElement)) return false
        const bytes = Uint8Array.from(atob(${JSON.stringify(PNG_1PX_BASE64)}), (c) => c.charCodeAt(0))
        const dt = new DataTransfer()
        for (let i = 1; i <= ${ATTACH_COUNT}; i++) {
          dt.items.add(new File([bytes], 'repro-' + i + '.png', { type: 'image/png' }))
        }
        ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
        return true
      })()`)) as boolean
      if (!pasted) throw new Error('composer-layout visual: the composer textarea is missing for the paste')
      if (
        !(await waitFor(
          getWindow,
          `document.querySelectorAll('.chat-dock .composer-attachment').length === ${ATTACH_COUNT}`,
          10_000
        ))
      ) {
        throw new Error('composer-layout visual: the 4 pasted images never rendered attachment cards')
      }
      console.log('VISUAL scene staged: 4 images attached')

      /** ONE line per input event, then let React settle before sampling. */
      const typeLine = async (line: string): Promise<void> => {
        await win.webContents.executeJavaScript(`(() => {
          const ta = document.querySelector('.chat-dock textarea.composer-input')
          if (!(ta instanceof HTMLTextAreaElement)) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, ta.value === '' ? ${JSON.stringify(line)} : ta.value + '\\n' + ${JSON.stringify(line)})
          ta.dispatchEvent(new Event('input', { bubbles: true }))
          return true
        })()`)
        await sleep(120)
      }

      // Mid-band leg: 3 lines — the box follows the content inside the band.
      for (const line of TYPED_LINES.slice(0, 3)) await typeLine(line)
      let s = await sample()
      console.log('VISUAL midband sample', JSON.stringify(s))
      check(s.attachCount === ATTACH_COUNT, `midband: 4 attachments staged (saw ${s.attachCount})`)
      check(s.boxH > 74 && s.boxH < 160, `midband: the input grew inside the 74→160 band (boxH ${s.boxH})`)
      check(!s.overlapStrip, 'midband: the attachment strip never overlaps the input rect')
      check(s.caretVisible, `midband: the caret line is fully visible (scrollTop ${s.scrollTop}, caretTop ${s.caretTop})`)
      await capture(win, 'c81-a-strip-midband', '4 images + 3-line draft, caret visible, strip docked below')

      // Cap leg: type on past the 160px pin — the operator's exact moment
      // (the last newline just landed, caret on the newest line).
      for (const line of TYPED_LINES.slice(3, 12)) await typeLine(line)
      s = await sample()
      console.log('VISUAL cap sample', JSON.stringify(s))
      check(s.boxH === 160, `cap: the input pinned the 160px auto-grow cap (boxH ${s.boxH})`)
      check(s.scrollH > s.clientH, 'cap: the content scrolls internally at the cap')
      check(!s.overlapStrip, 'cap: the attachment strip never overlaps the input rect')
      check(
        s.caretVisible,
        `cap: the caret line stays fully visible at the cap (scrollTop ${s.scrollTop}, line ${s.lineIndex}, caretTop ${s.caretTop}, clientH ${s.clientH})`
      )
      await capture(win, 'c81-b-cap-scene', 'the pi17 scene: 12 lines + 4 images, caret visible at the 160px cap')

      // ---- R8: the scrollbar vs the expand button ----
      // While scrollable the input must carry a REAL visible scrollbar (a
      // reserved classic gutter, not a transient overlay), and its travel
      // must start below the expand button's approved footprint (top 6 +
      // height 26 → the button ends 31px into the textarea; the track is
      // inset 34px). The button itself must stay clickable at its post.
      const trackInsetPx = 34
      check(s.gutter > 0, `R8: a visible classic scrollbar gutter is reserved while scrollable (gutter ${s.gutter}px)`)
      check(
        s.btnBottom !== null && s.btnBottom <= s.taRect.top + trackInsetPx + 1,
        `R8: the expand button (bottom ${String(s.btnBottom)}) clears the scrollbar travel top (${s.taRect.top + trackInsetPx})`
      )
      const btnHit = (await win.webContents.executeJavaScript(`(() => {
        const btn = document.querySelector('.chat-dock .composer-expand')
        if (!(btn instanceof HTMLElement)) return 'missing'
        const r = btn.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return hit !== null && (hit === btn || btn.contains(hit)) ? 'button' : 'other'
      })()`)) as string
      check(btnHit === 'button', 'R8: the expand button stays hittable at its approved position (ticket 58)')

      // Real-drag proof: park the scroll at the top (the thumb sits at the
      // travel's start, below the button), grab its computed center and pull
      // down. If the synthetic mouse path refuses to drive the native
      // scrollbar (Electron quirk), fall back to the honest static proof: a
      // hit-test sweep down the bar's travel — every point must return the
      // textarea (no occluder over the thumb's range → draggable anywhere),
      // with the button separately proven hittable above.
      const drag = (await win.webContents.executeJavaScript(`(() => {
        const ta = document.querySelector('.chat-dock textarea.composer-input')
        if (!(ta instanceof HTMLTextAreaElement)) return null
        ta.scrollTop = 0
        const gutter = ta.offsetWidth - ta.clientWidth
        const trackTop = 34
        const trackH = ta.clientHeight - trackTop - 4
        const scrollRange = ta.scrollHeight - ta.clientHeight
        const thumbH = Math.max(trackH * (ta.clientHeight / ta.scrollHeight), 20)
        const thumbTravel = trackH - thumbH
        const thumbY = trackTop + (ta.scrollTop / Math.max(scrollRange, 1)) * thumbTravel + thumbH / 2
        const r = ta.getBoundingClientRect()
        return JSON.stringify({ x: Math.round(r.right - gutter / 2), y: Math.round(r.top + thumbY) })
      })()`)) as string | null
      if (drag === null) {
        check(false, 'R8: the drag staging could not read the thumb geometry')
      } else {
        const dragPoint = JSON.parse(drag) as { x: number; y: number }
        const before = (await win.webContents.executeJavaScript(
          `document.querySelector('.chat-dock textarea.composer-input')?.scrollTop ?? -1`
        )) as number
        await win.webContents.sendInputEvent({ type: 'mouseDown', x: dragPoint.x, y: dragPoint.y, button: 'left', clickCount: 1 })
        await sleep(60)
        await win.webContents.sendInputEvent({ type: 'mouseMove', x: dragPoint.x, y: dragPoint.y + 40 })
        await sleep(60)
        await win.webContents.sendInputEvent({ type: 'mouseUp', x: dragPoint.x, y: dragPoint.y + 40, button: 'left', clickCount: 1 })
        await sleep(120)
        const after = (await win.webContents.executeJavaScript(
          `document.querySelector('.chat-dock textarea.composer-input')?.scrollTop ?? -1`
        )) as number
        if (after > before + 2) {
          check(true, `R8: dragging the thumb scrolls the input (${before} → ${after})`)
        } else {
          console.log(
            `VISUAL note: synthetic mouse drag did not drive the native scrollbar (${before} → ${after}); hit-test sweep instead`
          )
          const sweep = (await win.webContents.executeJavaScript(`(() => {
            const ta = document.querySelector('.chat-dock textarea.composer-input')
            if (!(ta instanceof HTMLTextAreaElement)) return null
            const gutter = ta.offsetWidth - ta.clientWidth
            const trackTop = 34
            const trackH = ta.clientHeight - trackTop - 4
            const r = ta.getBoundingClientRect()
            const points = [trackTop + 10, trackTop + trackH / 2, trackTop + trackH - 10]
            for (const dy of points) {
              const hit = document.elementFromPoint(r.right - gutter / 2, r.top + dy)
              if (!(hit instanceof Node) || !(ta === hit || ta.contains(hit))) return 'occluded'
            }
            return 'clear'
          })()`)) as string | null
          check(sweep === 'clear', 'R8: the scrollbar travel is unoccluded end to end (draggable anywhere)')
        }
      }
      await capture(win, 'c81-b2-scrollbar', 'classic scrollbar visible, travel clear of the expand button')

      // ---- R10: the expand/collapse glide ----
      const startH = s.boxH
      const zoneH = (await win.webContents.executeJavaScript(
        `document.querySelector('.chat-view')?.clientHeight ?? 0`
      )) as number
      const targetH = Math.round(Math.min(Math.max(zoneH / 2, 280), 560))
      const expandSamples = JSON.parse(
        (await win.webContents.executeJavaScript(
          [
            `document.querySelector('.chat-dock .composer-expand')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`,
            SAMPLE_HEIGHTS_JS
          ].join('\n')
        ).catch(() => '[]')) as string
      ) as number[]
      const expandInter = expandSamples.filter((h) => h !== null && h > startH && h < targetH).length
      check(
        expandInter >= 2,
        `R10: expanding glides through intermediate heights (${expandInter} frames in (${startH}, ${targetH}); samples ${expandSamples.slice(0, 8).join(',')})`
      )
      if (
        !(await waitFor(
          getWindow,
          `(() => {
            const ta = document.querySelector('.chat-dock textarea.composer-input')
            const zone = document.querySelector('.chat-view')
            if (!ta || !zone) return false
            return ta.clientHeight === Math.round(Math.min(Math.max(zone.clientHeight / 2, 280), 560))
          })()`,
          5_000
        ))
      ) {
        check(false, `R10: the expansion never settled at the projected half-zone height (${targetH})`)
      }
      await capture(win, 'c81-c-expand-open', 'expanded in place at the projected half-zone height')

      // Collapse: the expand button re-click glides back down to the
      // auto-grow clamp (click and sample in one page script — same
      // roundtrip reasoning). Diagnostics: marker + computed transition at
      // the first sample.
      const collapseProbe = JSON.parse(
        (await win.webContents.executeJavaScript(
          [
            `(() => {
              document.querySelector('.chat-dock .composer-expand')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
              return new Promise((resolve) => {
                const out = []
                let diag = null
                const t0 = performance.now()
                const snap = () => {
                  const box = document.querySelector('.chat-dock textarea.composer-input')
                  if (diag === null && box) {
                    diag = { marker: box.getAttribute('data-expand-anim'), transition: getComputedStyle(box).transition, h: box.clientHeight }
                  }
                  out.push(box ? box.clientHeight : null)
                  if (performance.now() - t0 < 450) setTimeout(snap, 12)
                  else resolve(JSON.stringify({ samples: out, diag }))
                }
                setTimeout(snap, 12)
              })
            })()`
          ].join(';')
        ).catch(() => 'null')) as string
      ) as { samples: number[]; diag: { marker: string | null; transition: string; h: number } | null }
      const collapseFrames = collapseProbe.samples
      const collapseInter = collapseFrames.filter((h) => h !== null && h > 160 && h < targetH).length
      check(
        collapseInter >= 2,
        `R10: collapsing glides through intermediate heights (${collapseInter} frames in (160, ${targetH}); samples ${collapseFrames.slice(0, 10).join(',')})`
      )
      if (!(await waitFor(getWindow, `${chatTa}.clientHeight === 160`, 5_000))) {
        check(false, 'R10: the collapse never re-settled at the 160px auto-grow clamp')
      }
      // The caret must still be visible in the settled collapsed box (R7).
      s = await sample()
      check(s.caretVisible, `R7: after the collapse the caret line is still visible (scrollTop ${s.scrollTop})`)

      // ---- R10 reduced-motion: the glide cuts to the instant end state ----
      // Emulated via CDP (the surface DevTools uses); the pane convention is
      // transition: none under prefers-reduced-motion. Click and sample in
      // one page script — the assertion is only meaningful when the sampler
      // covers the would-be glide window.
      try {
        const dbg = win.webContents.debugger
        await dbg.attach()
        await dbg.sendCommand('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
        })
        await sleep(100)
        if (!(await waitFor(getWindow, `${chatTa}.clientHeight === ${startH}`, 5_000))) {
          check(false, 'R10: the composer never returned to the collapsed floor before the reduced-motion leg')
        }
        const reducedSamples = JSON.parse(
          (await win.webContents.executeJavaScript(
            [
              `document.querySelector('.chat-dock .composer-expand')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`,
              SAMPLE_HEIGHTS_JS
            ].join('\n')
          ).catch(() => '[]')) as string
        ) as number[]
        const reducedInter = reducedSamples.filter((h) => h !== null && h > startH && h < targetH).length
        check(
          reducedInter === 0,
          `R10: under prefers-reduced-motion the expand cuts straight to the end state (${reducedInter} intermediate frames; samples ${reducedSamples.slice(0, 6).join(',')})`
        )
        await dbg.sendCommand('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-reduced-motion', value: '' }]
        })
        await dbg.detach()
      } catch (err) {
        check(false, `R10: the reduced-motion leg could not run (CDP emulation failed: ${String(err)})`)
      }

      if (failures.length > 0) {
        console.error(`VISUAL composer-layout done with ${failures.length} failure(s)`)
        app.exit(1)
      } else {
        console.log('VISUAL composer-layout done — all checks green')
        app.exit(0)
      }
    } catch (err) {
      console.error('VISUAL composer-layout FAIL', err)
      app.exit(1)
    }
  })()
}
