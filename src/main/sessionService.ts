/**
 * Session service — owns the child-process host lifecycle (ADR-0002).
 *
 * The Electron main process forked / spawned the phase0-style child host as a
 * separate system-Node process; this module is the single owner of that child:
 * it spawns it against a chosen working directory, wires its message / error /
 * exit events, relays every `HostToParent` message outward, forwards user
 * commands in, and guarantees a clean, orphan-free teardown on quit.
 *
 * The child talks to the real Pi SDK in-process (read-only); this module never
 * imports the SDK itself — it only moves plain JSON across the process boundary
 * (see shared/contract.ts).
 */
import { fork, type ChildProcess } from "node:child_process";
import type { ApprovalResponse, HostToParent, ParentToHost } from "../shared/contract";

export interface SessionServiceOptions {
  /** Absolute path to the child host entry (src/child/host.ts). */
  hostPath: string;
  /** Path to the system Node binary used for the fork; defaults to `node`. */
  nodePath?: string;
  /** Called for every `HostToParent` message the host emits (the IPC relay). */
  onHostMessage: (message: HostToParent) => void;
  /** Called if the host dies unexpectedly (supersedes onHostMessage's error). */
  onFatalError?: (err: unknown) => void;
}

const READY_WATCHDOG_MS = 30_000;
const SHUTDOWN_GRACE_MS = 5_000;

export class SessionService {
  private child: ChildProcess | null = null;
  private readonly hostPath: string;
  private readonly nodePath: string;
  private readonly onHostMessage: (message: HostToParent) => void;
  private readonly onFatalError?: (err: unknown) => void;
  private readyWatchdog: NodeJS.Timeout | null = null;
  private stopping = false;

  constructor(options: SessionServiceOptions) {
    this.hostPath = options.hostPath;
    this.nodePath = options.nodePath ?? "node";
    this.onHostMessage = options.onHostMessage;
    this.onFatalError = options.onFatalError;
  }

  /** Fork the host scoped to `cwd`. Fails fast if one is already running. */
  start(cwd: string): void {
    if (this.child) {
      this.onFatalError?.(new Error("session already running"));
      return;
    }
    const child = fork(this.hostPath, [cwd], {
      execPath: this.nodePath,
      stdio: ["inherit", "inherit", "inherit", "ipc"],
    });
    this.child = child;

    // A host that never reports `ready` is stuck before the SDK boots.
    this.readyWatchdog = setTimeout(() => {
      this.onFatalError?.(new Error(`host did not become ready within ${READY_WATCHDOG_MS}ms`));
      void this.kill();
    }, READY_WATCHDOG_MS);

    child.on("message", (raw: unknown) => {
      const message = raw as HostToParent;
      if (message.kind === "ready") this.clearWatchdog();
      this.onHostMessage(message);
    });
    child.on("error", (err) => {
      this.onFatalError?.(err);
    });
    child.on("exit", (code, signal) => {
      this.clearWatchdog();
      if (this.child === child) this.child = null;
      if (!this.stopping) {
        this.onFatalError?.(new Error(`host exited unexpectedly (code=${code}, signal=${signal ?? "none"})`));
      }
    });
  }

  get running(): boolean {
    return this.child !== null && !this.child.killed;
  }

  submitPrompt(text: string, streamingBehavior?: "steer" | "followUp"): void {
    this.send({ kind: "prompt", text, streamingBehavior });
  }

  abort(): void {
    this.send({ kind: "abort" });
  }

  /** Forward the user's allow/deny decision to a suspended tool in the host. */
  respondToApproval(response: ApprovalResponse): void {
    this.send(response);
  }

  /** Clear Pi's pending steering/follow-up queues (ticket 08, queue panel). */
  clearQueue(): void {
    this.send({ kind: "clear-queue" });
  }

  /** Forward a new/resume/fork session-lifecycle command to the host (ticket 05). */
  sessionCommand(command: { command: "new" | "resume" | "fork"; sessionPath?: string; forkEntryId?: string }): void {
    this.send({ kind: "session-command", ...command });
  }

  /** Switch the active session's model (provider/modelId) in the host (ticket 06). */
  setModel(modelRef: string): void {
    this.send({ kind: "set-model", modelRef });
  }

  /** Switch the active session's thinking level in the host (ticket 06). */
  setThinking(level: string): void {
    this.send({ kind: "set-thinking", level });
  }

  /** Ask the host for its available, auth-validated models (ticket 06). */
  listModels(): void {
    this.send({ kind: "list-models" });
  }

  /**
   * Cleanly tear down the host: ask it to dispose + confirm, then wait a short
   * grace period before force-killing. Resolves once the child is gone, so a
   * quit can proceed with no orphan left behind.
   */
  async stop(): Promise<void> {
    const child = this.child;
    if (!child || child.killed) {
      this.stopping = false;
      return;
    }
    this.stopping = true;
    this.clearWatchdog();

    // If the child already exited, no teardown is needed.
    if (child.exitCode !== null) {
      this.child = null;
      this.stopping = false;
      return;
    }

    // Attach the exit listener BEFORE sending shutdown so we can't miss a fast
    // host that confirms and exits between the send and our listener.
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));

    this.send({ kind: "shutdown" });

    const timedOut = await Promise.race([
      exited.then(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), SHUTDOWN_GRACE_MS)),
    ]);

    if (timedOut) {
      console.warn("[session] host did not confirm shutdown; force-killing");
      // Keep `stopping` true until the exit lands so the exit handler doesn't
      // report a spurious "unexpected exit".
      child.kill("SIGKILL");
      await Promise.race([exited, new Promise((r) => setTimeout(r, 300))]);
    }
    this.stopping = false;
  }

  private send(command: ParentToHost): void {
    if (this.child && !this.child.killed) {
      this.child.send(command);
    }
  }

  private clearWatchdog(): void {
    if (this.readyWatchdog) {
      clearTimeout(this.readyWatchdog);
      this.readyWatchdog = null;
    }
  }

  private async kill(): Promise<void> {
    this.stopping = true;
    this.clearWatchdog();
    const child = this.child;
    if (child && !child.killed && child.exitCode === null) {
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      child.kill("SIGKILL");
      await Promise.race([exited, new Promise((r) => setTimeout(r, 300))]);
    }
    this.stopping = false;
  }
}
