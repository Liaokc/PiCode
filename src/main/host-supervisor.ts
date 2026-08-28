/**
 * Host supervisor (main process, ADR-0003): owns the agent host child process,
 * relays the Seam-1 contract between renderer and host, and guarantees
 * lifecycle invariants — crash isolation (`host_exit` instead of a dead
 * window) and no orphaned processes on quit.
 */

import { fork, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import type { HostControlCommand, HostToParent, ParentToHost } from '../shared/contract'

const SHUTDOWN_GRACE_MS = 1500

export interface HostSupervisorOptions {
  /** Absolute path to the compiled host entry (out/main/host.js). */
  hostEntryPath: string
  onHostEvent: (event: HostToParent) => void
  /** Dev/debug logging of host stdout/stderr. */
  onHostLog?: (stream: 'stdout' | 'stderr', chunk: string) => void
}

export class HostSupervisor {
  private child: ChildProcess | null = null
  /** Child whose death is expected (deliberate replace or app quit). */
  private expectedExit: ChildProcess | null = null
  private quitting = false

  constructor(private readonly options: HostSupervisorOptions) {}

  get hostPid(): number | null {
    return this.child?.pid ?? null
  }

  /** Renderer command entry point. Unknown commands are ignored defensively. */
  handleParentCommand(message: ParentToHost): void {
    switch (message.type) {
      case 'create_session':
        this.createSession(message.cwd)
        break
      case 'resume_session':
        this.createSession(message.cwd, message.sessionFile)
        break
      case 'prompt':
      case 'abort_turn':
      case 'navigate_tree':
      case 'fork_session':
      case 'set_session_label':
      case 'request_tree':
        this.child?.send(message)
        break
    }
  }

  /**
   * One host process per session (β shape): replacing a session means
   * replacing the process. `cwd` is passed as argv[2]; an optional existing
   * session file goes as argv[3] (resume instead of create).
   */
  createSession(cwd: string, sessionFile?: string): void {
    const args = sessionFile ? [cwd, sessionFile] : [cwd]
    const previous = this.child
    if (previous) {
      this.expectedExit = previous
      this.terminateChild(previous)
    }
    const child = fork(this.options.hostEntryPath, args, {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    })
    this.child = child
    child.on('message', (message) => {
      if (typeof message === 'object' && message !== null && 'type' in message) {
        this.options.onHostEvent(message as HostToParent)
      }
    })
    child.stdout?.on('data', (chunk) => this.options.onHostLog?.('stdout', String(chunk)))
    child.stderr?.on('data', (chunk) => this.options.onHostLog?.('stderr', String(chunk)))
    child.on('exit', (code, signal) => {
      if (this.child === child) this.child = null
      // Deliberate replacement and app quit are clean; anything else the
      // renderer is alive to see is a crash it must be told about.
      const expected = this.quitting || this.expectedExit === child
      if (this.expectedExit === child) this.expectedExit = null
      // A replaced child's clean exit must NOT reach the renderer: a newer
      // session may already be installed, and host_exit would detach it
      // (rapid session switching is the norm since ticket 04). Crash exits
      // and quit-time exits always flow.
      const replaced = expected && !this.quitting
      if (!replaced) {
        this.options.onHostEvent({ type: 'host_exit', clean: expected, code, signal })
      }
    })
  }

  /** Graceful shutdown for app quit: polite request, then SIGTERM, then SIGKILL. */
  shutdownAll(): void {
    this.quitting = true
    if (this.child) this.terminateChild(this.child)
  }

  private terminateChild(child: ChildProcess): void {
    const control: HostControlCommand = { type: 'shutdown' }
    try {
      child.send(control)
    } catch {
      // Channel already gone — fall through to kill.
    }
    child.kill() // SIGTERM; Node default terminates the host.

    // If something blocks SIGTERM, SIGKILL after the grace window. The exit
    // listener clears this timer when the child dies in time.
    const forceTimer = setTimeout(() => child.kill('SIGKILL'), SHUTDOWN_GRACE_MS)
    forceTimer.unref?.()
    child.once('exit', () => clearTimeout(forceTimer))
  }
}

/** Default host entry resolution for the packaged/dev layout (out/main/host.js). */
export function defaultHostEntryPath(): string {
  return path.join(__dirname, 'host.js')
}
