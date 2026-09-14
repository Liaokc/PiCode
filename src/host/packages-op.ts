import type { PackagesOpDescriptor, PackagesOpOutcome, PackagesProgressEvent } from '../shared/packages-management'

/**
 * Packages-op collector (ticket 64): the write side of package management.
 * A short-lived host-family process performs ONE install or remove through
 * the SDK's own DefaultPackageManager — the exact code path
 * `pi install`/`pi remove` run — relaying progress events over IPC while
 * it works (ADR-0003: the Pi SDK never loads in the main process). The
 * trust gate for project-scope ops mirrors the SDK's own `pi install -l`:
 * an op Pi would refuse is refused before anything touches the disk. The
 * pure wiring lives here; the host entry (`--packages-op`) constructs the
 * real SDK objects around it.
 */

/** Structural subset of the SDK's PackageManager the op needs. */
export interface OpPackageManagerLike {
  setProgressCallback(
    callback: ((event: { type: string; action: string; source: string; message?: string }) => void) | undefined
  ): void
  installAndPersist(source: string, options?: { local?: boolean }): Promise<void>
  removeAndPersist(source: string, options?: { local?: boolean }): Promise<boolean>
}

const PROGRESS_PHASES = new Set(['start', 'progress', 'complete', 'error'])

/**
 * Perform one packages op against the structural manager, forwarding the
 * SDK's progress events (normalized to the relay shape). The trust gate
 * has already run by the time this is called (the host entry refuses
 * untrusted project ops before constructing anything). Errors resolve —
 * never throw — so the host can always report an outcome and exit.
 */
export async function runOpWithManager(
  manager: OpPackageManagerLike,
  descriptor: PackagesOpDescriptor,
  onProgress: (event: PackagesProgressEvent) => void
): Promise<PackagesOpOutcome> {
  manager.setProgressCallback((event) => {
    onProgress({
      kind: 'packages-progress',
      phase: PROGRESS_PHASES.has(event.type) ? (event.type as PackagesProgressEvent['phase']) : 'progress',
      action: event.action === 'remove' ? 'remove' : 'install',
      source: event.source,
      message: event.message ?? null
    })
  })
  try {
    if (descriptor.op === 'install') {
      await manager.installAndPersist(descriptor.source, { local: descriptor.local })
    } else {
      await manager.removeAndPersist(descriptor.source, { local: descriptor.local })
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    manager.setProgressCallback(undefined)
  }
}
