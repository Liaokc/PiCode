import { type JSX } from 'react'
import { useElapsedSeconds } from './use-elapsed-seconds'
import { LoaderIcon } from './icons'

/**
 * "Working · Ns" progress line (screenshot 01: 工作中 · 35 秒). Rendered right
 * after the message that started the current run, while the agent is in
 * flight. Seconds tick locally from mount — the reducer stays time-free.
 */
export default function WorkingLine(): JSX.Element {
  const seconds = useElapsedSeconds(true)

  return (
    <div className="working-line" role="status">
      <LoaderIcon size={13} className="working-line-icon spin" />
      <span className="working-line-label">Working</span>
      <span className="working-line-sep">·</span>
      <span className="working-line-duration">{seconds}s</span>
    </div>
  )
}
