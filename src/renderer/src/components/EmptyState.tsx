import { useMemo, type JSX } from 'react'
import { greetingForHour } from '../../../shared/greeting'
import {
  ArrowUpIcon,
  GaugeIcon,
  PlusIcon,
  ShieldCheckIcon
} from './icons'

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

/**
 * Empty state: greeting, centered static composer card and quick-start chip
 * slots, matching screenshot 02's composition. Functional wiring arrives with
 * the host loop in ticket 02 — controls render inert by design here.
 */
export default function EmptyState(): JSX.Element {
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

      <section className="composer" aria-label="Composer">
        <textarea
          className="composer-input"
          placeholder="Ask anything — @ to add context, / for commands"
          aria-label="Message composer"
        />
        <footer className="composer-footer">
          <button type="button" className="cmp-icon-btn" aria-label="Attach file">
            <PlusIcon />
          </button>
          <button type="button" className="cmp-chip cmp-access">
            <ShieldCheckIcon />
            <span>Full Access</span>
            <span className="cmp-caret">⌄</span>
          </button>
          <span className="composer-spring" />
          <button type="button" className="cmp-chip cmp-muted">
            <span>Select Model</span>
            <span className="cmp-caret">⌄</span>
          </button>
          <button type="button" className="cmp-chip cmp-muted">
            <GaugeIcon />
            <span>Max</span>
            <span className="cmp-caret">⌄</span>
          </button>
          <button type="button" className="cmp-send" aria-label="Send message">
            <ArrowUpIcon />
          </button>
        </footer>
      </section>

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
