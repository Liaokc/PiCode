/**
 * Session context-menu actions in the MAIN process (ticket 35): performs the
 * validated read-only actions through injected Electron io, and records every
 * PERFORMED action in a bounded log — the electron smoke's assertion surface
 * for "the menu action's IPC fired".
 */

import { parseSessionContextAction, type SessionContextAction } from '../../shared/sessions/context-actions'

/** The side effects, injected so the service stays testable without Electron. */
export interface ContextActionIO {
  reveal(file: string): void
  copy(text: string): void
}

/** Bounded log (the smoke asserts against it; normal runs never read it). */
const LOG_CAPACITY = 20

export class SessionContextActionService {
  private readonly performed: SessionContextAction[] = []

  constructor(private readonly io: ContextActionIO) {}

  /** Validate + perform one action; true when it was recognized and run. */
  perform(raw: unknown): boolean {
    const action = parseSessionContextAction(raw)
    if (action === null) return false
    if (action.kind === 'reveal') this.io.reveal(action.file)
    else this.io.copy(action.text)
    this.performed.push(action)
    if (this.performed.length > LOG_CAPACITY) this.performed.shift()
    return true
  }

  /** Everything performed so far, oldest first. */
  get log(): readonly SessionContextAction[] {
    return this.performed
  }
}
