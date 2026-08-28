/**
 * Visual-QA harness (ticket 03: transcript density against screenshots 01/04).
 * Enabled only with PICODE_VISUAL=1. Injects a realistic, settled `HostToParent`
 * event sequence directly into the renderer (no SDK, no network), then captures
 * PNG screenshots of the window:
 *
 *   1. mid-run  — working line ticking, streaming markdown with caret, tool card running
 *   2. settled  — done tool card, per-message actions row with timestamp
 *   3. expanded — thinking row and tool card unfolded
 *
 * PNGs land in $PICODE_VISUAL_OUT (default: <cwd>/.scratch/visual/). Not part
 * of `npm test`; a human compares them against the reference screenshots.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { HostToParent } from '../shared/contract'

export function visualEnabled(): boolean {
  return process.env['PICODE_VISUAL'] === '1'
}

function outDir(): string {
  return process.env['PICODE_VISUAL_OUT'] || path.join(process.cwd(), '.scratch', 'visual')
}

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
function emit(event: HostToParent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('chat:from-host', event)
  }
}

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
      working: document.querySelectorAll('.working-line').length,
      banner: document.querySelectorAll('.error-banner').length,
      previewMd: document.querySelectorAll('.preview-md').length,
      previewCrumbs: document.querySelectorAll('.preview-crumb').length,
      previewCodeLines: document.querySelectorAll('.code-line').length,
      previewListRows: document.querySelectorAll('.preview-list-row').length
    }))()`
  )
  console.log(`VISUAL captured ${file} ${JSON.stringify(sig)}`)
  return file
}

export function startVisualIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!visualEnabled()) return

  void (async () => {
    try {
      mkdirSync(outDir(), { recursive: true })
      // Wait for the renderer to mount AND attach its Seam-1 subscription —
      // events emitted before that point would never reach the reducer.
      const win = await waitForWindow(getWindow)
      if (!win) throw new Error('visual harness: no window')

      emit({
        type: 'session_created',
        sessionId: 'visual-session',
        cwd: '/Users/dev/projects/api-server',
        model: 'claude-opus-4-5'
      })
      await sleep(200)

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
      await streamText(['All ', 'three ', 'register ', 'tests ', 'pass ', '— ', 'ready ', 'for ', 'review.'])
      emit({ type: 'message_end' })
      emit({ type: 'agent_end' })
      await sleep(800)
      await capture(win, '2-settled')

      // Expand the thinking row and the tool card for the density check.
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
      await win.webContents.executeJavaScript(
        `(() => {
          const link = document.querySelector('.tool-card-preview-link')
          if (link instanceof HTMLElement) link.click()
          return link !== null
        })()`
      )
      await sleep(700)
      await capture(win, '4-preview-markdown')

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
      await win.webContents.executeJavaScript(
        `(() => {
          const toggle = document.querySelector('.preview-wrap-toggle')
          if (toggle instanceof HTMLElement) toggle.click()
          return toggle !== null
        })()`
      )
      await sleep(400)
      await capture(win, '5b-preview-truncated')
      await win.webContents.executeJavaScript(
        `(() => {
          const toggle = document.querySelector('.preview-wrap-toggle')
          if (toggle instanceof HTMLElement) toggle.click()
          return true
        })()`
      )
      await sleep(200)

      // Breadcrumb fallback: click the workspace-root crumb → listing.
      await win.webContents.executeJavaScript(
        `(() => {
          const crumb = document.querySelector('button.preview-crumb')
          if (crumb instanceof HTMLElement) crumb.click()
          return crumb !== null
        })()`
      )
      await sleep(500)
      await capture(win, '6-preview-directory')

      // Review file tree deep-link: picker → Review tab → hover Open chip.
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

      console.log('VISUAL done')
      app.exit(0)
    } catch (err) {
      console.error('VISUAL FAIL', err)
      app.exit(1)
    }
  })()
}
