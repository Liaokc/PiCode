/**
 * Ticket 134 (spec R21): the main-process spawn-PATH composition.
 *
 * A GUI launch (Finder/Dock) hands the app only the bare system PATH, so
 * every child the app spawns that resolves an executable by name —
 * pi-subagents' detached runner spawning `node` — fails with ENOENT. This
 * module composes a rich PATH once, early, asynchronously (never blocking
 * window readiness):
 *
 *   ① login-shell snapshot — the account's shell (SHELL env, falling back
 *      to os.userInfo().shell so a sanitized environment still resolves),
 *      run as `<shell> -lc 'printenv PATH'` with a bounded timeout.
 *      printenv, not `echo $PATH`: fish echoes its PATH list space-
 *      separated, while printenv prints the exported, colon-joined PATH
 *      in every shell.
 *   ② static probes of well-known node install points that exist on disk:
 *      the nvm current version's bin (alias/default resolved against the
 *      installed versions), /usr/local/bin, /opt/homebrew/bin,
 *      ~/.pi/agent/bin.
 *
 * The merge itself is the pure model in src/shared/spawn-path.ts. The
 * composition is cached once per process (failures degrade to the current
 * PATH — a broken shell never breaks the app); `hostForkEnv()` injects it
 * into every host-family fork so the whole host → runner → pi child chain
 * resolves `node` the way a terminal launch always could.
 */

import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import path from 'node:path'
import { composeSpawnPath, normalizePathEntry, resolveNvmVersion } from '../shared/spawn-path'

const LOGIN_SHELL_TIMEOUT_MS = 5_000

/** The login-shell snapshot runs once; failures degrade to current + probes. */
let composition: Promise<string> | null = null
/** The finished composition, for synchronous readers (null until then). */
let composedCache: string | null = null

function shellPath(): string | null {
  const candidates = [process.env['SHELL'], userInfo().shell]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim() === '') continue
    if (!path.isAbsolute(candidate)) continue
    if (!existsSync(candidate)) continue
    return candidate
  }
  return null
}

function loginShellSnapshot(): Promise<string | undefined> {
  const shell = shellPath()
  if (shell === null) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    execFile(shell, ['-lc', 'printenv PATH'], { timeout: LOGIN_SHELL_TIMEOUT_MS, env: process.env }, (error, stdout) => {
      // Any failure (missing shell, timeout, non-zero exit, garbage) is the
      // documented degradation: current PATH + static probes.
      if (error !== null || typeof stdout !== 'string') return resolve(undefined)
      const snapshot = stdout.trim()
      resolve(snapshot === '' ? undefined : snapshot)
    })
  })
}

/** A probe candidate counts only as an existing directory on disk. */
function existingDir(candidate: string): string | null {
  try {
    if (!statSync(candidate).isDirectory()) return null
  } catch {
    return null
  }
  return normalizePathEntry(candidate)
}

/** The nvm current version's bin dir (`~/.nvm/versions/node/<v>/bin`), or
 * null when nvm is absent/empty. The alias/default content and the lts
 * alias indirection are read here; version selection is the pure model. */
function nvmCurrentVersionBin(): string | null {
  const nvmRoot = path.join(homedir(), '.nvm')
  const versionsDir = path.join(nvmRoot, 'versions', 'node')
  let installed: string[]
  try {
    installed = readdirSync(versionsDir).filter((name) => /^v?\d/.test(name))
  } catch {
    return null
  }
  const readAlias = (file: string): string | undefined => {
    try {
      return readFileSync(file, 'utf8')
    } catch {
      return undefined
    }
  }
  let aliasDefault = readAlias(path.join(nvmRoot, 'alias', 'default'))
  // `lts/<name>` indirection: one level — the lts alias file names the
  // version (or major) nvm pins for that stream.
  if (aliasDefault !== undefined && aliasDefault.trim().startsWith('lts/')) {
    aliasDefault = readAlias(path.join(nvmRoot, 'alias', 'lts', aliasDefault.trim().slice('lts/'.length)))
  }
  const version = resolveNvmVersion(aliasDefault, installed)
  if (version === null) return null
  return existingDir(path.join(versionsDir, version, 'bin'))
}

/** The static probe list, in probe order, filtered to existing dirs. */
function staticProbePaths(): string[] {
  const home = homedir()
  const candidates = [
    nvmCurrentVersionBin(),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    path.join(home, '.pi', 'agent', 'bin')
  ]
  const probes: string[] = []
  for (const candidate of candidates) {
    if (candidate === null) continue
    const dir = existingDir(candidate)
    if (dir !== null) probes.push(dir)
  }
  return probes
}

async function composeOnce(): Promise<string> {
  const loginShellPath = await loginShellSnapshot()
  const probePaths = staticProbePaths()
  return composeSpawnPath({ currentPath: process.env['PATH'], loginShellPath, probePaths })
}

function ensureComposition(): Promise<string> {
  if (composition === null) {
    composition = composeOnce().then((composed) => {
      composedCache = composed
      return composed
    })
  }
  return composition
}

/** Kick off the composition (idempotent; fire-and-forget at app start). */
export function initSpawnPath(): void {
  void ensureComposition()
}

/** The best PATH to spawn host-family children with RIGHT NOW: the composed
 * PATH once ready, the app's own PATH until then (the async window is a
 * fraction of the first window's load). */
export function getSpawnPath(): string {
  return composedCache ?? process.env['PATH'] ?? ''
}

/** Await the one-shot composition (bounded by the login-shell timeout);
 * resolves even when every input failed. */
export function whenSpawnPathReady(): Promise<string> {
  return ensureComposition()
}

/** The env for every host-family fork: the app's environment with the
 * composed PATH (so the host, pi-subagents' runner and every pi child
 * resolve `node`) and the run-as-node marker the fork protocol needs. */
export function hostForkEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ELECTRON_RUN_AS_NODE: '1', PATH: getSpawnPath() }
}
