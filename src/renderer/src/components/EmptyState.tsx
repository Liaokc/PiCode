import { useMemo, type JSX } from 'react'
import { greetingForHour } from '../../../shared/greeting'
import Composer from './Composer'

const QUICK_START_CHIPS = ['Weekly Report', 'Bug Fix', 'Slide Maker', 'Idle Tasks'] as const

/** Big faint brand mark floating above the empty-state greeting (screenshot 02). */
function WatermarkPi(): JSX.Element {
  return (
    <svg className="empty-mark" viewBox="0 0 360 250" fill="none" aria-hidden="true">
      <path d="M26 110 C110 92, 240 74, 336 62" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
      <path d="M52 106 L30 150" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
      <path d="M116 96 L96 232" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
      <path d="M212 84 C202 152, 178 208, 140 234" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
    </svg>
  )
}

interface EmptyStateProps {
  /** True while a session is being created after a folder pick. */
  creating: boolean
  /** First send from the empty state: App turns it into folder-pick + first prompt. */
  onSend: (text: string) => void
}

/**
 * Empty state: greeting, centered composer card and quick-start chip slots,
 * matching screenshot 02's composition. The first send picks a working
 * directory, boots the agent host session, then runs the typed prompt.
 */
export default function EmptyState({ creating, onSend }: EmptyStateProps): JSX.Element {
  // `VITE_PICODE_FAKE_HOUR` pins the greeting for deterministic screenshot QA.
  const pinnedHour = Number(import.meta.env.VITE_PICODE_FAKE_HOUR)
  const greeting = useMemo(
    () => greetingForHour(Number.isInteger(pinnedHour) ? pinnedHour : new Date().getHours()),
    [pinnedHour]
  )

  return (
    <div className="empty-state">
      <WatermarkPi />
      <h1 className="empty-greeting">{greeting}</h1>

      <Composer
        busy={false}
        disabled={creating}
        placeholder={creating ? 'Starting session…' : 'Ask anything — @ to add context, / for commands'}
        onSend={onSend}
        onStop={() => {}}
      />

      <div className="quick-chips" role="list" aria-label="Quick starts">
        {QUICK_START_CHIPS.map((label) => (
          <button key={label} type="button" className="quick-chip" role="listitem">
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
