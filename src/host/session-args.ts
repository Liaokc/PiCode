/**
 * Session-spawn argv encoding for the agent host (ticket 11). The supervisor
 * passes PiCode's new-session defaults to the host atomically at fork time —
 * a trailing sentinel argument carrying JSON. Keeping this pure (and
 * legacy-shaped when no defaults are set) keeps the headless contract smoke
 * and every older spawn path byte-identical.
 */
import type { SessionDefaults } from '../shared/preferences.ts'
import { ACCESS_MODES } from '../shared/composer/access.ts'
import type { AccessMode } from '../shared/contract.ts'

export const DEFAULTS_ARG_PREFIX = 'picode:defaults='

export interface SessionArgs {
  cwd: string
  resumeFile: string | null
  defaults: SessionDefaults | null
}

/** True when at least one default field is present. */
export function hasSessionDefaults(defaults: SessionDefaults | null | undefined): boolean {
  if (defaults === null || defaults === undefined) return false
  const { providerId, modelId, thinkingLevel, accessMode } = defaults
  return providerId !== undefined || modelId !== undefined || thinkingLevel !== undefined || accessMode !== undefined
}

/**
 * Host argv after the entry path: `[cwd, resumeFile?, sentinel?]`.
 * With no defaults the encoding is exactly the legacy shape.
 */
export function encodeSessionArgs(
  cwd: string,
  resumeFile: string | null | undefined,
  defaults: SessionDefaults | null | undefined
): string[] {
  const args = [cwd]
  if (resumeFile) args.push(resumeFile)
  if (hasSessionDefaults(defaults)) {
    args.push(DEFAULTS_ARG_PREFIX + JSON.stringify(defaults))
  }
  return args
}

/** Parse host argv (argv[2..]) into the spawn intent. Requires a cwd. */
export function parseSessionArgs(argv: readonly string[]): SessionArgs {
  const rest = argv.slice(2)
  let cwd: string | null = null
  let resumeFile: string | null = null
  let defaults: SessionDefaults | null = null
  for (const arg of rest) {
    if (arg.startsWith(DEFAULTS_ARG_PREFIX)) {
      try {
        const parsed: unknown = JSON.parse(arg.slice(DEFAULTS_ARG_PREFIX.length))
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          const record: Record<string, unknown> = { ...(parsed as Record<string, unknown>) }
          // Ticket 80: the additive accessMode normalizes defensively — an
          // out-of-vocabulary value is dropped (the gate keeps its own
          // fallback) while the rest of the payload passes unchanged.
          if (record['accessMode'] !== undefined && !ACCESS_MODES.includes(record['accessMode'] as AccessMode)) {
            delete record['accessMode']
          }
          defaults = record as SessionDefaults
        }
      } catch {
        // Malformed sentinel — ignore; Pi applies its own defaults.
      }
      continue
    }
    if (cwd === null) cwd = arg
    else if (resumeFile === null) resumeFile = arg
  }
  if (cwd === null) throw new Error('agent host requires a working directory as argv[2]')
  return { cwd, resumeFile, defaults }
}
