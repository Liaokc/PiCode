/**
 * Perf profiling harness (ticket 30). Enabled only with PICODE_PERF=1.
 * Pairs with `scripts/perf/flame.mjs`, which boots the built app with
 * `--remote-debugging-port`, then drives Chrome DevTools Protocol:
 * Profiler.start → scenario → Profiler.stop, archiving `.cpuprofile`
 * flamegraphs + numeric summaries for the before/after comparison.
 *
 * This harness's only job is to SET UP a deterministic heavy state and stay
 * alive (the driver closes the app):
 *   - a large streaming-shaped markdown answer (many code cards + tables)
 *     replayed via history_loaded — the same AnswerBlock → Markdown path
 *     the live transcript uses;
 *   - the side panel open with an (empty) Preview tab — exposes the panel
 *     resizer;
 *   - the bottom dock open showing the BRIDGE panel (no pty noise) —
 *     exposes the dock resizer.
 * `body[data-perf-ready="1"]` + "PERF ready" on stdout tell the driver to
 * begin profiling.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow } from 'electron'
import { emitContractEvent } from './visual'

export function perfEnabled(): boolean {
  return process.env['PICODE_PERF'] === '1'
}

/** Absolute path of the seeded big markdown file (preview scroll scenario). */
export function bigMarkdownPath(): string {
  return process.env['PICODE_PERF_MD'] || path.join(tmpdir(), 'picode-perf-big.md')
}

/** Deterministic transcript size (code cards = sections). */
function sections(): number {
  const raw = Number.parseInt(process.env['PICODE_PERF_SECTIONS'] ?? '80', 10)
  return Number.isFinite(raw) && raw > 0 ? raw : 80
}

/** One deterministic ~15-line TS block (highlight-heavy content). */
function codeBlock(i: number): string {
  return [
    `export function guard${i}(body: unknown): Registration {`,
    `  const parsed = RegistrationSchema${i}.safeParse(body)`,
    `  if (!parsed.success) {`,
    `    const issue = parsed.error.issues[0]`,
    `    throw new ValidationError(issue.path.join('.'), issue.message)`,
    `  }`,
    `  const { email, password } = parsed.data`,
    `  return {`,
    `    email: email.trim().toLowerCase(),`,
    `    password: assertStrongPassword${i}(password),`,
    `    region: normalizeRegion(issue.path.length),`,
    `    attempts: issue.code === 'too_small' ? 1 : 0,`,
    `    validatedAt: new Date().toISOString(),`,
    `  }`,
    `}`
  ].join('\n')
}

/** Large markdown answer: `sections()` × (heading, prose, list, table, code). */
export function bigMarkdown(n: number): string {
  const parts: string[] = [
    'Validation is in place. `register.ts` now rejects malformed addresses before they reach the service layer. The sections below walk the guard chain, the schema fallback and the retry policy as shipped.'
  ]
  for (let i = 1; i <= n; i++) {
    parts.push(
      `## Section ${i} — guard chain ${i}`,
      `The register endpoint validates the payload in three passes. Section ${i} covers the syntax check, the length caps and the breach-list lookup, plus the error shape returned to the client on failure.`,
      `- **Email**: syntax-checked, lowercased, length-capped at 254\n- **Password**: minimum 12 characters, checked against the breached-list\n- **Errors**: returned as \`400 { field, message }\` instead of a generic \`500\``,
      `| Field | Rule | Since |\n| --- | --- | --- |\n| email | lowercased, ≤ 254 chars | v1.${i} |\n| password | ≥ 12 chars, breach-listed | v1.${i} |\n| region | ISO-3166 alpha-2 | v1.${i} |`,
      '```typescript\n' + codeBlock(i) + '\n```'
    )
  }
  return parts.join('\n\n')
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

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

async function click(win: BrowserWindow, selector: string): Promise<boolean> {
  return win.webContents.executeJavaScript(
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (el instanceof HTMLElement) {
        el.click()
        return true
      }
      return false
    })()`
  )
}

export function startPerfIfEnabled(getWindow: () => BrowserWindow | null): void {
  if (!perfEnabled()) return
  void (async () => {
    try {
      const win = await waitForWindow(getWindow)
      if (!win) throw new Error('perf harness: no window')

      // Replay the large markdown answer through the structured-history path
      // (same AnswerBlock → Markdown rendering the live transcript uses).
      const mdPath = bigMarkdownPath()
      mkdirSync(path.dirname(mdPath), { recursive: true })
      writeFileSync(mdPath, bigMarkdown(sections()))
      emitContractEvent({
        type: 'session_created',
        sessionId: 'perf-session',
        cwd: path.dirname(mdPath),
        model: 'claude-opus-4-5',
        resumed: true
      })
      emitContractEvent({
        type: 'history_loaded',
        items: [
          {
            role: 'user',
            id: 'perf-u1',
            text: 'Harden the register endpoint and document the guard chain.',
            timestamp: '2026-09-02T09:00:00.000Z',
            skillName: null
          },
          {
            role: 'assistant',
            id: 'perf-a1',
            timestamp: '2026-09-02T09:00:20.000Z',
            text: '',
            parts: [{ kind: 'text', text: bigMarkdown(sections()) }]
          }
        ]
      })

      // Side panel open, then the big markdown file deep-linked through the
      // SAME tool-card chip path a human clicks (ticket 07) — the Preview tab
      // renders it in rendered mode and exposes `.preview-body` + the panel
      // resizer for the scroll-preview / drag scenarios.
      emitContractEvent({
        type: 'tool_start',
        toolCallId: 'tc-perf-md',
        name: 'write',
        args: { path: mdPath, content: '…' }
      })
      emitContractEvent({ type: 'tool_end', toolCallId: 'tc-perf-md', output: 'Wrote', isError: false })
      if (!(await click(win, 'button[aria-label="Open side panel"]'))) throw new Error('perf harness: no side panel toggle')
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
      if (!(await click(win, '.tool-card-preview-link'))) throw new Error('perf harness: no preview deep link')
      await sleep(700)

      // Bottom dock open showing the BRIDGE panel (read-only, no pty) —
      // exposes `.terminal-dock-resizer` without shell-output noise.
      if (!(await click(win, 'button[aria-label="Toggle agent bridge"]'))) throw new Error('perf harness: no bridge toggle')
      await sleep(300)

      // Render gate: the big markdown must be fully mounted before profiling.
      const expected = sections()
      for (let waited = 0; waited < 30_000; waited += 200) {
        const sig = (await win.webContents.executeJavaScript(
          `(() => ({
            cards: document.querySelectorAll('.md-code-card').length,
            tables: document.querySelectorAll('.md-table-wrap').length,
            panel: document.querySelector('.side-panel') !== null,
            dock: document.querySelector('.terminal-dock') !== null,
            previewMd: document.querySelector('.preview-body .preview-md') !== null
          }))()`
        )) as { cards: number; tables: number; panel: boolean; dock: boolean; previewMd: boolean }
        if (sig.cards >= expected && sig.tables >= expected && sig.panel && sig.dock && sig.previewMd) {
          console.log(`PERF gate: ${JSON.stringify(sig)} sections=${expected}`)
          break
        }
        await sleep(200)
        if (waited >= 28_000) throw new Error(`perf harness: render gate never passed ${JSON.stringify(sig)}`)
      }
      await sleep(500)
      await win.webContents.executeJavaScript(`document.body.dataset['perfReady'] = '1'`)
      console.log('PERF ready')
    } catch (err) {
      console.error('PERF FAIL', err)
      app.exit(1)
    }
  })()
}
