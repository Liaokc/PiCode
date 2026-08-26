import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  initialState,
  reduce,
  type ChatAction,
  type ChatState,
} from "../shared/chatReduce";
import type { ApprovalChoice } from "../shared/api";
import type { IndexedSession } from "../shared/sessionIndex";
import { ChatPanel } from "./ChatPanel";
import { DirectoryPicker } from "./DirectoryPicker";

export function App(): JSX.Element {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  // The derived sidebar index (read-only from Pi's session JSONL, ticket 05).
  const [sessions, setSessions] = useState<IndexedSession[]>([]);

  const refreshSessions = useCallback(() => {
    void window.picode.listSessions().then(setSessions);
  }, []);

  // Ask the host for its switchable models when a session becomes active, so the
  // settings panel has something to render (ticket 06). Runs once per boot.
  const requestedModels = useRef(false);
  useEffect(() => {
    if (state.status !== "idle" && !requestedModels.current) {
      requestedModels.current = true;
      window.picode.listModels();
    }
  }, [state.status]);

  // The single feed into the UI: every host message relayed over IPC is folded
  // through the same reducer that tests drive. Nothing is filtered here, so the
  // full (tool + streaming) event stream reaches the panel.
  useEffect(() => {
    return window.picode.onHostMessage((message) => {
      dispatch(message as ChatAction);
      // Re-index the sidebar whenever the active session changes so new/resume/
      // fork results show up (and the active marker is fresh).
      if ((message as { kind?: string }).kind === "session-switched") refreshSessions();
    });
  }, [refreshSessions]);

  const selectDirectory = useCallback(async () => {
    const result = await window.picode.selectDirectory();
    if (result.canceled) return;
    setStarting(true);
    setStartError(null);
    const ack = await window.picode.startSession(result.path);
    setStarting(false);
    if (!ack.ok) setStartError(ack.reason ?? "无法启动会话");
    else refreshSessions();
  }, [refreshSessions]);

  const submit = useCallback((text: string, behavior?: "steer" | "followUp") => {
    dispatch({ kind: "user-submitted", text });
    window.picode.submitPrompt(text, behavior);
  }, []);

  const abort = useCallback(() => {
    dispatch({ kind: "user-aborted" });
    window.picode.abort();
  }, []);

  /** Clear Pi's pending inject/queue messages (ticket 08, queue panel). */
  const clearQueue = useCallback(() => {
    window.picode.clearQueue();
  }, []);

  /**
   * Resolve a pending tool approval: send the decision to the host (which
   * unblocks/suspends the tool), and fold the outcome into the local UI state.
   */
  const decideApproval = useCallback(
    (requestId: string, toolName: string, choice: ApprovalChoice) => {
      window.picode.respondToApproval(requestId, choice);
      dispatch({ kind: "approval-resolved", requestId, toolName, decision: choice.decision });
    },
    [],
  );

  // Session lifecycle (ticket 05): drive the host, then re-index the sidebar.
  const newSession = useCallback(() => {
    window.picode.sessionCommand({ command: "new" });
  }, []);
  const resumeSession = useCallback((sessionPath: string) => {
    window.picode.sessionCommand({ command: "resume", sessionPath });
  }, []);
  const forkSession = useCallback((sessionPath: string, entryId: string) => {
    window.picode.sessionCommand({ command: "fork", sessionPath, forkEntryId: entryId });
  }, []);

  // Settings (ticket 06): forward model / thinking switches to the host. The
  // host applies them via the SDK's public setModel / setThinkingLevel.
  const switchModel = useCallback((modelRef: string) => {
    window.picode.setModel(modelRef);
  }, []);
  const switchThinking = useCallback((level: string) => {
    window.picode.setThinking(level);
  }, []);

  if (state.status === "idle" || !state.cwd) {
    return (
      <DirectoryPicker
        starting={starting}
        error={startError}
        onPick={selectDirectory}
      />
    );
  }

  return (
    <ChatPanel
      state={state}
      sessions={sessions}
      trustInfo={state.trustInfo ?? null}
      onSubmit={submit}
      onAbort={abort}
      onApprovalDecision={decideApproval}
      onNewSession={newSession}
      onResumeSession={resumeSession}
      onForkSession={forkSession}
      onSetModel={switchModel}
      onSetThinking={switchThinking}
      onClearQueue={clearQueue}
    />
  );
}

export type { ChatState };
