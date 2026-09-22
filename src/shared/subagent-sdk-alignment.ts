/**
 * Ticket 134: the pure model of the bundled-SDK / pi-subagents alignment
 * check. The batch's second empty run proved the second root factor: the
 * app's bundled pi-ai 0.85.1 had no transcript utilities export
 * (`createInitialSystemMessage` / `toToolDeclaration`, added in 0.86.0),
 * while pi-subagents ≥ 0.70 (watchdog review.js / permission-arbiter.js)
 * imports them at module load — the extension fails to load entirely, so
 * in-app subagents are dead no matter how good the spawn PATH is.
 *
 * The main process reads the two version facts (the app's bundled SDK
 * package.json and the operator's ~/.pi/agent npm pi-subagents) and this
 * model decides whether the honest startup notice must fire — never a
 * silent failure.
 */

/** The SDK floor pi-subagents 0.70.x needs (transcript utilities export). */
export const SUBAGENTS_SDK_FLOOR = '0.86.1'
/** The pi-subagents floor whose review chain needs the SDK floor above. */
export const SUBAGENTS_PACKAGE_FLOOR = '0.70.0'

/** Numeric dot-version comparison (missing or non-numeric parts count as 0). */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string): number[] =>
    value
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
 * The honest startup notice when the installed combination cannot run
 * in-app subagents: pi-subagents at or past 0.70 against an SDK older than
 * 0.86.1. Null in every healthy case (newer SDK, older pi-subagents, or
 * either side absent — absence is the bridge's designed silent degrade).
 */
export function subagentsSdkAlignmentNotice(sdkVersion: string | null, subagentsVersion: string | null): string | null {
  if (sdkVersion === null || subagentsVersion === null) return null
  if (compareVersions(sdkVersion, SUBAGENTS_SDK_FLOOR) >= 0) return null
  if (compareVersions(subagentsVersion, SUBAGENTS_PACKAGE_FLOOR) < 0) return null
  return (
    `Subagents cannot start: pi-subagents ${subagentsVersion} requires the Pi SDK ` +
    `${SUBAGENTS_SDK_FLOOR} or newer, but this app bundles ${sdkVersion}. ` +
    'Update PiCode to use in-app subagents.'
  )
}
