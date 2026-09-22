/**
 * Ticket 134 (spec R21): the pure model behind the composed spawn PATH.
 *
 * A GUI launch (Finder/Dock on macOS) hands the app only the bare system
 * PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) — every child the app spawns that
 * resolves an executable by name (pi-subagents' detached runner spawning
 * `node`) fails with ENOENT. The main process composes a richer PATH once
 * at startup (see src/main/spawn-path.ts): a login-shell snapshot
 * (`$SHELL -lc 'printenv PATH'` — printenv, not `echo $PATH`, because fish
 * echoes its PATH *list* space-separated) plus static probes of well-known
 * node install points, merged by the pure function below.
 *
 * Composition order (the no-degradation contract): the PATH the app was
 * launched with keeps its exact entries and positions first — nothing
 * findable before stays harder to find; login-shell-only entries follow
 * (the user's real shell environment); probe-only entries last (the nvm
 * current version, /usr/local/bin, /opt/homebrew/bin, ~/.pi/agent/bin).
 * Entries are deduplicated by exact string. Every missing input degrades
 * gracefully: no snapshot → current + probes; nothing at all → the current
 * PATH unchanged.
 */

/** The raw inputs of one composition (fs/exec facts resolved by the caller). */
export interface SpawnPathComposition {
  /** The PATH the app itself was launched with; undefined = none at all. */
  readonly currentPath: string | undefined
  /** The login-shell snapshot; undefined when the shell failed or timed out. */
  readonly loginShellPath: string | undefined
  /** Static node-install points that exist on disk, in probe order. */
  readonly probePaths: readonly string[]
}

/** Split a PATH value into its entries (undefined → no entries). */
export function splitPathEntries(value: string | undefined): string[] {
  if (value === undefined) return []
  return value.split(':')
}

/** One candidate entry: empty/whitespace entries are dropped — an empty
 * PATH slot means "the current directory" in POSIX lookup semantics, which
 * no composed environment should ever inject. Trailing separators are
 * stripped so the same directory deduplicates from every source. */
function pushEntry(seen: Set<string>, ordered: string[], entry: string): void {
  const trimmed = normalizePathEntry(entry.trim())
  if (trimmed === '' || seen.has(trimmed)) return
  seen.add(trimmed)
  ordered.push(trimmed)
}

/** Compose the spawn PATH: current first (never deprioritized), then
 * login-shell-only entries, then probe-only entries — deduplicated. */
export function composeSpawnPath(composition: SpawnPathComposition): string {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const entry of splitPathEntries(composition.currentPath)) pushEntry(seen, ordered, entry)
  for (const entry of splitPathEntries(composition.loginShellPath)) pushEntry(seen, ordered, entry)
  for (const entry of composition.probePaths) pushEntry(seen, ordered, entry)
  return ordered.join(':')
}

/** Strip trailing separators so a probe dir and an inherited PATH entry
 * deduplicate by the same string (`/opt/homebrew/bin/` → `/opt/homebrew/bin`). */
export function normalizePathEntry(dir: string): string {
  let end = dir.length
  while (end > 1 && (dir[end - 1] === '/' || dir[end - 1] === '\\')) end -= 1
  return dir.slice(0, end)
}

// ---- nvm "current version" resolution (pure: the caller reads the files) ----

/** Compare two version strings numerically by dot-separated parts ('v'
 * prefixes tolerated; missing or non-numeric parts count as 0). */
export function compareVersionStrings(a: string, b: string): number {
  const parts = (value: string): number[] =>
    value
      .replace(/^v/, '')
      .split('.')
      .map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN))
  const left = parts(a)
  const right = parts(b)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index++) {
    const l = Number.isFinite(left[index]) ? left[index]! : 0
    const r = Number.isFinite(right[index]) ? right[index]! : 0
    if (l !== r) return l - r
  }
  return 0
}

/**
 * Resolve the nvm "current version" — the version dir `~/.nvm/versions/node/`
 * should contribute to the probe list — from the `alias/default` content and
 * the installed version dir names. `aliasDefault` values nvm writes:
 * a full version (`22.19.0` / `v22.19.0`), a partial (`22`, `22.19`), an
 * alias name resolved by the caller (`lts/…` → the caller reads
 * `alias/lts/<name>` and passes that), or `node`/`stable` (newest installed).
 * Unknown/garbage content degrades to the highest installed version — any
 * node beats none. No installed versions → null (nvm absent or empty).
 */
export function resolveNvmVersion(aliasDefault: string | undefined, installedVersions: readonly string[]): string | null {
  if (installedVersions.length === 0) return null
  const wanted = aliasDefault?.trim() ?? ''
  const highest = [...installedVersions].sort(compareVersionStrings).at(-1)!
  if (wanted === '') return highest
  const versionPattern = /^v?\d+(\.\d+)*$/
  if (!versionPattern.test(wanted)) return highest
  // Exact or prefix match ('22' matches v22.19.0; '22.19' matches
  // v22.19.0): the highest installed version the alias still names.
  const wantedParts = wanted.replace(/^v/, '').split('.')
  const matches = installedVersions.filter((version) => {
    const parts = version.replace(/^v/, '').split('.')
    return wantedParts.every((part, index) => parts[index] === part)
  })
  if (matches.length === 0) return highest
  return matches.sort(compareVersionStrings).at(-1)!
}
