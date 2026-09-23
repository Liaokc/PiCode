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
 * expensive half — the login-shell snapshot and the on-disk probe results —
 * is gathered once per process (failures degrade to the current PATH — a
 * broken shell never breaks the app); the merge runs on every read against
 * the LIVE process PATH (ticket 141), so entries injected after startup —
 * the smoke's PATH-prepended `open` shim, any runtime PATH change — reach
 * the next host fork instead of being swallowed by a startup-frozen cache,
 * while the no-degradation order (current PATH first, verbatim) keeps the
 * t134 rich-PATH semantics. `hostForkEnv()` injects the result into every
 * host-family fork so the whole host → runner → pi child chain resolves
 * `node` the way a terminal launch always could.
 */

import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import path from 'node:path'
import { composeSpawnPath, normalizePathEntry, resolveNvmVersion } from '../shared/spawn-path'

const LOGIN_SHELL_TIMEOUT_MS = 5_000

/** The slow-moving half of the composition (ticket 141): the login-shell
 * snapshot and the on-disk probe results. Both are expensive (a shell
 * spawn, a filesystem walk), so they are gathered once per process; the
 * cheap fast-moving half — the PATH the process carries RIGHT NOW — is
 * merged live on every read. */
interface SpawnPathFacts {
  loginShellPath: string | undefined
  probePaths: string[]
}

/** The login-shell snapshot runs once; failures degrade to current + probes. */
let composition: Promise<SpawnPathFacts> | null = null
/** The finished facts, for synchronous readers (null until then). */
let factsCache: SpawnPathFacts | null = null

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

async function gatherFacts(): Promise<SpawnPathFacts> {
  const loginShellPath = await loginShellSnapshot()
  const probePaths = staticProbePaths()
  return { loginShellPath, probePaths }
}

function ensureComposition(): Promise<SpawnPathFacts> {
  if (composition === null) {
    composition = gatherFacts().then((facts) => {
      factsCache = facts
      return facts
    })
  }
  return composition
}

/** Kick off the composition (idempotent; fire-and-forget at app start). */
export function initSpawnPath(): void {
  void ensureComposition()
}

/** The best PATH to spawn host-family children with RIGHT NOW: once the
 * slow facts have landed, the pure model merges them with the LIVE
 * process PATH on every read (ticket 141) — anything the process's PATH
 * gained after startup reaches the next fork, while the no-degradation
 * order keeps the current PATH first, verbatim. Before the facts land
 * (a fraction of the first window's load), the app's own PATH. */
export function getSpawnPath(): string {
  const currentPath = process.env['PATH']
  if (factsCache === null) return currentPath ?? ''
  return composeSpawnPath({ currentPath, loginShellPath: factsCache.loginShellPath, probePaths: factsCache.probePaths })
}

/** Await the one-shot facts gathering (bounded by the login-shell timeout);
 * resolves even when every input failed — with the live-composed PATH for
 * the caller's convenience (the t134-sanitized stage compares it against
 * the launch PATH). */
export function whenSpawnPathReady(): Promise<string> {
  return ensureComposition().then(() => getSpawnPath())
}

/** The env for every host-family fork: the app's environment with the
 * live-composed PATH (so the host, pi-subagents' runner and every pi child
 * resolve `node`) and the run-as-node marker the fork protocol needs. */
export function hostForkEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ELECTRON_RUN_AS_NODE: '1', PATH: getSpawnPath() }
}
