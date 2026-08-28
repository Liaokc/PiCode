/**
 * CLI: scan Pi session jsonl files and print the usage aggregation.
 *
 *   node scripts/usage-scan.ts [--dir <sessionsDir>] [--file <one.jsonl>] [--json] [--range 7|30]
 *
 * Defaults to ~/.pi/agent/sessions. `--json` prints the full Seam-2 snapshot.
 * Used for eyeballing numbers against real history (ticket 09 acceptance).
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { UsageStore } from '../src/main/usage/store.ts'
import { buildUsageSnapshot, foldSessionFile, trendView } from '../src/shared/usage/aggregate.ts'
import type { UsageSnapshot } from '../src/shared/usage/aggregate.ts'

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const has = (flag: string): boolean => process.argv.includes(flag)

async function main(): Promise<void> {
  const range = (arg('--range') === '30' ? 30 : 7) as 7 | 30
  let snapshot: UsageSnapshot

  const oneFile = arg('--file')
  if (oneFile) {
    const text = await readFile(oneFile, 'utf8')
    // UTC for reproducible cross-checks against jq (whole-store scans use the system zone)
    snapshot = buildUsageSnapshot([foldSessionFile(text, { timeZone: 'UTC' })], { timeZone: 'UTC' })
  } else {
    const sessionsDir = arg('--dir') ?? join(homedir(), '.pi', 'agent', 'sessions')
    const store = new UsageStore({ sessionsDir })
    snapshot = await store.scan()
  }

  if (has('--json')) {
    console.log(JSON.stringify(snapshot, null, 2))
    return
  }

  const nf = new Intl.NumberFormat('en-US')
  const fmtCost = (usd: number): string => `$${usd.toFixed(4)}`
  const fmtDuration = (ms: number): string => {
    const mins = Math.round(ms / 60_000)
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  console.log('=== PiCode usage snapshot ===')
  console.log(`generated at     : ${snapshot.generatedAt} (${snapshot.timeZone})`)
  console.log('--- headline cards ---')
  console.log(`total tokens     : ${nf.format(snapshot.totalTokens)}`)
  console.log(`peak day         : ${snapshot.peakDay ? `${snapshot.peakDay.date} (${nf.format(snapshot.peakDay.tokens)})` : '—'}`)
  console.log(`longest chat day : ${snapshot.longestChatDay ? `${snapshot.longestChatDay.date} (${fmtDuration(snapshot.longestChatDay.durationMs)})` : '—'}`)
  console.log(`current streak   : ${snapshot.currentStreak ? `${snapshot.currentStreak.days} day(s)` : '0 days'}`)
  console.log(`longest streak   : ${snapshot.longestStreak ? `${snapshot.longestStreak.days} day(s)` : '0 days'}`)
  console.log(`estimated cost   : ${fmtCost(snapshot.totalCost.amountUsd)} (estimated)`)
  console.log('--- coverage ---')
  console.log(`sessions         : ${snapshot.sessionCount}`)
  console.log(`usage events     : ${snapshot.usageEventCount}`)
  console.log(`active days      : ${snapshot.activeDayCount}`)
  console.log(`daily span       : ${snapshot.daily.length} day rows (${snapshot.daily[0]?.date ?? '—'} → ${snapshot.daily.at(-1)?.date ?? '—'})`)
  console.log(`heatmap cells    : daily=${snapshot.heatmap.daily.length} weekly=${snapshot.heatmap.weekly.length} cumulative=${snapshot.heatmap.cumulative.length}`)
  console.log('--- model share ---')
  for (const slice of snapshot.modelTotals) {
    console.log(
      `${slice.model.padEnd(40)} ${nf.format(slice.tokens).padStart(14)} tokens  ${(slice.share * 100).toFixed(1).padStart(5)}%  ${fmtCost(slice.cost.amountUsd)} (estimated)`
    )
  }
  console.log(`--- ${range}-day trend (tokens per model per day) ---`)
  const trend = trendView(snapshot, range)
  console.log(trend.dates.join('\t'))
  for (const series of trend.series) {
    console.log(`${series.model}: ${series.tokens.join('\t')}`)
  }
  console.log('--- drill-down sample (session × day, first 10) ---')
  for (const row of snapshot.sessionDays.slice(0, 10)) {
    console.log(`${row.date}  ${row.sessionId ?? '(no id)'}  ${nf.format(row.tokens)} tokens  ${fmtCost(row.cost.amountUsd)} (estimated)`)
  }
  if (snapshot.sessionDays.length > 10) console.log(`… and ${snapshot.sessionDays.length - 10} more rows`)
}

main().catch((err) => {
  console.error('usage-scan failed:', err)
  process.exit(1)
})
