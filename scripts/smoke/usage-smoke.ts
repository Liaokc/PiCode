/**
 * Usage-aggregation smoke (spec testing seam #2, ticket 12 acceptance).
 * Two layers:
 *
 *   Real store (READ-ONLY): scans ~/.pi/agent/sessions — the SAME files the
 *   pi TUI writes (ADR-0002) — and asserts the chart-ready snapshot contract:
 *   totals consistent with model shares, zero-filled daily rows covering
 *   first→today, heatmap/trend shapes, drill-down rows, estimated-cost flags.
 *   A second full scan must be byte-identical (idempotence).
 *
 *   Temp store (REAL FORMAT): seeds a throwaway sessions dir with synthetic
 *   Pi-format jsonl (session header + assistant usage entries), then proves
 *   the incremental machinery: first scan counts events, an APPENDED tail is
 *   folded incrementally (tokens add up, no double-count), a HALF-WRITTEN
 *   tail line is ignored until its newline completes, and a SHRUNK file is
 *   re-folded from scratch.
 *
 * Usage: node scripts/smoke/usage-smoke.ts   (plain node; no app, no model)
 * Exits non-zero on the first broken invariant. Progress logs as
 * `USAGE_SMOKE <step>` lines on stdout. Part of `npm run smoke`.
 */

import { join } from 'node:path'
import { mkdtemp, mkdir, rm, writeFile, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { UsageStore } from '../../src/main/usage/store.ts'
import { trendView } from '../../src/shared/usage/aggregate.ts'
import { defaultSessionsDir } from '../../src/main/usage/service.ts'

function log(step: string, detail = ''): void {
  console.log(`USAGE_SMOKE ${step}${detail ? ` ${detail}` : ''}`)
}

function fail(message: string): never {
  console.error(`USAGE_SMOKE FAIL ${message}`)
  process.exit(1)
}
const close = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) < eps

// ---------- layer 1: real shared store, strictly read-only ----------

async function realStorePass(): Promise<void> {
  const dir = defaultSessionsDir()
  const store = new UsageStore({ sessionsDir: dir })
  log('real scan start', dir)
  const snap = await store.scan()

  if (snap.sessionCount === 0) {
    // Not an error: a fresh machine has no history yet. Report and move on.
    log('real store empty — no TUI history on this machine, skipping real-data invariants')
    return
  }

  if (snap.totalTokens <= 0) fail(`real store has ${snap.sessionCount} session(s) but totalTokens=${snap.totalTokens}`)
  if (!snap.totalCost.estimated) fail('totalCost must carry estimated:true (red line: no fake precision)')
  const shareSum = snap.modelTotals.reduce((n, s) => n + s.share, 0)
  if (!close(shareSum, 1)) fail(`model shares sum to ${shareSum}, want 1`)
  const modelTokens = snap.modelTotals.reduce((n, s) => n + s.tokens, 0)
  if (modelTokens !== snap.totalTokens) fail(`modelTotals tokens ${modelTokens} != totalTokens ${snap.totalTokens}`)
  for (const slice of snap.modelTotals) {
    if (!slice.cost.estimated) fail(`model slice ${slice.model} cost not labeled estimated`)
  }
  if (snap.daily.length === 0) fail('daily rows empty despite sessions')
  for (let i = 1; i < snap.daily.length; i++) {
    if (snap.daily[i].date <= snap.daily[i - 1].date) fail(`daily rows not strictly ascending at ${snap.daily[i].date}`)
  }
  if (snap.heatmap.daily.length !== snap.daily.length) {
    fail(`heatmap daily cells ${snap.heatmap.daily.length} != daily rows ${snap.daily.length}`)
  }
  for (const range of [7, 30] as const) {
    const view = trendView(snap, range)
    if (view.dates.length !== range) fail(`trend ${range}-day view has ${view.dates.length} dates`)
  }
  if (snap.sessionDays.length === 0) fail('no drill-down rows despite sessions')
  log(
    'real snapshot ok',
    `sessions=${snap.sessionCount} days=${snap.daily.length} models=${snap.modelTotals.length} tokens=${snap.totalTokens}`
  )

  const again = await store.scan()
  // generatedAt is a fresh stamp per scan by design; the aggregation content
  // must still be byte-identical.
  const withoutStamp = (s: typeof snap): string =>
    JSON.stringify(s, (key, value) => (key === 'generatedAt' ? undefined : value))
  if (withoutStamp(again) !== withoutStamp(snap)) fail('rescan is not idempotent')
  log('real rescan idempotent')
}

// ---------- layer 2: temp store, incremental machinery on real-format files ----------

interface FixtureUsage {
  totalTokens: number
  input?: number
  output?: number
  costUsd?: number
}

function entryLine(type: string, fields: Record<string, unknown>): string {
  return `${JSON.stringify({ type, ...fields })}\n`
}

function assistantMessage(id: string, timestamp: string, model: string, usage: FixtureUsage): string {
  return entryLine('message', {
    id,
    timestamp,
    message: {
      role: 'assistant',
      model,
      content: [{ type: 'text', text: 'fixture' }],
      usage: {
        input: usage.input ?? 100,
        output: usage.output ?? 50,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: usage.totalTokens,
        cost: { total: usage.costUsd ?? 0.01 }
      }
    }
  })
}

async function tempStorePass(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'picode-usage-smoke-'))
  try {
    const projectDir = join(dir, 'proj-a')
    await mkdir(projectDir, { recursive: true })
    await writeFile(
      join(projectDir, 'session-one.jsonl'),
      entryLine('session', { id: 'usage-smoke-1', cwd: '/tmp/proj-a', timestamp: '2026-08-25T09:00:00.000Z' }) +
        entryLine('message', { id: 'm0', timestamp: '2026-08-25T09:00:05.000Z', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } }) +
        assistantMessage('m1', '2026-08-25T09:00:20.000Z', 'GLM-5.3', { totalTokens: 1000, costUsd: 0.02 }) +
        assistantMessage('m2', '2026-08-25T09:01:20.000Z', 'GLM-5.3', { totalTokens: 500, costUsd: 0.01 }),
      'utf8'
    )
    const store = new UsageStore({ sessionsDir: dir, timeZone: 'UTC', now: '2026-08-27T10:00:00.000Z' })

    const first = await store.scan()
    if (first.totalTokens !== 1500) fail(`initial fold expected 1500 tokens, got ${first.totalTokens}`)
    if (first.usageEventCount !== 2) fail(`initial fold expected 2 events, got ${first.usageEventCount}`)
    if (first.totalCost.amountUsd !== 0.03) fail(`initial cost expected 0.03, got ${first.totalCost.amountUsd}`)
    log('initial fold ok', '1500 tokens / 2 events / $0.03')

    // Append a new line (real incremental path: only the tail is read).
    await appendFile(
      join(projectDir, 'session-one.jsonl'),
      assistantMessage('m3', '2026-08-26T10:00:20.000Z', 'kimi-k3', { totalTokens: 700, costUsd: 0.005 }),
      'utf8'
    )
    const second = await store.scan()
    if (second.totalTokens !== 2200) fail(`incremental fold expected 2200 tokens, got ${second.totalTokens}`)
    if (second.usageEventCount !== 3) fail(`incremental event count expected 3, got ${second.usageEventCount}`)
    log('incremental append ok', '2200 tokens / 3 events')

    // A half-written tail must stay invisible until its newline arrives.
    const file = join(projectDir, 'session-one.jsonl')
    const fullLine = assistantMessage('m4', '2026-08-27T08:00:00.000Z', 'GLM-5.2', { totalTokens: 300 })
    const partial = fullLine.slice(0, -20)
    await appendFile(file, partial, 'utf8')
    const withTail = await store.scan()
    if (withTail.totalTokens !== 2200 || withTail.usageEventCount !== 3) {
      fail(`half-written tail leaked into the fold: ${withTail.totalTokens} tokens / ${withTail.usageEventCount} events`)
    }
    if (!withTail.sessionDays.some((r) => r.sessionId === 'usage-smoke-1')) fail('drill-down row for the fixture session missing')
    await appendFile(file, fullLine.slice(-20), 'utf8') // complete the line
    const completed = await store.scan()
    if (completed.totalTokens !== 2500) fail(`completed tail not folded: ${completed.totalTokens} tokens, want 2500`)
    log('half-written tail handled ok', 'folded only after the newline completed it')

    // A shrunken file (rewrite/truncation) re-folds from scratch.
    await writeFile(
      file,
      entryLine('session', { id: 'usage-smoke-1', cwd: '/tmp/proj-a', timestamp: '2026-08-25T09:00:00.000Z' }) +
        assistantMessage('r1', '2026-08-27T09:00:20.000Z', 'GLM-5.3', { totalTokens: 90, costUsd: 0.001 }),
      'utf8'
    )
    const shrunk = await store.scan()
    if (shrunk.totalTokens !== 90) fail(`shrunk file re-fold expected 90 tokens, got ${shrunk.totalTokens}`)
    if (shrunk.sessionCount !== 1) fail(`shrunk scan session count ${shrunk.sessionCount}, want 1`)
    log('truncate-refold ok', '90 tokens after rewrite')

    // A vanished file drops out of the fold.
    await rm(file)
    const empty = await store.scan()
    if (empty.sessionCount !== 0 || empty.totalTokens !== 0) fail('deleted file still contributes to the fold')
    log('file-removal ok')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

await realStorePass()
await tempStorePass()
console.log('USAGE_SMOKE PASS usage aggregation smoke complete (real store + incremental temp store)')
