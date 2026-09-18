/**
 * Bounded single-line text for the subagent bridge surfaces (ticket 90):
 * one shared normalize/clamp/ellipsis shape for the forwarded lifecycle
 * payloads and the directory's row previews, so the two never drift.
 */

/** Collapse whitespace, trim, and clamp to `max` chars with an ellipsis.
 * Returns null for empty input (absence is meaningful — no preview). */
export function clampInlineText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized === '') return null
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`
}
