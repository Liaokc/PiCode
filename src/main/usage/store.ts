/**
 * Incremental usage store (main process). Scans the Pi sessions directory for
 * session jsonl files and keeps one folded aggregate per file.
 *
 * Incrementality (ADR-0002: session files are append-only):
 * - Each tracked file remembers the byte offset just past its last fully
 *   consumed newline. Rescans read only the tail bytes; a trailing half line
 *   stays unconsumed until a newline completes it.
 * - A file that shrank below the consumed offset (rewrite/truncation) is folded
 *   again from byte zero.
 * - Files that vanished are dropped from the fold.
 *
 * The global snapshot is rebuilt by recombining per-file aggregates with
 * integer sums, so repeated scans are exactly idempotent.
 */
import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { buildUsageSnapshot, foldSessionFile, mergeModelDisplay } from '../../shared/usage/aggregate.ts'
import type { SessionFileUsage, SnapshotOptions } from '../../shared/usage/aggregate.ts'

export interface UsageStoreOptions extends SnapshotOptions {
  sessionsDir: string
}

interface FileState {
  /** Byte offset just past the last consumed newline. */
  consumedBytes: number
  usage: SessionFileUsage
}

/** Result of reading a byte range clipped to complete (newline-terminated) lines. */
interface FoldChunk {
  text: string
  endOffset: number
}

export class UsageStore {
  private readonly opts: UsageStoreOptions
  private readonly states = new Map<string, FileState>()

  constructor(opts: UsageStoreOptions) {
    this.opts = opts
  }


  /** Walk the sessions dir and return a fresh chart-ready snapshot. */
  async scan(): Promise<ReturnType<typeof buildUsageSnapshot>> {
    const paths = await this.listSessionFiles()
    const known = new Set(paths)

    for (const path of paths) {
      await this.refreshFile(path)
    }
    for (const path of [...this.states.keys()]) {
      if (!known.has(path)) this.states.delete(path)
    }

    return buildUsageSnapshot([...this.states.values()].map((s) => s.usage), this.opts)
  }

  private async listSessionFiles(): Promise<string[]> {
    const found: string[] = []
    const walk = async (dir: string, depth: number): Promise<void> => {
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return // missing/unreadable dir — nothing to scan
      }
      for (const entry of entries) {
        const p = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (depth < 8) await walk(p, depth + 1)
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          found.push(p)
        }
      }
    }
    await walk(this.opts.sessionsDir, 0)
    return found.sort()
  }

  /**
   * Read [from, to) and clip to the last newline so offsets never land mid-line.
   * Returns null when the file is unreadable.
   */
  private async foldRange(path: string, from: number, to: number): Promise<FoldChunk | null> {
    let fh
    try {
      fh = await open(path, 'r')
    } catch {
      return null
    }
    try {
      const len = to - from
      if (len <= 0) return { text: '', endOffset: from }
      const buf = Buffer.alloc(len)
      const { bytesRead } = await fh.read(buf, 0, len, from)
      const slice = buf.subarray(0, bytesRead)
      const lastNewline = slice.lastIndexOf(0x0a)
      const end = lastNewline === -1 ? from : from + lastNewline + 1
      return { text: slice.subarray(0, end - from).toString('utf8'), endOffset: end }
    } finally {
      await fh.close()
    }
  }

  private async refreshFile(path: string): Promise<void> {
    let size: number
    try {
      size = (await stat(path)).size
    } catch {
      this.states.delete(path)
      return
    }

    const state = this.states.get(path)
    if (state && size === state.consumedBytes) return // unchanged since last scan

    if (!state || size < state.consumedBytes) {
      // new file — or rewritten/truncated smaller: fold from scratch
      const chunk = await this.foldRange(path, 0, size)
      if (!chunk) return
      this.states.set(path, {
        consumedBytes: chunk.endOffset,
        usage: foldSessionFile(chunk.text, this.opts)
      })
      return
    }

    // incremental: fold only the newly completed lines and merge them in
    const chunk = await this.foldRange(path, state.consumedBytes, size)
    if (!chunk || chunk.endOffset === state.consumedBytes) return
    this.mergeFold(state.usage, foldSessionFile(chunk.text, this.opts))
    state.consumedBytes = chunk.endOffset
  }

  /** Merge an incremental fold into a file's existing aggregate (integer sums only). */
  private mergeFold(target: SessionFileUsage, delta: SessionFileUsage): void {
    if (delta.header) target.header = delta.header
    target.eventCount += delta.eventCount
    target.skippedLines += delta.skippedLines
    // a chunk never contains a pending tail (offsets stop at newlines)
    target.pendingTail = false

    for (const [date, byModel] of delta.days) {
      let dayCells = target.days.get(date)
      if (!dayCells) {
        dayCells = new Map()
        target.days.set(date, dayCells)
      }
      for (const [model, cell] of byModel) {
        const acc = dayCells.get(model) ?? { tokens: 0, costMicros: 0, events: 0 }
        acc.tokens += cell.tokens
        acc.costMicros += cell.costMicros
        acc.events += cell.events
        dayCells.set(model, acc)
      }
    }

    mergeModelDisplay(target.modelDisplay, delta.modelDisplay)
    for (const [date, span] of delta.activity) {
      const acc = target.activity.get(date)
      if (!acc) {
        target.activity.set(date, { ...span })
      } else {
        acc.firstTs = Math.min(acc.firstTs, span.firstTs)
        acc.lastTs = Math.max(acc.lastTs, span.lastTs)
        acc.messages += span.messages
      }
    }
  }
}
