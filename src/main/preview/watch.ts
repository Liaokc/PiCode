/**
 * Preview watch service (main process, ticket 107): the sidebar file
 * browser's real-time refresh. While the browser is open, ONE recursive
 * fs.watch over the browsed cwd turns disk changes into coalesced
 * invalidation events pushed to the renderer (additive Electron IPC,
 * `preview:watch-changed` — never the Seam-1 contract stream, ADR-0002/0003).
 *
 * The event is a HINT, not data: the renderer re-reads affected listings
 * through the existing preview channel, so the tree's only truth stays the
 * read path. Coalescing exists to survive event storms (.git churn, builds,
 * node_modules) — one debounced event per quiet window, directory-level
 * deduped, with an overflow flag when the window's change set can no longer
 * be bounded (the renderer then re-reads every loaded listing).
 *
 * No Electron imports here: the watcher is an injected factory and the sink
 * an injected callback, so the service unit-tests with a spy factory.
 */

import { watch, type FSWatcher } from 'node:fs'
import type { PreviewWatchEvent } from '../../shared/preview/types'

/** Quiet-window length before a burst flushes as one event. Short enough to
 * feel immediate, long enough to swallow same-tick write bursts. */
export const PREVIEW_WATCH_DEBOUNCE_MS = 200

/** Maximum time a window can be held open by CONTINUOUS events (builds,
 * installs): the flush fires at latest this long after the window's first
 * event, so a sustained storm delivers at a bounded cadence instead of
 * starving the debounce forever (the tree must never freeze mid-build). */
export const PREVIEW_WATCH_MAX_HOLD_MS = 1000

/** Raw changes buffered per window before the event degrades to overflow. */
export const PREVIEW_WATCH_EVENT_CAP = 200

/** Distinct directories deliverable per event; beyond this the renderer is
 * told "everything changed" instead of a boundless list. */
export const PREVIEW_WATCH_DIR_CAP = 40

/** One live recursive watcher. */
export interface PreviewWatchHandle {
  close(): void
}

/** Opens the recursive watcher for one cwd. `onChange` delivers the changed
 * path relative to the cwd (null = the platform did not name it — an
 * unspecified change); `onError` reports the watcher dying (e.g. the cwd
 * vanished). Both are invoked from fs event turns — never after close. */
export type PreviewWatchFactory = (
  cwd: string,
  onChange: (relativePath: string | null) => void,
  onError: () => void
) => PreviewWatchHandle

export interface PreviewWatchSink {
  onWatchEvent(event: PreviewWatchEvent): void
}

/** Platform-normalized parent directory ('' = the root itself) of one
 * watched change. The listing that contains the changed entry is the one
 * whose rows can differ, so it is the one that must re-read. Windows
 * watchers report backslash separators; the tree's paths are posix. */
export function parentDirOf(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  return slash === -1 ? '' : normalized.slice(0, slash)
}

/** The REAL watcher: node:fs recursive watch (FSEvents on macOS, the app's
 * platform). A synchronous open failure (bad args, vanished cwd) routes to
 * the error path instead of throwing into the caller's turn. */
export function fsPreviewWatchFactory(cwd: string, onChange: (relativePath: string | null) => void, onError: () => void): PreviewWatchHandle {
  let watcher: FSWatcher
  try {
    watcher = watch(cwd, { recursive: true }, (_eventType, filename) => {
      // Default utf8 encoding: filename is string | null (null = the platform
      // did not name the change — an unspecified change).
      onChange(filename)
    })
  } catch {
    onError()
    return { close: () => {} }
  }
  watcher.on('error', onError)
  return {
    close: () => {
      watcher.close()
    }
  }
}

export class PreviewWatchService {
  private handle: PreviewWatchHandle | null = null
  private activeCwd: string | null = null
  /** The open coalescing window (null = quiet). */
  private window: {
    /** Distinct parent dirs changed so far (sorted on flush for
     * deterministic payloads). */
    dirs: Set<string>
    /** Raw events buffered — the storm meter. */
    count: number
    /** An unnamed change (or a cap breach) was seen. */
    sawUnnamedChange: boolean
    /** Monotonic start of the window (max-hold clock). */
    startedAt: number
  } | null = null
  private timer: NodeJS.Timeout | null = null
  /** Monotonic epoch: every start/close bumps it; buffered callbacks from a
   * dead epoch are dropped, so a stale watcher can never emit. */
  private generation = 0

  constructor(
    private readonly factory: PreviewWatchFactory,
    private readonly sink: PreviewWatchSink,
    private readonly debounceMs: number = PREVIEW_WATCH_DEBOUNCE_MS,
    private readonly maxHoldMs: number = PREVIEW_WATCH_MAX_HOLD_MS
  ) {}

  /** Watch one cwd. The browser is a sidebar singleton, so the service holds
   * at most one watcher: same-cwd starts are no-ops (StrictMode double-mount),
   * a different cwd replaces the previous watcher. */
  start(cwd: string): void {
    if (this.activeCwd === cwd) return
    this.closeActive()
    const generation = ++this.generation
    this.activeCwd = cwd
    this.handle = this.factory(
      cwd,
      (relativePath) => this.record(generation, relativePath),
      () => this.fail(generation)
    )
  }

  /** Stop watching (browser Back / unmount). Cancelled windows never flush. */
  stop(): void {
    this.closeActive()
  }

  private closeActive(): void {
    this.generation++
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.resetWindow()
    this.handle?.close()
    this.handle = null
    this.activeCwd = null
  }

  private resetWindow(): void {
    this.window = null
  }

  private record(generation: number, relativePath: string | null): void {
    if (generation !== this.generation || this.activeCwd === null) return
    if (this.window === null) {
      this.window = { dirs: new Set(), count: 0, sawUnnamedChange: false, startedAt: Date.now() }
    }
    const win = this.window
    if (relativePath === null || relativePath === '') {
      win.sawUnnamedChange = true
    } else {
      win.dirs.add(parentDirOf(relativePath))
      win.count++
      if (win.count > PREVIEW_WATCH_EVENT_CAP) win.sawUnnamedChange = true
    }
    // Trailing debounce: each event re-arms the quiet timer — EXCEPT when
    // this window has been held open past the max-hold bound by CONTINUOUS
    // events (a long build would otherwise starve the flush forever and
    // freeze the tree until the noise stops): flush now at the bounded
    // cadence instead.
    if (this.timer !== null) clearTimeout(this.timer)
    if (Date.now() - win.startedAt >= this.maxHoldMs) {
      this.timer = null
      this.flush(generation)
      return
    }
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush(generation)
    }, this.debounceMs)
  }

  private flush(generation: number): void {
    if (generation !== this.generation || this.activeCwd === null) return
    const win = this.window
    if (win === null) return
    const cwd = this.activeCwd
    const dirs = [...win.dirs].sort()
    const overflow = win.sawUnnamedChange || dirs.length > PREVIEW_WATCH_DIR_CAP
    this.resetWindow()
    this.sink.onWatchEvent({ cwd, dirs: overflow ? [] : dirs, overflow })
  }

  /** The watcher died (cwd deleted, descriptor exhaustion). Close cleanly —
   * no re-watch loop; the browser's read failures surface the truth, and the
   * next mount starts a fresh watcher. */
  private fail(generation: number): void {
    if (generation !== this.generation) return
    this.closeActive()
  }
}
