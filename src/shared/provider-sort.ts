/**
 * Provider menu order (ticket 76): configured providers first, unconfigured
 * after, alphabetical within each group — the same rule for the settings
 * window's Models section and the composer's model menu (the pi16
 * reference frames showed a signed-in provider sinking to the bottom of a
 * registry-ordered list).
 *
 * Zero new contract: the sort joins the credential probe report the App
 * already holds (ticket 11's auth channel) against the provider lists the
 * renderer renders — the host payloads stay untouched. A missing or empty
 * report degrades to the incoming order (nothing is known about
 * credentials, so nothing is reordered).
 */

import type { AuthProbeReport } from './auth-status.ts'

/** Minimal row the sort works over — the settings status rows, the cascade
 * provider groups, and the new-task catalog groups all fit it. */
interface ProviderRow {
  providerId: string
  name: string
}

/**
 * The providers holding credentials, from the probe report. null = the
 * report is missing, failed, or scanned to nothing — the sort degrades to
 * the incoming order instead of guessing. An expired OAuth credential
 * still counts (authType is set); health coloring stays the settings
 * window's own concern.
 */
export function configuredProviderIds(report: AuthProbeReport | null): ReadonlySet<string> | null {
  if (report === null || report.error !== null || report.providers.length === 0) return null
  const ids = new Set<string>()
  for (const provider of report.providers) {
    if (provider.authType !== null) ids.add(provider.providerId)
  }
  return ids
}

/** Locale-free alphabetical order: display name case-folded, provider id
 * as the tiebreaker, stable otherwise. */
function byDisplayName(a: ProviderRow, b: ProviderRow): number {
  const aName = a.name.toLowerCase()
  const bName = b.name.toLowerCase()
  if (aName !== bName) return aName < bName ? -1 : 1
  if (a.providerId !== b.providerId) return a.providerId < b.providerId ? -1 : 1
  return 0
}

/**
 * Sort provider rows: configured (in `configured`) first, the rest after,
 * alphabetical within each group. A null `configured` (missing/empty
 * report) returns the rows in their incoming order. Never mutates the
 * input; nested model lists ride their group untouched — the model column
 * inside a group is never reordered.
 */
export function sortProvidersConfiguredFirst<T extends ProviderRow>(
  rows: readonly T[],
  configured: ReadonlySet<string> | null
): T[] {
  if (configured === null) return [...rows]
  const rank = (row: T): number => (configured.has(row.providerId) ? 0 : 1)
  return [...rows].sort((a, b) => rank(a) - rank(b) || byDisplayName(a, b))
}
