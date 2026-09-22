/**
 * Menu-geometry visual-QA harness (ticket 122, spec R4/R5; reworked by
 * ticket 138 against the delivered ZCode frames). Enabled with
 * PICODE_VISUAL=1 plus PICODE_VISUAL_MENU_GEOMETRY=1. Like the context-ring
 * harness it ASSERTS its probe results (exit 1 on any violation) and
 * captures the review frames (the z19-menu-1/2 reference frames live in
 * .scratch/picode-1-8/reference/ — the frames below are captioned for the
 * operator's eyeball pass against them):
 *
 *   mg1-cascade-provider-first — the model cascade open, first provider
 *                                hovered: TWO SEPARATE CARDS (each column
 *                                its own border/radius/height, a real
 *                                groove between them), model card top
 *                                riding the hovered row, the provider
 *                                card hugging the chip
 *   mg2-cascade-provider-last  — the LAST provider hovered: same provider
 *                                card bbox (R4 — the model column no longer
 *                                drives the popover height), the model
 *                                card's top riding the new row instead
 *   mg3-anchor-chip            — the card's left edge = the model chip's
 *                                viewport-left edge, bottom edge ≈2px above
 *                                the chip's top edge (R5 + the 138 hug)
 *   mg4-thinking-brain         — the thinking menu open on its chip: the
 *                                Lucide-form brain icon (t137) on the chip
 *                                + the narrow card chip-anchored AND
 *                                chip-hugging (R5, z 图7 form)
 *   mg5-narrow-clamp           — a 520px window: the open card stays
 *                                inside the viewport (R5 clamping)
 *
 * Seeding: throwaway userData + an isolated EMPTY session store — the boot
 * lands on the New Task empty state whose model menu reads the REAL auth
 * probe catalog (the smoke's empty-state path; zero model calls).
 */

import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { visualOutDir } from './visual'
import { ensureVisualStore } from './visual-store'

/** Exclusive gate of the menu-geometry harness — every other visual
 * harness stands down when it is set. */
export function menuGeometryVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_MENU_GEOMETRY'] === '1'
}

/** Throwaway userData, like every harness that drives real prefs-adjacent
 * UI. Called from index.ts at module scope, BEFORE app.whenReady reads
 * userData. */
export function isolateMenuGeometryUserData(): void {
  if (!menuGeometryVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-menu-geometry-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(win: BrowserWindow, probe: string, budgetMs: number): Promise<boolean> {
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

/** The geometry facts of the open model card, its chip and the composer. */
const GEOM_JS = `(() => {
  const card = document.querySelector('.cmp-popover')
  const chip = document.querySelector('.cmp-chip[aria-label^="Model:"]')
  const composer = document.querySelector('.composer')
  if (!(card instanceof HTMLElement) || !(chip instanceof HTMLElement) || !(composer instanceof HTMLElement)) return null
  const c = card.getBoundingClientRect()
  const k = chip.getBoundingClientRect()
  const m = composer.getBoundingClientRect()
  const cols = [...document.querySelectorAll('.cmp-popover .cmp-cascade-col')]
  const colRects = cols.map((col) => {
    const r = col.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, height: r.height }
  })
  const providerRows = cols[0]?.querySelectorAll('.cmp-menu-row') ?? []
  const selectedRow = [...providerRows].find((r) => r.classList.contains('cmp-menu-row-selected'))
  return JSON.stringify({
    left: c.left, top: c.top, width: c.width, height: c.height, right: c.right, bottom: c.bottom,
    chipLeft: k.left, chipTop: k.top, composerTop: m.top, innerWidth: window.innerWidth,
    colRects,
    selectedRowTop: selectedRow ? selectedRow.getBoundingClientRect().top : null,
    wrapperBg: getComputedStyle(card).backgroundColor,
    colStyles: cols.map((col) => {
      const s = getComputedStyle(col)
      return { radius: s.borderTopLeftRadius, borderTop: s.borderTopWidth }
    })
  })
})()`

interface CardGeom {
  left: number
  top: number
  width: number
  height: number
  right: number
  bottom: number
  chipLeft: number
  chipTop: number
  composerTop: number
  innerWidth: number
  colRects: { left: number; right: number; top: number; height: number }[]
  selectedRowTop: number | null
  wrapperBg: string
  colStyles: { radius: string; borderTop: string }[]
}

export function startMenuGeometryVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!menuGeometryVisualEnabled()) return

  // An isolated EMPTY store: the boot empty state is the surface under test
  // (its model menu lists the real configured catalog — zero model calls).
  ensureVisualStore()

  void (async () => {
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('menu-geometry visual: no window')
      await waitFor(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      // The chip shows the chained default once the auth probe lands (the
      // smoke's empty-state wait shape).
      await waitFor(win, `document.querySelector('.cmp-chip[aria-label^="Model:"]') !== null`, 30_000)
      await sleep(500)
      win.webContents.setBackgroundThrottling(false)

      // Deterministic wide viewport so the unclamped anchor equality is
      // observable (the model card is 380px wide).
      const bounds = win.getBounds()
      win.setSize(Math.max(bounds.width, 1440), bounds.height)
      win.show()
      win.focus()
      app.focus({ steal: true })

      const js = (script: string): Promise<unknown> => win.webContents.executeJavaScript(script)

      // Wait for the boot layout to settle: the sidebar/panel entrance
      // motion and the auth-report join keep sliding the footer chip for
      // the first seconds — the chip's x must hold ~1s before the menu
      // opens, or the frames compare geometry across a moving target.
      {
        let lastX = Number.NaN
        let stableTicks = 0
        for (let waited = 0; waited < 30_000 && stableTicks < 10; waited += 100) {
          const x = (await js(
            `document.querySelector('.cmp-chip[aria-label^="Model:"]')?.getBoundingClientRect().left ?? -1`
          ).catch(() => -1)) as number
          if (Math.abs(x - lastX) < 0.5) stableTicks++
          else {
            stableTicks = 0
            lastX = x
          }
          await sleep(100)
        }
        if (stableTicks < 10) throw new Error('menu-geometry visual: the footer never settled before the menu opened')
      }

      const readGeom = async (): Promise<CardGeom> => {
        const raw = (await js(GEOM_JS).catch(() => null)) as string | null
        if (!raw) throw new Error('menu-geometry visual: the model card / chip / composer probe failed')
        return JSON.parse(raw) as CardGeom
      }
      /** Trusted hover onto a provider row (the row's hover gate follows
       * real pointer movement only). */
      const hoverProvider = async (index: number): Promise<void> => {
        const raw = (await js(`(() => {
          const row = document.querySelectorAll('.cmp-popover .cmp-cascade-col')[0]?.querySelectorAll('.cmp-menu-row')[${index}]
          if (!(row instanceof HTMLElement)) return null
          row.scrollIntoView({ block: 'nearest' })
          const r = row.getBoundingClientRect()
          return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) })
        })()`).catch(() => null)) as string | null
        if (!raw) throw new Error(`menu-geometry visual: provider row ${index} is missing`)
        const p = JSON.parse(raw) as { x: number; y: number }
        for (let move = 0; move < 2; move++) {
          win.webContents.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y })
          await sleep(150)
        }
      }
      const selectedProvider = `(() => {
        const rows = [...(document.querySelectorAll('.cmp-popover .cmp-cascade-col')[0]?.querySelectorAll('.cmp-menu-row') ?? [])]
        return rows.findIndex((r) => r.classList.contains('cmp-menu-row-selected'))
      })()`

      // ---- open the model menu on the empty-state composer ----
      await js(`document.querySelector('.cmp-chip[aria-label^="Model:"]')?.click(); true`)
      if (!(await waitFor(win, `document.querySelector('.cmp-popover .cmp-cascade') !== null`, 5_000))) {
        throw new Error('menu-geometry visual: the model cascade never opened on the empty state')
      }
      const providerCount = (await js(
        `document.querySelectorAll('.cmp-popover .cmp-cascade-col')[0]?.querySelectorAll('.cmp-menu-row').length ?? 0`
      )) as number
      if (providerCount < 1) throw new Error('menu-geometry visual: the catalog lists no providers')

      // ---- mg1: first provider hovered — the frame pair's base geometry ----
      await hoverProvider(0)
      if (!(await waitFor(win, `${selectedProvider} === 0`, 5_000))) {
        throw new Error('menu-geometry visual: hovering the first provider never selected it')
      }
      const base = await readGeom()
      console.log(`VISUAL probe mg1: ${JSON.stringify(base)}`)
      // Ticket 138 ①: the two columns are SEPARATE cards — each its own
      // boundary, a real groove between them, the wrapper painting nothing,
      // the model card's top riding the hovered row (z19-menu-1/2).
      if (base.colRects.length !== 2) throw new Error(`menu-geometry visual 138: the cascade renders ${base.colRects.length} columns, want 2`)
      if (base.wrapperBg !== 'rgba(0, 0, 0, 0)') {
        throw new Error(`menu-geometry visual 138: the cascade wrapper still paints chrome (bg ${base.wrapperBg})`)
      }
      for (const [i, style] of base.colStyles.entries()) {
        if (style.borderTop !== '1px' || style.radius === '0px') {
          throw new Error(`menu-geometry visual 138: cascade column ${i} has no own boundary (border ${style.borderTop}, radius ${style.radius})`)
        }
      }
      const groove = base.colRects[1]!.left - base.colRects[0]!.right
      if (groove < 3) throw new Error(`menu-geometry visual 138: the two cards are not separated (groove ${groove.toFixed(1)}, want ≥3)`)
      if (base.selectedRowTop !== null && Math.abs(base.colRects[1]!.top - base.selectedRowTop) > 1.5) {
        throw new Error(`menu-geometry visual 138: the model card top ${base.colRects[1]!.top.toFixed(1)} != the hovered row top ${base.selectedRowTop.toFixed(1)}`)
      }
      await sleep(300)
      await capture(win, 'mg1-cascade-provider-first', 'cascade open, first provider hovered — two separate cards, model card top on the hovered row, provider card hugging the chip')

      // ---- mg2: last provider hovered — the bbox must be UNCHANGED (R4) ----
      await hoverProvider(providerCount - 1)
      if (!(await waitFor(win, `${selectedProvider} === ${providerCount - 1}`, 5_000))) {
        throw new Error('menu-geometry visual: hovering the last provider never selected it')
      }
      const last = await readGeom()
      // R4 compared on drift-invariant quantities: the chip itself may
      // legitimately move between probes (auth-report label settle), and
      // the card tracks it — what hover must never change is the provider
      // card's SIZE, its offset from the chip, and its hug of the chip
      // (the model card's own height/top legitimately ride the hovered
      // row's model list — the two cards are separate, ticket 138).
      const drift = (g: CardGeom): { w: number; h: number; anchor: number; hug: number } => ({
        w: g.width,
        h: g.height,
        anchor: g.left - g.chipLeft,
        hug: g.chipTop - g.bottom
      })
      const d0 = drift(base)
      const d1 = drift(last)
      const stable =
        Math.abs(d0.w - d1.w) <= 0.5 &&
        Math.abs(d0.h - d1.h) <= 0.5 &&
        Math.abs(d0.anchor - d1.anchor) <= 0.5 &&
        Math.abs(d0.hug - d1.hug) <= 0.5
      if (!stable) {
        const diag = (await js(
          `(() => {
            const composer = document.querySelector('.composer')
            const chip = document.querySelector('.cmp-chip[aria-label^="Model:"]')
            const zone = document.querySelector('.main-zone')
            const sidebar = document.querySelector('.sidebar')
            return JSON.stringify({
              composer: composer ? composer.getBoundingClientRect().toJSON() : null,
              chip: chip ? chip.getBoundingClientRect().toJSON() : null,
              chipText: chip?.textContent ?? null,
              zoneScroll: zone ? { left: zone.scrollLeft, top: zone.scrollTop, w: zone.clientWidth } : null,
              docScroll: { left: document.scrollingElement.scrollLeft, top: document.scrollingElement.scrollTop },
              sidebarW: sidebar ? sidebar.getBoundingClientRect().width : null
            })
          })()`
        ).catch(() => 'diag-failed')) as string
        throw new Error(
          `menu-geometry visual R4: the card moved across provider hover (first ${JSON.stringify(base)} vs last ${JSON.stringify(last)}); DOM: ${diag}`
        )
      }
      console.log(`VISUAL probe mg2: provider card identical across ${providerCount} providers' hover`)
      await sleep(300)
      await capture(win, 'mg2-cascade-provider-last', `cascade open, last provider hovered — provider card bbox identical (R4), model card re-hung on the new row`)

      // ---- mg3: the anchor composition — card left = chip left, hug ----
      if (Math.abs(last.left - last.chipLeft) > 0.5) {
        const diag = (await js(
          `(() => {
            const card = document.querySelector('.cmp-popover')
            if (!(card instanceof HTMLElement)) return 'no-card'
            const op = card.offsetParent
            const s = getComputedStyle(card)
            const chain = []
            let node = card.parentElement
            for (let depth = 0; node && depth < 6; depth++) {
              const st = getComputedStyle(node)
              chain.push(node.tagName + '.' + String(node.className).slice(0, 40) + ' pos=' + st.position + ' transform=' + st.transform)
              node = node.parentElement
            }
            return JSON.stringify({
              composers: document.querySelectorAll('.composer').length,
              popovers: document.querySelectorAll('.cmp-popover').length,
              inlineStyle: card.getAttribute('style'),
              position: s.position, left: s.left, right: s.right, bottom: s.bottom,
              offsetParent: op ? op.tagName + '.' + String(op.className).slice(0, 40) : String(op),
              chain
            })
          })()`
        ).catch(() => 'diag-failed')) as string
        throw new Error(
          `menu-geometry visual R5: card left ${last.left.toFixed(1)} != chip left ${last.chipLeft.toFixed(1)}; DOM: ${diag}`
        )
      }
      // The hug (ticket 138): the card's bottom edge sits ≈2px above the
      // chip's top edge — touching the trigger, not floating above the
      // input area (the pre-138 anchor).
      const hug = last.chipTop - last.bottom
      if (hug < 1 || hug > 3) {
        throw new Error(`menu-geometry visual 138: the card does not hug the chip (bottom ${last.bottom.toFixed(1)} vs chip top ${last.chipTop.toFixed(1)}, gap ${hug.toFixed(1)}, want ≈2)`)
      }
      await capture(win, 'mg3-anchor-chip', 'card left-aligned to the model chip, bottom edge hugging the chip top (R5 + 138)')

      // ---- mg4: the thinking menu + the brain icon chip (z 图7 form) ----
      // A model pick first: the thinking levels resolve against the SHOWN
      // model (the chained default carries no levels on some machines —
      // the chip stays disabled until a catalog model with levels is
      // picked), the same order an operator follows. Provider 0's second
      // row is the smoke-proven levels-bearing shape on this machine.
      // The boot-time catalog/auth settle can close the menu underneath
      // the harness — re-open before driving it.
      if (!(await waitFor(win, `document.querySelector('.cmp-popover .cmp-cascade') !== null`, 2_000))) {
        await js(`document.querySelector('.cmp-chip[aria-label^="Model:"]')?.click(); true`)
        if (!(await waitFor(win, `document.querySelector('.cmp-popover .cmp-cascade') !== null`, 5_000))) {
          throw new Error('menu-geometry visual: the cascade never reopened for the model pick')
        }
      }
      await hoverProvider(0)
      if (!(await waitFor(win, `${selectedProvider} === 0`, 5_000))) {
        throw new Error('menu-geometry visual: the pre-pick hover never returned to provider 0')
      }
      const picked = (await js(`(() => {
        const rows = document.querySelectorAll('.cmp-popover .cmp-cascade-col')[1]?.querySelectorAll('.cmp-menu-row') ?? []
        const row = rows[1] ?? rows[0]
        if (!(row instanceof HTMLElement)) return false
        row.click()
        return true
      })()`)) as boolean
      if (!picked) throw new Error('menu-geometry visual: the model pick row is missing')
      if (!(await waitFor(win, `document.querySelector('.cmp-popover') === null`, 5_000))) {
        throw new Error('menu-geometry visual: the model pick never closed the cascade')
      }
      if (
        !(await waitFor(
          win,
          `(() => {
            const chip = document.querySelector('.cmp-chip[aria-label^="Thinking:"]')
            return chip instanceof HTMLButtonElement && !chip.disabled
          })()`,
          10_000
        ))
      ) {
        throw new Error('menu-geometry visual: the thinking chip never enabled after the model pick')
      }
      await js(`document.querySelector('.cmp-chip[aria-label^="Thinking:"]')?.click(); true`)
      if (!(await waitFor(win, `document.querySelector('.cmp-popover-thinking') !== null`, 5_000))) {
        const diag = (await js(
          `(() => {
            const chip = document.querySelector('.cmp-chip[aria-label^="Thinking:"]')
            return JSON.stringify({
              chip: chip ? { label: chip.getAttribute('aria-label'), disabled: chip.hasAttribute('disabled'), rect: chip.getBoundingClientRect().toJSON() } : null,
              anyPopover: document.querySelector('.cmp-popover') !== null
            })
          })()`
        ).catch(() => 'diag-failed')) as string
        throw new Error(`menu-geometry visual: the thinking menu never opened; DOM: ${diag}`)
      }
      const brain = (await js(`(() => {
        const chip = document.querySelector('.cmp-chip[aria-label^="Thinking:"]')
        const card = document.querySelector('.cmp-popover-thinking')
        if (!(chip instanceof HTMLElement) || !(card instanceof HTMLElement)) return null
        const icon = chip.querySelector('svg path')?.getAttribute('d') ?? ''
        const c = card.getBoundingClientRect()
        const k = chip.getBoundingClientRect()
        return JSON.stringify({
          brainPath: icon.startsWith('M12 5a3 3 0 1 0-5.997.125'),
          cardLeft: c.left, cardBottom: c.bottom, chipLeft: k.left, chipTop: k.top
        })
      })()`).catch(() => null)) as string | null
      if (!brain) throw new Error('menu-geometry visual: the thinking chip / card probe failed')
      const brainState = JSON.parse(brain) as { brainPath: boolean; cardLeft: number; cardBottom: number; chipLeft: number; chipTop: number }
      if (!brainState.brainPath) throw new Error('menu-geometry visual R5: the thinking chip does not render the brain icon')
      if (Math.abs(brainState.cardLeft - brainState.chipLeft) > 0.5) {
        throw new Error(`menu-geometry visual R5: thinking card left ${brainState.cardLeft.toFixed(1)} != chip left ${brainState.chipLeft.toFixed(1)}`)
      }
      // Ticket 138: the thinking card hugs its chip the same way.
      const thinkHug = brainState.chipTop - brainState.cardBottom
      if (thinkHug < 1 || thinkHug > 3) {
        throw new Error(`menu-geometry visual 138: the thinking card does not hug the chip (bottom ${brainState.cardBottom.toFixed(1)} vs chip top ${brainState.chipTop.toFixed(1)}, gap ${thinkHug.toFixed(1)}, want ≈2)`)
      }
      await sleep(300)
      await capture(win, 'mg4-thinking-brain', 'brain icon on the thinking chip + chip-anchored, chip-hugging thinking card (z 图7 form; t137 pixel-compared against the z19 reference crops)')

      // ---- mg5: the narrow window clamps the open card inside (R5) ----
      // Ensure the thinking menu is still open (the same boot settle can
      // close it) before the narrow-window leg.
      if (
        !(await waitFor(win, `document.querySelector('.cmp-popover-thinking') !== null`, 1_000))
      ) {
        await js(`document.querySelector('.cmp-chip[aria-label^="Thinking:"]')?.click(); true`)
        if (!(await waitFor(win, `document.querySelector('.cmp-popover-thinking') !== null`, 5_000))) {
          throw new Error('menu-geometry visual: the thinking menu never reopened for the clamp leg')
        }
      }
      win.setSize(520, Math.max(bounds.height, 700))
      await sleep(500)
      const narrow = (await js(`(() => {
        const card = document.querySelector('.cmp-popover-thinking')
        if (!(card instanceof HTMLElement)) return null
        const r = card.getBoundingClientRect()
        return JSON.stringify({ left: r.left, right: r.right, innerWidth: window.innerWidth })
      })()`).catch(() => null)) as string | null
      if (!narrow) throw new Error('menu-geometry visual: the thinking card probe failed in the narrow window')
      const clamp = JSON.parse(narrow) as { left: number; right: number; innerWidth: number }
      if (clamp.left < 4 || clamp.right > clamp.innerWidth - 4) {
        throw new Error(`menu-geometry visual R5: the card escaped the narrow window (left ${clamp.left.toFixed(1)}, right ${clamp.right.toFixed(1)}, innerWidth ${clamp.innerWidth})`)
      }
      await capture(win, 'mg5-narrow-clamp', `520px window: the open card stays inside (${clamp.left.toFixed(0)}..${clamp.right.toFixed(0)} of ${clamp.innerWidth})`)

      console.log('VISUAL menu-geometry done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL menu-geometry FAIL', err)
      app.exit(1)
    }
  })()
}
