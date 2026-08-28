/// <reference types="vite/client" />
import type { HostToParent, ParentToHost } from '../shared/contract'

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
      usage: {
        snapshot: () => Promise<UsageSnapshot>
      }
    }
  }
}

export {}
