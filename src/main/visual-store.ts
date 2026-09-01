/**
 * Visual-harness session store seeding (ticket 20 integration): the visual
 * harnesses need DETERMINISTIC sidebar content — status dots depend on the
 * session index (mtime-based liveness) and the new-task chip depends on
 * recent projects (also index-derived). Seeding an isolated store (via
 * PICODE_SESSION_DIR, the same isolation the smoke uses) decouples the shots
 * from the operator's real session store. Never touches ~/.pi/agent/sessions.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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

/** Real project fixture for the ticket-26 file-browser captures: the tree
 * reads through the REAL preview channel, so the browsed cwd must exist
 * with hidden entries (.git, .idea) and typed files on disk. Returns the
 * api-server project path (basename kept — the m3–m7 probes match the
 * group label). Like the visual store: isolated in tmpdir, never the
 * operator's filesystem. */
export function ensureVisualProjectFixture(): string {
  const api = path.join(tmpdir(), `picode-visual-projects-${process.pid}`, 'api-server')
  mkdirSync(path.join(api, '.git'), { recursive: true })
  mkdirSync(path.join(api, '.idea'), { recursive: true })
  mkdirSync(path.join(api, 'src', 'host'), { recursive: true })
  writeFileSync(path.join(api, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  writeFileSync(path.join(api, '.idea', 'modules.xml'), '<?xml version="1.0"?>\n')
  writeFileSync(path.join(api, '.gitignore'), 'node_modules\n')
  writeFileSync(path.join(api, 'package.json'), '{\n  "name": "api-server"\n}\n')
  writeFileSync(path.join(api, 'README.md'), '# api-server\n\nFixture for the ticket-26 file browser captures.\n')
  writeFileSync(path.join(api, 'src', 'index.ts'), 'export const main = (): void => undefined\n')
  writeFileSync(path.join(api, 'src', 'App.tsx'), 'export const App = (): void => undefined\n')
  writeFileSync(path.join(api, 'src', 'host', 'files.ts'), 'export const list = (): string[] => []\n')
  return api
}
