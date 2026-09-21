/**
 * Ticket 111 (pi-subagents 0.70.x adaptation): the async-runner host-package
 * override. pi-subagents' detached runner resolves the SDK package it runs
 * children against from the process entry (the pi TUI's own binary path);
 * a bundled host layout — entry `out/main/host.js`, the SDK in the app's
 * `node_modules` — never matches, and every async launch failed closed with
 * "Background children require a supported standalone Pi host or the
 * installed npm package (@earendil-works/pi-coding-agent); neither is
 * available". The documented escape hatch is the
 * `PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT` override (pi-subagents
 * docs/configuration.md; consulted when argv-based discovery cannot
 * identify the host, e.g. wrapper installs and non-standard layouts).
 *
 * The host points the override at the EXACT SDK tree it runs (the package's
 * own root, whose nested node_modules also satisfy the runner's peer-alias
 * validation) — children share one SDK instance, never a second copy. Set
 * BEFORE the extension pipeline loads pi-subagents: the extension reads the
 * env once at module import.
 */

/** The override pi-subagents honors for background children (0.68.0+,
 * #2254). Kept here beside the setter so the name never drifts. */
export const SUBAGENT_RUNNER_PACKAGE_ROOT_ENV = 'PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT'

/**
 * Idempotent: an explicit operator override always wins. Inside an app.asar
 * archive the env stays unset — the detached runner is a plain node process
 * that cannot read asar, so pointing at the archive would trade a clear
 * fail-closed spawn error for a confusing module-resolution failure.
 */
export function ensureSubagentRunnerPackageRoot(sdkPackageDir: string): void {
  if (process.env[SUBAGENT_RUNNER_PACKAGE_ROOT_ENV] !== undefined) return
  if (sdkPackageDir.split(/[\\/]/).some((part) => part.endsWith('.asar'))) return
  process.env[SUBAGENT_RUNNER_PACKAGE_ROOT_ENV] = sdkPackageDir
}
