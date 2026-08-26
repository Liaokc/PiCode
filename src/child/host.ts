/**
 * Child-process agent host.
 *
 * Forks a real Pi SDK session scoped to a working directory into this separate
 * process, forwards every AgentSessionEvent to the parent over IPC, and handles
 * `prompt` / `abort` / `shutdown` / `approvalResponse` commands — plus the
 * per-execution tool approval gate (ticket 03) and the session lifecycle
 * `new` / `resume` / `fork` (ticket 05).
 *
 * The working directory is supplied as a spawn argument by the Electron main
 * process (ADR-0002: main owns the child lifecycle). The session is created
 * against that directory via the SDK's runtime API (`createAgentSessionRuntime`
 * + `SessionManager`), which is the public surface for replacing the active
 * session — the same layer Pi's own /new /resume /fork use. Pi is consumed
 * read-only: we only use public, exported SDK APIs and read Pi's session files.
 *
 * ## Tool-approval gate (ticket 03)
 *
 * The gate is injected read-only via the SDK's public resource-loader option
 * (`extensionFactories`). Because sessions are (re)created by the runtime's
 * `createRuntime` factory, we pass the gate's extension factory through
 * `createAgentSessionServices({ resourceLoaderOptions })` so *every* session —
 * including ones produced by new/resume/fork — carries the interception point.
 * The gate object itself is shared across sessions, so saved per-tool defaults
 * survive a session switch; each new session re-registers its `tool_call`
 * handler against the same gate.
 *
 * ## Session lifecycle (ticket 05)
 *
 * `runtime.newSession()` / `runtime.switchSession(path)` / `runtime.fork(id)`
 * replace `runtime.session`. The SDK docs require re-subscribing to the new
 * session's events and re-binding extensions after replacement; `bindSession()`
 * does exactly that, then emits a `session-switched` identity message so the
 * renderer can keep the sidebar's active marker in sync. Session switches are
 * rejected while a prompt is in flight to avoid tearing down a mid-turn session.
 */
import {
  SessionManager,
  getAgentDir,
  createAgentSessionFromServices,
  createAgentSessionServices,
  createAgentSessionRuntime,
  type AgentSession,
  type AgentSessionEvent,
  type CreateAgentSessionRuntimeFactory,
  type ToolCallEvent,
  type ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import type { HostToParent, ParentToHost } from "../shared/contract";
import { createApprovalGate, type ApprovalGate } from "../shared/approvalGate.ts";
import { trustPostureFrom } from "../shared/trustInfo.ts";

const IS_CHILD = typeof process.send === "function";

function emit(message: HostToParent): void {
  if (process.send) process.send(message);
  else console.log(JSON.stringify(message)); // standalone fallback
}

/**
 * Whether the SDK is mid-turn. We use the session's own `isStreaming` rather
 * than a locally tracked flag so that an injected/queued prompt (steer/followUp,
 * ADR-0003) doesn't desync a manual busy counter — the SDK is authoritative.
 */
function isBusy(session: AgentSession): boolean {
  return session.isStreaming;
}

async function main(): Promise<void> {
  // `cwd` is the session scope, passed by the main process as argv[2].
  const cwd = process.argv[2];
  if (!cwd) {
    emit({ kind: "log", level: "error", message: "host: no cwd argument provided" });
    process.exit(1);
  }

  const gate: ApprovalGate = createApprovalGate({
    isChild: IS_CHILD,
    emit: (request) => emit(request),
  });

  /**
   * The runtime factory the SDK reuses for every new/resume/fork. Services are
   * cwd-bound; the approval-gate extension rides along via `resourceLoaderOptions`
   * so it is present on each (re)created session.
   */
  const createRuntime: CreateAgentSessionRuntimeFactory = async ({
    cwd: sessionCwd,
    sessionManager,
    sessionStartEvent,
  }) => {
    const services = await createAgentSessionServices({
      cwd: sessionCwd,
      agentDir: getAgentDir(),
      resourceLoaderOptions: {
        extensionFactories: [
          {
            name: "picode-approval-gate",
            hidden: true,
            factory: (api) => {
              api.on(
                "tool_call",
                (event: ToolCallEvent): Promise<ToolCallEventResult | void> =>
                  gate.requestApproval(event.toolName, event.input).then((outcome) =>
                    outcome.allow ? undefined : { block: true, reason: outcome.reason },
                  ),
              );
            },
          },
        ],
      },
    });
    return {
      ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
      services,
      diagnostics: services.diagnostics,
    };
  };

  let runtime: Awaited<ReturnType<typeof createAgentSessionRuntime>>;
  try {
    runtime = await createAgentSessionRuntime(createRuntime, {
      cwd,
      agentDir: getAgentDir(),
      sessionManager: SessionManager.create(cwd),
    });
  } catch (err) {
    emit({ kind: "log", level: "error", message: `host: createAgentSessionRuntime failed: ${String(err)}` });
    process.exit(1);
  }

  let unsubscribe: (() => void) | undefined;

  /**
   * (Re)wire to the runtime's current session: drop the old subscription, attach
   * to `runtime.session`, and surface its identity. Called at boot and after each
   * new/resume/fork.
   */
  function bindSession(reason: "boot" | "new" | "resume" | "fork"): AgentSession {
    unsubscribe?.();
    const session = runtime.session;
    unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      emit({ kind: "event", event });
    });
    if (reason === "boot") {
      emit({
        kind: "ready",
        sessionId: session.sessionId,
        cwd,
        model: session.model ? `${session.model.provider}/${session.model.id}` : undefined,
        thinking: session.thinkingLevel,
        // Pi's read-only trust posture for this scope (ticket 06). Read from the
        // session's own SettingsManager; never modify Pi config.
        trust: trustPostureFrom(session.settingsManager, cwd),
      });
    } else {
      emit({
        kind: "session-switched",
        sessionId: session.sessionId,
        sessionPath: session.sessionFile,
        reason,
      });
    }
    return session;
  }

  bindSession("boot");

  if (!IS_CHILD) {
    // Standalone smoke run so the host is usable without a driver/parent.
    // Approval requests auto-allow in this mode (see approvalGate).
    const session = runtime.session;
    await runPrompt(session, "List the files in this directory.");
    await runtime.dispose();
    process.exit(0);
  }

  /** Run a session lifecycle command against the runtime, then rebind identity. */
  async function runSessionCommand(command: {
    kind: "session-command";
    command: "new" | "resume" | "fork";
    sessionPath?: string;
    forkEntryId?: string;
  }): Promise<void> {
    try {
      switch (command.command) {
        case "new": {
          await runtime.newSession();
          bindSession("new");
          break;
        }
        case "resume": {
          if (!command.sessionPath) {
            emit({ kind: "log", level: "error", message: "resume: sessionPath required" });
            return;
          }
          const result = await runtime.switchSession(command.sessionPath);
          if (!result.cancelled) bindSession("resume");
          break;
        }
        case "fork": {
          // Forking a historical session (sourcePath given) resumes it first; the
          // fork then branches from its entry. The source file is never mutated —
          // the SDK's fork creates a new branched file via createBranchedSession.
          if (command.sessionPath && command.sessionPath !== runtime.session.sessionFile) {
            const switched = await runtime.switchSession(command.sessionPath);
            if (switched.cancelled) return;
          }
          if (!command.forkEntryId) {
            emit({ kind: "log", level: "error", message: "fork: forkEntryId required" });
            return;
          }
          const result = await runtime.fork(command.forkEntryId);
          if (!result.cancelled) bindSession("fork");
          break;
        }
      }
    } catch (err) {
      emit({ kind: "log", level: "error", message: `session-command(${command.command}) failed: ${String(err)}` });
    }
  }

  /** The thinking levels the settings panel offers (SDK ThinkingLevel set). */
  const THINKING_LEVELS = [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ] as const;

  /**
   * Switch the active session's model via the public SDK API (ticket 06). The
   * ref is `provider/modelId`, resolved against the runtime's model registry; the
   * model is applied read-only through `session.setModel()` (the officially
   * exported surface — we never hand-patch Pi files).
   */
  async function setModel(modelRef: string): Promise<void> {
    const slash = modelRef.indexOf("/");
    if (slash <= 0 || slash === modelRef.length - 1) {
      emit({ kind: "log", level: "error", message: `set-model: invalid model ref "${modelRef}" (expected provider/modelId)` });
      return;
    }
    const provider = modelRef.slice(0, slash);
    const id = modelRef.slice(slash + 1);
    try {
      const model = runtime.services.modelRuntime.getModel(provider, id);
      if (!model) {
        emit({ kind: "log", level: "error", message: `set-model: unknown model "${modelRef}"` });
        return;
      }
      await runtime.session.setModel(model);
      emit({ kind: "model-changed", model: `${model.provider}/${model.id}` });
    } catch (err) {
      emit({ kind: "log", level: "error", message: `set-model(${modelRef}) failed: ${String(err)}` });
    }
  }

  /** Switch the active session's thinking level via the public SDK API (ticket 06). */
  function setThinking(level: string): void {
    if (!(THINKING_LEVELS as readonly string[]).includes(level)) {
      emit({ kind: "log", level: "error", message: `set-thinking: invalid level "${level}"` });
      return;
    }
    try {
      // The SDK clamps to the model's supported thinking levels, so report the
      // *actual* resulting level (session.thinkingLevel) rather than the request.
      runtime.session.setThinkingLevel(level as (typeof THINKING_LEVELS)[number]);
      emit({ kind: "thinking-changed", level: runtime.session.thinkingLevel });
    } catch (err) {
      emit({ kind: "log", level: "error", message: `set-thinking(${level}) failed: ${String(err)}` });
    }
  }

  /** Report the auth-validated models the settings panel can switch to (ticket 06). */
  async function listModels(): Promise<void> {
    let models;
    try {
      models = await runtime.services.modelRuntime.getAvailable();
    } catch (err) {
      emit({ kind: "log", level: "error", message: `list-models failed: ${String(err)}` });
      return;
    }
    emit({
      kind: "models",
      models: models.map((m) => ({ ref: `${m.provider}/${m.id}`, provider: m.provider, id: m.id })),
    });
  }

  process.on("message", (raw: unknown) => {
    const command = raw as ParentToHost;
    switch (command.kind) {
      case "prompt":
        // Never refuse a prompt while busy: Pi natively queues it via
        // streamingBehavior (steer/followUp, ADR-0003) instead of us dropping it.
        // When idle, streamingBehavior is undefined and it just starts a turn.
        runPrompt(runtime.session, command.text, command.streamingBehavior);
        break;
      case "abort":
        // Reject suspended approvals so a pending tool unblocks (deadlock-free).
        gate.rejectAll("aborted");
        void runtime.session.abort();
        break;
      case "clear-queue":
        runtime.session.clearQueue();
        break;
      case "approvalResponse":
        gate.respond(command);
        break;
      case "session-command":
        // Don't tear down a session mid-turn; user should abort first.
        if (isBusy(runtime.session)) {
          emit({ kind: "log", level: "warn", message: "host: ignoring session-command while busy" });
        } else {
          void runSessionCommand(command);
        }
        break;
      case "set-model":
        if (isBusy(runtime.session)) {
          emit({ kind: "log", level: "warn", message: "host: ignoring set-model while busy" });
        } else {
          void setModel(command.modelRef);
        }
        break;
      case "set-thinking":
        if (isBusy(runtime.session)) {
          emit({ kind: "log", level: "warn", message: "host: ignoring set-thinking while busy" });
        } else {
          setThinking(command.level);
        }
        break;
      case "list-models":
        void listModels();
        break;
      case "shutdown":
        gate.rejectAll("shutdown");
        void runtime.dispose().finally(() => {
          emit({ kind: "shutdown", code: 0 });
          process.exit(0);
        });
        break;
    }
  });
}

/**
 * Create the initial SessionManager for the scope. Starts a fresh session
 * (SessionManager.create) — the MVP boots into a brand-new conversation bound
 * to the chosen working directory.
 */

/** Run a prompt, then signal completion (or a hard error) to the parent. */
function runPrompt(
  session: AgentSession,
  text: string,
  streamingBehavior?: "steer" | "followUp",
): void {
  // If the SDK is already running a turn, `streamingBehavior` makes prompt()
  // queue the message (steer/followUp) and resolves immediately — that is NOT a
  // finished turn, so we must not emit "done". Only a prompt that starts a turn
  // (idle at submission) ends with "done".
  const queued = isBusy(session) && streamingBehavior !== undefined;
  session
    .prompt(text, streamingBehavior ? { streamingBehavior } : undefined)
    .then(() => {
      if (!queued) emit({ kind: "done" });
    })
    .catch((err: unknown) => {
      emit({ kind: "log", level: "error", message: String(err) });
      if (!queued) emit({ kind: "done" });
    });
}

main().catch((err: unknown) => {
  emit({ kind: "log", level: "error", message: String(err) });
  process.exit(1);
});
