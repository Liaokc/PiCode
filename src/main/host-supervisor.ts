/**
 * Host supervisor (main process, ADR-0003 + ADR-0006): owns agent host child
 * processes and relays the Seam-1 contract between renderer and hosts.
 *
 * Registry semantics (ticket 20, ADR-0006): one host process per session,
 * MANY hosts alive at once. Creating or resolving a session never terminates
 * another host — background sessions keep running and streaming while
 * unfocused. Every host event is tagged with its session (`session_event`)
 * so the renderer's session registry can route per session; crash isolation
 * narrows to the crashed session only. Quit still terminates every host —
 * no orphans.
 */

import { fork, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { SessionDefaults } from '../shared/preferences'
import type { HostControlCommand, HostToParent, ParentToHost, SessionScopedEvent } from '../shared/contract'
import { encodeSessionArgs } from '../host/session-args'

const SHUTDOWN_GRACE_MS = 1500

export interface HostSupervisorOptions {
  /** Absolute path to the compiled host entry (out/main/host.js). */
  hostEntryPath: string
  onHostEvent: (event: HostToParent) => void
  /** Dev/debug logging of host stdout/stderr. */
  onHostLog?: (stream: 'stdout' | 'stderr', chunk: string) => void
}

/** One live host child and its session binding. The binding id is a
 * supervisor-local provisional id from spawn until the host announces its
 * real session id — events that arrive that early (boot failures) still
 * reach the renderer scoped to SOMETHING addressable. */
interface HostBinding {
  child: ChildProcess
  sessionId: string
  /** Deliberate termination (quit, or displaced by a same-id re-announce):
   * its exit is clean and must not reach the renderer as a crash. */
  expectedExit: boolean
}

export class HostSupervisor {
  /** Spawn order preserved for the legacy un-targeted command fallback. */
  private bindings: HostBinding[] = []
  private bySession = new Map<string, HostBinding>()
  private provisionalSeq = 0
  private quitting = false

  constructor(private readonly options: HostSupervisorOptions) {}

  /** Pids of every live host, announcement order (smoke diagnostics). */
  get hostPids(): number[] {
    return this.bindings.map((b) => b.child.pid ?? 0).filter((pid) => pid > 0)
  }

  /** The most recently spawned host's pid (smoke + legacy callers). */
  get hostPid(): number | null {
    const last = this.bindings[this.bindings.length - 1]
    return last?.child.pid ?? null
  }

  /** Host pid backing one session (smoke: per-session crash isolation). */
  pidForSession(sessionId: string): number | null {
    return this.bySession.get(sessionId)?.child.pid ?? null
  }

  /** Renderer command entry point. Unknown commands are ignored defensively. */
  handleParentCommand(message: ParentToHost): void {
    switch (message.type) {
      case 'create_session':
        this.createSession(message.cwd, undefined, message.defaults)
        break
      case 'resume_session':
        this.createSession(message.cwd, message.sessionFile)
        break
      case 'session_command': {
        const binding = this.bySession.get(message.sessionId)
        if (binding === undefined) {
          // Ticket 21: `get_branch` is a pure DISPLAY read — with no live
          // host there is no workspace readout, which degrades to a null
          // branch (the badge hides) instead of an error. Synthetic
          // announcements from the visual-QA harnesses and focus switches
          // onto crashed sessions stay toast-free this way.
          if (message.command.type === 'get_branch') {
            this.emitScoped(message.sessionId, { type: 'branch_info', branch: null })
            break
          }
          // Ticket 90: `subagent_status` is a pure display read too — the
          // bridge snapshot degrades to available:false (empty runs, no
          // fleet) instead of erroring a session whose host is gone; the
          // directory replays from the session record regardless.
          if (message.command.type === 'subagent_status') {
            this.emitScoped(message.sessionId, {
              type: 'subagent_status',
              requestId: message.command.requestId,
              available: false,
              runs: [],
              fleet: null
            })
            break
          }
          // Tickets 99+101: `subagent_steer` / `subagent_stop` against a
          // hostless session degrade to honest FAILED receipts (never a
          // toast, never a hang) — the subagent surfaces render the truth:
          // this run cannot be steered/stopped because its session has no
          // live host.
          if (message.command.type === 'subagent_steer' || message.command.type === 'subagent_stop') {
            this.failSubagentReceipt(message.sessionId, message.command.type === 'subagent_stop' ? 'subagent_stop_receipt' : 'subagent_steer_receipt', message.command.requestId, message.command.asyncId)
            break
          }
          // The session has no live host (crashed, detached, or never
          // announced). Tell ITS scope so the entry can react; the renderer's
          // click routing normally prevents reaching here.
          this.emitScoped(message.sessionId, {
            type: 'session_command_error',
            message: 'This session has no live host — reopen it from the sidebar.'
          })
          break
        }
        this.send(binding, message.command)
        break
      }
      // Legacy un-targeted session commands route to the most recent host
      // (the α single-session behavior); the renderer now targets explicitly.
      case 'prompt':
      case 'steer_prompt':
      case 'follow_up_prompt':
      case 'clear_queue':
      case 'set_model':
      case 'set_thinking_level':
      case 'set_access_mode':
      case 'approve_tool':
      case 'deny_tool':
      case 'compact_session':
      case 'list_files':
      case 'get_branch':
      case 'abort_turn':
      case 'navigate_tree':
      case 'fork_session':
      case 'set_session_label':
      case 'request_tree':
        this.sendToLast(message)
        break
    }
  }

  /**
   * Spawn one more host process (β shape, registry semantics, ADR-0006):
   * existing hosts are untouched — switching sessions never kills a run.
   * `cwd` is passed as argv[2]; an optional existing session file goes as
   * argv[3] (resume instead of create); optional new-session defaults ride a
   * trailing sentinel argument (ticket 11).
   */
  createSession(cwd: string, sessionFile?: string, defaults?: SessionDefaults): void {
    const args = encodeSessionArgs(cwd, sessionFile, defaults)
    // Ticket 96: the fork runs IN the session's workspace — the pi TUI's own
    // semantics (its process cwd IS the project dir). The adapter resolves
    // its EARLY config and cache-reuse fast-path against process.cwd(); a
    // host forked at the app's launch dir defers the whole MCP runtime even
    // for sessions that configure servers, so no status snapshot would ever
    // flow. Session files, agent dir and every other path are argv/env —
    // nothing in the host depends on the old inherited cwd. A workspace
    // that has vanished keeps the inherited cwd (the host boots and fails
    // on its own, preserving the dead-cwd exit(1) semantics).
    const cwdExists = existsSync(cwd)
    const child = fork(this.options.hostEntryPath, args, {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      ...(cwdExists ? { cwd } : {})
    })
    const binding: HostBinding = {
      child,
      sessionId: `pending-${++this.provisionalSeq}`,
      expectedExit: false
    }
    this.bindings.push(binding)

    child.on('message', (message) => {
      if (typeof message !== 'object' || message === null || !('type' in message)) return
      if (message.type === 'session_created') {
        this.announce(binding, (message as unknown as { sessionId: string }).sessionId)
      }
      this.emitScoped(binding.sessionId, message as SessionScopedEvent)
    })
    child.stdout?.on('data', (chunk) => this.options.onHostLog?.('stdout', String(chunk)))
    child.stderr?.on('data', (chunk) => this.options.onHostLog?.('stderr', String(chunk)))
    child.on('exit', (code, signal) => {
      this.removeBinding(binding)
      // Deliberate termination (quit, displaced re-announce) is clean and
      // silent; anything else the renderer is alive to see is a crash of
      // exactly THIS session (ticket 20 crash isolation).
      if (!binding.expectedExit && !this.quitting) {
        this.emitScoped(binding.sessionId, { type: 'host_exit', clean: false, code, signal })
      }
    })
  }

  /** Bind a host to the session id it just announced (ticket 20). */
  private announce(binding: HostBinding, sessionId: string): void {
    // In-host session replacement (fork re-announce): the host stopped
    // backing the old session — detach it so the renderer drops the entry
    // and the sidebar row resumes the file instead of dead-focusing.
    if (binding.sessionId !== sessionId) {
      this.emitScoped(binding.sessionId, { type: 'session_detached' })
      this.bySession.delete(binding.sessionId)
    }
    // Same session re-announced by a DIFFERENT host (full resume takeover of
    // a session this app still hosts): one session file, one host. The old
    // host is displaced — deliberate, silent exit.
    const displaced = this.bySession.get(sessionId)
    if (displaced !== undefined && displaced !== binding) {
      displaced.expectedExit = true
      this.terminateChild(displaced.child)
      this.removeBinding(displaced)
    }
    binding.sessionId = sessionId
    this.bySession.set(sessionId, binding)
  }

  private emitScoped(sessionId: string, event: SessionScopedEvent): void {
    this.options.onHostEvent({ type: 'session_event', sessionId, event })
  }

  /** The hostless degradation for the subagent receipt commands (steer
   * ticket 99, stop ticket 101): one honest FAILED receipt, shared shape. */
  private failSubagentReceipt(sessionId: string, type: 'subagent_steer_receipt' | 'subagent_stop_receipt', requestId: string, asyncId: string): void {
    this.emitScoped(sessionId, { type, requestId, asyncId, ok: false, error: 'This session has no live host — reopen it from the sidebar.' })
  }

  private removeBinding(binding: HostBinding): void {
    const index = this.bindings.indexOf(binding)
    if (index !== -1) this.bindings.splice(index, 1)
    if (this.bySession.get(binding.sessionId) === binding) this.bySession.delete(binding.sessionId)
  }

  private send(binding: HostBinding, command: ParentToHost): void {
    try {
      binding.child.send(command)
    } catch {
      // Channel already gone — the exit listener reports the death.
    }
  }

  private sendToLast(command: ParentToHost): void {
    const last = this.bindings[this.bindings.length - 1]
    if (last !== undefined) this.send(last, command)
  }

  /** Graceful shutdown for app quit: EVERY host gets the polite request, then
   * SIGTERM, then SIGKILL (ticket acceptance: no orphaned processes). */
  shutdownAll(): void {
    this.quitting = true
    for (const binding of [...this.bindings]) {
      this.terminateChild(binding.child)
    }
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
