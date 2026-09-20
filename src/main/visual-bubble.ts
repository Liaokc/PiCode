/**
 * Composite user bubble visual-QA harness (ticket 97, spec R19/R17/R14).
 * Enabled with PICODE_VISUAL=1 plus PICODE_VISUAL_BUBBLE=1. Like the
 * worked-container harness it ASSERTS its probe results (exit 1 on any
 * violation) and captures the review frames:
 *
 *   b1-composite-bubbles — the skill shapes at the transcript top:
 *                          skill-only (no empty box), skill+text (both
 *                          segments); b1b captures the text+image strip and
 *                          the plain bubble at the bottom
 *   b2-bubble-preview    — the ticket-91 fullscreen preview opened by a
 *                          REAL click on a bubble thumbnail (the R17
 *                          reuser), then closed again by Escape
 *
 * The retired marker is asserted ABSENT across the whole transcript (the
 * container body no longer carries the skill story — the bubble does,
 * fold-proof). Seeding: the transcript is injected through the contract
 * stream (session_created(resumed) + history_loaded — the visual-perf
 * precedent, no model call); an isolated session store gets one fake
 * sidebar row; throwaway userData keeps the run off the operator's
 * preferences.
 */

import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { emitContractEvent, visualOutDir } from './visual'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'

/** Exclusive gate of the bubble harness (PICODE_VISUAL_BUBBLE=1 alongside
 * PICODE_VISUAL=1) — every other visual harness stands down. */
export function bubbleVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_BUBBLE'] === '1'
}

/** Throwaway userData (no-op unless PICODE_VISUAL_BUBBLE=1). Called from
 * index.ts at module scope, BEFORE app.whenReady reads userData. */
export function isolateBubbleUserData(): void {
  if (!bubbleVisualEnabled()) return
  app.setPath('userData', path.join(tmpdir(), `picode-visual-bubble-userdata-${process.pid}`))
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** A real decodable 1×1 red PNG — the thumbnails must render as <img>s. */
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const SKILL_PROLOGUE = (name: string): string =>
  `<skill name="${name}" location="~/.pi/agent/skills/${name}/SKILL.md">\nSkill body.\n</skill>\n`

/** The transcript: four user turns, each followed by a short settled reply,
 * covering the bubble composition table (skill-only / skill+text /
 * text+images / plain). Images ride the ticket-79 replay projection. */
const HISTORY_ITEMS = [
  {
    role: 'user' as const,
    id: 'b-u1',
    text: SKILL_PROLOGUE('implement'),
    timestamp: '2026-09-17T09:00:00.000Z',
    skillName: 'implement'
  },
  {
    role: 'assistant' as const,
    id: 'b-a1',
    timestamp: '2026-09-17T09:00:05.000Z',
    text: 'Skill-only turn: the bubble shows just the skill.',
    parts: [{ kind: 'text' as const, text: 'Skill-only turn: the bubble shows just the skill.' }]
  },
  {
    role: 'user' as const,
    id: 'b-u2',
    text: `${SKILL_PROLOGUE('grilling')}Now grill this plan step by step`,
    timestamp: '2026-09-17T09:01:00.000Z',
    skillName: 'grilling'
  },
  {
    role: 'assistant' as const,
    id: 'b-a2',
    timestamp: '2026-09-17T09:01:05.000Z',
    text: 'Skill + text: both segments render.',
    parts: [{ kind: 'text' as const, text: 'Skill + text: both segments render.' }]
  },
  {
    role: 'user' as const,
    id: 'b-u3',
    text: 'What does this screenshot show?',
    timestamp: '2026-09-17T09:02:00.000Z',
    skillName: null,
    images: [{ kind: 'image' as const, mimeType: 'image/png', data: PNG_1PX }]
  },
  {
    role: 'assistant' as const,
    id: 'b-a3',
    timestamp: '2026-09-17T09:02:05.000Z',
    text: 'Text + image: the thumbnail strip renders under the text.',
    parts: [{ kind: 'text' as const, text: 'Text + image: the thumbnail strip renders under the text.' }]
  },
  {
    role: 'user' as const,
    id: 'b-u4',
    text: 'A plain message keeps its plain bubble.',
    timestamp: '2026-09-17T09:03:00.000Z',
    skillName: null
  },
  {
    role: 'assistant' as const,
    id: 'b-a4',
    timestamp: '2026-09-17T09:03:05.000Z',
    text: 'Plain: one text segment.',
    parts: [{ kind: 'text' as const, text: 'Plain: one text segment.' }]
  }
]

const SIG = `(() => {
  const blocks = [...document.querySelectorAll('.chat-thread > .msg-user-block')]
  return JSON.stringify({
    blocks: blocks.length,
    markerRows: document.querySelectorAll('.skill-marker-row').length,
    bubbles: blocks.map((b) => ({
      skill: b.querySelectorAll('.user-skill-row').length,
      text: b.querySelectorAll('.user-bubble-text').length,
      thumbs: b.querySelectorAll('.user-image-thumb').length
    })),
    previewOpen: document.querySelector('.image-preview-backdrop') !== null
  })
})()`

interface BubbleSig {
  blocks: number
  markerRows: number
  bubbles: { skill: number; text: number; thumbs: number }[]
  previewOpen: boolean
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

export function startBubbleVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!bubbleVisualEnabled()) return

  // Committed frames must never show the operator's real sessions: isolate
  // the session store (PICODE_SESSION_DIR) BEFORE the index constructs, and
  // seed one fake row so the sidebar looks natural (same rule as the other
  // store harnesses).
  const store = ensureVisualStore()
  writeVisualSession(store, {
    id: 'visual-bubble-side',
    cwd: ensureVisualProjectDir('bubble-demo'),
    userText: 'Bubble composition demo'
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
      if (!win) throw new Error('bubble visual: no window')
      // Wait for the renderer's Seam-1 subscription (same marker as the smoke).
      await waitFor(win, `document.documentElement.dataset['chatSubscribed'] === 'true'`, 15_000)
      await sleep(500)
      win.webContents.setBackgroundThrottling(false)

      emitContractEvent({
        type: 'session_created',
        sessionId: 'visual-user-bubble',
        cwd: tmpdir(),
        model: 'claude-opus-4-5',
        resumed: true
      })
      emitContractEvent({ type: 'history_loaded', items: HISTORY_ITEMS })
      await sleep(700)

      // ---- b1: the four bubble shapes + the retired marker ----
      const sig = JSON.parse(String(await win.webContents.executeJavaScript(SIG))) as BubbleSig
      const problems: string[] = []
      if (sig.blocks !== 4) problems.push(`blocks ${sig.blocks} !== 4`)
      if (sig.markerRows !== 0) problems.push(`marker rows ${sig.markerRows} !== 0 (retired marker rendered!)`)
      const [skillOnly, skillText, textImage, plain] = sig.bubbles
      if (!skillOnly || skillOnly.skill !== 1 || skillOnly.text !== 0 || skillOnly.thumbs !== 0) {
        problems.push(`skill-only bubble wrong: ${JSON.stringify(skillOnly)}`)
      }
      if (!skillText || skillText.skill !== 1 || skillText.text !== 1 || skillText.thumbs !== 0) {
        problems.push(`skill+text bubble wrong: ${JSON.stringify(skillText)}`)
      }
      if (!textImage || textImage.skill !== 0 || textImage.text !== 1 || textImage.thumbs !== 1) {
        problems.push(`text+image bubble wrong: ${JSON.stringify(textImage)}`)
      }
      if (!plain || plain.skill !== 0 || plain.text !== 1 || plain.thumbs !== 0) {
        problems.push(`plain bubble wrong: ${JSON.stringify(plain)}`)
      }
      if (problems.length > 0) throw new Error(`bubble visual b1: ${problems.join('; ')}`)
      console.log(`VISUAL probe b1: ${JSON.stringify(sig)}`)

      // The skill shapes sit at the TOP of the transcript — capture them
      // there, then scroll down for the image/plain shapes. The SCROLLER is
      // .chat-scroll (the .chat-thread is its content).
      await win.webContents.executeJavaScript(
        `(() => {
          const scroller = document.querySelector('.chat-scroll')
          if (scroller instanceof HTMLElement) scroller.scrollTop = 0
          return true
        })()`
      )
      await sleep(300)
      await capture(win, 'b1-composite-bubbles')
      await win.webContents.executeJavaScript(
        `(() => {
          const scroller = document.querySelector('.chat-scroll')
          if (scroller instanceof HTMLElement) scroller.scrollTop = scroller.scrollHeight
          return true
        })()`
      )
      await sleep(300)
      await capture(win, 'b1b-composite-bubbles-bottom')

      // ---- b2: a REAL click on the bubble thumbnail opens the ticket-91
      // preview; Escape closes it (the four-exit seam is ticket-91's). ----
      await win.webContents.executeJavaScript(
        `document.querySelectorAll('.chat-thread .user-image-thumb')[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`
      )
      if (!(await waitFor(win, `document.querySelector('.image-preview-backdrop') !== null`, 5_000))) {
        throw new Error('bubble visual b2: the bubble thumbnail click never opened the preview overlay')
      }
      await sleep(300)
      await capture(win, 'b2-bubble-preview')
      await win.webContents.executeJavaScript(
        `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true`
      )
      if (!(await waitFor(win, `document.querySelector('.image-preview-backdrop') === null`, 5_000))) {
        throw new Error('bubble visual b2: Escape never closed the bubble preview overlay')
      }
      console.log('VISUAL probe b2: preview opened by the bubble thumb and closed by Escape')

      console.log('VISUAL bubble harness complete')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL FAIL:', err instanceof Error ? err.message : String(err))
      app.exit(1)
    }
  })()
}
