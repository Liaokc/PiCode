/// <reference types="vite/client" />
import type { HostToParent, ParentToHost } from '../shared/contract'
import type { FollowUpdate, SessionSummary, TranscriptItem } from '../../shared/sessions/types'
import type { ReviewResult } from '../shared/review/types'
import type { PreviewResult } from '../shared/preview/types'

import type { UsageSnapshot } from '../../shared/usage/aggregate'

interface ImportMetaEnv {
  /** QA hook: pin the empty-state greeting hour so screenshot runs are deterministic. */
  readonly VITE_PICODE_FAKE_HOUR?: string
  /** QA hook: launch with the side panel expanded (screenshot 03 composition). */
  readonly VITE_PICODE_PANEL_OPEN?: string
  /** QA hook: open the settings window shell at launch (screenshot 09 composition). */
  readonly VITE_PICODE_VIEW?: string
}

interface PicodeChatBridge {
  sendToHost(message: ParentToHost): void
  /** Subscribe to the Seam-1 contract stream; returns an unsubscribe function. */
  onHostEvent(listener: (event: HostToParent) => void): () => void
  pickWorkingDirectory(): Promise<string | null>
}

interface PicodeSessionsBridge {
  list(): Promise<SessionSummary[]>
  /** Rename write-back for sessions NOT open in a host process. */
  rename(file: string, name: string): Promise<SessionSummary | null>
  /** Begin Live Follow tailing; resolves with the full transcript snapshot. */
  follow(file: string): Promise<{ file: string; items: TranscriptItem[] } | null>
  unfollow(): void
  onIndexChanged(listener: () => void): () => void
  onFollowUpdate(listener: (update: FollowUpdate) => void): () => void
}

interface PicodeReviewBridge {
  /** Collect a workspace-vs-HEAD diff snapshot for the given directory. */
  load(cwd: string): Promise<ReviewResult>
}

interface PicodePreviewBridge {
  /** Open a file (content) or directory (listing) for the Preview tab. */
  load(cwd: string, target: string): Promise<PreviewResult>
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
      sessions: PicodeSessionsBridge
      usage: {
        snapshot: () => Promise<UsageSnapshot>
      }
      review: PicodeReviewBridge
      preview: PicodePreviewBridge
    }
  }
}

export {}
