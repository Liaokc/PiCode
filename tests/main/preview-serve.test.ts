import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  addServeRoot,
  clearServeRoots,
  isServablePath,
  isServeRoot,
  previewServeSchemePrivileges,
  servePreviewRequest
} from '../../src/main/preview/serve'
import { PREVIEW_MAX_BYTES, previewFileUrl } from '../../src/shared/preview/policy'

/**
 * The preview-file:// serve seam (ticket 88): the pure containment predicate
 * plus the real request handler against throwaway directories — the security
 * contract (roots only, no traversal, size cap, mime, html CSP sandbox) is
 * asserted, not eyeballed.
 */

let root: string

beforeAll(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'picode-preview-serve-'))
  mkdirSync(path.join(root, 'site'))
  writeFileSync(path.join(root, 'site/report.html'), '<!doctype html><p>hi</p>')
  writeFileSync(path.join(root, 'site/style.css'), 'body { color: #333 }')
  writeFileSync(path.join(root, 'site/pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  writeFileSync(path.join(root, 'outside.txt'), 'secret')
  addServeRoot(path.join(root, 'site'))
})

afterAll(() => {
  clearServeRoots()
  rmSync(root, { recursive: true, force: true })
})

describe('serve-root registration', () => {
  it('registers absolute directories and ignores relative junk', () => {
    expect(isServeRoot(path.join(root, 'site'))).toBe(true)
    addServeRoot('relative/path')
    expect(isServeRoot('relative/path')).toBe(false)
  })
})

describe('isServablePath — the containment predicate', () => {
  it('allows files inside a registered root', () => {
    expect(isServablePath(path.join(root, 'site/report.html'))).toBe(true)
    expect(isServablePath(path.join(root, 'site/sub/deep/x.css'))).toBe(true)
  })

  it('refuses everything outside the registered roots', () => {
    expect(isServablePath(path.join(root, 'outside.txt'))).toBe(false)
    expect(isServablePath('/etc/passwd')).toBe(false)
    expect(isServablePath('/')).toBe(false)
  })

  it('refuses relative paths and lexical traversal out of a root', () => {
    expect(isServablePath('site/report.html')).toBe(false)
    expect(isServablePath(path.join(root, 'site/../outside.txt'))).toBe(false)
    expect(isServablePath(`${path.join(root, 'site')}/../..${root}/outside.txt`)).toBe(false)
  })
})

describe('servePreviewRequest — the handler', () => {
  it('serves a registered file with the right mime and body', async () => {
    const response = await servePreviewRequest(previewFileUrl(path.join(root, 'site/report.html')))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    // Defense in depth: the html payload itself carries the sandbox CSP.
    expect(response.headers.get('content-security-policy')).toBe('sandbox allow-scripts')
    expect(await response.text()).toBe('<!doctype html><p>hi</p>')
  })

  it('serves subresources (css/png) without the html CSP header', async () => {
    const css = await servePreviewRequest(previewFileUrl(path.join(root, 'site/style.css')))
    expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8')
    expect(css.headers.get('content-security-policy')).toBeNull()
    const png = await servePreviewRequest(previewFileUrl(path.join(root, 'site/pic.png')))
    expect(png.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await png.arrayBuffer()).subarray(0, 4).toString('hex')).toBe('89504e47')
  })

  it('refuses unregistered paths with 403 and malformed URLs with 400', async () => {
    expect((await servePreviewRequest(previewFileUrl(path.join(root, 'outside.txt')))).status).toBe(403)
    expect((await servePreviewRequest(previewFileUrl('/etc/passwd'))).status).toBe(403)
    expect((await servePreviewRequest('preview-file://local/not-a-path')).status).toBe(403)
    expect((await servePreviewRequest('::::')).status).toBe(400)
  })

  it('reports 404 for missing paths inside a root and for directories', async () => {
    expect((await servePreviewRequest(previewFileUrl(path.join(root, 'site/missing.css')))).status).toBe(404)
    expect((await servePreviewRequest(previewFileUrl(path.join(root, 'site')))).status).toBe(404)
  })

  it('caps served files at the preview byte limit', async () => {
    const big = path.join(root, 'site/big.bin')
    writeFileSync(big, Buffer.alloc(PREVIEW_MAX_BYTES + 1, 0x41))
    expect((await servePreviewRequest(previewFileUrl(big))).status).toBe(413)
  })
})

describe('previewServeSchemePrivileges — the registered privilege shape', () => {
  it('is exactly the preview-file scheme with standard+secure, no fetch/stream', () => {
    expect(previewServeSchemePrivileges).toEqual([
      { scheme: 'preview-file', privileges: { standard: true, secure: true } }
    ])
  })
})
