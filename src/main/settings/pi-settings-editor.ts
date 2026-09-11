/**
 * Pi settings editor + skill-entry delete (main process, ticket 63). The
 * Skills section's per-skill toggle writes Pi's OWN global settings
 * (`~/.pi/agent/settings.json`) in exactly the format `pi config` writes —
 * the operator-approved scope for this ticket (Q3/Q4/Q5) — via a surgical
 * parse → mutate → serialize pass that leaves every other key untouched.
 * Deletes are strictly scoped to entries under `~/.pi/agent/skills`: a
 * symlink is UNLINKED (never recursed into — the rm -rf trailing-slash trap
 * is defused by normalizing the path and lstat-classifying first), a real
 * directory is removed, and anything else is refused. The symlink TARGETS
 * (the ~/.agents/skills / ~/.cc-switch/skills SSOT directories) are never
 * touched.
 *
 * ADR-0003: this module stays SDK-free — plain fs, no Pi code in main.
 */

import { mkdir, rename, rm, unlink, writeFile, readFile } from 'node:fs/promises'
import { existsSync, lstatSync, realpathSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { isUnderPiSkillsDir } from '../../shared/skills-management'

/** One document mutation for writeSkillOverride. */
export type PiSettingsMutation = (doc: Record<string, unknown>) => Record<string, unknown>

/** Read Pi's global settings.json; a missing or corrupt file reads as {}. */
export function readPiSettingsSync(file: string): Record<string, unknown> {
  try {
    if (!existsSync(file)) return {}
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf-8'))
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Apply one mutation to Pi's global settings.json (atomic: temp file +
 * rename). The mutation receives the parsed document and returns the next
 * one; unrelated keys pass through untouched.
 */
export async function writeSkillOverride(file: string, mutate: PiSettingsMutation): Promise<void> {
  const raw = await readFileIfPresent(file)
  let doc: Record<string, unknown> = {}
  try {
    const parsed: unknown = raw === null ? {} : JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      doc = parsed as Record<string, unknown>
    }
  } catch {
    doc = {}
  }
  const next = mutate(doc)
  await mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.picode-tmp`
  await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`)
  await rename(temp, file)
}

async function readFileIfPresent(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf-8')
  } catch {
    return null
  }
}

/** Strip trailing separators: `path/` must lstat the LINK, never demand a
 * directory behind it (the rm -rf trailing-slash trap). */
export function normalizeEntryPath(entryPath: string): string {
  let trimmed = entryPath
  while (trimmed.length > 1 && trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1)
  return trimmed
}

/** lstat classification of an entry: symlinks stay symlinks (stat would
 * follow them — exactly what a delete must not do). null = missing. */
export function entryKindOf(entryPath: string): 'symlink' | 'real-dir' | 'real-file' | null {
  try {
    const stats = lstatSync(entryPath)
    if (stats.isSymbolicLink()) return 'symlink'
    if (stats.isDirectory()) return 'real-dir'
    if (stats.isFile()) return 'real-file'
    return null
  } catch {
    return null
  }
}

/** Result of a validated delete attempt. */
export type DeleteOutcome =
  | { ok: true; kind: 'symlink' | 'real-dir' | 'real-file' }
  | { ok: false; error: string }

/**
 * Delete ONE entry under `~/.pi/agent/skills` after re-validating at action
 * time (the probe's classification may be stale):
 *
 * 1. normalize trailing separators, refuse the skills dir itself;
 * 2. lexical containment under the skills dir;
 * 3. lstat: symlink → `unlink` ONLY (the target is never read or written —
 *    a dangling link deletes the same way); real dir/file → `rm` recursive
 *    on THAT entry, whose realpath must still be inside the skills dir;
 * 4. anything missing or unclassifiable is refused with an error.
 */
export async function deleteSkillEntry(options: { path: string; piSkillsDir: string }): Promise<DeleteOutcome> {
  const entryPath = normalizeEntryPath(options.path)
  const piSkillsDir = normalizeEntryPath(options.piSkillsDir)
  if (entryPath === piSkillsDir || entryPath === '') {
    return { ok: false, error: 'Refusing to delete the skills directory itself.' }
  }
  if (!isUnderPiSkillsDir(entryPath, piSkillsDir)) {
    return { ok: false, error: 'Only entries under ~/.pi/agent/skills can be deleted here.' }
  }
  const kind = entryKindOf(entryPath)
  if (kind === null) {
    return { ok: false, error: 'The entry no longer exists on disk.' }
  }
  if (kind === 'symlink') {
    // Unlink the link itself. Never lstat-verify the target, never recurse:
    // where the link points is none of the delete's business.
    try {
      await unlink(entryPath)
      return { ok: true, kind }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
  // Real dir/file: its REAL path must still be inside the skills dir
  // (guards against a directory swap between probe and click). Both sides
  // are realpathed — on macOS, /tmp is a symlink to /private/tmp, so a
  // sandbox dir and its realpath differ textually while meaning the same
  // place; the comparison must run on resolved paths on BOTH sides.
  try {
    const real = realpathSync(entryPath)
    const realSkillsDir = realpathSync(piSkillsDir)
    if (!isUnderPiSkillsDir(real, realSkillsDir)) {
      return { ok: false, error: 'The entry no longer resolves inside ~/.pi/agent/skills.' }
    }
  } catch {
    return { ok: false, error: 'The entry no longer exists on disk.' }
  }
  try {
    await rm(entryPath, { recursive: true, force: false })
    return { ok: true, kind }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Re-export for callers that prefer the short name. */
export { readPiSettingsSync as readPiSettings }
