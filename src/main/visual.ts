/**
 * Visual-QA harness (ticket 03: transcript density against screenshots 01/04).
 * Enabled only with PICODE_VISUAL=1. Injects a realistic, settled `HostToParent`
 * event sequence directly into the renderer (no SDK, no network), then captures
 * PNG screenshots of the window:
 *
 *   1. mid-run  — the live turn container open and ticking, streaming markdown
 *                 with caret, tool card running
 *   1b. streaming blocks — code card + table container live mid-stream, and a
 *       dataset marker proves they are NOT remounted by later deltas (ticket 16)
 *   2. settled  — the turn folded into "Worked · Ns ›" (ticket 23), done tool
 *                 card hidden inside, per-message actions row (with fork)
 *                 outside the fold
 *   2b/2c/2d   — ticket 16 block chrome, replayed over the FOLDED transcript:
 *                 the container is opened first (ticket 23 choreography), then
 *                 wrap toggle, table expand, table preview overlay, and the
 *                 message-row fork toast
 *   4b/4c/4d   — ticket 32: the preview reader's rendered state adopts the
 *                 SAME block chrome (code cards + table containers); wrap and
 *                 copy state stay isolated per block key, and the source
 *                 state stays windowed bare text
 *   3b/3c      — ticket 14: a resumed session replayed from structured history
 *                items — collapsed turn containers by default (3b, ticket 23:
 *                replay always starts folded), opened for audit (3c) revealing
 *                collapsed thinking rows + settled tool cards; the failed card
 *                is in the error style, replayed thinking carries no ticking
 *                duration, the skill-driven turn shows its marker row.
 *   8. tooltip  — unified tooltip bubble on the sidebar filter button (ticket 22)
 *
 * PNGs land in $PICODE_VISUAL_OUT (default: <cwd>/.scratch/visual/). Not part
 * of `npm test`; a human compares them against the reference screenshots.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import { terminalVisualEnabled } from './visual-terminal'
import { traceVisualEnabled } from './visual-trace'
import { foldVisualEnabled } from './visual-fold'
import { codeblockVisualEnabled } from './visual-codeblock'
import { expandVisualEnabled } from './visual-expand'
import { ensureVisualProjectDir, ensureVisualStore, writeVisualSession } from './visual-store'
import type { HostToParent } from '../shared/contract'

export function visualEnabled(): boolean {
  return process.env['PICODE_VISUAL'] === '1'
}

/** Ticket-20 multi-session harness (sidebar dots + alignment). Exclusive:
 * when set, the transcript/density/terminal harnesses stand down. */
export function multiSessionVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_MULTI'] === '1'
}

/** Ticket-25 background-approval harness (orange badge + parked pill + deny
 * story). Exclusive: owns the window alone. */
export function approvalVisualEnabled(): boolean {
  return process.env['PICODE_VISUAL_APPROVAL'] === '1'
}

export function visualOutDir(): string {
  return process.env['PICODE_VISUAL_OUT'] || path.join(process.cwd(), '.scratch', 'visual')
}

const outDir = visualOutDir

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Poll until a window exists and its renderer has attached the chat subscription. */
async function waitForWindow(getWindow: () => BrowserWindow | null): Promise<BrowserWindow | null> {
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

/** Inject `event` into every window, exactly like the supervisor relay does. */
export function emitContractEvent(event: HostToParent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('chat:from-host', event)
  }
}

const emit = emitContractEvent

async function streamText(chunks: string[], delayMs = 26): Promise<void> {
  for (const delta of chunks) {
    emit({ type: 'text_delta', delta })
    await sleep(delayMs)
  }
}

async function capture(win: BrowserWindow, name: string): Promise<string> {
  const png = await win.webContents.capturePage()
  const file = path.join(outDir(), `${name}.png`)
  writeFileSync(file, png.toPNG())
  const sig = await win.webContents.executeJavaScript(
    `(() => ({
      placeholder: document.querySelector('.composer-input')?.placeholder ?? '',
      users: document.querySelectorAll('.msg-user').length,
      assistants: document.querySelectorAll('.msg-assistant').length,
      tools: document.querySelectorAll('.tool-card').length,
      thinkingOpen: document.querySelectorAll('.thinking-row-open').length,
      toolOpen: document.querySelectorAll('.tool-card-open').length,
      turns: document.querySelectorAll('.turn-container').length,
      turnsOpen: document.querySelectorAll('.turn-container-open').length,
      skills: document.querySelectorAll('.skill-marker-row').length,
      banner: document.querySelectorAll('.error-banner').length,
      previewMd: document.querySelectorAll('.preview-md').length,
      previewCrumbs: document.querySelectorAll('.preview-crumb').length,
      previewCodeLines: document.querySelectorAll('.code-line').length,
      previewListRows: document.querySelectorAll('.preview-list-row').length,
      previewCodeCards: document.querySelectorAll('.preview-md .md-code-card').length,
      previewTableWraps: document.querySelectorAll('.preview-md .md-table-wrap').length
    }))()`
  )
  console.log(`VISUAL captured ${file} ${JSON.stringify(sig)}`)
  return file
}

/** Capture a composer-state shot and assert its DOM signature. */
async function captureMenu(
  win: BrowserWindow,
  name: string,
  probes: Record<string, string>
): Promise<string> {
  const file = await capture(win, name)
  for (const [label, selector] of Object.entries(probes)) {
    const count = (await win.webContents.executeJavaScript(
      `document.querySelectorAll(${JSON.stringify(selector)}).length`
    )) as number
    if (count === 0) throw new Error(`visual ${name}: expected ${label} (${selector}) in the DOM`)
    console.log(`VISUAL probe ${name}/${label}: ${count}`)
  }
  return file
}

/** Poll a compositor-driven fade to completion: the harness window may be
 * unfocused, and Electron throttles a background renderer's transitions —
 * the element must be SEEN opaque (or the poll gives up), not just
 * class-flagged. Returns the last observed opacity. */
async function pollOpacity(win: BrowserWindow, selector: string, budgetMs: number): Promise<number> {
  let last = 0
  for (let waited = 0; waited < budgetMs; waited += 100) {
    last = (await win.webContents.executeJavaScript(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el === null ? 0 : Number(getComputedStyle(el).opacity) })()`
    )) as number
    if (last > 0.9) return last
    await sleep(100)
  }
  return last
}

export function startVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!visualEnabled()) return
  // Density runs (ticket 15) own the window alone: a fixed sample transcript
  // plus geometry probe, no composer menus / preview flow alongside.
  if (process.env['PICODE_VISUAL_DENSITY'] === '1') return
  // The multi-session harness (ticket 20) owns the window alone too.
  if (multiSessionVisualEnabled()) return
  // Same for the background-approval harness (ticket 25).
  if (approvalVisualEnabled()) return
  // And for the row-geometry harness (ticket 34).
  if (process.env['PICODE_VISUAL_ROW_GEOMETRY'] === '1') return
  // And for the filter-dropdown harness (ticket 33).
  if (process.env['PICODE_VISUAL_FILTER'] === '1') return
  // And for the context-menu/archive harness (ticket 35).
  if (process.env['PICODE_VISUAL_CONTEXT_MENU'] === '1') return
  // And for the trace tool-surfaces harness (ticket 37).
  if (traceVisualEnabled()) return
  // And for the access-menu harness (ticket 38).
  if (process.env['PICODE_VISUAL_ACCESS'] === '1') return
  // And for the group-fold harness (ticket 39).
  if (foldVisualEnabled()) return
  // And for the codeblock-label harness (ticket 50).
  if (codeblockVisualEnabled()) return
  // And for the composer-expand harness (ticket 49).
  if (expandVisualEnabled()) return

  // Deterministic sidebar content for the shots (ticket 20): the empty-state
  // frame must show a status dot (a session written by ANOTHER end — fresh
  // mtime, no registry events = static green dot) next to the ticket-17
  // chip. Seed an isolated store before the session index constructs. The
  // cwd must be a REAL directory (ticket 42: the cwd-liveness filter drops
  // sessions whose working directory is not on disk).
  if (!terminalVisualEnabled() && !process.env['PICODE_SESSION_DIR']) {
    const store = ensureVisualStore()
    writeVisualSession(store, {
      id: 'visual-tui-live',
      cwd: ensureVisualProjectDir('api-server'),
      userText: 'Wire the new checkout form to the payments sandbox'
    })
  }

  void (async () => {
    try {
      mkdirSync(outDir(), { recursive: true })
      // Wait for the renderer to mount AND attach its Seam-1 subscription —
      // events emitted before that point would never reach the reducer.
      const win = await waitForWindow(getWindow)
      if (!win) throw new Error('visual harness: no window')
      // The visual frames capture compositor-driven fades (ticket 45's jump
      // button, pane motion). A backgrounded window's renderer is throttled
      // and the fade would freeze at opacity 0 mid-transition — opt this
      // harness window out.
      win.webContents.setBackgroundThrottling(false)

      // ---- reference 02: pristine empty state (greeting + composer + chips)
      await sleep(700)
      await capture(win, '0-empty-state')

      // ---- ticket 17: the project chip's dropdown (ZCode /tmp/chip-dd.png
      // shape: search workspaces + recent list + bottom "Open folder…")
      await win.webContents.executeJavaScript(
        `(() => {
          const chip = document.querySelector('.newtask-chip')
          if (!(chip instanceof HTMLElement)) return false
          chip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true
        })()`
      )
      await sleep(300)
      await capture(win, '0a-newtask-dropdown')
      // Click outside closes the dropdown (mousedown on anything off-chipbar).
      await win.webContents.executeJavaScript(
        `document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`
      )
      await sleep(200)

      // ---- reference 03: empty state + side-panel placeholder (tab picker)
      // Skipped in terminal-harness runs: one window serves both harnesses,
      // and the terminal flow wants the panel state untouched (its dock is
      // independent of the side panel).
      if (!terminalVisualEnabled()) {
        const openedByHarness = await win.webContents.executeJavaScript(
          `(() => {
            const toggle = document.querySelector('button[aria-label="Open side panel"]')
            if (toggle instanceof HTMLElement) {
              toggle.click()
              return true
            }
            return false
          })()`
        )
        await sleep(400)
        await win.webContents.executeJavaScript(
          `(() => {
            const add = document.querySelector('.panel-add-tab')
            if (add instanceof HTMLElement) add.click()
            return add !== null
          })()`
        )
        await sleep(500)
        await capture(win, '0b-empty-panel')
        if (openedByHarness === true) {
          // Collapse the panel again for the transcript shots.
          await win.webContents.executeJavaScript(
            `(() => {
              const toggle = document.querySelector('button[aria-label="Close side panel"]')
              if (toggle instanceof HTMLElement) toggle.click()
              return toggle !== null
            })()`
          )
          await sleep(300)
        }
      }

      emit({
        type: 'session_created',
        sessionId: 'visual-session',
        // In terminal-harness runs the terminal dock anchors on the ACTIVE
        // session's cwd — a nonexistent fake path would spawn a shell that
        // dies instantly. Reuse the terminal harness's real tmpdir.
        cwd: terminalVisualEnabled() ? tmpdir() : '/Users/dev/projects/api-server',
        model: 'claude-opus-4-5'
      })
      await sleep(200)
      // Ticket 21: the branch badge. The synthetic session has no live host,
      // so the supervisor's branch_info(null) degradation has settled by now
      // (fires within ms of the announcement) — inject the display value
      // AFTER that so it wins (last write wins).
      emit({ type: 'branch_info', branch: 'main' })

      emit({ type: 'user_message', text: 'Add input validation to the register endpoint and re-run its tests.' })
      emit({ type: 'agent_start' })
      await sleep(3500) // let the Working · Ns line tick up

      emit({ type: 'message_start' })
      emit({ type: 'thinking_delta', delta: 'The register endpoint lives in src/server/routes/register.ts. ' })
      emit({ type: 'thinking_delta', delta: 'I should check the existing validation helpers first, then add schema checks for email and password, and finally run the test suite to confirm nothing regressed.' })
      await sleep(2600) // thinking row ticks while streaming
      emit({ type: 'thinking_end', durationMs: 29_400 })

      await streamText(["I'll ", 'start ', 'by ', 'checking ', 'the ', 'register ', 'route ', 'and ', 'its ', 'existing ', 'validation ', 'helpers.'])
      emit({ type: 'message_end' })
      await sleep(400)

      // Tool round: bash tests, seen first mid-run.
      emit({
        type: 'tool_start',
        toolCallId: 'tc-visual-1',
        name: 'bash',
        args: { command: 'npm test -- register.test.ts' }
      })
      emit({ type: 'tool_update', toolCallId: 'tc-visual-1', partial: '→ Running vitest…\n' })
      await sleep(2200) // capture the running card + ticking working line
      await capture(win, '1-midrun')

      emit({
        type: 'tool_end',
        toolCallId: 'tc-visual-1',
        output: 'PASS  src/server/routes/register.test.ts\n  ✓ rejects malformed emails (4 ms)\n  ✓ requires a password of at least 12 characters (3 ms)\n  ✓ hashes passwords before storage (6 ms)\n\nTest Files  1 passed (1)\n     Tests  3 passed (3)',
        isError: false
      })
      await sleep(300)

      // Follow-up assistant message with rich markdown.
      emit({ type: 'message_start' })
      await streamText([
        'Validation is in place. ',
        '`register.ts` now rejects malformed addresses ',
        'before they reach the service layer:\n\n',
        '- **Email**: syntax-checked, lowercased, length-capped at 254\n',
        '- **Password**: minimum 12 characters, checked against the breached-list\n',
        '- **Errors**: returned as `400 { field, message }` instead of a generic `500`\n\n',
        'The guard itself is small:\n\n'
      ])
      emit({
        type: 'text_delta',
        delta:
          '```typescript\nexport function parseRegistration(body: unknown): Registration {\n  const { email, password } = RegistrationSchema.parse(body)\n  return {\n    email: email.trim().toLowerCase(),\n    password: assertStrongPassword(password)\n  }\n}\n```\n\n'
      })
      await sleep(400)
      // Ticket 16: the code card must exist mid-stream with both controls,
      // and must survive later deltas WITHOUT remounting — mark the mounted
      // element and re-check after more streaming (a remount drops the mark).
      const streamCodeSig = (await win.webContents.executeJavaScript(
        `(() => {
          const cards = document.querySelectorAll('.md-code-card')
          cards.forEach((el) => { if (el instanceof HTMLElement) el.dataset.streamProbe = 'mounted' })
          return { cards: cards.length, buttons: document.querySelectorAll('.md-code-card .md-block-btn').length }
        })()`
      )) as { cards: number; buttons: number }
      if (streamCodeSig.cards !== 1 || streamCodeSig.buttons !== 2) {
        throw new Error(`visual streaming: code card signature ${JSON.stringify(streamCodeSig)}`)
      }
      // Table streams in after the code block — same remount tolerance there.
      await streamText(['| Field | Rule |\n', '| --- | --- |\n| email | lowercased, ≤ 254 chars |\n', '| password | ≥ 12 chars, breach-listed |\n\n'], 120)
      const streamTableSig = (await win.webContents.executeJavaScript(
        `(() => {
          const wraps = document.querySelectorAll('.md-table-wrap')
          wraps.forEach((el) => { if (el instanceof HTMLElement) el.dataset.streamProbe = 'mounted' })
          return { wraps: wraps.length, buttons: document.querySelectorAll('.md-table-tools .md-block-btn').length }
        })()`
      )) as { wraps: number; buttons: number }
      if (streamTableSig.wraps !== 1 || streamTableSig.buttons !== 3) {
        throw new Error(`visual streaming: table container signature ${JSON.stringify(streamTableSig)}`)
      }
      await streamText(['All ', 'three ', 'register ', 'tests ', 'pass ', '— ', 'ready ', 'for ', 'review.'])
      const remountSig = (await win.webContents.executeJavaScript(
        `(() => {
          const marked = document.querySelectorAll('[data-stream-probe="mounted"]')
          let kept = 0
          marked.forEach((el) => {
            if (el instanceof HTMLElement && el.dataset.streamProbe === 'mounted') kept++
          })
          return { marked: marked.length, kept }
        })()`
      )) as { marked: number; kept: number }
      if (remountSig.marked < 2 || remountSig.kept !== remountSig.marked) {
        throw new Error(`visual streaming: block card remounted mid-stream ${JSON.stringify(remountSig)}`)
      }
      console.log(`VISUAL probe 1b-streaming-blocks: ${JSON.stringify({ ...streamCodeSig, ...streamTableSig, ...remountSig })}`)
      await capture(win, '1b-streaming-blocks')
      emit({ type: 'message_end' })
      emit({ type: 'agent_end' })
      await sleep(800)
      await capture(win, '2-settled')
      // Ticket 23 gate: settling folds the turn — the capture above must show
      // the collapsed "Worked · Ns ›" row with everything tucked inside, and
      // both streamed text parts visible as one answer block outside.
      const settledSig = (await win.webContents.executeJavaScript(
        `(() => ({
          turns: document.querySelectorAll('.turn-container').length,
          turnsOpen: document.querySelectorAll('.turn-container-open').length,
          answers: document.querySelectorAll('.msg-assistant').length,
          answerBlocks: document.querySelectorAll('.msg-assistant .md').length
        }))()`
      )) as { turns: number; turnsOpen: number; answers: number; answerBlocks: number }
      if (settledSig.turns < 1 || settledSig.turnsOpen !== 0 || settledSig.answers !== 1 || settledSig.answerBlocks < 2) {
        throw new Error(`visual 2-settled: turn did not fold on settle ${JSON.stringify(settledSig)}`)
      }
      console.log(`VISUAL probe 2-settled: ${JSON.stringify(settledSig)}`)

      // Ticket 23 choreography: settle folds the turn — open the container
      // FIRST, then run the ticket 16 block-chrome probes, then the density
      // check. (The answer block with its code card / table / fork row sits
      // outside the fold, but the expanded container matches the audit flow.)
      await win.webContents.executeJavaScript(
        `(() => {
          document.querySelectorAll('.turn-container-header').forEach((el) => (el instanceof HTMLElement ? el.click() : undefined))
          return true
        })()`
      )
      await sleep(300)

      // ---- ticket 16: settled block chrome interactions ----
      // Wrap toggle flips the code area to pre-wrap; expand lifts the table
      // scroll cap; preview opens the overlay; fork fires the toast.
      const chromeSig = (await win.webContents.executeJavaScript(
        `(() => ({
          codeCards: document.querySelectorAll('.md-code-card').length,
          tableWraps: document.querySelectorAll('.md-table-wrap').length,
          tools: document.querySelectorAll('.md-table-tools .md-block-btn').length,
          innerTables: document.querySelectorAll('.md-table-scroll table').length
        }))()`
      )) as { codeCards: number; tableWraps: number; tools: number; innerTables: number }
      if (chromeSig.codeCards < 1 || chromeSig.tableWraps < 1 || chromeSig.tools !== 3 || chromeSig.innerTables < 1) {
        throw new Error(`visual 2b: block chrome signature ${JSON.stringify(chromeSig)}`)
      }
      await win.webContents.executeJavaScript(
        `(() => {
          document.querySelector('.md-code-card button[aria-label="Wrap lines"]')?.scrollIntoView({ block: 'center' })
          const btn = document.querySelector('.md-code-card button[aria-label="Wrap lines"]')
          if (btn instanceof HTMLElement) btn.click()
          return btn !== null
        })()`
      )
      await sleep(300)
      const wrapSig = (await win.webContents.executeJavaScript(
        `document.querySelectorAll('.md pre.md-code-pre-wrapped').length`
      )) as number
      if (wrapSig < 1) throw new Error('visual 2b: wrap toggle did not wrap the code area')
      await capture(win, '2b-code-wrapped')

      await win.webContents.executeJavaScript(
        `(() => {
          document.querySelector('.md-table-wrap')?.scrollIntoView({ block: 'center' })
          const btn = document.querySelector('.md-table-tools button[aria-label="Expand table"]')
          if (btn instanceof HTMLElement) btn.click()
          return btn !== null
        })()`
      )
      await sleep(300)
      const expandSig = (await win.webContents.executeJavaScript(
        `document.querySelectorAll('.md-table-scroll-expanded').length`
      )) as number
      if (expandSig < 1) throw new Error('visual 2b: expand toggle did not lift the scroll cap')

      await win.webContents.executeJavaScript(
        `(() => {
          const btn = document.querySelector('.md-table-tools button[aria-label="Preview table"]')
          if (btn instanceof HTMLElement) btn.click()
          return btn !== null
        })()`
      )
      await sleep(400)
      await captureMenu(win, '2c-table-preview', { dialog: '.md-table-preview' })
      await win.webContents.executeJavaScript(
        `(() => {
          const close = document.querySelector('button[aria-label="Close table preview"]')
          if (close instanceof HTMLElement) close.click()
          return close !== null
        })()`
      )
      await sleep(200)

      // Fork from the message action row: toast + (in a live host) an
      // automatic session switch; the harness can only see the toast.
      await win.webContents.executeJavaScript(
        `(() => {
          const fork = document.querySelector('button[aria-label="Fork a new session from this message"]')
          fork?.scrollIntoView({ block: 'center' })
          if (fork instanceof HTMLElement) fork.click()
          return fork !== null
        })()`
      )
      await sleep(400)
      await captureMenu(win, '2d-fork-toast', { toast: '.toast' })
      const toastText = (await win.webContents.executeJavaScript(
        `document.querySelector('.toast-message')?.textContent ?? ''`
      )) as string
      if (!toastText.includes('Forked')) throw new Error(`visual 2d: unexpected fork toast ${JSON.stringify(toastText)}`)
      await sleep(300)

      // ---- ticket 45: Jump to Latest — scrolled away past the stick
      // threshold, the circular ↓ button fades in centered above the
      // composer (operator review frame; ZCode reference
      // z13-jump-to-latest). The 2d toast must clear first — it parks
      // bottom-right and would sit in the frame.
      for (let waited = 0; waited < 8_000; waited += 200) {
        const toastUp = (await win.webContents.executeJavaScript(
          `document.querySelector('.toast') !== null`
        )) as boolean
        if (!toastUp) break
        await sleep(200)
      }
      const scrollable = (await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector('.chat-scroll'); if (!el) return false; el.scrollTop = 0; return el.scrollHeight > el.clientHeight + 160 })()`
      )) as boolean
      if (!scrollable) throw new Error('visual 2e: the settled transcript does not overflow the viewport')
      // Poll the fade to completion instead of a fixed sleep: the harness
      // window may be unfocused, and Electron throttles a background
      // renderer's transitions — the button must be SEEN opaque, not just
      // class-flagged.
      if ((await pollOpacity(win, '.chat-jump-btn', 8_000)) <= 0.9) {
        throw new Error('visual 2e: the jump button never faded in (opacity stuck at 0)')
      }
      await captureMenu(win, '2e-jump-to-latest', { 'jump button visible': '.chat-jump-btn-visible' })
      await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector('.chat-scroll'); if (el) el.scrollTop = el.scrollHeight; return true })()`
      )
      await sleep(300)

      // Density check: with the container already open, unfold the inner
      // thinking row and tool card (ticket 23 + 14 audit view).
      await win.webContents.executeJavaScript(
        `(() => {
          const rows = document.querySelectorAll('.thinking-row-header, .tool-card-header')
          rows.forEach((el) => (el instanceof HTMLElement ? el.click() : undefined))
          document.querySelector('.thinking-row')?.scrollIntoView({ block: 'start' })
          return rows.length
        })()`
      )
      await sleep(500)
      await capture(win, '3-expanded')

      // ---- ticket 14: structured replay — a RESUMED agent-dense session.
      // A session_created(resumed) + history_loaded with structured items
      // must render isomorphic to the live transcript above: collapsed
      // thinking rows (no ticking duration — the file does not record it),
      // settled tool cards, the failed one in the error style.
      emit({
        type: 'session_created',
        sessionId: 'visual-replay',
        cwd: terminalVisualEnabled() ? tmpdir() : '/Users/dev/projects/api-server',
        model: 'claude-opus-4-5',
        resumed: true
      })
      emit({
        type: 'history_loaded',
        items: [
          {
            role: 'user',
            id: 'rv-e1',
            text: 'Investigate the flaky auth test and fix it.',
            timestamp: '2026-08-31T09:12:04.100Z',
            skillName: null
          },
          {
            role: 'assistant',
            id: 'rv-a1',
            timestamp: '2026-08-31T09:12:11.480Z',
            text: '',
            parts: [
              {
                kind: 'thinking',
                text:
                  'The flake smells like a shared fixture: auth.test.ts reuses the token cache across cases, so run order decides the outcome. Reproduce with --sequence.shuffle first, then isolate the fixture.',
                durationMs: null
              }
            ]
          },
          {
            role: 'tool',
            id: 'call_rv_1',
            timestamp: '2026-08-31T09:12:13.020Z',
            name: 'bash',
            args: { command: 'npx vitest run tests/auth.test.ts --sequence.shuffle' },
            output:
              'FAIL  tests/auth.test.ts > refreshes an expired token (run 2/3)\nAssertionError: expected 401 to equal 200\n\nTest Files  1 failed (1)\n     Tests  2 passed | 1 failed (3)',
            isError: false
          },
          {
            role: 'assistant',
            id: 'rv-a2',
            timestamp: '2026-08-31T09:13:02.770Z',
            text: 'Reproduced on the shuffled run — the token cache leaks between cases. `beforeEach` now resets it, and the suite passes three shuffled runs in a row.',
            parts: [
              {
                kind: 'thinking',
                text: 'The shuffled run failed exactly the cache-dependent case. Fix: reset the shared TokenCache in beforeEach, re-run three times to confirm.',
                durationMs: null
              },
              {
                kind: 'text',
                text: 'Reproduced on the shuffled run — the token cache leaks between cases. `beforeEach` now resets it, and the suite passes three shuffled runs in a row.'
              }
            ]
          },
          {
            role: 'user',
            id: 'rv-e3',
            text: '<skill name="fix-flake" location="~/.pi/agent/skills/fix-flake/SKILL.md">\nDetect and stabilize flaky tests.\n</skill>\n\nNow deploy it to staging.',
            timestamp: '2026-08-31T09:14:40.010Z',
            skillName: 'fix-flake'
          },
          {
            role: 'assistant',
            id: 'rv-a3',
            timestamp: '2026-08-31T09:14:47.390Z',
            text: '',
            parts: [
              {
                kind: 'thinking',
                text: 'Deploy runs the release script; staging needs STAGING_TOKEN from the environment — check before pushing.',
                durationMs: null
              }
            ]
          },
          {
            role: 'tool',
            id: 'call_rv_2',
            timestamp: '2026-08-31T09:14:49.150Z',
            name: 'bash',
            args: { command: 'npm run deploy --stage=staging' },
            output: 'Error: STAGING_TOKEN is not set — deployment aborted before any artifact was pushed.',
            isError: true
          }
        ]
      })
      await sleep(700)
      // Ticket 21: same as above — the resume announcement reset the badge
      // and the null degradation has settled; re-inject the readout so the
      // replayed transcript shows the badge too.
      emit({ type: 'branch_info', branch: 'main' })
      // Replay gates (tickets 14 + 23): every turn arrives FOLDED — inner
      // rows not in the DOM yet — with the skill marker waiting inside.
      const replaySig = (await win.webContents.executeJavaScript(
        `(() => ({
          turns: document.querySelectorAll('.turn-container').length,
          turnsOpen: document.querySelectorAll('.turn-container-open').length,
          thinkingRows: document.querySelectorAll('.thinking-row').length,
          tools: document.querySelectorAll('.tool-card').length
        }))()`
      )) as { turns: number; turnsOpen: number; thinkingRows: number; tools: number }
      if (replaySig.turns < 2 || replaySig.turnsOpen !== 0) {
        throw new Error(`visual 3b-replayed: replay must open fully collapsed ${JSON.stringify(replaySig)}`)
      }
      if (replaySig.thinkingRows !== 0 || replaySig.tools !== 0) {
        throw new Error(`visual 3b-replayed: inner rows leaked while folded ${JSON.stringify(replaySig)}`)
      }
      console.log(`VISUAL probe 3b-replayed: ${JSON.stringify(replaySig)}`)
      await capture(win, '3b-replayed')

      // Expanded variant: open every container, then unfold the inner rows —
      // the audit check: collapsed thinking rows (no durations), settled tool
      // cards, the failed one in the error style, one skill marker row.
      await win.webContents.executeJavaScript(
        `(() => {
          document.querySelectorAll('.turn-container-header').forEach((el) => (el instanceof HTMLElement ? el.click() : undefined))
          return true
        })()`
      )
      await sleep(300)
      const openedSig = (await win.webContents.executeJavaScript(
        `(() => ({
          skills: document.querySelectorAll('.skill-marker-row').length,
          thinkingRows: document.querySelectorAll('.thinking-row').length,
          thinkingOpen: document.querySelectorAll('.thinking-row-open').length,
          thinkingDurations: document.querySelectorAll('.thinking-row .thinking-row-duration').length,
          tools: document.querySelectorAll('.tool-card').length,
          toolErrors: document.querySelectorAll('.tool-card-error').length
        }))()`
      )) as { skills: number; thinkingRows: number; thinkingOpen: number; thinkingDurations: number; tools: number; toolErrors: number }
      if (openedSig.skills !== 1) {
        throw new Error(`visual 3c-replayed: expected exactly one skill marker row ${JSON.stringify(openedSig)}`)
      }
      if (openedSig.thinkingRows < 3 || openedSig.tools < 2 || openedSig.toolErrors !== 1) {
        throw new Error(`visual 3c-replayed: unexpected replay signature ${JSON.stringify(openedSig)}`)
      }
      if (openedSig.thinkingOpen !== 0 || openedSig.thinkingDurations !== 0) {
        throw new Error(`visual 3c-replayed: replay must render collapsed and duration-less ${JSON.stringify(openedSig)}`)
      }
      console.log(`VISUAL probe 3c-replayed: ${JSON.stringify(openedSig)}`)
      await win.webContents.executeJavaScript(
        `(() => {
          document.querySelector('.turn-container')?.scrollIntoView({ block: 'start' })
          return true
        })()`
      )
      await sleep(300)
      await capture(win, '3c-replayed-expanded')

      // ---- ticket 05: composer menus, approval pill, queue panel ----
      emit({
        type: 'composer_state',
        model: { providerId: 'bella', modelId: 'GLM-5.3', name: 'GLM-5.3' },
        thinkingLevel: 'max',
        availableLevels: ['off', 'low', 'medium', 'high', 'max'],
        accessMode: 'standard'
      })
      emit({
        type: 'models_available',
        providers: [
          {
            providerId: 'bella',
            name: 'Bella',
            models: [
              { providerId: 'bella', modelId: 'GLM-5.1', name: 'GLM-5.1' },
              { providerId: 'bella', modelId: 'GLM-5.3', name: 'GLM-5.3' },
              { providerId: 'bella', modelId: 'GLM-5.3-flash', name: 'GLM-5.3-flash' }
            ]
          },
          {
            providerId: 'openai',
            name: 'OpenAI',
            models: [{ providerId: 'openai', modelId: 'gpt-5.1', name: 'GPT-5.1' }]
          }
        ],
        current: { providerId: 'bella', modelId: 'GLM-5.3', name: 'GLM-5.3' }
      })
      emit({
        type: 'slash_commands',
        commands: [
          // Ticket 38: the menu carries the one retained built-in (compact);
          // /model /new /tree /name /copy /thinking are retired.
          { name: 'compact', description: 'Compact the session context', source: 'builtin' },
          { name: 'review', description: 'Review the current diff against HEAD', source: 'prompt' },
          { name: 'plan', description: 'Switch to plan mode and send a task', source: 'prompt' },
          { name: 'code-review', description: 'Structured review skill', source: 'skill' }
        ]
      })
      await sleep(300)

      // Open the `/` menu like a user typing (React-controlled textarea).
      await win.webContents.executeJavaScript(
        `(() => {
          const ta = document.querySelector('.composer-input')
          if (!(ta instanceof HTMLTextAreaElement)) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, '/')
          ta.dispatchEvent(new Event('input', { bubbles: true }))
          ta.focus()
          return true
        })()`
      )
      await sleep(400)
      await captureMenu(win, '4-command-menu', { menuRows: '.cmp-popover .cmp-menu-row' })

      // ---- reference 07: provider → model cascade menu ----
      await win.webContents.executeJavaScript(
        `(() => {
          const ta = document.querySelector('.composer-input')
          if (!(ta instanceof HTMLTextAreaElement)) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, '')
          ta.dispatchEvent(new Event('input', { bubbles: true }))
          window.dispatchEvent(new Event('picode:open-model-menu'))
          return true
        })()`
      )
      await sleep(400)
      await captureMenu(win, '4b-model-menu', { providers: '.cmp-cascade-col .cmp-menu-row' })
      // Close the cascade so the approval-pill shot shows the pill alone.
      await win.webContents.executeJavaScript(
        `(() => {
          for (const target of [window, document]) {
            target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
          }
          return true
        })()`
      )
      await sleep(300)

      // Approval pill + queue panel while a run is in flight. Close the `/`
      // menu first (clear the input) so the pill is fully visible.
      await win.webContents.executeJavaScript(
        `(() => {
          const ta = document.querySelector('.composer-input')
          if (!(ta instanceof HTMLTextAreaElement)) return false
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
          setter.call(ta, '')
          ta.dispatchEvent(new Event('input', { bubbles: true }))
          return true
        })()`
      )
      emit({ type: 'agent_start' })
      emit({ type: 'queue_update', steering: [], followUp: ['Summarize the changes when done'] })
      emit({
        type: 'approval_required',
        toolCallId: 'tc-visual-pill',
        toolName: 'bash',
        args: { command: 'npm run deploy --stage=prod' }
      })
      await sleep(500)
      await win.webContents.executeJavaScript(
        `document.querySelector('.approval-pill-pending')?.scrollIntoView({ block: 'center' }); true`
      )
      await sleep(200)
      await captureMenu(win, '5-approval-queue', {
        pills: '.approval-pill-pending',
        queueItems: '.queue-item'
      })
      // ---- Preview tab (ticket 07): deep-link + markdown/source/crumbs ----
      // Re-anchor the visual session on this repository so the preview reader
      // has real files, then drive the same deep-link path a human clicks.
      const repoCwd = process.cwd()
      emit({ type: 'session_created', sessionId: 'visual-preview', cwd: repoCwd, model: 'claude-opus-4-5' })
      await sleep(200)
      emit({
        type: 'tool_start',
        toolCallId: 'tc-visual-md',
        name: 'write',
        args: { path: 'CONTEXT.md', content: '…' }
      })
      emit({ type: 'tool_end', toolCallId: 'tc-visual-md', output: 'Wrote CONTEXT.md', isError: false })
      await sleep(300)
      // Ticket 23: the settled tool card hides inside its folded turn — open
      // the container before driving the deep-link a human would click.
      await win.webContents.executeJavaScript(
        `(() => {
          document.querySelectorAll('.turn-container-header').forEach((el) => (el instanceof HTMLElement ? el.click() : undefined))
          return true
        })()`
      )
      await sleep(300)
      await win.webContents.executeJavaScript(
        `(() => {
          const link = document.querySelector('.tool-card-preview-link')
          if (link instanceof HTMLElement) link.click()
          return link !== null
        })()`
      )
      await sleep(700)
      await capture(win, '4-preview-markdown')

      // ---- ticket 32: preview rendered state adopts the transcript chrome ----
      // Ticket 16 kept the preview reader bare; the operator overturned that
      // scope (2026-09-02). Rendered markdown in the preview now renders the
      // SAME code cards and table containers as the transcript; the source
      // state stays windowed bare text. A deterministic fixture (two fenced
      // blocks + one table) drives the probes and is removed afterwards.
      const previewFixture = path.join(process.cwd(), '.scratch', 'visual', 'preview-chrome-fixture.md')
      writeFileSync(
        previewFixture,
        [
          '# Preview chrome fixture',
          '',
          'Two fenced blocks and a table for the preview chrome probes:',
          '',
          '```typescript',
          'export function probe(value: number): number {',
          '  return value * 2',
          '}',
          '```',
          '',
          '```json',
          '{ "ok": true, "scope": "preview" }',
          '```',
          '',
          '| Field | Rule |',
          '| --- | --- |',
          '| email | lowercased |',
          '| password | breach-listed |',
          ''
        ].join('\n')
      )
      emit({
        type: 'tool_start',
        toolCallId: 'tc-visual-chrome',
        name: 'write',
        args: { path: '.scratch/visual/preview-chrome-fixture.md', content: '…' }
      })
      emit({ type: 'tool_end', toolCallId: 'tc-visual-chrome', output: 'Wrote .scratch/visual/preview-chrome-fixture.md', isError: false })
      await sleep(300)
      await win.webContents.executeJavaScript(
        `(() => {
          const cards = [...document.querySelectorAll('.tool-card')]
          const link = cards[cards.length - 1]?.querySelector('.tool-card-preview-link')
          if (link instanceof HTMLElement) link.click()
          return link !== undefined
        })()`
      )
      await sleep(700)
      // Probes run against the ACTIVE tab body only — hidden tabs stay
      // mounted (ticket 31) and would double-count their own chrome.
      const previewSig = (await win.webContents.executeJavaScript(
        `(() => {
          const $ = (sel) => document.querySelectorAll('.panel-tab-body:not(.panel-tab-body-hidden) ' + sel).length
          return {
            md: $('.preview-md'),
            codeCards: $('.preview-md .md-code-card'),
            codeBtns: $('.preview-md .md-code-card .md-block-btn'),
            tableWraps: $('.preview-md .md-table-wrap'),
            tableBtns: $('.preview-md .md-table-tools .md-block-btn'),
            innerTables: $('.preview-md .md-table-scroll table'),
            wrapped: $('.preview-md pre.md-code-pre-wrapped'),
            tips: $('.preview-md .md-block-btn[data-tip-label]')
          }
        })()`
      )) as {
        md: number
        codeCards: number
        codeBtns: number
        tableWraps: number
        tableBtns: number
        innerTables: number
        wrapped: number
        tips: number
      }
      if (
        previewSig.md !== 1 ||
        previewSig.codeCards !== 2 ||
        previewSig.codeBtns !== 4 ||
        previewSig.tableWraps !== 1 ||
        previewSig.tableBtns !== 3 ||
        previewSig.innerTables !== 1 ||
        previewSig.wrapped !== 0 ||
        previewSig.tips !== 7
      ) {
        throw new Error(`visual 4b: preview chrome signature ${JSON.stringify(previewSig)}`)
      }
      // Wrap ONE card: the other stays unwrapped — per-key state isolation.
      await win.webContents.executeJavaScript(
        `(() => {
          const btn = document.querySelector('.panel-tab-body:not(.panel-tab-body-hidden) .preview-md .md-code-card button[aria-label="Wrap lines"]')
          if (btn instanceof HTMLElement) btn.click()
          return btn !== null
        })()`
      )
      await sleep(300)
      const previewWrapSig = (await win.webContents.executeJavaScript(
        `(() => ({
          wrapped: document.querySelectorAll('.panel-tab-body:not(.panel-tab-body-hidden) .preview-md pre.md-code-pre-wrapped').length,
          cards: document.querySelectorAll('.panel-tab-body:not(.panel-tab-body-hidden) .preview-md .md-code-card').length
        }))()`
      )) as { wrapped: number; cards: number }
      if (previewWrapSig.wrapped !== 1 || previewWrapSig.cards !== 2) {
        throw new Error(`visual 4b: preview wrap toggle ${JSON.stringify(previewWrapSig)}`)
      }
      // Copy ONE card: only its own ✓ shows (per-key feedback). The OS
      // pasteboard is stubbed — clipboard.writeText rejects while the window
      // is unfocused, and the harness only needs our handler + feedback path
      // (payload recorded by the stub doubles as a copy-content check).
      await win.webContents.executeJavaScript(
        `(() => {
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: (text) => { window.__previewCopy = String(text); return Promise.resolve() } }
          })
          const btn = document.querySelector('.panel-tab-body:not(.panel-tab-body-hidden) .preview-md .md-code-card button[aria-label="Copy code"]')
          if (btn instanceof HTMLElement) btn.click()
          return btn !== null
        })()`
      )
      await sleep(250)
      const previewCopySig = (await win.webContents.executeJavaScript(
        `(() => ({
          copied: document.querySelectorAll('.panel-tab-body:not(.panel-tab-body-hidden) .preview-md .md-copy-copied').length,
          payload: window.__previewCopy ?? ''
        }))()`
      )) as { copied: number; payload: string }
      if (previewCopySig.copied !== 1 || !previewCopySig.payload.includes('export function probe')) {
        throw new Error(`visual 4b: preview copy feedback ${JSON.stringify(previewCopySig)}`)
      }
      await capture(win, '4b-preview-chrome')
      // Table preview overlay opens from inside the preview tab too.
      await win.webContents.executeJavaScript(
        `(() => {
          const btn = document.querySelector('.panel-tab-body:not(.panel-tab-body-hidden) .preview-md .md-table-tools button[aria-label="Preview table"]')
          if (btn instanceof HTMLElement) btn.click()
          return btn !== null
        })()`
      )
      await sleep(400)
      await captureMenu(win, '4c-preview-table-preview', {
        dialog: '.panel-tab-body:not(.panel-tab-body-hidden) .preview-md .md-table-preview'
      })
      await win.webContents.executeJavaScript(
        `(() => {
          const close = document.querySelector('.panel-tab-body:not(.panel-tab-body-hidden) .preview-md .md-table-preview button[aria-label="Close table preview"]')
          if (close instanceof HTMLElement) close.click()
          return close !== null
        })()`
      )
      await sleep(200)
      // Expand lifts the scroll cap — the same container the transcript uses.
      await win.webContents.executeJavaScript(
        `(() => {
          const btn = document.querySelector('.panel-tab-body:not(.panel-tab-body-hidden) .preview-md .md-table-tools button[aria-label="Expand table"]')
          if (btn instanceof HTMLElement) btn.click()
          return btn !== null
        })()`
      )
      await sleep(200)
      const previewExpandSig = (await win.webContents.executeJavaScript(
        `document.querySelectorAll('.panel-tab-body:not(.panel-tab-body-hidden) .preview-md .md-table-scroll-expanded').length`
      )) as number
      if (previewExpandSig !== 1) {
        throw new Error(`visual 4b: preview expand toggle ${previewExpandSig}`)
      }
      // Source state unchanged (ticket 16's surviving half): windowed
      // CodeView, no chrome. Flip the fixture tab's segmented control.
      await win.webContents.executeJavaScript(
        `(() => {
          const btn = document.querySelector('.panel-tab-body:not(.panel-tab-body-hidden) .preview-toolbar .review-segmented button[aria-selected="false"]')
          if (btn instanceof HTMLElement) btn.click()
          return btn !== null
        })()`
      )
      await sleep(400)
      const previewSourceSig = (await win.webContents.executeJavaScript(
        `(() => {
          const $ = (sel) => document.querySelectorAll('.panel-tab-body:not(.panel-tab-body-hidden) ' + sel).length
          return { md: $('.preview-md'), cards: $('.md-code-card'), codeLines: $('.code-line') }
        })()`
      )) as { md: number; cards: number; codeLines: number }
      if (previewSourceSig.md !== 0 || previewSourceSig.cards !== 0 || previewSourceSig.codeLines === 0) {
        throw new Error(`visual 4d: preview source state ${JSON.stringify(previewSourceSig)}`)
      }
      await capture(win, '4d-preview-source-window')
      rmSync(previewFixture, { force: true })

      // Source file deep-link: highlighted code with the line-number gutter.
      emit({
        type: 'tool_start',
        toolCallId: 'tc-visual-src',
        name: 'edit',
        args: { path: 'src/shared/preview/policy.ts' }
      })
      emit({ type: 'tool_end', toolCallId: 'tc-visual-src', output: 'Patched', isError: false })
      await sleep(200)
      await win.webContents.executeJavaScript(
        `(() => {
          const cards = [...document.querySelectorAll('.tool-card')]
          const link = cards[cards.length - 1]?.querySelector('.tool-card-preview-link')
          if (link instanceof HTMLElement) link.click()
          return link !== undefined
        })()`
      )
      await sleep(700)
      await capture(win, '5-preview-source')

      // Wrap/truncate display toggle (ticket 07 feedback): flip to truncated.
      // The toggle must come from the ACTIVE tab — the ticket-32 fixture tab
      // stays open in source mode, and its hidden toolbar would otherwise
      // win an unscoped selector (ticket 31 feedback, same shape as crumbs).
      await win.webContents.executeJavaScript(
        `(() => {
          const toggle = document.querySelector('.panel-tab-body:not(.panel-tab-body-hidden) .preview-wrap-toggle')
          if (toggle instanceof HTMLElement) toggle.click()
          return toggle !== null
        })()`
      )
      await sleep(400)
      await capture(win, '5b-preview-truncated')
      await win.webContents.executeJavaScript(
        `(() => {
          const toggle = document.querySelector('.panel-tab-body:not(.panel-tab-body-hidden) .preview-wrap-toggle')
          if (toggle instanceof HTMLElement) toggle.click()
          return true
        })()`
      )
      await sleep(200)

      // Breadcrumb fallback: click the workspace-root crumb → listing. The
      // crumb must come from the ACTIVE tab — in-tab navigation retargets
      // that tab in place (ticket 31 feedback), so a hidden tab's crumb
      // would navigate off-screen and the frame would show nothing new.
      await win.webContents.executeJavaScript(
        `(() => {
          const crumb = document.querySelector('.panel-tab-body:not(.panel-tab-body-hidden) button.preview-crumb')
          if (crumb instanceof HTMLElement) crumb.click()
          return crumb !== null
        })()`
      )
      await sleep(500)
      await capture(win, '6-preview-directory')

      // Review file tree deep-link: picker → Review tab → hover Open chip.
      // The review tree only renders when the workspace HAS changes; the
      // harness must not depend on the operator's git state, so drop an
      // untracked scratch probe (collect synthesizes it as an addition) and
      // remove it after the stage.
      const reviewProbe = path.join(process.cwd(), '.scratch', 'visual', '.review-probe.txt')
      writeFileSync(reviewProbe, 'visual harness review probe — safe to delete\n')
      await win.webContents.executeJavaScript(
        `(() => {
          const add = document.querySelector('.panel-add-tab')
          if (add instanceof HTMLElement) add.click()
          return true
        })()`
      )
      let reviewCard = false
      for (let waited = 0; waited < 5_000 && !reviewCard; waited += 100) {
        await sleep(100)
        reviewCard = await win.webContents.executeJavaScript(
          `(() => {
            const card = document.querySelector('.panel-tab-card[aria-label="Open Review tab"]')
            if (card instanceof HTMLElement) {
              card.click()
              return true
            }
            return false
          })()`
        )
      }
      if (!reviewCard) throw new Error('visual harness: review picker card never appeared')
      let reviewChip = false
      for (let waited = 0; waited < 10_000 && !reviewChip; waited += 200) {
        reviewChip = await win.webContents.executeJavaScript(
          `document.querySelector('.review-tree-open') !== null`
        )
        if (!reviewChip) await sleep(200)
      }
      if (!reviewChip) throw new Error('visual harness: review tree never rendered')
      await win.webContents.executeJavaScript(
        `(() => {
          const chip = document.querySelector('.review-tree-open')
          if (chip instanceof HTMLElement) chip.click()
          return true
        })()`
      )
      await sleep(700)
      await capture(win, '7-review-deeplink')
      rmSync(reviewProbe, { force: true })

      // ---- ticket 31: multi-file tabs + the tab management dropdown ----
      // Close one file tab (it must land under Recently Closed Tabs), then
      // open the ⌄ dropdown: search box, both sections, relative time.
      await win.webContents.executeJavaScript(
        `(() => {
          const probe = '.review-probe.txt'
          for (const tabEl of document.querySelectorAll('.panel-tab')) {
            if (tabEl.querySelector('.panel-tab-label span')?.textContent !== probe) continue
            const closeBtn = tabEl.querySelector('.panel-tab-close')
            if (closeBtn instanceof HTMLElement) { closeBtn.click(); return true }
          }
          return false
        })()`
      )
      await sleep(300)
      await win.webContents.executeJavaScript(
        `(() => {
          const trigger = document.querySelector('button[aria-label="Manage tabs"]')
          if (trigger instanceof HTMLElement) trigger.click()
          return trigger !== null
        })()`
      )
      await sleep(400)
      await captureMenu(win, '9-tab-dropdown', {
        menu: '.panel-tab-menu',
        menuRows: '.panel-menu-row',
        menuSections: '.panel-tab-menu-section'
      })
      // Leave the dropdown closed and the persisted history clean (the
      // visual run writes the REAL preference store otherwise).
      await win.webContents.executeJavaScript(
        `(() => {
          const trigger = document.querySelector('button[aria-label="Manage tabs"]')
          if (trigger instanceof HTMLElement) trigger.click()
          return true
        })()`
      )
      await win.webContents.executeJavaScript(`window.picode.settings.set({ recentlyClosedTabs: [] }); true`)
      await sleep(200)

      // ---- ticket 22: unified tooltip on the sidebar filter button ----
      // The tooltip host listens to delegated mouseover; dispatch a bubbling
      // one on the trigger, wait out the 400ms dwell, then capture the bubble.
      await win.webContents.executeJavaScript(
        `(() => {
          const filter = document.querySelector('button[aria-label="Filter tasks"]')
          if (!(filter instanceof HTMLElement)) return false
          filter.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
          return true
        })()`
      )
      await sleep(700)
      await captureMenu(win, '8-tooltip-filter', { bubble: '.tooltip-bubble' })
      await win.webContents.executeJavaScript(
        `(() => {
          const filter = document.querySelector('button[aria-label="Filter tasks"]')
          if (filter instanceof HTMLElement) {
            filter.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
          }
          return true
        })()`
      )
      await sleep(200)

      // ---- ticket 46: the turn navigator rail — three operator frames
      // against the ZCode references (z13-navigator-rail / z13-navigator-hover
      // / the scrolled-away state). A fresh focused session with two settled
      // turns drives the chain: rail with two ticks → hover bubble on the
      // second tick → scrolled away past the stick threshold (jump button +
      // rail together). Events are injected, so the run needs no model.
      emit({
        type: 'session_created',
        sessionId: 'visual-navigator',
        cwd: '/Users/dev/projects/api-server',
        model: 'claude-opus-4-5'
      })
      await sleep(300)
      const navTurn = async (text: string, lead: string): Promise<void> => {
        emit({ type: 'user_message', text })
        emit({ type: 'agent_start' })
        await sleep(300)
        emit({ type: 'message_start' })
        // Long enough answers to overflow the viewport — the scrolled-away
        // frame needs a transcript that can actually scroll past the stick
        // threshold.
        const filler =
          'The register endpoint validates the payload in three passes, and the migration backfills the breached-list column for the cutover window. '
        await streamText([lead, ' ', filler.repeat(14)])
        emit({ type: 'message_end' })
        emit({ type: 'agent_end' })
        await sleep(300)
      }
      await navTurn(
        'Add input validation to the register endpoint and re-run its tests.',
        'Done. The register endpoint now rejects malformed addresses before they reach the service layer, and the test suite is green.'
      )
      await navTurn(
        'Now write the migration for the new schema.',
        'The migration is in place. It adds the breached-list column, backfills the existing rows, and leaves the old index in place for the cutover window.'
      )
      await captureMenu(win, '9-nav-rail', { rail: '.nav-rail', tick: '.nav-tick' })
      const tickCount = (await win.webContents.executeJavaScript(
        `document.querySelectorAll('.nav-rail:not(.nav-rail-hidden) .nav-tick').length`
      )) as number
      if (tickCount !== 2) throw new Error(`visual 9: expected 2 ticks, saw ${tickCount}`)

      // Hover the second tick → the two-segment preview bubble (user input
      // clamp 2 + assistant reply clamp 3) fades in after the open delay.
      await win.webContents.executeJavaScript(
        `(() => {
          const slots = document.querySelectorAll('.nav-tick-slot')
          const slot = slots[slots.length - 1]
          if (!(slot instanceof HTMLElement)) return false
          const r = slot.getBoundingClientRect()
          const opts = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }
          slot.dispatchEvent(new MouseEvent('mouseover', opts))
          slot.dispatchEvent(new MouseEvent('mouseenter', opts))
          return true
        })()`
      )
      if ((await pollOpacity(win, '.nav-bubble.nav-bubble-open', 8_000)) <= 0.9) {
        throw new Error('visual 9b: the preview bubble never opened on tick hover')
      }
      await captureMenu(win, '9b-nav-hover', { bubble: '.nav-bubble.nav-bubble-open' })
      await win.webContents.executeJavaScript(
        `(() => {
          const slots = document.querySelectorAll('.nav-tick-slot')
          const slot = slots[slots.length - 1]
          if (slot instanceof HTMLElement) {
            slot.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
            slot.dispatchEvent(new MouseEvent('mouseleave', { relatedTarget: document.body }))
          }
          return true
        })()`
      )
      await sleep(500)

      // Scrolled away past the stick threshold: the circular jump button is
      // up AND the rail rides the left edge — the full scrolled-away state.
      await win.webContents.executeJavaScript(
        `(() => { const el = document.querySelector('.chat-scroll'); if (el) el.scrollTop = 0; return true })()`
      )
      if ((await pollOpacity(win, '.chat-jump-btn', 8_000)) <= 0.9) {
        throw new Error('visual 9c: the jump button never faded in for the scrolled-away frame')
      }
      await captureMenu(win, '9c-nav-scrollaway', {
        jump: '.chat-jump-btn-visible',
        rail: '.nav-rail:not(.nav-rail-hidden)'
      })

      console.log('VISUAL done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL FAIL', err)
      app.exit(1)
    }
  })()
}
