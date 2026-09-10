/**
 * New-task command catalog (ticket 52): the `/` menu rows behind the
 * new-task empty state's composer, where no host process exists yet. The
 * data arrives as the auth-probe report's command-catalog slice (ticket 11's
 * `--auth-probe` short-lived host, extended with a cwd argument — the
 * resource loader enumerates prompt templates + skills for one working
 * directory without any session machinery), pushed per-directory from the
 * main process. Pure functions only — everything here projects that catalog
 * into the shapes the composer renders (the same `SlashCommandItem` rows the
 * live session's `slash_commands` event carries, minus the session-domain
 * built-ins).
 *
 * Two projections, both table-testable (Seam-1):
 * - catalog selection: the pushed catalogs (one per probed directory) → the
 *   entry matching the New Task chip's current selection (the cwd dimension);
 * - menu rows: catalog → slash menu rows, excluding the session-domain
 *   reserved names (/compact and the six ticket-38 retirements) — the
 *   empty-state menu lists only what the first message can actually run.
 */
import type { CommandCatalogRow } from './auth-status.ts'
import type { SlashCommandItem } from './contract.ts'

/** Re-exported for consumers: the raw rows a catalog carries. */
export type NewTaskCommandRow = CommandCatalogRow

/** One pushed per-directory command catalog (main → renderer). */
export interface NewTaskCommandCatalog {
  /** The working directory the probe enumerated; null = the no-selection
   * fallback (global resources only, probed from the home directory). */
  cwd: string | null
  /** Raw prompt/skill rows from the probe report (unfiltered). */
  commands: CommandCatalogRow[]
  /** Probe failure, surfaced by an empty menu; null = healthy scan. */
  error: string | null
  /** Wall-clock time the probe finished scanning. */
  scannedAt: number
}

/**
 * Prompt-template names the empty-state menu must not offer: `/compact` is
 * session-domain (manual compaction of an existing session), and the six
 * ticket-38 retirements own dedicated PiCode UI. A prompt template shadowed
 * by one of these names is unreachable in-session too (the slash gate blocks
 * the retired names before the SDK ever expands them), so excluding them
 * keeps the empty-state menu honest about what a first message can run.
 * Skills are invoked as `/skill:name` — a namespace that never collides —
 * so skill rows are never excluded.
 */
export const RESERVED_PROMPT_NAMES: ReadonlySet<string> = new Set([
  'compact',
  'new',
  'tree',
  'name',
  'copy',
  'model',
  'thinking'
])

/** The catalog pushed for the given New Task directory; null when the probe
 * for that selection has not landed yet (the menu is truthfully empty). */
export function selectCommandCatalog(
  catalogs: readonly NewTaskCommandCatalog[],
  cwd: string | null
): NewTaskCommandCatalog | null {
  return catalogs.find((catalog) => catalog.cwd === cwd) ?? null
}

/** Project one catalog into the composer's `/` menu rows. Unknown sources
 * and reserved prompt names drop out; order and argument hints survive so
 * the rows match the in-session menu exactly. */
export function projectCommandMenu(catalog: NewTaskCommandCatalog | null): SlashCommandItem[] {
  if (catalog === null) return []
  const rows: SlashCommandItem[] = []
  for (const command of catalog.commands) {
    if (command.source !== 'prompt' && command.source !== 'skill') continue
    if (command.source === 'prompt' && RESERVED_PROMPT_NAMES.has(command.name)) continue
    rows.push({
      name: command.name,
      description: command.description,
      ...(command.argumentHint !== undefined ? { argumentHint: command.argumentHint } : {}),
      source: command.source
    })
  }
  return rows
}
