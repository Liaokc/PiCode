import { useMemo, type JSX } from 'react'
import { greetingForHour } from '../../../shared/greeting'
import Composer, { type ComposerApi } from './Composer'
import { BugIcon, CalendarIcon, ClockIcon, MonitorIcon } from './icons'
import { initialChatState } from '../../../shared/chat-reducer'

/** Quick-start chips with the reference's per-chip leading icon (screenshot 02). */
const QUICK_START_CHIPS: ReadonlyArray<{ label: string; icon: (props: { size: number }) => JSX.Element }> = [
  { label: 'Weekly Report', icon: CalendarIcon },
  { label: 'Bug Fix', icon: BugIcon },
  { label: 'Slide Maker', icon: MonitorIcon },
  { label: 'Idle Tasks', icon: ClockIcon }
]

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
  /** Composer commands (the first send turns into folder-pick + first prompt). */
  composerApi: ComposerApi
}

/**
 * Empty state: greeting, centered composer card and quick-start chip slots,
 * matching screenshot 02's composition. The composer runs with the initial
 * chat state (no menus data yet); the first send picks a working directory,
 * boots the agent host session, then runs the typed prompt.
 */
export default function EmptyState({ creating, composerApi }: EmptyStateProps): JSX.Element {
  // `VITE_PICODE_FAKE_HOUR` pins the greeting for deterministic screenshot QA.
  const pinnedHour = Number(import.meta.env.VITE_PICODE_FAKE_HOUR)
  const greeting = useMemo(
    () => greetingForHour(Number.isInteger(pinnedHour) ? pinnedHour : new Date().getHours()),
    [pinnedHour]
  )
  const idleChat = initialChatState()

  return (
    <div className="empty-state">
      <WatermarkPi />
      <h1 className="empty-greeting">{greeting}</h1>

      <Composer
        busy={false}
        disabled={creating}
        placeholder={creating ? 'Starting session…' : 'Ask anything — @ to add context, / for commands'}
        chat={idleChat}
        queue={idleChat.queue}
        {...composerApi}
      />

      <div className="quick-chips" role="list" aria-label="Quick starts">
        {QUICK_START_CHIPS.map(({ label, icon: Icon }) => (
          <button key={label} type="button" className="quick-chip" role="listitem">
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
