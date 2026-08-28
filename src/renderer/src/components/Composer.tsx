import { useState, type JSX, type KeyboardEvent } from 'react'
import { ArrowUpIcon, PlusIcon, ShieldCheckIcon, StopIcon, GaugeIcon } from './icons'

interface ComposerProps {
  /** Agent run in flight — send becomes stop (screenshot 01). */
  busy: boolean
  /** No usable session (or one is starting) — input is inert. */
  disabled: boolean
  placeholder: string
  onSend: (text: string) => void
  onStop: () => void
}

/**
 * The ZCode composer card: input line, attach/access chips on the left,
 * model/thinking chips and the send/stop control on the right. Enter sends,
 * Shift+Enter inserts a newline (user story 17). Model/access chips stay
 * inert until their tickets (05+).
 */
export default function Composer({ busy, disabled, placeholder, onSend, onStop }: ComposerProps): JSX.Element {
  const [value, setValue] = useState('')

  function submit(): void {
    const text = value.trim()
    if (!text || disabled || busy) return
    onSend(text)
    setValue('')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (busy) return
      submit()
    }
  }

  return (
    <section className="composer" aria-label="Composer">
      <textarea
        className="composer-input"
        placeholder={placeholder}
        aria-label="Message composer"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <footer className="composer-footer">
        <button type="button" className="cmp-icon-btn" aria-label="Attach file" disabled={disabled}>
          <PlusIcon />
        </button>
        <button type="button" className="cmp-chip cmp-access" disabled={disabled}>
          <ShieldCheckIcon />
          <span>Full Access</span>
          <span className="cmp-caret">⌄</span>
        </button>
        <span className="composer-spring" />
        <button type="button" className="cmp-chip cmp-muted" disabled={disabled}>
          <span>Select Model</span>
          <span className="cmp-caret">⌄</span>
        </button>
        <button type="button" className="cmp-chip cmp-muted" disabled={disabled}>
          <GaugeIcon />
          <span>Max</span>
          <span className="cmp-caret">⌄</span>
        </button>
        {busy ? (
          <button type="button" className="cmp-stop" aria-label="Stop generating" onClick={onStop}>
            <StopIcon />
          </button>
        ) : (
          <button
            type="button"
            className="cmp-send"
            aria-label="Send message"
            disabled={disabled || value.trim() === ''}
            onClick={submit}
          >
            <ArrowUpIcon />
          </button>
        )}
      </footer>
    </section>
  )
}
