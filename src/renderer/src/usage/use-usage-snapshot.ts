import { useEffect, useState } from 'react'
import type { UsageSnapshot } from '../../../shared/usage/aggregate'

export interface UsageSnapshotState {
  snapshot: UsageSnapshot | null
  error: string | null
}

/**
 * Fetches the aggregated usage snapshot from the main process (Seam-2 via the
 * preload bridge). The renderer never reads session files — this hook is the
 * only data door for every chart on the Usage page.
 */
export function useUsageSnapshot(): UsageSnapshotState {
  const [state, setState] = useState<UsageSnapshotState>({ snapshot: null, error: null })

  useEffect(() => {
    let alive = true
    window.picode.usage
      .snapshot()
      .then((snapshot) => {
        if (alive) setState({ snapshot, error: null })
      })
      .catch((err: unknown) => {
        if (alive) setState({ snapshot: null, error: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      alive = false
    }
  }, [])

  return state
}
