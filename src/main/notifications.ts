/**
 * System notifications for background-session approval gates (ticket 25).
 * When a session the user is NOT looking at hits the approval gate, the
 * renderer asks this module to raise the OS notification; clicking it
 * foregrounds the window and deep-links to the waiting session (the
 * renderer focuses it through the session registry — same routing as a
 * sidebar click on a live in-app session).
 *
 * The notification is only the knock on the door: the pill itself lives in
 * the session's transcript state and stays pending until a human decides —
 * a click never approves anything (绝不自动批准).
 */

import { Notification, type BrowserWindow } from 'electron'

export interface ApprovalNotice {
  sessionId: string
  toolName: string
  /** Session display title when known; null falls back to a generic body. */
  title: string | null
}

/** IPC payload guard: notifications arrive from the renderer over IPC. */
export function parseApprovalNotice(value: unknown): ApprovalNotice | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.sessionId !== 'string' || v.sessionId === '') return null
  if (typeof v.toolName !== 'string' || v.toolName === '') return null
  if (v.title !== null && typeof v.title !== 'string') return null
  return { sessionId: v.sessionId, toolName: v.toolName, title: v.title as string | null }
}

export interface ApprovalNotifierOptions {
  getWindow: () => BrowserWindow | null
  /** Observe every notice (smoke seam): fired even when the OS layer is
   * unavailable, so the pipeline stays assertable end to end. */
  onNotice?: (notice: ApprovalNotice) => void
}

export interface ApprovalNotifier {
  notify(notice: ApprovalNotice): void
}

export function createApprovalNotifier(options: ApprovalNotifierOptions): ApprovalNotifier {
  return {
    notify(notice: ApprovalNotice): void {
      options.onNotice?.(notice)
      const win = options.getWindow()
      if (win === null || !Notification.isSupported()) return
      const where = notice.title !== null ? `"${notice.title}"` : 'A task'
      const notification = new Notification({
        title: 'Approval needed',
        body: `${where} is waiting for approval to run ${notice.toolName}.`
      })
      notification.on('click', () => {
        focusSessionFromNotification(options.getWindow, notice.sessionId)
      })
      notification.show()
    }
  }
}

/** The notification-click action, factored out so the smoke can drive the
 * exact same path (window foreground + focus deep link). Sends the renderer
 * the focus request; the App routes it through the session registry. */
export function focusSessionFromNotification(getWindow: () => BrowserWindow | null, sessionId: string): void {
  const win = getWindow()
  if (win === null || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  win.webContents.send('notifications:focus-session', sessionId)
}
