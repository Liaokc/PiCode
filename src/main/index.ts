import { app, BrowserWindow, clipboard, dialog, ipcMain, protocol, shell } from 'electron'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import type { HostToParent, ImageAttachment, ParentToHost } from '../shared/contract'
import type { ReviewResult } from '../shared/review/types'
import type { PreviewResult } from '../shared/preview/types'
import type { AuthProbeReport } from '../shared/auth-status'
import type { AppPreferences } from '../shared/preferences'
import { SIDEBAR_WIDTH_PX } from '../shared/layout-model'
import { PANEL_DEFAULT_WIDTH_PX } from '../shared/panel-model'
import { EMPTY_MANUAL_ORDER } from '../shared/sessions/group'
import { createWindowOptions } from './window-options'
import { applyDevDockIcon } from './app-icon'
import { HostSupervisor, defaultHostEntryPath } from './host-supervisor'
import { createApprovalNotifier, parseApprovalNotice } from './notifications'
import { collectReview } from './review/collect'
import { readPreview } from './preview/read'
import { addServeRoot, installPreviewServe, previewServeSchemePrivileges } from './preview/serve'
import { SessionIndexService, type FollowUpdate } from './sessions/index-service'
import type { TracePayload } from '../shared/sessions/trace'
import { SessionContextActionService } from './sessions/context-actions'
import { SettingsService, type SettingsSnapshot } from './settings/service'
import { runAuthProbeHost } from './settings/probe-runner'
import { CommandCatalogService } from './settings/command-catalog'
import { SkillsService, type SkillActionOutcome } from './settings/skills-service'
import { PackagesService, forkPackagesOpRunner, type PackageActionOutcome } from './settings/packages-service'
import { McpService, type McpActionOutcome } from './settings/mcp-service'
import type { McpLayerReport, McpServerForm } from '../shared/mcp-management'
import { startSmokeIfEnabled, smokeEnabled, type SmokeHooks } from './smoke'
import { startVisualIfEnabled } from './visual'
import { startDensityVisualIfEnabled } from './visual-density'
import { startSettingsVisualIfEnabled } from './visual-settings'
import { startTerminalVisualIfEnabled } from './visual-terminal'
import { startMultiSessionVisualIfEnabled, isolateVisualUserData } from './visual-multisession'
import { startRowGeometryVisualIfEnabled, isolateRowGeometryUserData } from './visual-row-geometry'
import { startFilterVisualIfEnabled, isolateFilterUserData } from './visual-filter'
import { startDragVisualIfEnabled, isolateDragUserData } from './visual-drag'
import { startAccessVisualIfEnabled } from './visual-access'
import { startContextMenuVisualIfEnabled, isolateContextMenuUserData } from './visual-context-menu'
import { startTraceVisualIfEnabled, isolateTraceUserData } from './visual-trace'
import { startSubagentsVisualIfEnabled, isolateSubagentsUserData } from './visual-subagents'
import { startFoldVisualIfEnabled, isolateFoldUserData } from './visual-fold'
import { startCodeblockVisualIfEnabled, isolateCodeblockUserData } from './visual-codeblock'
import { startAnswerVisualIfEnabled, isolateAnswerUserData } from './visual-answer'
import { startMermaidVisualIfEnabled, isolateMermaidUserData } from './visual-mermaid'
import { startCodeCardVisualIfEnabled, isolateCodeCardUserData } from './visual-codecard'
import { startWorkedVisualIfEnabled, isolateWorkedUserData } from './visual-worked-container'
import { startChronologyVisualIfEnabled, isolateChronologyUserData } from './visual-chronology'
import { startSendPinVisualIfEnabled, isolateSendPinUserData } from './visual-send-pin'
import { startFilebarVisualIfEnabled, isolateFilebarUserData } from './visual-filebar'
import { startRailStackVisualIfEnabled, isolateRailStackUserData } from './visual-rail-stack'
import { startThinkingVisualIfEnabled, isolateThinkingUserData } from './visual-thinking'
import { startExpandVisualIfEnabled, isolateExpandUserData } from './visual-expand'
import { startComposerLayoutVisualIfEnabled, isolateComposerLayoutUserData } from './visual-composer-layout'
import { startImagePreviewVisualIfEnabled, isolateImagePreviewUserData } from './visual-image-preview'
import { startFocusVisualIfEnabled, isolateFocusUserData, focusVisualEnabled } from './visual-focus'
import { startBubbleVisualIfEnabled, isolateBubbleUserData } from './visual-bubble'
import { startPreviewVisualIfEnabled, isolatePreviewUserData } from './visual-preview'
import { startSkillCardVisualIfEnabled, isolateSkillCardUserData } from './visual-skill-card'
import { startContextRingVisualIfEnabled, isolateContextRingUserData } from './visual-context-ring'
import { startTreeVisualIfEnabled, isolateTreeUserData } from './visual-tree'
import { startApprovalVisualIfEnabled } from './visual-approval'
import { startUsageVisualIfEnabled } from './visual-usage'
import { startPerfIfEnabled } from './visual-perf'
import { startCwdVisualIfEnabled, isolateCwdVisualUserData } from './visual-cwd'
import { fakeUsageSnapshot } from '../shared/usage/fixture'
import type { SkillCatalogRow, SkillsReport } from '../shared/skills-management'
import { hasProjectTrustResources } from '../shared/packages-management'
import { projectListFromSummaries, type KnownProject } from '../shared/sessions/group'
import type { PackageRow, PackagesReport } from '../shared/packages-management'
import { TerminalService, type TerminalDataMessage, type TerminalExitMessage } from './terminal/service'
import { nodePtyFactory } from './terminal/node-pty-factory'
import { createUsageService } from './usage/service'

let supervisor: HostSupervisor | null = null
let sessionIndex: SessionIndexService | null = null
let terminalService: TerminalService | null = null
let commandCatalog: CommandCatalogService | null = null

// Ticket-19 visual harness: the hide/restore captures drive the REAL
// settings service, so the multi-session visual run gets throwaway userData
// (no-op unless PICODE_VISUAL_MULTI=1). Must run before app.whenReady.
isolateVisualUserData()
// Ticket-34 row-geometry harness pins through the REAL pin button (writes
// the pin preference) — throwaway userData for it too (no-op unless
// PICODE_VISUAL_ROW_GEOMETRY=1).
isolateRowGeometryUserData()
// Ticket-54 ghost-cwd visual harness: throwaway userData too (no-op unless
// PICODE_VISUAL_CWD=1).
isolateCwdVisualUserData()
// Ticket-33 filter-dropdown harness drives the REAL preferences (dropdown
// choices + pin) — throwaway userData for it too (no-op unless
// PICODE_VISUAL_FILTER=1).
isolateFilterUserData()
// Ticket-35 context-menu harness archives/restores through the REAL
// preferences channel — same throwaway-userData rule (no-op unless
// PICODE_VISUAL_CONTEXT_MENU=1).
isolateContextMenuUserData()
// Ticket-37 trace tool-surfaces harness — same throwaway-userData rule
// (no-op unless PICODE_VISUAL_TRACE=1).
isolateTraceUserData()
// Ticket-84 sidebar drag-reorder harness drives the REAL preference store
// (drag commits + sort flips) — throwaway userData for it too (no-op unless
// PICODE_VISUAL_DRAG=1).
isolateDragUserData()
// Ticket-90 subagent-directory harness — same throwaway-userData rule
// (no-op unless PICODE_VISUAL_SUBAGENTS=1).
isolateSubagentsUserData()
// Ticket-39 group-fold harness reads the default 'projects' view from a
// throwaway userData (no-op unless PICODE_VISUAL_FOLD=1).
isolateFoldUserData()
// Ticket-49 composer-expand harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_EXPAND=1).
isolateExpandUserData()
// Ticket-81 composer-layout harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_COMPOSER_LAYOUT=1).
isolateComposerLayoutUserData()
// Ticket-91 image-preview harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_IMAGE_PREVIEW=1).
isolateImagePreviewUserData()
// Ticket-98 focus-discipline harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_FOCUS=1).
isolateFocusUserData()
// Ticket-97 composite-bubble harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_BUBBLE=1).
isolateBubbleUserData()
// Ticket-88 preview dual-view harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_PREVIEW=1).
isolatePreviewUserData()
// Ticket-72 command-card harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_SKILL_CARD=1).
isolateSkillCardUserData()
// Ticket-77 context-ring harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_CONTEXT_RING=1).
isolateContextRingUserData()
// Ticket-43 history-tree harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_TREE=1).
isolateTreeUserData()
// Ticket-50 codeblock-label harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_CODEBLOCK=1).
isolateCodeblockUserData()
// Ticket-53 answer-split harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_ANSWER=1).
isolateAnswerUserData()
// Ticket-59 mermaid diagram-card harness — same throwaway-userData rule
// (no-op unless PICODE_VISUAL_MERMAID=1).
isolateMermaidUserData()
// Ticket-60 code-card line-number harness — same throwaway-userData rule
// (no-op unless PICODE_VISUAL_CODECARD=1).
isolateCodeCardUserData()

// Ticket-55 worked-container harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_WORKED=1).
isolateWorkedUserData()

// Ticket-56 turn-chronology harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_CHRONOLOGY=1).
isolateChronologyUserData()

// Ticket-93 send-pin harness — same throwaway-userData rule (no-op unless
// PICODE_VISUAL_SEND_PIN=1).
isolateSendPinUserData()

// Ticket-78 turn-file-bar harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_FILEBAR=1).
isolateFilebarUserData()

// Ticket-62 rail-stacking harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_RAIL_STACK=1).
isolateRailStackUserData()

// Ticket-61 thinking-row harness — same throwaway-userData rule (no-op
// unless PICODE_VISUAL_THINKING=1).
isolateThinkingUserData()

// Ticket-13 hygiene, extended by ticket 31: the smoke drives the REAL
// settings service too (panel recently closed round-trip), so it gets the
// same throwaway userData — the operator's PiCode preferences are never
// touched by a smoke run. No-op unless PICODE_SMOKE=1.
if (smokeEnabled()) {
  app.setPath('userData', path.join(tmpdir(), `picode-smoke-userdata-${process.pid}`))
}

// Ticket-29 layout smoke: the drag + restart persistence assertions run
// against throwaway userData so a real profile is never touched (no-op
// unless the smoke driver sets the env). Must run before app.whenReady.
const layoutSmokeUserData = process.env['PICODE_LAYOUT_SMOKE_USER_DATA']
if (typeof layoutSmokeUserData === 'string' && layoutSmokeUserData !== '') {
  app.setPath('userData', layoutSmokeUserData)
}

// Ticket-88 preview-file serve scheme: privileges must be registered before
// app ready; the handler installs inside whenReady below.
protocol.registerSchemesAsPrivileged(previewServeSchemePrivileges)

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow(createWindowOptions(path.join(__dirname, '../preload/index.js')))
  win.once('ready-to-show', () => win.show())

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

function broadcastToWindows(event: HostToParent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('chat:from-host', event)
  }
}

function broadcastChannel(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

app.whenReady().then(() => {
  // Ticket 102: while unpackaged, paint the V2 PiCode icon onto the macOS
  // Dock — the dev binary is stock Electron otherwise. Packaged apps inherit
  // the baked bundle icns instead (no override).
  applyDevDockIcon(app.dock, { isPackaged: app.isPackaged, mainDir: __dirname })

  // Ticket 88: the preview-file protocol serves previewed files' relative
  // resources to the sandboxed HTML preview frame (see preview/serve.ts for
  // the security contract).
  installPreviewServe(protocol)

  // Usage charts consume only this aggregated snapshot — the renderer never
  // scans session files (ADR-0002 / Seam-2 contract). PICODE_FAKE_USAGE=1
  // serves the deterministic visual-QA fixture instead of the real scan.
  const usageService = createUsageService()
  const fakeUsage = process.env['PICODE_FAKE_USAGE'] === '1'
  ipcMain.handle('usage:snapshot', () => (fakeUsage ? Promise.resolve(fakeUsageSnapshot()) : usageService.snapshot()))

  // Settings + read-only auth status (ticket 11). Preferences persist to
  // PiCode's own file — never Pi's settings.json; the auth report comes from
  // a short-lived probe host (ADR-0003: the SDK never loads here).
  const hostEntry = defaultHostEntryPath()
  const fakeSettings = process.env['PICODE_FAKE_SETTINGS'] === '1'
  const settings = new SettingsService({
    file: path.join(app.getPath('userData'), 'picode-settings.json'),
    probe: () => runAuthProbeHost(hostEntry)
  })
  ipcMain.handle('settings:get', (): Promise<SettingsSnapshot> =>
    fakeSettings
      ? Promise.resolve({ preferences: fakePreferences(), lastUsedDirectory: process.cwd() })
      : settings.getSnapshot()
  )
  ipcMain.handle('settings:set', (_event, patch: unknown): Promise<AppPreferences> => {
    if (fakeSettings) return Promise.resolve(fakePreferences())
    return settings.setPreferences(patch)
  })
  ipcMain.handle('settings:refresh-auth', (): Promise<AuthProbeReport> =>
    fakeSettings
      ? Promise.resolve(fakeAuthReport())
      : settings.authReport(true)
  )

  // Ticket 63: the Skills section rides the same fake-settings switch —
  // the deterministic fixture below serves the visual harness and never
  // touches the real probe or settings.json (toggles/deletes resolve ok
  // without I/O); the real branch is the SkillsService further down.

  // New-task command catalog (ticket 52): the renderer reports the New Task
  // chip's selected directory; the service debounces switches, probes each
  // directory once (short-lived probe host, cwd-parametrized), caches, and
  // pushes the catalog to every window. Same host-family child as the auth
  // probe (ADR-0003: the SDK never loads in the main process).
  const catalogService = new CommandCatalogService({
    probe: (cwd) => runAuthProbeHost(hostEntry, { cwd }),
    push: (payload) => broadcastChannel('chat:command-catalog', payload)
  })
  commandCatalog = catalogService
  ipcMain.on('chat:new-task-cwd', (_event, cwd: unknown) => {
    catalogService.request(typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null)
  })

  // Skills management (ticket 63): the settings window's Skills section —
  // read side enumerates Pi's loading surface per directory (probe host,
  // cached); the toggle/delete writes go through the strictly-scoped
  // pi-settings editor (deletes never touch symlink targets).
  const skills = new SkillsService({ probe: (cwd, agentDir) => runAuthProbeHost(hostEntry, { cwd, agentDir }) })
  ipcMain.handle('settings:skills', (_event, cwd: unknown, force: unknown): Promise<SkillsReport> => {
    const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null
    if (fakeSettings) return Promise.resolve(fakeSkillsReport(dir))
    return skills.listSkills(dir, force === true)
  })
  ipcMain.handle('settings:skills-toggle', (_event, rawRow: unknown, enable: unknown): Promise<SkillActionOutcome> => {
    if (fakeSettings) return Promise.resolve({ ok: true })
    if (typeof rawRow !== 'object' || rawRow === null || typeof enable !== 'boolean') {
      return Promise.resolve({ ok: false, error: 'Malformed toggle request.' })
    }
    return skills.toggleSkill(rawRow as SkillCatalogRow, enable)
  })
  ipcMain.handle('settings:skills-delete', (_event, entryPath: unknown): Promise<SkillActionOutcome> => {
    if (fakeSettings) return Promise.resolve({ ok: true })
    if (typeof entryPath !== 'string' || entryPath.trim() === '') {
      return Promise.resolve({ ok: false, error: 'Malformed delete request.' })
    }
    return skills.deleteSkillEntry(entryPath)
  })
  ipcMain.handle('settings:skills-reveal', (_event, target: unknown): boolean => {
    // Read-only reveal of the row's skill file (falls back to the skills
    // dir for broken rows, whose path no longer exists).
    if (fakeSettings) return true
    if (typeof target !== 'string' || target.trim() === '') return false
    try {
      shell.showItemInFolder(target)
      return true
    } catch {
      return false
    }
  })

  // Known-project list for the Skills section's Project card (ticket 67):
  // distinct session cwds from the index, fs-PRE-FILTERED to plausible
  // candidates via hasProjectTrustResources (cwd/.pi entries or ancestor
  // .agents/skills — of the operator's 59 session projects only the few
  // with real .pi content survive), newest first. Read-only; the
  // per-project skills enumeration itself reuses settings:skills.
  ipcMain.handle('settings:projects', async (): Promise<KnownProject[]> => {
    if (fakeSettings) return fakeProjectsList()
    if (!sessionIndex) return []
    const sessions = await sessionIndex.list()
    const home = homedir()
    return projectListFromSummaries(sessions).filter((project) => {
      try {
        return hasProjectTrustResources(project.cwd, home, existsSync)
      } catch {
        return false
      }
    })
  })

  // Packages management (ticket 64): the settings window's Packages
  // section — the read side enumerates global + project packages and the
  // read-only project trust state (probe host, cached); toggles derive the
  // pi-config change through the shared pure model and write the settings
  // file; installs/removes fork the op host running the SDK's OWN package
  // manager (the exact pi install/remove code path), one op at a time, with
  // progress relayed to every window. The project trust gate mirrors pi's
  // own refusal — and trust.json is never written by this app.
  const packages = new PackagesService({
    probe: (cwd, agentDir) => runAuthProbeHost(hostEntry, { cwd, agentDir }),
    runOp: forkPackagesOpRunner(hostEntry)
  })
  ipcMain.handle('settings:packages', (_event, cwd: unknown, force: unknown): Promise<PackagesReport> => {
    if (fakeSettings) return Promise.resolve(fakePackagesReport())
    const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null
    return packages.listPackages(dir, force === true)
  })
  ipcMain.handle(
    'settings:packages-toggle',
    (_event, scope: unknown, source: unknown, enable: unknown, cwd: unknown): Promise<PackageActionOutcome> => {
      if (fakeSettings) return Promise.resolve({ ok: true })
      if (
        (scope !== 'global' && scope !== 'project') ||
        typeof source !== 'string' ||
        source.trim() === '' ||
        typeof enable !== 'boolean'
      ) {
        return Promise.resolve({ ok: false, error: 'Malformed package toggle request.' })
      }
      const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null
      return packages.togglePackage(scope, source, enable, dir)
    }
  )
  ipcMain.handle(
    'settings:packages-op',
    (_event, op: unknown, source: unknown, local: unknown, cwd: unknown): Promise<PackageActionOutcome> => {
      if (fakeSettings) return Promise.resolve({ ok: true })
      if (
        (op !== 'install' && op !== 'remove') ||
        typeof source !== 'string' ||
        source.trim() === '' ||
        typeof local !== 'boolean'
      ) {
        return Promise.resolve({ ok: false, error: 'Malformed package op request.' })
      }
      const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null
      return packages.performOp(op, source, local, dir, (event) => broadcastChannel('settings:packages-progress', event))
    }
  )

  // MCP management (ticket 89): the settings window's MCP section — the
  // read side parses every adapter config layer fresh (small JSON files,
  // no SDK in main per ADR-0003) and the pure shared model merges them;
  // writes derive through the model and the service guards the canonical
  // write surface (external host-tool configs are NEVER written). The
  // OAuth flow itself rides the session host bridge (mcp_auth_* contract
  // events), never this service — credentials stay in the adapter/keychain.
  const mcp = new McpService({})
  ipcMain.handle('settings:mcp', (_event, cwd: unknown): McpLayerReport => {
    if (fakeSettings) return fakeMcpReport(cwd)
    const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null
    return mcp.listConfig(dir)
  })
  ipcMain.handle(
    'settings:mcp-toggle',
    (_event, serverName: unknown, disabled: unknown, cwd: unknown): Promise<McpActionOutcome> => {
      if (fakeSettings) return Promise.resolve({ ok: true, path: '' })
      if (typeof serverName !== 'string' || typeof disabled !== 'boolean') {
        return Promise.resolve({ ok: false, error: 'Malformed MCP toggle request.' })
      }
      const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null
      return mcp.toggleServer(serverName, disabled, dir)
    }
  )
  ipcMain.handle(
    'settings:mcp-write',
    (_event, mode: unknown, form: unknown, target: unknown, cwd: unknown, preserve: unknown): Promise<McpActionOutcome> => {
      if (fakeSettings) return Promise.resolve({ ok: true, path: '' })
      if (
        (mode !== 'add' && mode !== 'edit') ||
        (target !== 'project' && target !== 'global') ||
        typeof form !== 'object' ||
        form === null ||
        typeof preserve !== 'object' ||
        preserve === null
      ) {
        return Promise.resolve({ ok: false, error: 'Malformed MCP write request.' })
      }
      const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null
      return mcp.writeServerEntry(mode, form as McpServerForm, target, dir, preserve as Record<string, unknown>)
    }
  )
  ipcMain.handle('settings:mcp-remove', (_event, serverName: unknown, cwd: unknown): Promise<McpActionOutcome> => {
    if (fakeSettings) return Promise.resolve({ ok: true, path: '' })
    if (typeof serverName !== 'string' || serverName.trim() === '') {
      return Promise.resolve({ ok: false, error: 'Malformed MCP remove request.' })
    }
    const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null
    return mcp.removeServer(serverName, dir)
  })
  ipcMain.handle('settings:mcp-reveal', (_event, layerPath: unknown, cwd: unknown): { ok: boolean; target: string | null } => {
    if (typeof layerPath !== 'string' || layerPath.trim() === '') return { ok: false, target: null }
    const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd : null
    const outcome = fakeSettings ? { ok: true, target: layerPath } : mcp.revealLayer(layerPath, dir)
    if (outcome.ok && outcome.target !== null) {
      try {
        shell.showItemInFolder(outcome.target)
      } catch {
        return { ok: false, target: null }
      }
    }
    return outcome
  })

  let smokeHooks: SmokeHooks | null = null
  let mainWindow: BrowserWindow | null = null
  const smokeWindow = (): BrowserWindow | null => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null)
  // Read-only context-menu actions (ticket 35): the session row menu's
  // Reveal in Finder + copy actions. Main validates every payload and the
  // performed actions land in a bounded log the electron smoke asserts
  // against — the renderer has no direct shell/clipboard access.
  const contextActions = new SessionContextActionService({
    reveal: (file) => shell.showItemInFolder(file),
    copy: (text) => clipboard.writeText(text)
  })
  ipcMain.handle('sessions:context-action', (_event, action: unknown) => contextActions.perform(action))
  supervisor = new HostSupervisor({
    hostEntryPath: defaultHostEntryPath(),
    onHostEvent: (event) => {
      broadcastToWindows(event)
      smokeHooks?.onHostEvent(event)
    },
    onHostLog: (stream, chunk) => console.log(`[host ${stream}]`, chunk.trimEnd())
  })
  smokeHooks = startSmokeIfEnabled(supervisor, smokeWindow, contextActions, () => settings.authReport(false))
  // System notifications for background-session approval gates (ticket 25):
  // the renderer asks only for sessions whose pill is not on screen; the
  // click deep-links back to the waiting session and approves nothing.
  const approvalNotifier = createApprovalNotifier({
    getWindow: smokeWindow,
    onNotice: (notice) => smokeHooks?.onApprovalNotice(notice)
  })
  ipcMain.on('notifications:approval-request', (_event, payload: unknown) => {
    const notice = parseApprovalNotice(payload)
    if (notice !== null) approvalNotifier.notify(notice)
  })
  startVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  startDensityVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  startTerminalVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-20 dot/alignment harness must run BEFORE the session index is
  // constructed: it seeds an isolated store via PICODE_SESSION_DIR.
  startMultiSessionVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-25 badge/parked-pill harness — same seeding constraint.
  startApprovalVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-34 row-geometry harness — same seeding constraint (it also pins
  // through the real button, which needs the seeded rows).
  startRowGeometryVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-33 filter-dropdown harness — same seeding constraint (it also
  // pins and persists dropdown choices through the real UI).
  startFilterVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  startDragVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-35 context-menu/archive harness — same seeding constraint.
  startContextMenuVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-54 ghost-cwd harness — seeds its own dead/alive store pair.
  startCwdVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-37 trace tool-surfaces harness — same seeding constraint.
  startTraceVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-90 subagent-directory harness — same seeding constraint (the
  // artifact root rides the env before any host spawns).
  startSubagentsVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-38 access-menu harness — renderer-only injection, no store writes.
  startAccessVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-39 group-fold harness — same seeding constraint (12 fake
  // sessions land in the isolated store before the index reads it).
  startFoldVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-49 composer-expand harness — same seeding constraint.
  startExpandVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-81 composer-layout harness — same seeding constraint.
  startComposerLayoutVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-91 image-preview harness — same seeding constraint.
  startImagePreviewVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-98 focus-discipline harness — same seeding constraint.
  startFocusVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-97 composite-bubble harness — settled-replay injection, same pattern.
  startBubbleVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-88 preview dual-view harness — same seeding constraint (the fake
  // sidebar row lands in the isolated store before the index reads it; its
  // cwd is the real fixture directory the harness writes).
  startPreviewVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-72 command-card harness — same seeding constraint (the seeded
  // session lands in the isolated store before the index reads it).
  startSkillCardVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-77 context-ring harness — same seeding constraint (two fresh
  // sessions land in the isolated store before the index reads it).
  startContextRingVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-43 history-tree harness — same seeding constraint.
  startTreeVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-50 codeblock-label harness — contract-stream injection, no store writes.
  startCodeblockVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-59 mermaid diagram-card harness — live contract-stream injection.
  startMermaidVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-60 code-card line-number harness — live contract-stream injection.
  startCodeCardVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-53 answer-split harness — settled-replay injection, same pattern.
  startAnswerVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-55 worked-container harness — settled-replay + live injection.
  startWorkedVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-56 turn-chronology harness — live turn past the approval gate.
  startChronologyVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-93 send-pin harness — a real send drives the landing composition.
  startSendPinVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-78 turn-file-bar harness — settled-replay injection, same pattern.
  startFilebarVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-62 rail-stacking harness — same seeding constraint (it seeds an
  // isolated store before the index reads PICODE_SESSION_DIR).
  startRailStackVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-61 thinking-row harness — live streaming + fold/reopen continuity.
  startThinkingVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))

  // Renderer → host relay (Seam-1: the only chat channel the renderer has).
  ipcMain.on('chat:to-host', (_event, message: ParentToHost) => {
    // Startup preference bookkeeping: remember the last working directory a
    // session actually used (create or resume) for "reuse last folder".
    if (message.type === 'create_session' || message.type === 'resume_session') {
      void settings.recordLastUsedDirectory(message.cwd)
    }
    supervisor?.handleParentCommand(message)
  })

  ipcMain.handle('chat:pick-directory', async (event) => {
    // Smoke (ticket 41 stage): the empty-state send creates the session from
    // the composer, and no human is present for the folder picker — answer
    // with the smoke working directory, exactly what supervisor.createSession
    // would have used.
    if (smokeEnabled()) return process.env['PICODE_SMOKE_CWD'] || tmpdir()
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'Choose a working directory',
      properties: ['openDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  // Composer image attachments (ticket 05): picked images are read in the
  // main process and delivered to the renderer as base64 contract payloads.
  ipcMain.handle('chat:pick-images', async (event): Promise<ImageAttachment[]> => {
    // Ticket 98 stage: the focus-discipline leg presses the attach button
    // for real (a trusted click is the only way to move focus like a human
    // does) — no human is present for the native picker, so smoke answers
    // an empty pick and the assertions ride the renderer's focus instead.
    if (smokeEnabled() || focusVisualEnabled()) return []
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      title: 'Attach images',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
    })
    if (result.canceled) return []
    const attachments: ImageAttachment[] = []
    for (const file of result.filePaths) {
      try {
        const buffer = await fs.readFile(file)
        const ext = path.extname(file).toLowerCase().replace('.', '')
        const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
        attachments.push({ mimeType, data: buffer.toString('base64') })
      } catch {
        // Unreadable file — skip it rather than failing the whole pick.
      }
    }
    return attachments
  })

  // Review tab (ticket 06): git workspace-vs-HEAD snapshots, read-only.
  ipcMain.handle('review:load', (_event, cwd: unknown): Promise<ReviewResult> => {
    if (typeof cwd !== 'string' || cwd.length === 0) {
      return Promise.resolve({ ok: false, reason: 'failed', message: 'No working directory selected.' })
    }
    return collectReview(cwd)
  })

  // File Preview tab (ticket 07): file contents + directory listings for the
  // breadcrumb navigation, read-only, with the policy's hard size cap.
  // Ticket 88: an HTML preview registers its directory as a preview-file
  // serve root so the sandboxed frame's RELATIVE resources load; nothing
  // outside registered roots is ever served.
  ipcMain.handle('preview:load', (_event, cwd: unknown, target: unknown): Promise<PreviewResult> => {
    if (typeof cwd !== 'string' || cwd.length === 0 || typeof target !== 'string') {
      return Promise.resolve({ ok: false, reason: 'failed', message: 'No preview target selected.' })
    }
    return readPreview(cwd, target).then((result) => {
      if (result.ok && result.kind === 'file' && result.file.kind === 'html') {
        addServeRoot(path.dirname(result.file.absolutePath))
      }
      return result
    })
  })
  // Terminal tab (ticket 08, Seam-3): the REAL pty lives here, behind the
  // node-pty factory adapter; bytes flow over terminal-dedicated batched
  // channels, never the chat contract stream (ADR-0004). Read-only guard:
  // every channel validates types before touching the service.
  const terminals = new TerminalService(nodePtyFactory(), {
    data: (message: TerminalDataMessage) => broadcastChannel('terminal:data', message),
    exit: (message: TerminalExitMessage) => broadcastChannel('terminal:exit', message)
  })
  terminalService = terminals
  ipcMain.handle('terminal:start', (_event, id: unknown, cwd: unknown, cols: unknown, rows: unknown) => {
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      typeof cwd !== 'string' ||
      cwd.length === 0 ||
      typeof cols !== 'number' ||
      typeof rows !== 'number'
    ) {
      return null
    }
    return terminals.start(id, { cwd, cols, rows })
  })
  ipcMain.on('terminal:input', (_event, id: unknown, data: unknown) => {
    if (typeof id !== 'string' || typeof data !== 'string') return
    terminals.write(id, data)
  })
  ipcMain.on('terminal:resize', (_event, id: unknown, cols: unknown, rows: unknown) => {
    if (typeof id !== 'string' || typeof cols !== 'number' || typeof rows !== 'number') return
    terminals.resize(id, cols, rows)
  })
  ipcMain.on('terminal:kill', (_event, id: unknown) => {
    if (typeof id !== 'string') return
    terminals.dispose(id)
  })

  // Session index + Live Follow (ticket 04): read-only scan of the shared Pi
  // session store; the only write is the rename write-back for non-active
  // sessions (the active session renames through its host process).
  // PICODE_SESSION_DIR (ticket 13 smoke isolation) points the whole app at a
  // throwaway store so smoke runs never touch the real session files.
  sessionIndex = new SessionIndexService({
    sessionsDir: process.env['PICODE_SESSION_DIR'] || path.join(homedir(), '.pi', 'agent', 'sessions'),
    onIndexChanged: () => broadcastChannel('sessions:index-changed', null),
    onFollowUpdate: (update: FollowUpdate) => broadcastChannel('sessions:follow-update', update),
    // Trace-tab live follow (ticket 37): the rebuilt payload after the
    // traced file changed size — same push semantics as the transcript tail.
    onTraceUpdate: (payload: TracePayload) => broadcastChannel('sessions:trace-update', payload)
  })
  ipcMain.handle('sessions:list', () => sessionIndex?.list())
  ipcMain.handle('sessions:rename', (_event, file: string, name: string) => {
    if (typeof file !== 'string' || typeof name !== 'string') return null
    return sessionIndex?.renameSession(file, name)
  })
  ipcMain.handle('sessions:follow', async (_event, file: string) => {
    if (typeof file !== 'string') return null
    await sessionIndex?.startFollowing(file)
    return sessionIndex?.followSnapshot(file)
  })
  ipcMain.on('sessions:unfollow', () => sessionIndex?.stopFollowing())
  // Call-trace payload (ticket 36): one-shot read-only build over any session
  // file — TUI sessions included; the additive contract member is the same
  // file-scoped family as `sessions:follow`. Validation guards the channel;
  // an unreadable file resolves null (the tab shows its error state).
  ipcMain.handle('sessions:trace', (_event, file: unknown) => {
    if (typeof file !== 'string' || file.length === 0) return Promise.resolve(null)
    return sessionIndex?.trace(file) ?? Promise.resolve(null)
  })
  // Trace-tab live follow (ticket 37): snapshot + tail registration in one
  // request, then size-driven payload pushes — the same semantics as
  // `sessions:follow`, scoped to its own per-file slots (several trace tabs
  // can tail at once). Additive members of the sessions family.
  ipcMain.handle('sessions:trace-follow', (_event, file: unknown) => {
    if (typeof file !== 'string' || file.length === 0) return Promise.resolve(null)
    return sessionIndex?.startTraceFollowing(file) ?? Promise.resolve(null)
  })
  ipcMain.on('sessions:untrace-follow', (_event, file: unknown) => {
    if (typeof file === 'string' && file.length > 0) sessionIndex?.stopTraceFollowing(file)
  })
  sessionIndex.start()

  startSettingsVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  startUsageVisualIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  // Ticket-30 perf harness: seeds a heavy markdown transcript + open panel/
  // dock resizers, then parks the window for the CDP flamegraph driver.
  startPerfIfEnabled(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))

  mainWindow = createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// No orphaned agent hosts on quit (ticket acceptance): polite shutdown first.
// Also no orphaned pty shells (ticket 08).
app.on('before-quit', () => {
  supervisor?.shutdownAll()
  sessionIndex?.stop()
  terminalService?.disposeAll()
  commandCatalog?.dispose()
})

// ---- visual-QA fixtures (PICODE_FAKE_SETTINGS=1): deterministic settings
// data for the settings-window screenshot pass. Never used in normal runs. ----
function fakePreferences(): AppPreferences {
  return {
    defaultModel: { providerId: 'bella', modelId: 'GLM-5.3' },
    defaultThinkingLevel: 'high',
    newTaskDirectory: 'fixed',
    newTaskFixedProject: '/Users/demo/Projects/picode',
    hiddenGroups: ['/Users/demo/Projects/archive'],
    archivedSessions: [],
    readStates: {},
    recentlyClosedTabs: [],
    sidebarView: 'projects',
    sidebarSort: 'updated',
    sidebarManualOrder: EMPTY_MANUAL_ORDER,
    sidebarWidth: SIDEBAR_WIDTH_PX,
    panelWidth: PANEL_DEFAULT_WIDTH_PX
  }
}

function fakeAuthReport(): AuthProbeReport {
  return {
    scannedAt: Date.now(),
    error: null,
    models: [
      { providerId: 'anthropic', modelId: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
      { providerId: 'anthropic', modelId: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
      { providerId: 'openai', modelId: 'gpt-5.1', name: 'GPT-5.1' },
      { providerId: 'bella', modelId: 'GLM-5.3', name: 'GLM-5.3' },
      { providerId: 'bella', modelId: 'GLM-5.3-flash', name: 'GLM-5.3-flash' },
      { providerId: 'google', modelId: 'gemini-3-pro', name: 'Gemini 3 Pro' }
    ],
    providers: [
      { providerId: 'anthropic', name: 'Anthropic', modelCount: 12, authType: 'oauth', source: 'OAuth', oauthExpiresAt: Date.now() + 86_400_000 },
      { providerId: 'openai', name: 'OpenAI', modelCount: 8, authType: 'api_key', source: 'OPENAI_API_KEY', oauthExpiresAt: null },
      { providerId: 'google', name: 'Google', modelCount: 6, authType: 'oauth', source: 'OAuth', oauthExpiresAt: Date.now() - 3_600_000 },
      { providerId: 'bella', name: 'Bella', modelCount: 3, authType: 'api_key', source: 'bella.apiKey', oauthExpiresAt: null },
      { providerId: 'github-copilot', name: 'GitHub Copilot', modelCount: 5, authType: null, source: null, oauthExpiresAt: null },
      { providerId: 'zai', name: 'Z.ai', modelCount: 4, authType: null, source: null, oauthExpiresAt: null }
    ]
  }
}

/** Deterministic Skills-section fixture (PICODE_FAKE_SETTINGS=1, ticket
 * 63): every source badge + a broken link + a disabled row, so the visual
 * frames show the whole state vocabulary. Ticket 67: cwd-AWARE — the null
 * request returns only global-face rows; a project request returns that
 * project's rows (with its trust state). Never touches the real machine. */
function fakeSkillsReport(cwd: string | null): SkillsReport {
  if (cwd !== null) {
    const projectRow: SkillCatalogRow = {
      path: `${cwd}/.pi/skills/api-review/SKILL.md`,
      entryPath: null,
      entryKind: null,
      realPath: null,
      name: 'api-review',
      description: 'Review API changes against the team design checklist.',
      enabled: true,
      scope: 'project',
      origin: 'top-level',
      source: 'auto',
      baseDir: `${cwd}/.pi`,
      broken: false
    }
    return {
      cwd,
      scannedAt: Date.now(),
      rows: [projectRow],
      error: null,
      trust: { decision: 'trusted', trusted: true, hasResources: true }
    }
  }
  const rows: SkillCatalogRow[] = [
    {
      path: '/Users/demo/.pi/agent/skills/alpha-testing/SKILL.md',
      entryPath: '/Users/demo/.pi/agent/skills/alpha-testing',
      entryKind: 'symlink',
      realPath: '/Users/demo/.agents/skills/alpha-testing',
      name: 'alpha-testing',
      description: 'Run the alpha test suite against a fixture project and summarize failures.',
      enabled: true,
      scope: 'user',
      origin: 'top-level',
      source: 'auto',
      baseDir: '/Users/demo/.pi/agent',
      broken: false
    },
    {
      path: '/Users/demo/.pi/agent/skills/cron-scheduler/SKILL.md',
      entryPath: '/Users/demo/.pi/agent/skills/cron-scheduler',
      entryKind: 'real-dir',
      realPath: null,
      name: 'cron-scheduler',
      description: 'Schedule recurring prompts and inspect their run history.',
      enabled: false,
      scope: 'user',
      origin: 'top-level',
      source: 'auto',
      baseDir: '/Users/demo/.pi/agent',
      broken: false
    },
    {
      path: '/Users/demo/.pi/agent/skills/old-workflow',
      entryPath: '/Users/demo/.pi/agent/skills/old-workflow',
      entryKind: 'symlink',
      realPath: null,
      name: 'old-workflow',
      description: null,
      enabled: false,
      scope: 'user',
      origin: 'top-level',
      source: 'auto',
      baseDir: '/Users/demo/.pi/agent',
      broken: true
    },
    {
      path: '/install/pi-clipboard/skills/clipboard-lint/SKILL.md',
      entryPath: null,
      entryKind: null,
      realPath: null,
      name: 'clipboard-lint',
      description: 'Lint clipboard-handling code for privacy leaks before commits.',
      enabled: true,
      scope: 'user',
      origin: 'package',
      source: 'npm:@demo/pi-clipboard',
      baseDir: '/install/pi-clipboard',
      broken: false
    }
  ]
  return { cwd: null, scannedAt: Date.now(), rows, error: null }
}

/** Deterministic MCP-section fixture (PICODE_FAKE_SETTINGS=1, ticket 89):
 * every layer with its badge + an OAuth server + a disabled row + a
 * layered override, so the visual frames show the whole state vocabulary.
 * Never touches the real machine. */
function fakeMcpReport(cwd: unknown): McpLayerReport {
  const dir = typeof cwd === 'string' && cwd.trim() !== '' ? cwd : '/Users/demo/Projects/picode'
  return {
    cwd: dir,
    agentDir: '/Users/demo/.pi/agent',
    home: '/Users/demo',
    scannedAt: Date.now(),
    error: null,
    globalLayers: [
      {
        id: 'shared-global',
        label: 'Global shared',
        scope: 'global',
        kind: 'shared',
        path: '/Users/demo/.config/mcp/mcp.json',
        exists: true,
        error: null,
        servers: {
          deepwiki: { url: 'https://mcp.deepwiki.com/mcp', protocolVersion: 'auto' },
          notion: { url: 'https://mcp.notion.com/mcp', auth: 'oauth' },
          // Ticket 96: two more rows so the s7b status frame can show the
          // whole runtime-state vocabulary (cached + failed join the six).
          'docs-cache': { url: 'https://docs.example.com/mcp' },
          flaky: { command: 'flaky-mcp-bin' }
        }
      },
      {
        id: 'agents-global',
        label: 'Global .agents',
        scope: 'global',
        kind: 'shared',
        path: '/Users/demo/.agents/mcp.json',
        exists: false,
        error: null,
        servers: {}
      },
      {
        id: 'agents-nested-global',
        label: 'Global .agents/mcp',
        scope: 'global',
        kind: 'shared',
        path: '/Users/demo/.agents/mcp/mcp.json',
        exists: false,
        error: null,
        servers: {}
      },
      {
        id: 'pi-global',
        label: 'Pi global',
        scope: 'global',
        kind: 'pi',
        path: '/Users/demo/.pi/agent/mcp.json',
        exists: true,
        error: null,
        servers: {
          'web-archive': { command: 'npx', args: ['-y', 'web-archive-mcp'], disabled: true }
        }
      }
    ],
    projectLayers: [
      {
        id: 'shared-project',
        label: 'Project shared',
        scope: 'project',
        kind: 'shared',
        path: `${dir}/.mcp.json`,
        exists: true,
        error: null,
        servers: {
          'repo-tools': { command: 'node', args: ['tools/repo-mcp.js'] }
        }
      },
      {
        id: 'pi-project',
        label: 'Pi project',
        scope: 'project',
        kind: 'pi',
        path: `${dir}/.pi/mcp.json`,
        exists: true,
        error: null,
        servers: {
          deepwiki: { protocolVersion: '2025-06-18' }
        }
      }
    ]
  }
}

/** Deterministic known-projects fixture (PICODE_FAKE_SETTINGS=1, ticket
 * 67): two candidate projects so the Project card's per-project groups
 * render in the visual frame (one with skills, one without — the empty
 * one collapses into the summary line). */
function fakeProjectsList(): KnownProject[] {
  return [
    { cwd: '/Users/demo/Projects/api', name: 'api', sessionCount: 4, latest: Date.now() - 3_600_000 },
    { cwd: '/Users/demo/Projects/picode', name: 'picode', sessionCount: 12, latest: Date.now() - 86_400_000 }
  ]
}

/** Deterministic Packages-section fixture (PICODE_FAKE_SETTINGS=1, ticket
 * 64): the three source badges, a disabled package, per-package component
 * counts, a project layer, and an UNTRUSTED project — the visual frame
 * shows the whole state vocabulary, including the untrusted banner. Never
 * touches the real machine. */
function fakePackagesReport(): PackagesReport {
  const globalRows: PackageRow[] = [
    {
      source: 'npm:@demo/pi-clipboard',
      kind: 'npm',
      entry: 'npm:@demo/pi-clipboard',
      autoload: null,
      counts: { extensions: 2, skills: 3, prompts: 1, themes: 0 },
      installedPath: '/Users/demo/.pi/agent/npm/node_modules/@demo/pi-clipboard',
      scope: 'user'
    },
    {
      source: 'git:github.com/demo/pi-themes@v2',
      kind: 'git',
      entry: 'git:github.com/demo/pi-themes@v2',
      autoload: null,
      counts: { extensions: 0, skills: 1, prompts: 0, themes: 4 },
      installedPath: '/Users/demo/.pi/agent/git/github.com/demo/pi-themes',
      scope: 'user'
    },
    {
      source: '/Users/demo/ext/picode-local-pack',
      kind: 'local',
      entry: {
        source: '/Users/demo/ext/picode-local-pack',
        extensions: [],
        skills: [],
        prompts: [],
        themes: []
      },
      autoload: null,
      counts: { extensions: 1, skills: 2, prompts: 0, themes: 0 },
      installedPath: '/Users/demo/ext/picode-local-pack',
      scope: 'user'
    }
  ]
  const projectRows: PackageRow[] = [
    {
      source: 'npm:@api/team-skills',
      kind: 'npm',
      entry: 'npm:@api/team-skills',
      autoload: null,
      counts: { extensions: 0, skills: 4, prompts: 2, themes: 0 },
      installedPath: null,
      scope: 'project'
    }
  ]
  return {
    cwd: '/Users/demo/Projects/api',
    scannedAt: Date.now(),
    global: globalRows,
    project: projectRows,
    trust: { decision: 'none', trusted: false, hasResources: true },
    error: null
  }
}
