/**
 * Visual-harness session store seeding (ticket 20 integration): the visual
 * harnesses need DETERMINISTIC sidebar content — status dots depend on the
 * session index (mtime-based liveness) and the new-task chip depends on
 * recent projects (also index-derived). Seeding an isolated store (via
 * PICODE_SESSION_DIR, the same isolation the smoke uses) decouples the shots
 * from the operator's real session store. Never touches ~/.pi/agent/sessions.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** One minimal fake Pi session to seed into a visual store. */
export interface VisualSeedSession {
  id: string
  cwd: string
  userText: string
}

/** Write one fake session jsonl (header + one user message = the title). */
export function writeVisualSession(dir: string, session: VisualSeedSession): string {
  const now = new Date().toISOString()
  const lines = [
    JSON.stringify({ type: 'session', version: 3, id: session.id, timestamp: now, cwd: session.cwd }),
    JSON.stringify({
      type: 'message',
      id: `${session.id}-u1`,
      parentId: null,
      timestamp: now,
      message: { role: 'user', content: [{ type: 'text', text: session.userText }] }
    })
  ]
  const file = path.join(dir, `visual-${session.id}.jsonl`)
  writeFileSync(file, lines.join('\n') + '\n')
  return file
}

/** Ensure the visual run has an isolated session store; returns its path.
 * MUST run before the session index is constructed (it reads the env once). */
export function ensureVisualStore(): string {
  if (!process.env['PICODE_SESSION_DIR']) {
    process.env['PICODE_SESSION_DIR'] = mkdtempSync(path.join(tmpdir(), 'picode-visual-store-'))
  }
  return process.env['PICODE_SESSION_DIR'] as string
}
