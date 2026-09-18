/**
 * preview-file:// local serve (ticket 88): the privileged scheme a sandboxed
 * HTML preview frame loads its document from. Because the scheme is
 * hierarchical (`preview-file://local/<abs path>`), relative resources in the
 * document resolve against the previewed file's own directory — exactly the
 * "base = 文件目录" contract.
 *
 * Security contract (ticket 88 安全核查留档):
 * - Scheme privileges: `standard` (hierarchical URLs → relative resolution)
 *   and `secure` (counts as a secure context in the dev http page). Nothing
 *   else — notably NOT `supportFetchAPI`, so frame scripts get no fetch()
 *   access to local files through this scheme.
 * - The handler serves only REGULAR FILES under directories registered when
 *   an HTML file is actually previewed (`addServeRoot`), after lexical
 *   normalization that kills `..` traversal, capped at PREVIEW_MAX_BYTES,
 *   never directories. Read-only: nothing here ever writes to disk.
 * - No credentials exist for the scheme: the frame is an opaque origin
 *   (iframe sandbox="allow-scripts" without allow-same-origin), so no
 *   cookies, storage, or app access; the handler sends no credentials and
 *   the app holds none for local files.
 * - text/html responses additionally carry `Content-Security-Policy: sandbox
 *   allow-scripts` — defense in depth, so the frame stays script-only
 *   isolated even if the iframe attribute were dropped somewhere.
 * - No Node access inside the frame: the window runs with nodeIntegration
 *   off and nodeIntegrationInSubFrames off, so sub-frames receive no preload
 *   bridge (window.picode is absent there).
 */

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { PREVIEW_MAX_BYTES, PREVIEW_SERVE_SCHEME, mimeForName } from '../../shared/preview/policy'

/** Directories whose files the protocol may serve. Registered only when an
 * HTML file is actually previewed (the operator opened it); in-memory for
 * the app run, never persisted. */
const serveRoots = new Set<string>()

/** Register a directory (and its subtree) as servable. Absolute, normalized
 * POSIX paths only; the filesystem root is refused — a previewed file at
 * `/x.html` must not turn EVERY regular file servable. */
export function addServeRoot(dir: string): void {
  if (!dir.startsWith('/') || dir === '/') return
  serveRoots.add(path.posix.normalize(dir))
}

/** Test/inspection helper. */
export function isServeRoot(dir: string): boolean {
  return serveRoots.has(path.posix.normalize(dir))
}

/** Test helper: forget every registered root. */
export function clearServeRoots(): void {
  serveRoots.clear()
}

/**
 * Pure containment predicate: may the handler serve this path right now?
 * The path is lexically normalized FIRST, so `..` traversal out of a root is
 * refused; symlinked paths are judged by their requested spelling (the
 * handler never resolves symlinks).
 */
export function isServablePath(absolutePath: string): boolean {
  if (!absolutePath.startsWith('/')) return false
  const normalized = path.posix.normalize(absolutePath)
  for (const root of serveRoots) {
    if (normalized === root || normalized.startsWith(`${root}/`)) return true
  }
  return false
}

/** The minimal protocol surface the installer needs — kept structural so the
 * module stays importable (and testable) without Electron. */
export interface PreviewServeProtocol {
  handle(scheme: string, handler: (request: { url: string }) => Promise<Response> | Response): void
}

/** Scheme privileges for protocol.registerSchemesAsPrivileged — must be
 * called before app ready (the index does it at module scope). */
export const previewServeSchemePrivileges = [
  {
    scheme: PREVIEW_SERVE_SCHEME,
    privileges: { standard: true, secure: true }
  }
]

/** Handle one preview-file:// request: resolve, check, stream the file.
 * Only the app's own `local` host is accepted — a frame (or anything else)
 * crafting `preview-file://<other-host>/…` is refused before path work. */
export async function servePreviewRequest(url: string): Promise<Response> {
  let pathname: string
  try {
    const parsed = new URL(url)
    if (parsed.host !== 'local') return new Response('forbidden', { status: 403 })
    pathname = decodeURIComponent(parsed.pathname)
  } catch {
    return new Response('bad request', { status: 400 })
  }
  const filePath = path.posix.normalize(pathname)
  if (!isServablePath(filePath)) return new Response('forbidden', { status: 403 })

  let info
  try {
    info = await stat(filePath)
  } catch {
    return new Response('not found', { status: 404 })
  }
  if (!info.isFile()) return new Response('not found', { status: 404 })
  if (info.size > PREVIEW_MAX_BYTES) return new Response('too large', { status: 413 })

  try {
    const body = await readFile(filePath)
    const headers: Record<string, string> = { 'content-type': mimeForName(filePath) }
    if (headers['content-type']!.startsWith('text/html')) {
      headers['content-security-policy'] = 'sandbox allow-scripts'
    }
    return new Response(body, { headers })
  } catch {
    return new Response('not found', { status: 404 })
  }
}

/** Install the protocol handler. Called from the index once app is ready. */
export function installPreviewServe(protocol: PreviewServeProtocol): void {
  protocol.handle(PREVIEW_SERVE_SCHEME, (request) => servePreviewRequest(request.url))
}
