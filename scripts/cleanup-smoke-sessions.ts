/**
 * One-time cleanup for smoke-polluted session stores (ticket 13).
 *
 * Ticket 12's smoke tooling wrote its throwaway sessions into the REAL
 * ~/.pi/agent/sessions library (fixed in this ticket — smoke runs now use an
 * isolated PICODE_SESSION_DIR store). The leftovers live in directories whose
 * names embed the smoke harnesses' temp working dirs:
 *
 *   picode-smoke-*            host-contract / interop / app smoke cwds
 *   picode-lifecycle-smoke    early session-lifecycle smoke
 *   picode-probe              host probe smoke
 *   picode-diff-e2e-*         review-tab diff e2e
 *
 * Deleting those directories removes the smoke noise (including the echoed
 * lowercase glm-5.3-flash usage) from the usage aggregation permanently.
 *
 * DRY RUN IS THE DEFAULT: without --yes the script only PRINTS what it would
 * delete. Review the list, then re-run with --yes to actually delete.
 *
 *   node scripts/cleanup-smoke-sessions.ts            # dry run (list only)
 *   node scripts/cleanup-smoke-sessions.ts --yes      # delete
 *   node scripts/cleanup-smoke-sessions.ts --dir <sessionsDir>  # override target
 */
import { readdirSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Directory-name patterns that identify smoke-tooling session stores. */
const SMOKE_DIR_PATTERNS = [/picode-smoke-/, /picode-lifecycle-smoke/, /picode-probe/, /picode-diff-e2e-/]

/** True when a sessions-dir entry name was created by PiCode smoke tooling. */
export function isSmokeDirName(name: string): boolean {
  return SMOKE_DIR_PATTERNS.some((p) => p.test(name))
}

export interface SmokeDirReport {
  name: string
  path: string
  sessionFiles: number
  bytes: number
}

/** Scan a sessions dir for smoke-tooling subdirectories (non-recursive). */
export function findSmokeDirs(sessionsDir: string): SmokeDirReport[] {
  let entries: string[]
  try {
    entries = readdirSync(sessionsDir)
  } catch {
    return [] // no sessions dir — nothing to clean
  }
  const reports: SmokeDirReport[] = []
  for (const name of entries) {
    if (!isSmokeDirName(name)) continue
    const full = join(sessionsDir, name)
    let stats
    try {
      stats = statSync(full)
    } catch {
      continue // raced away
    }
    if (!stats.isDirectory()) continue
    let sessionFiles = 0
    let bytes = 0
    try {
      for (const entry of readdirSync(full, { recursive: true })) {
        const p = join(full, String(entry))
        const s = statSync(p)
        if (s.isFile()) {
          sessionFiles += p.endsWith('.jsonl') ? 1 : 0
          bytes += s.size
        }
      }
    } catch {
      // unreadable entries — still report the directory with what we know
    }
    reports.push({ name, path: full, sessionFiles, bytes })
  }
  return reports
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function main(): void {
  const sessionsDir = arg('--dir') ?? join(homedir(), '.pi', 'agent', 'sessions')
  const yes = process.argv.includes('--yes')
  const reports = findSmokeDirs(sessionsDir)

  if (reports.length === 0) {
    console.log(`CLEANUP: no smoke-polluted session directories found under ${sessionsDir}`)
    return
  }

  const files = reports.reduce((n, r) => n + r.sessionFiles, 0)
  const kib = Math.round(reports.reduce((n, r) => n + r.bytes, 0) / 1024)
  console.log(`CLEANUP: ${reports.length} smoke session director(y/ies), ${files} session file(s), ~${kib} KiB under ${sessionsDir}`)
  for (const r of reports) console.log(`  ${r.name}  (${r.sessionFiles} file(s))`)

  if (!yes) {
    console.log('CLEANUP: dry run — nothing deleted. Re-run with --yes to delete the directories above.')
    return
  }
  for (const r of reports) rmSync(r.path, { recursive: true, force: true })
  console.log(`CLEANUP: deleted ${reports.length} director(y/ies), ${files} session file(s) reclaimed from the usage aggregation`)
}

// Only run when invoked directly (the matcher stays importable for tests).
const invoked = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false
if (invoked) main()
