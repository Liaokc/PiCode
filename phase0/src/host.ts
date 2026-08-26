/**
 * Child-process agent host.
 *
 * Forks a real Pi SDK session (`createAgentSession`) with the machine's default
 * provider/model into this separate process, forwards every AgentSessionEvent
 * to the parent over IPC, and handles `prompt` / `abort` / `shutdown` commands.
 *
 * This is the Phase 0 tracer bullet: it proves the in-process SDK runs in a
 * forked child and that streamed text + tool-execution events cross the
 * boundary without blocking (ADR-0002).
 */
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import type { HostToParent, ParentToHost } from "./contract.ts";

const IS_CHILD = typeof process.send === "function";

function emit(message: HostToParent): void {
  if (process.send) process.send(message);
  else console.log(JSON.stringify(message)); // standalone fallback
}

async function main(): Promise<void> {
  const modelRuntime = await ModelRuntime.create();
  const { session } = await createAgentSession({
    // In-memory session: ephemeral, no writes to ~/.pi/agent/sessions.
    sessionManager: SessionManager.inMemory(),
    modelRuntime,
  });

  session.subscribe((event: AgentSessionEvent) => {
    emit({ kind: "event", event });
  });

  emit({
    kind: "ready",
    sessionId: session.sessionId,
    model: session.model ? `${session.model.provider}/${session.model.id}` : undefined,
  });

  if (!IS_CHILD) {
    // Standalone smoke run so the host is usable without a driver.
    await runPrompt(session, "List the files in this directory.");
    session.dispose();
    process.exit(0);
  }

  process.on("message", (raw: unknown) => {
    const command = raw as ParentToHost;
    switch (command.kind) {
      case "prompt":
        runPrompt(session, command.text);
        break;
      case "abort":
        void session.abort();
        break;
      case "shutdown":
        session.dispose();
        emit({ kind: "shutdown", code: 0 });
        process.exit(0);
        break;
    }
  });
}

/** Run a prompt, then signal completion (or a hard error) to the parent. */
function runPrompt(session: AgentSession, text: string): void {
  session
    .prompt(text)
    .then(() => emit({ kind: "done" }))
    .catch((err: unknown) => {
      emit({ kind: "log", level: "error", message: String(err) });
      emit({ kind: "done" });
    });
}

main().catch((err: unknown) => {
  emit({ kind: "log", level: "error", message: String(err) });
  process.exit(1);
});
