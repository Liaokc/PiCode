/**
 * Session index + Live Follow tail (main process). Reads the shared Pi session
 * store (the same jsonl files the TUI writes, ADR-0002) WITHOUT ever writing
 * through this path — the only write here is the rename write-back, which
 * appends a `session_info` entry exactly as the SDK would (pure helper in
 * shared/sessions/parse).
 *
 * Incremental scanning mirrors the usage store: per-file mtime cache, parse
 * only what changed. A poll timer drives both the sidebar index-changed
 * signal and the followed-file tail pushes.
 */
import { appendFile, open, readFile, readdir, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  extractTranscriptItems,
  leafIdOf,
  makeSessionInfoLine,
  parseSessionLines,
  summarizeSession
} from '../../shared/sessions/parse'
import type { FollowUpdate, SessionSummary, TranscriptItem } from '../../shared/sessions/types'

export type { FollowUpdate }

export interface SessionIndexOptions {
  sessionsDir: string
  onIndexChanged: () => void
  onFollowUpdate?: (update: FollowUpdate) => void
  /** Poll interval; defaults to 2s. */
  pollMs?: number
}

interface CacheState {
  mtimeMs: number
  size: number
  summary: SessionSummary
}

interface FollowState {
  file: string
  /** Byte offset just past the last newline consumed. */
  consumedBytes: number
}

const MAX_WALK_DEPTH = 3

export class SessionIndexService {
  private readonly opts: SessionIndexOptions
  private readonly cache = new Map<string, CacheState>()
  private follow: FollowState | null = null
  private timer: NodeJS.Timeout | null = null
  private scanning = false

  constructor(opts: SessionIndexOptions) {
    this.opts = opts
  }

  /** All sessions across all project dirs, unchanged files served from cache. */
  async list(): Promise<SessionSummary[]> {
    const paths = await this.listSessionFiles()
    const known = new Set(paths)
    for (const file of paths) await this.refreshFile(file)
    for (const file of [...this.cache.keys()]) {
      if (!known.has(file)) this.cache.delete(file)
    }
    return [...this.cache.values()].map((state) => state.summary).sort((a, b) => b.modifiedAt - a.modifiedAt)
  }

  /**
   * Rename write-back for NON-active sessions: append a `session_info` entry
   * chained to the file's current leaf (the active session is renamed through
   * its host process instead, so the host's in-memory leaf stays consistent).
   * Returns the refreshed summary, or null when the file is unreadable.
   */
  async renameSession(file: string, name: string): Promise<SessionSummary | null> {
    let text: string
    try {
      text = await readFileText(file)
    } catch {
      return null
    }
    const { entries } = parseSessionLines(text)
    const parentId = leafIdOf(entries)
    const existingIds = new Set(entries.map((e) => e.id))
    let id = randomUUID().slice(0, 8)
    while (existingIds.has(id)) id = randomUUID().slice(0, 8)
    // Guard against appending onto a half-written tail line (would corrupt it).
    const separator = text === '' || text.endsWith('\n') ? '' : '\n'
    await appendFile(file, separator + makeSessionInfoLine({ id, parentId, name, timestamp: new Date().toISOString() }))
    // Cache is stale by one mtime — refresh eagerly so callers can use it.
    this.cache.delete(file)
    await this.refreshFile(file)
    return this.cache.get(file)?.summary ?? null
  }

  /** Begin tailing a session file for Live Follow. The tail starts at the
   * CURRENT file size — the snapshot covers everything before it, so the two
   * never overlap. */
  async startFollowing(file: string): Promise<void> {
    let size = 0
    try {
      size = (await stat(file)).size
    } catch {
      // unreadable: tail starts at 0 and picks up when the file appears
    }
    this.follow = { file, consumedBytes: size }
  }

  stopFollowing(): void {
    this.follow = null
  }

  /** One-shot transcript read for a file (used before/without tailing). */
  async followSnapshot(file?: string): Promise<{ file: string; items: TranscriptItem[] } | null> {
    const target = file ?? this.follow?.file
    if (!target) return null
    let text: string
    try {
      text = await readFileText(target)
    } catch {
      return null
    }
    const { entries } = parseSessionLines(text)
    if (this.follow?.file === target) {
      // Keep the tail offset in sync with the full read.
      this.follow.consumedBytes = Buffer.byteLength(text)
    }
    return { file: target, items: extractTranscriptItems(entries) }
  }

  start(intervalMs?: number): void {
    this.stop()
    this.timer = setInterval(() => void this.tick(), intervalMs ?? this.opts.pollMs ?? 2_000)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async tick(): Promise<void> {
    if (this.scanning) return
    this.scanning = true
    try {
      const before = this.cacheSignature()
      await this.list()
      if (this.cacheSignature() !== before) this.opts.onIndexChanged()
      await this.pollFollow()
    } finally {
      this.scanning = false
    }
  }

  private cacheSignature(): string {
    let signature = ''
    for (const [file, state] of [...this.cache.entries()].sort()) {
      signature += `${file}:${state.mtimeMs}:${state.size};`
    }
    return signature
  }

  /** Deliver any newly appended transcript items for the followed file. */
  private async pollFollow(): Promise<void> {
    const follow = this.follow
    if (!follow) return
    let size: number
    try {
      size = (await stat(follow.file)).size
    } catch {
      return
    }
    if (size === follow.consumedBytes) return
    if (size < follow.consumedBytes) {
      // Rewritten/truncated: restart the tail from scratch with a full snapshot.
      follow.consumedBytes = 0
    }
    const chunk = await this.readRange(follow.file, follow.consumedBytes, size)
    if (!chunk || chunk.endOffset === follow.consumedBytes) return
    follow.consumedBytes = chunk.endOffset
    const { entries } = parseSessionLines(chunk.text)
    const items = extractTranscriptItems(entries)
    if (items.length > 0) this.opts.onFollowUpdate?.({ file: follow.file, items })
  }

  private async listSessionFiles(): Promise<string[]> {
    const found: string[] = []
    const walk = async (dir: string, depth: number): Promise<void> => {
      let dirEntries
      try {
        dirEntries = await readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of dirEntries) {
        const p = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (depth < MAX_WALK_DEPTH) await walk(p, depth + 1)
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          found.push(p)
        }
      }
    }
    await walk(this.opts.sessionsDir, 0)
    return found.sort()
  }

  private async refreshFile(file: string): Promise<void> {
    let stats
    try {
      stats = await stat(file)
    } catch {
      this.cache.delete(file)
      return
    }
    const cached = this.cache.get(file)
    const mtimeMs = Math.round(stats.mtimeMs)
    if (cached && cached.mtimeMs === mtimeMs && cached.size === stats.size) return

    const text = await readFileText(file).catch(() => null)
    if (text === null) {
      this.cache.delete(file)
      return
    }
    const summary = summarizeSession(text, file, mtimeMs)
    if (!summary) return // not a session file (e.g. leftover temp)
    this.cache.set(file, { mtimeMs, size: stats.size, summary })
  }

  /** Read [from, to) clipped to the last newline (never a half-written tail). */
  private async readRange(file: string, from: number, to: number): Promise<{ text: string; endOffset: number } | null> {
    let fh
    try {
      fh = await open(file, 'r')
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
}

async function readFileText(file: string): Promise<string> {
  return readFile(file, 'utf8')
}
