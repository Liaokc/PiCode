/**
 * Electron main process.
 *
 * Owns the window, the IPC bridge and — crucially (ADR-0002) — the lifetime of
 * the forked agent host. Host events relay to the renderer over `host:message`
 * exactly as they cross the process boundary (plain JSON, nothing dropped); user
 * prompts and abort flow back in. On quit we cleanly tear the host down with no
 * orphan process.
 */
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { SessionService } from "./sessionService";
import type { ApprovalChoice, SessionCommand } from "../shared/api";
import type { StreamingBehavior } from "../shared/contract";
import { IPC, type SelectDirectoryResult } from "../shared/ipc";
import { indexSessionScope, type IndexedSession } from "../shared/sessionIndex";

function resolveHostPath(): string {
  // In dev (electron-vite) app.getAppPath() is the project root.
  return join(app.getAppPath(), "src", "child", "host.ts");
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1080,
    height: 760,
    title: "PiCode",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // ESM preload needs sandbox disabled; contextIsolation still blocks the
      // renderer from reaching Node/IPC, exposing only the contextBridge API.
      sandbox: false,
    },
  });

  // electron-vite sets ELECTRON_RENDERER_URL in dev (HMR); otherwise load build.
  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));

  return win;
}

function main(): void {
  let mainWindow: BrowserWindow | null = null;
  // The bound working-directory scope; used to index the sidebar's history tree.
  let currentCwd: string | null = null;

  const sessionService = new SessionService({
    hostPath: resolveHostPath(),
    nodePath: process.env.PICODE_NODE_PATH ?? "node",
    onHostMessage: (message) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.hostMessage, message);
      }
    },
    onFatalError: (err) => {
      console.error(`[session] ${String(err)}`);
    },
  });

  ipcMain.handle(IPC.selectDirectory, async (event): Promise<SelectDirectoryResult> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win ?? mainWindow!, {
      title: "选择工作目录",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  ipcMain.handle(IPC.startSession, (_event, cwd: string): { ok: boolean; reason?: string } => {
    if (!cwd) return { ok: false, reason: "no directory" };
    try {
      sessionService.start(cwd);
      currentCwd = cwd;
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: String(err) };
    }
  });

  ipcMain.on(IPC.submitPrompt, (_event, text: string, streamingBehavior?: StreamingBehavior) => {
    sessionService.submitPrompt(text, streamingBehavior);
  });

  ipcMain.on(IPC.clearQueue, () => {
    sessionService.clearQueue();
  });

  ipcMain.on(IPC.abortPrompt, () => {
    sessionService.abort();
  });

  ipcMain.on(IPC.sessionCommand, (_event, command: SessionCommand) => {
    sessionService.sessionCommand(command);
  });

  ipcMain.on(IPC.setModel, (_event, modelRef: string) => {
    sessionService.setModel(modelRef);
  });

  ipcMain.on(IPC.setThinking, (_event, level: string) => {
    sessionService.setThinking(level);
  });

  ipcMain.on(IPC.listModels, () => {
    sessionService.listModels();
  });

  ipcMain.handle(IPC.listSessions, (): IndexedSession[] => {
    if (!currentCwd) return [];
    return indexSessionScope(currentCwd);
  });

  ipcMain.on(IPC.approvalResponse, (_event, requestId: string, choice: ApprovalChoice) => {
    sessionService.respondToApproval({
      kind: "approvalResponse",
      requestId,
      decision: choice.decision,
      reason: choice.reason,
      remember: choice.remember,
    });
  });

  app.whenReady().then(() => {
    mainWindow = createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  // macOS: keep running until all windows close; quit otherwise.
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  // Clean teardown: block quit long enough to dispose the host child.
  let quitting = false;
  const tearDown = async (): Promise<void> => {
    if (quitting) return;
    quitting = true;
    try {
      await sessionService.stop();
    } finally {
      app.exit(0);
    }
  };
  app.on("before-quit", (event) => {
    // Signals share tearDown; `quitting` guards against double-entry.
    if (quitting) return;
    event.preventDefault();
    void tearDown();
  });

  // Handle SIGINT/SIGTERM sent to the app (e.g. from a terminal).
  const onSignal = (): void => void tearDown();
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}

main();
