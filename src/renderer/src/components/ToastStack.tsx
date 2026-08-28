import { useEffect, type JSX } from 'react'
import type { Toast, ToastList } from '../../../shared/toast'
import { CloseIcon } from './icons'

/** How long a toast stays up before auto-dismissing. */
const TOAST_DURATION_MS: Record<Toast['level'], number> = {
  info: 4_000,
  error: 8_000
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }): JSX.Element {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS[toast.level])
    return () => clearTimeout(timer)
  }, [toast.id, toast.level, onDismiss])

  return (
    <div className={`toast toast-${toast.level}`} role="status">
      <span className="toast-message">{toast.message}</span>
      <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
        <CloseIcon size={12} />
      </button>
    </div>
  )
}

interface ToastStackProps {
  toasts: ToastList
  onDismiss: (id: number) => void
}

/**
 * The global non-blocking notification surface (ticket 11): host notices
 * (compaction etc.) and session command failures surface here — nothing in
 * the app keeps its own ad-hoc toast. Errors stay up longer than infos.
 */
export default function ToastStack({ toasts, onDismiss }: ToastStackProps): JSX.Element | null {
  if (toasts.length === 0) return null
  return (
    <div className="toast-stack" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
