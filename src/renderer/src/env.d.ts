/// <reference types="vite/client" />
import type { HostToParent, ParentToHost } from '../shared/contract'
import type { ReviewResult } from '../shared/review/types'

interface ImportMetaEnv {
  /** QA hook: pin the empty-state greeting hour so screenshot runs are deterministic. */
  readonly VITE_PICODE_FAKE_HOUR?: string
  /** QA hook: launch with the side panel expanded (screenshot 03 composition). */
  readonly VITE_PICODE_PANEL_OPEN?: string
}

interface PicodeChatBridge {
  sendToHost(message: ParentToHost): void
  /** Subscribe to the Seam-1 contract stream; returns an unsubscribe function. */
  onHostEvent(listener: (event: HostToParent) => void): () => void
  pickWorkingDirectory(): Promise<string | null>
}

interface PicodeReviewBridge {
  /** Collect a workspace-vs-HEAD diff snapshot for the given directory. */
  load(cwd: string): Promise<ReviewResult>
}

declare global {
  interface Window {
    picode: {
      versions: {
        app: string
        electron: string
        chrome: string
        node: string
      }
      chat: PicodeChatBridge
      review: PicodeReviewBridge
    }
  }
}

export {}
