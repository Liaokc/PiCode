import { useEffect, useRef, type JSX } from 'react'
import type { TranscriptItem } from '../../../shared/sessions/types'

interface FollowViewProps {
  title: string
  items: TranscriptItem[]
  /** True while the source file is still growing (TUI actively writing). */
  live: boolean
  onStop: () => void
}

/**
 * Live Follow (read-only): streams the transcript of a session that is
 * running in another window (typically the pi TUI). This view has NO
 * composer — Live Follow is strictly zero-write on the PiCode side.
 */
export default function FollowView({ title, items, live, onStop }: FollowViewProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keep the newest content in view as the other side streams.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [items])

  return (
    <div className="chat-view">
      <div className="chat-topbar">
        <span className="chat-topbar-title" title={title}>
          {title}
        </span>
        <span className={live ? 'follow-badge follow-badge-live' : 'follow-badge'}>
          <span className="sb-live-dot" aria-hidden="true" />
          {live ? 'Live · read-only' : 'Read-only'}
        </span>
        <button type="button" className="chat-topbar-btn" onClick={onStop}>
          Stop following
        </button>
      </div>
      <div ref={scrollRef} className="chat-scroll">
        <div className="chat-thread">
          {items.length === 0 && <div className="follow-empty">Waiting for activity in this session…</div>}
          {items.map((item) =>
            item.role === 'user' ? (
              <div key={item.id} className="msg msg-user">
                {item.text}
              </div>
            ) : (
              <div key={item.id} className="msg msg-assistant">
                {item.text}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
