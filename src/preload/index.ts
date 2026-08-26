/**
 * Preload bridge — the only channel between the renderer and the main process.
 * Exposes a narrow, typed API (shared/api.ts) via contextBridge; the renderer
 * never touches Node or ipcRenderer directly (contextIsolation on).
 *
 * Only serializable values cross the boundary. Host events stream in
 * incrementally through `onHostMessage`; user prompts flow back out.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { ApprovalChoice, PiCodeApi, SessionCommand } from "../shared/api";
import type { HostToParent, StreamingBehavior } from "../shared/contract";
import type { IndexedSession } from "../shared/sessionIndex";
import { IPC, type SelectDirectoryResult } from "../shared/ipc";

const api: PiCodeApi = {
  selectDirectory: (): Promise<SelectDirectoryResult> =>
    ipcRenderer.invoke(IPC.selectDirectory),

  startSession: (cwd: string): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke(IPC.startSession, cwd),

  submitPrompt: (text: string, streamingBehavior?: StreamingBehavior): void =>
    ipcRenderer.send(IPC.submitPrompt, text, streamingBehavior),

  clearQueue: (): void => ipcRenderer.send(IPC.clearQueue),

  abort: (): void => ipcRenderer.send(IPC.abortPrompt),

  respondToApproval: (requestId: string, choice: ApprovalChoice): void =>
    ipcRenderer.send(IPC.approvalResponse, requestId, choice),

  sessionCommand: (command: SessionCommand): void =>
    ipcRenderer.send(IPC.sessionCommand, command),

  setModel: (modelRef: string): void => ipcRenderer.send(IPC.setModel, modelRef),

  setThinking: (level: string): void => ipcRenderer.send(IPC.setThinking, level),

  listModels: (): void => ipcRenderer.send(IPC.listModels),

  listSessions: (): Promise<IndexedSession[]> => ipcRenderer.invoke(IPC.listSessions),

  onHostMessage: (callback: (message: HostToParent) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, message: HostToParent): void =>
      callback(message);
    ipcRenderer.on(IPC.hostMessage, listener);
    return () => ipcRenderer.removeListener(IPC.hostMessage, listener);
  },
};

contextBridge.exposeInMainWorld("picode", api);
