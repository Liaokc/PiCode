/**
 * Pure trust-posture resolution (ticket 06).
 *
 * Pi's "trust" is the gate for whether project-local resources (`.pi/settings`,
 * extensions, skills) load into a session — distinct from PiCode's per-tool
 * approval gate. This helper is invoked by the child host (where the SDK lives)
 * from its session's SettingsManager, and relayed to the renderer via `ready`.
 * It is read-only: we never modify Pi's config, only read the current decision.
 *
 * The helper is dependency-injected (a SettingsManager rather than a directory)
 * so tests drive it with a read-only in-memory sample — no real `~/.pi` config
 * is read or written.
 */
import type { SettingsManager } from "@earendil-works/pi-coding-agent";
import { hasTrustRequiringProjectResources } from "@earendil-works/pi-coding-agent";
import type { TrustInfo } from "./contract";

/** Resolve the trust posture from a SettingsManager against a working directory. */
export function trustPostureFrom(
  settingsManager: SettingsManager,
  cwd: string,
): TrustInfo {
  return {
    defaultProjectTrust: settingsManager.getDefaultProjectTrust(),
    hasTrustResources: hasTrustRequiringProjectResources(cwd),
  };
}
