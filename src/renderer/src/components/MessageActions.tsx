import { useEffect, useRef, useState, type JSX } from 'react'
import { CheckIcon, CopyIcon } from './icons'

/**
 * Per-message action row (screenshot 04: copy control + timestamp under the
 * assistant reply). The copy acts on the message's plain text. The timestamp
 * is stamped once on mount — the contract stream carries no clock, and the
 * reducer stays time-free.
 */
export default function MessageActions({ text }: { text: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const [time, setTime] = useState('')
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Async stamp: keep the effect itself side-effect-free (purity lint).
    const stamp = setTimeout(() => {
      const d = new Date()
      setTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    }, 0)
    return () => {
      clearTimeout(stamp)
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
    }
  }, [])

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable — leave the row as-is.
    }
  }

  return (
    <div className="msg-actions">
      <button type="button" className="msg-action-btn" onClick={() => void handleCopy()} aria-label="Copy message">
        {copied ? <CheckIcon size={13} className="msg-action-copied" /> : <CopyIcon size={13} />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
      {time !== '' && <span className="msg-actions-time">{time}</span>}
    </div>
  )
}
