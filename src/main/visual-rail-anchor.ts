/**
 * Turn-navigator-rail live-anchoring visual harness (ticket 120). Enabled
 * with PICODE_VISUAL=1 plus PICODE_VISUAL_RAIL_ANCHOR=1. Like the
 * rail-stack harness it ASSERTS its probe results (exit 1 on any
 * violation) and CAPTURES the two acceptance states: which tick reads
 * `nav-tick-focus` is exactly the decision the Seam-1 model makes, so it
 * is observable behavior, not eyeball material.
 *
 * The behavior being pinned (the pi18 “Working · 14s” frame): while the
 * viewport sits at the bottom and the newest turn runs, the focus tick
 * must be the NEWEST turn's — the pre-120 probe rule (the last user
 * message above the 35% probe line) left the anchor on the previous turn
 * for the whole run, because the just-started turn's bubble hides in the
 * lower viewport behind the Working container and the composer. Scrolled
 * up, the anchor must follow the reading position (the probe rule,
 * unchanged — and the Jump-to-Latest button fades in as corroborating
 * geometry).
 *
 * Seeding (ticket-94 shape, zero model calls): a synthetic
 * session_created(resumed) + history_loaded replay of three TALL settled
 * turns, then a hand-emitted LIVE turn (user_message + agent_start + two
 * short deltas, no agent_end until both frames are captured). The sidebar
 * rows come from an isolated store (deterministic, never the operator's).
 *
 * Captures (PNGs land in the visual out dir):
 *   ra1-at-bottom-live — pinned at the bottom, the newest turn Working,
 *                        focus tick on the newest turn
 *   ra2-scrolled-up    — scrolled to the top (Jump-to-Latest faded in),
 *                        focus tick on the first turn
 *
 * Plus rail-anchor.json — the raw measurement dump (density-probe
 * convention). The ZCode side-by-side (pi18-*) frames were not in the
 * compare set when this harness landed; the two PNGs stand alone.
 */

import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import type { HostToParent } from '../shared/contract'
import { emitContractEvent, visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

export function railAnchorVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_RAIL_ANCHOR'] === '1'
}

/** Throwaway userData (no-op unless PICODE_VISUAL_RAIL_ANCHOR=1). Called
 * from index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateRailAnchorUserData(): void {
  if (!railAnchorVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-railanchor-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** REAL tmpdir dir (ticket 42): the synthetic session's cwd must exist on
 * disk or the CWD banner (ticket 54) would crash the frames. */
const PROJECT_CWD = (): string => ensureVisualProjectDir('rail-anchor-proj')

/** Ages (days) of the two seeded sidebar rows — settled filler so the
 * frames carry a truthful sidebar, never the operator's sessions. */
const SEED_AGES_DAYS = [3, 6]

async function waitFor(getWindow: () => BrowserWindow | null, probe: string, budgetMs: number): Promise<boolean> {
  const win = getWindow()
  if (!win) return false
  for (let waited = 0; waited < budgetMs; waited += 100) {
    const ok = (await win.webContents.executeJavaScript(probe).catch(() => false)) as boolean
    if (ok === true) return true
    await sleep(100)
  }
  return false
}

async function measure<T>(getWindow: () => BrowserWindow | null, probe: string): Promise<T | null> {
  const win = getWindow()
  if (!win) return null
  return win.webContents.executeJavaScript(probe).catch(() => null) as Promise<T | null>
}

async function capture(win: BrowserWindow, name: string): Promise<void> {
  const png = await win.webContents.capturePage()
  const file = path.join(visualOutDir(), `${name}.png`)
  writeFileSync(file, png.toPNG())
  console.log(`VISUAL captured ${file}`)
}

/** The anchoring state both frames assert and dump: which tick reads
 * focus (by DOM order = turn order), the bottom distance, and the
 * container labels. */
const ANCHOR_STATE_PROBE = `(() => {
  const el = document.querySelector('.chat-scroll')
  const rail = document.querySelector('.nav-rail')
  if (el === null || rail === null) return null
  const focused = [...rail.querySelectorAll('.nav-tick-focus')].map((t) => t.closest('.nav-tick-slot')?.getAttribute('data-nav-tick'))
  return JSON.stringify({
    ticks: rail.querySelectorAll('.nav-tick-slot').length,
    focused,
    distFromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
    scrollTop: el.scrollTop,
    labels: [...document.querySelectorAll('.turn-container-label')].map((l) => l.textContent),
    jumpVisible: document.querySelector('.chat-jump-btn')?.classList.contains('chat-jump-btn-visible') ?? false
  })
})()`

/** ① at-bottom + live: the newest (4th, live) tick reads focus while the
 * viewport sits on the bottom and the last container shows Working. */
const LIVE_BOTTOM_PROBE = `(() => {
  const el = document.querySelector('.chat-scroll')
  const turns = document.querySelectorAll('[data-turn-id]')
  if (el === null || turns.length !== 4) return false
  const id = turns[3].getAttribute('data-turn-id')
  const tick = id === null ? null : document.querySelector('.nav-tick-slot[data-nav-tick="' + id + '"] .nav-tick')
  const labels = [...document.querySelectorAll('.turn-container-label')].map((l) => l.textContent)
  return el.scrollHeight - el.scrollTop - el.clientHeight < 1 &&
    tick !== null && tick.classList.contains('nav-tick-focus') &&
    labels.length === 4 && labels[3] === 'Working'
})()`

/** ② scrolled-up: the FIRST turn's tick reads focus, the newest loses it,
 * and the Jump-to-Latest button fades in (the reader is away from the
 * bottom — corroborating geometry for the frame). */
const SCROLLED_UP_PROBE = `(() => {
  const turns = document.querySelectorAll('[data-turn-id]')
  if (turns.length !== 4) return false
  const tickOf = (i) => {
    const id = turns[i].getAttribute('data-turn-id')
    return id === null ? null : document.querySelector('.nav-tick-slot[data-nav-tick="' + id + '"] .nav-tick')
  }
  const first = tickOf(0)
  const last = tickOf(3)
  const btn = document.querySelector('.chat-jump-btn')
  return first !== null && first.classList.contains('nav-tick-focus') &&
    (last === null || !last.classList.contains('nav-tick-focus')) &&
    btn !== null && btn.classList.contains('chat-jump-btn-visible')
})()`

/** Three tall settled turns — enough vertical content that the transcript
 * overflows the viewport (the scrolled-up frame needs real travel). */
const TURN_ANSWER = (n: number): string =>
  `Turn ${n} is settled. ` +
  'The register endpoint now rejects malformed addresses before they reach the service layer; email is syntax-checked, ' +
  'lowercased and length-capped, and password is checked against the breached list. '.repeat(4) +
  `Turn ${n}'s guard sits at the route boundary, so no other layer duplicates the checks. `.repeat(3)

export function startRailAnchorVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!railAnchorVisualEnabled()) return

  // Seeding must precede the session index construction (it reads
  // PICODE_SESSION_DIR once) — same constraint as the other store harnesses.
  const store = ensureVisualStore()
  const cwd = PROJECT_CWD()
  const backdate = (file: string, days: number): void => {
    const then = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    utimesSync(file, then, then)
  }
  for (let i = 0; i < SEED_AGES_DAYS.length; i++) {
    const file = writeVisualSession(store, {
      id: `rail-anchor-${i}`,
      cwd,
      userText: `Rail anchoring probe task number ${i + 1}`
    })
    backdate(file, SEED_AGES_DAYS[i] as number)
  }

  void (async () => {
    const measurements: Record<string, unknown> = {}
    try {
      mkdirSync(visualOutDir(), { recursive: true })
      for (let waited = 0; waited < 15_000; waited += 100) {
        if (getWindow()) break
        await sleep(100)
      }
      const win = getWindow()
      if (!win) throw new Error('rail-anchor visual: no window')
      win.webContents.setBackgroundThrottling(false)

      // The renderer must have attached its Seam-1 subscription before the
      // history injection, and the seeded rows must reach the sidebar.
      const ready = await waitFor(
        getWindow,
        `document.documentElement.dataset['chatSubscribed'] === 'true' &&
         document.querySelectorAll('.sb-task').length >= 2`,
        30_000
      )
      if (!ready) {
        throw new Error('rail-anchor visual: renderer never became ready')
      }
      await sleep(400)

      // ---- three settled turns: the rail renders three ticks and the
      // transcript overflows the viewport -------------------------------
      const items: Extract<HostToParent, { type: 'history_loaded' }>['items'] = []
      for (let n = 1; n <= 3; n++) {
        items.push(
          {
            role: 'user',
            id: `ra120-u${n}`,
            text: `Harden the register endpoint (round ${n})\nand re-run its tests.`,
            timestamp: `2026-09-20T09:0${n}:00.000Z`,
            skillName: null
          },
          {
            role: 'assistant',
            id: `ra120-a${n}`,
            timestamp: `2026-09-20T09:0${n}:30.000Z`,
            text: TURN_ANSWER(n),
            parts: [{ kind: 'text', text: TURN_ANSWER(n) }]
          }
        )
      }
      emitContractEvent({
        type: 'session_created',
        sessionId: 'rail-anchor-session',
        cwd,
        model: 'claude-opus-4-5',
        resumed: true
      })
      emitContractEvent({ type: 'history_loaded', items })
      const railReady = await waitFor(
        getWindow,
        `(() => {
          const rail = document.querySelector('.nav-rail')
          const el = document.querySelector('.chat-scroll')
          return rail !== null && rail.querySelectorAll('.nav-tick-slot').length === 3 &&
            el !== null && el.scrollHeight > el.clientHeight + 200
        })()`,
        15_000
      )
      if (!railReady) {
        throw new Error('rail-anchor visual: the replay never rendered three overflowing turns')
      }

      // ---- the live turn: short growth keeps the newest bubble in the
      // lower viewport — the exact pre-120 bug geometry ------------------
      emitContractEvent({ type: 'user_message', text: 'Now watch the live turn while I read from the top.' })
      emitContractEvent({ type: 'agent_start' })
      emitContractEvent({ type: 'message_start' })
      emitContractEvent({ type: 'text_delta', delta: 'Reproducing the failure first: the validator never trims.' })
      emitContractEvent({ type: 'text_delta', delta: ' Adding the trim pass before the schema parse.' })
      const liveBottom = await waitFor(getWindow, LIVE_BOTTOM_PROBE, 15_000)
      if (!liveBottom) {
        const state = (await measure<string>(getWindow, ANCHOR_STATE_PROBE)) ?? 'unavailable'
        throw new Error(`rail-anchor visual: at the bottom with a live turn the focus tick is not the newest; state: ${state}`)
      }
      measurements.liveBottom = JSON.parse(String(await measure<string>(getWindow, ANCHOR_STATE_PROBE) ?? '{}'))
      // Let the Working timer earn a visible second before the frame.
      await sleep(1_400)
      await capture(win, 'ra1-at-bottom-live')
      logState(measurements, 'liveBottom')

      // ---- scrolled to the top: the anchor follows the reading position
      // and the Jump-to-Latest button fades in --------------------------
      const scrolled = await win.webContents
        .executeJavaScript(`(() => { const el = document.querySelector('.chat-scroll'); if (el === null) return false; el.scrollTop = 0; return true })()`)
        .catch(() => false)
      if (scrolled !== true) throw new Error('rail-anchor visual: could not scroll the transcript to the top')
      const scrolledUp = await waitFor(getWindow, SCROLLED_UP_PROBE, 15_000)
      if (!scrolledUp) {
        const state = (await measure<string>(getWindow, ANCHOR_STATE_PROBE)) ?? 'unavailable'
        throw new Error(`rail-anchor visual: scrolled to the top, the anchor did not follow the reading position; state: ${state}`)
      }
      measurements.scrolledUp = JSON.parse(String(await measure<string>(getWindow, ANCHOR_STATE_PROBE) ?? '{}'))
      // Let the jump button's fade land before the frame.
      await sleep(400)
      await capture(win, 'ra2-scrolled-up')
      logState(measurements, 'scrolledUp')

      // ---- settle the live turn (clean exit state), then dump ----------
      emitContractEvent({ type: 'message_end' })
      emitContractEvent({ type: 'agent_end' })

      const jsonPath = path.join(visualOutDir(), 'rail-anchor.json')
      writeFileSync(jsonPath, JSON.stringify(measurements, null, 2))
      console.log(`VISUAL measured ${jsonPath}`)
      console.log('VISUAL rail-anchor done — all invariants held')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL rail-anchor FAIL', err)
      try {
        const jsonPath = path.join(visualOutDir(), 'rail-anchor.json')
        writeFileSync(jsonPath, JSON.stringify(measurements, null, 2))
      } catch {
        // dump best-effort; the failure report above is what matters
      }
      app.exit(1)
    }
  })()
}

function logState(measurements: Record<string, unknown>, key: string): void {
  const state = measurements[key]
  console.log(`VISUAL ${key} state: ${JSON.stringify(state)}`)
}
