import { useEffect, useState } from 'react'

/**
 * Re-render timer so relative timestamps stay honest, and a stable render-time
 * `now` for derived displays (impure Date.now() confined to the initializer).
 */
export function useNowTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
