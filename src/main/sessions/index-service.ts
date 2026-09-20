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
} from '../../shared/sessions/parse.ts'
import { withCwdMissing } from '../../shared/sessions/cwd-liveness.ts'
import { buildTracePayload, type TracePayload } from '../../shared/sessions/trace.ts'
import { parseTranscriptSourceEnvelope } from '../../shared/subagents/artifact.ts'
import type { SubagentTranscriptPayload } from '../../shared/subagents/chat-model.ts'
import type { FollowUpdate, SessionSummary, TranscriptItem } from '../../shared/sessions/types'
import { readFileSync } from 'node:fs'

export type { FollowUpdate }

export interface SessionIndexOptions {
  sessionsDir: string
  onIndexChanged: () => void
  onFollowUpdate?: (update: FollowUpdate) => void
  /** Live-follow push for call-trace tabs (ticket 37): the rebuilt payload
   * after the traced file changed size. */
  onTraceUpdate?: (payload: TracePayload) => void
  /** Live-follow push for subagent conversation tabs (ticket 99): the
   * rebuilt transcript snapshot after the run's artifact / child session
   * file changed. */
  onSubagentTranscriptUpdate?: (payload: SubagentTranscriptPayload) => void
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
  /** Live-follow tails of call-trace tabs (ticket 37), file → last seen
   * size. Unlike the transcript tail, the trace payload is a pure function
   * of the WHOLE file — so each tail only tracks the size and re-derives
   * the full payload on any change (growth OR shrink/rewrite). Several
   * trace tabs can tail at once — one slot each. */
  private readonly traceFollows = new Map<string, number>()
  /** Live-follow tails of subagent conversation tabs (ticket 99), asyncDir
   * → the last seen source (artifact resolution + child file size). The
   * artifact is re-resolved on every tick: a run whose status.json appears
   * late (or whose child file only materializes after the artifact) still
   * lands — the follow never gives up while the tab is open. */
  private readonly subagentFollows = new Map<string, { sessionFile: string | null; error: string | null; size: number }>
  private timer: NodeJS.Timeout | null = null
  private scanning = false
  /** Last scan's injected stat results (cwd → is a live directory) — part
   * of the index-changed signature so a directory appearing/vanishing fires
   * onIndexChanged even when no session file changed. */
  private cwdAlive = new Map<string, boolean>()

  constructor(opts: SessionIndexOptions) {
    this.opts = opts
  }

  /** All sessions across all project dirs, unchanged files served from cache.
   * cwd-liveness annotated (ticket 54): every session stays listed; one whose
   * working directory is gone carries `cwdMissing: true` (the gray-row/banner
   * fact — resume must never target it, the host would exit(1)). The flag is
   * applied at LIST time, not in the cache: the cached summaries keep their
   * pre-54 shape and the flag always reflects the CURRENT scan. Session
   * files are never touched by any of this. */
  async list(): Promise<SessionSummary[]> {
    const paths = await this.listSessionFiles()
    const known = new Set(paths)
    for (const file of paths) await this.refreshFile(file)
    for (const file of [...this.cache.keys()]) {
      if (!known.has(file)) this.cache.delete(file)
    }
    const all = [...this.cache.values()].map((state) => state.summary).sort((a, b) => b.modifiedAt - a.modifiedAt)
    this.cwdAlive = await this.statCwds(all)
    return withCwdMissing(all, (cwd) => this.cwdAlive.get(cwd) === true)
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

  /** One-shot call-trace read for a file (ticket 36): read-only, works for
   * ANY session — TUI sessions included, no host process involved. The
   * payload build is the shared pure builder; unreadable files return null
   * and the tab shows its error state. */
  async trace(file: string): Promise<TracePayload | null> {
    let text: string
    try {
      text = await readFileText(file)
    } catch {
      return null
    }
    return buildTracePayload(text, file)
  }

  /** Begin tailing a session file for a call-trace tab (ticket 37): returns
   * the initial payload and records the file's current size as the growth
   * baseline (FollowView convention — snapshot and tail never overlap). An
   * unreadable file returns null but still registers the tail, so the push
   * picks the file up once it appears. */
  async startTraceFollowing(file: string): Promise<TracePayload | null> {
    let text: string | null = null
    try {
      text = await readFileText(file)
    } catch {
      this.traceFollows.set(file, 0)
      return null
    }
    this.traceFollows.set(file, Buffer.byteLength(text))
    return buildTracePayload(text, file)
  }

  /** End one trace tab's tail. Tabs tail independently — stopping one
   * never touches the others. */
  stopTraceFollowing(file: string): void {
    this.traceFollows.delete(file)
  }

  /**
   * One subagent conversation tab's transcript snapshot (ticket 99):
   * resolve the run's child session file from its status.json artifact and
   * read the transcript through the same parser every session surface
   * uses. Also registers the live tail (re-resolved every tick — a
   * late-arriving artifact still lands). Error states are honest payload
   * members, never thrown.
   */
  async startSubagentTranscriptFollowing(asyncDir: string): Promise<SubagentTranscriptPayload | null> {
    this.subagentFollows.set(asyncDir, { sessionFile: null, error: null, size: 0 })
    return this.readSubagentTranscript(asyncDir)
  }

  /** One-shot read for a settled run (follow: false) — no tail registered. */
  async subagentTranscriptOnce(asyncDir: string): Promise<SubagentTranscriptPayload | null> {
    return this.readSubagentTranscript(asyncDir)
  }

  /** End one conversation tab's tail. Tabs tail independently. */
  stopSubagentTranscriptFollowing(asyncDir: string): void {
    this.subagentFollows.delete(asyncDir)
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
      await this.pollTraceFollow()
      await this.pollSubagentFollows()
    } finally {
      this.scanning = false
    }
  }

  private cacheSignature(): string {
    let signature = ''
    for (const [file, state] of [...this.cache.entries()].sort()) {
      signature += `${file}:${state.mtimeMs}:${state.size};`
    }
    // cwd liveness is part of the index's identity (ticket 42): a directory
    // appearing/vanishing must fire onIndexChanged even when no session file
    // changed — the flip is what flips the cwdMissing flags downstream.
    for (const [cwd, alive] of [...this.cwdAlive.entries()].sort()) {
      signature += `${cwd}:${alive ? '1' : '0'};`
    }
    return signature
  }

  /** One injected stat per unique cwd (deduped — many sessions share a
   * project). A cwd counts as alive only when it is a DIRECTORY on disk. */
  private async statCwds(sessions: readonly SessionSummary[]): Promise<Map<string, boolean>> {
    const unique = new Set(sessions.map((session) => session.cwd))
    const entries = await Promise.all([...unique].map(async (cwd) => [cwd, await directoryExists(cwd)] as const))
    return new Map(entries)
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

  /** Re-derive + push the payload of every tailed trace file whose size
   * changed since the last push (ticket 37). The full rebuild is the
   * correct answer to growth AND to shrink/rewrite alike, and appends are
   * the only realistic change at the 2s poll cadence. */
  private async pollTraceFollow(): Promise<void> {
    for (const [file, seenBytes] of [...this.traceFollows]) {
      let size: number
      try {
        size = (await stat(file)).size
      } catch {
        continue
      }
      if (size === seenBytes) continue
      const text = await readFileText(file).catch(() => null)
      if (text === null) continue // transient read error — retry next tick
      this.traceFollows.set(file, size)
      const payload = buildTracePayload(text, file)
      if (payload !== null) this.opts.onTraceUpdate?.(payload)
    }
  }

  /**
   * Re-resolve + push every tailed subagent run (ticket 99). Three change
   * classes push: the artifact resolved differently (late artifact), the
   * resolved error changed, or the child file grew. The read + parse is
   * the same full-snapshot rebuild the trace tail uses.
   */
  private async pollSubagentFollows(): Promise<void> {
    for (const asyncDir of [...this.subagentFollows.keys()]) {
      const seen = this.subagentFollows.get(asyncDir)
      if (seen === undefined) continue
      const payload = await this.readSubagentTranscript(asyncDir)
      if (payload === null) continue
      const size =
        payload.sessionFile !== null ? await stat(payload.sessionFile).then((s) => s.size).catch(() => 0) : 0
      const changed =
        payload.sessionFile !== seen.sessionFile || (payload.error ?? null) !== seen.error || size !== seen.size
      if (!changed) continue
      this.subagentFollows.set(asyncDir, { sessionFile: payload.sessionFile, error: payload.error, size })
      this.opts.onSubagentTranscriptUpdate?.(payload)
    }
  }

  /** One run's transcript source, read from disk: status.json → the
   * shared envelope table. Null for absent/corrupt artifacts — the honest
   * artifact-missing error, never a fabricated source. */
  private readTranscriptSource(asyncDir: string): { sessionFile: string | null; state: string } | null {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(join(asyncDir, 'status.json'), 'utf8'))
    } catch {
      return null
    }
    return parseTranscriptSourceEnvelope(raw)
  }

  /** One run's transcript snapshot: artifact → child session file → parsed
   * items. Every failure is an honest error payload, never a throw. */
  private async readSubagentTranscript(asyncDir: string): Promise<SubagentTranscriptPayload | null> {
    const source = this.readTranscriptSource(asyncDir)
    if (source === null) {
      return { asyncDir, sessionFile: null, items: [], error: 'artifact-missing' }
    }
    if (source.sessionFile === null) {
      return { asyncDir, sessionFile: null, items: [], error: 'no-session-file' }
    }
    const text = await readFileText(source.sessionFile).catch(() => null)
    if (text === null) {
      return { asyncDir, sessionFile: source.sessionFile, items: [], error: 'unreadable' }
    }
    const { entries } = parseSessionLines(text)
    return { asyncDir, sessionFile: source.sessionFile, items: extractTranscriptItems(entries), error: null }
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
    const summary = summarizeSession(
      text,
      file,
      mtimeMs,
      // Ticket 33: creation sort source — file birthtime when the platform
      // reports one (0 = no birthtime support → the summary degrades to null
      // and the sort falls back to the header timestamp).
      stats.birthtimeMs > 0 ? Math.round(stats.birthtimeMs) : null
    )
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

/** The ticket-42 liveness fact: the cwd must be a directory on disk (a file
 * at the path cannot host a session either). Any stat failure reads as dead. */
async function directoryExists(cwd: string): Promise<boolean> {
  try {
    return (await stat(cwd)).isDirectory()
  } catch {
    return false
  }
}
