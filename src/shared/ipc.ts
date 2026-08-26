/**
 * IPC channel names shared by the main process and the preload bridge. Kept in
 * one module so main / preload / renderer can't drift on a channel string.
 */
export const IPC = {
  /** renderer → main: open a directory picker, resolve with the chosen path (or null). */
  selectDirectory: "ipc:select-directory",
  /** renderer → main: fork the host scoped to the given working directory. */
  startSession: "ipc:start-session",
  /** renderer → main: forward a user prompt to the host. */
  submitPrompt: "ipc:submit-prompt",
  /** renderer → main: clear Pi's pending steering/follow-up queues (ticket 08). */
  clearQueue: "ipc:clear-queue",
  /** renderer → main: abort the current turn. */
  abortPrompt: "ipc:abort-prompt",
  /** renderer → main: send the user's allow/deny decision for a tool approval. */
  approvalResponse: "ipc:approval-response",
  /** renderer → main: drive a session lifecycle command (new/resume/fork). */
  sessionCommand: "ipc:session-command",
  /** renderer → main: switch the active session's model (provider/modelId). */
  setModel: "ipc:set-model",
  /** renderer → main: switch the active session's thinking level. */
  setThinking: "ipc:set-thinking",
  /** renderer → main: request the available models for the settings panel. */
  listModels: "ipc:list-models",
  /** renderer → main: read the derived session index for the current scope. */
  listSessions: "ipc:list-sessions",
  /** main → renderer: every HostToParent message, forwarded incrementally. */
  hostMessage: "ipc:host-message",
} as const;

/** Return type of the `selectDirectory` IPC call exposed to the renderer. */
export type SelectDirectoryResult = { canceled: true } | { canceled: false; path: string };
