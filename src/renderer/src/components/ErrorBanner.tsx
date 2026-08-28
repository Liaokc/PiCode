import type { JSX } from 'react'
import type { ChatError } from '../../../shared/chat-reducer'

interface ErrorBannerProps {
  error: ChatError
  /** Rebuild a crashed host session on the same working directory. */
  onRebuild: () => void
  /** Abandon the failed session and pick a different folder. */
  onPickAnotherFolder: () => void
  onDismiss: () => void
}

const TITLES: Record<ChatError['kind'], string> = {
  host: 'The agent host stopped running',
  session: 'The session could not be started',
  agent: 'The agent hit an error'
}

/**
 * Failure surface per ticket 02: a clear banner (never a dead window). Host
 * crashes offer rebuild/replace; agent errors only need a dismissal since the
 * session itself is still usable.
 */
export default function ErrorBanner({ error, onRebuild, onPickAnotherFolder, onDismiss }: ErrorBannerProps): JSX.Element {
  return (
    <div className={`error-banner error-banner-${error.kind}`} role="alert">
      <div className="error-banner-text">
        <strong>{TITLES[error.kind]}</strong>
        <span>{error.message}</span>
      </div>
      <div className="error-banner-actions">
        {error.kind === 'host' && error.cwd && (
          <button type="button" className="error-banner-btn error-banner-btn-primary" onClick={onRebuild}>
            Rebuild Session
          </button>
        )}
        {error.kind !== 'agent' && (
          <button type="button" className="error-banner-btn" onClick={onPickAnotherFolder}>
            Choose Another Folder
          </button>
        )}
        {error.kind === 'agent' && (
          <button type="button" className="error-banner-btn" onClick={onDismiss} aria-label="Dismiss error">
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
