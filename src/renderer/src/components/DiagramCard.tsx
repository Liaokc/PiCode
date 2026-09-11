/**
 * Diagram card (ticket 59, spec R4): the rendered body of a closed,
 * successfully-parsing mermaid fence — ZCode's evidenced shape. Header = the
 * same lowercase mono language chip (mermaid) with a sticky top-right action
 * group: download (SVG / PNG / MMD menu), copy source, fullscreen. Body = a
 * pan/zoom viewport over the rendered SVG (wheel zoom, drag pan, corner
 * controls). Fullscreen is a ROOT-LEVEL overlay (fixed inset-0, portal to
 * document.body) closed by Esc — not an in-flow expansion.
 *
 * The mermaid package itself lives behind the dynamically-imported
 * `mermaid-api` module: this component stays in the main bundle while the
 * diagram machinery (and mermaid's per-diagram chunks) loads on demand.
 * Render failure falls back to the caller-provided source card — content is
 * never lost behind a render error and no error toast pops (operator
 * ruling Q7).
 */

import { useEffect, useRef, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import Tooltip from './Tooltip'
import {
  CheckIcon,
  CloseIcon,
  CodeIcon,
  CopyIcon,
  DownloadIcon,
  FullscreenIcon,
  MinusIcon,
  PlusIcon,
  TargetIcon
} from './icons'
import type { BlockUiState } from './Markdown'

/** Pan/zoom transform of the diagram canvas (translate px + scale). */
interface CanvasTransform {
  x: number
  y: number
  k: number
}

const ZOOM_MIN = 0.2
const ZOOM_MAX = 8
/** Wheel tick / button step: ≥1 zooms in, <1 zooms out. */
const ZOOM_IN = 1.2

/** Anchor-zoom: keep the canvas point under the viewport position
 * (`cx`, `cy` relative to the viewport center) fixed while scaling. */
function zoomAt(prev: CanvasTransform, cx: number, cy: number, factor: number): CanvasTransform {
  const k = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev.k * factor))
  const ratio = k / prev.k
  return { k, x: cx - (cx - prev.x) * ratio, y: cy - (cy - prev.y) * ratio }
}

const IDENTITY: CanvasTransform = { x: 0, y: 0, k: 1 }

/**
 * The pan/zoom viewport over one rendered diagram. A fresh instance starts
 * at identity — the fullscreen overlay opens at fit, never inherits the
 * inline transform.
 */
function DiagramCanvas({ svg }: { svg: string }): JSX.Element {
  const [t, setT] = useState<CanvasTransform>(IDENTITY)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  // Wheel zoom — a raw non-passive listener: React's synthetic onWheel is
  // passive, and preventDefault (stopping the transcript scroll behind the
  // diagram) is the whole point here.
  useEffect(() => {
    const el = viewportRef.current
    if (el === null) return
    function onWheel(event: WheelEvent): void {
      event.preventDefault()
      const rect = el!.getBoundingClientRect()
      const cx = event.clientX - rect.left - rect.width / 2
      const cy = event.clientY - rect.top - rect.height / 2
      setT((prev) => zoomAt(prev, cx, cy, event.deltaY < 0 ? ZOOM_IN : 1 / ZOOM_IN))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div
      ref={viewportRef}
      className="md-diagram-viewport"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        dragRef.current = { px: event.clientX, py: event.clientY, x: t.x, y: t.y }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (drag === null) return
        setT((prev) => ({ ...prev, x: drag.x + (event.clientX - drag.px), y: drag.y + (event.clientY - drag.py) }))
      }}
      onPointerUp={(event) => {
        dragRef.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
    >
      <div
        className="md-diagram-canvas"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})` }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="md-diagram-zoom">
        <Tooltip label="Zoom in">
          <button
            type="button"
            className="md-block-btn"
            aria-label="Zoom in"
            onClick={() => setT((prev) => zoomAt(prev, 0, 0, ZOOM_IN))}
          >
            <PlusIcon size={13} />
          </button>
        </Tooltip>
        <Tooltip label="Zoom out">
          <button
            type="button"
            className="md-block-btn"
            aria-label="Zoom out"
            onClick={() => setT((prev) => zoomAt(prev, 0, 0, 1 / ZOOM_IN))}
          >
            <MinusIcon size={13} />
          </button>
        </Tooltip>
        <Tooltip label="Reset zoom">
          <button
            type="button"
            className="md-block-btn"
            aria-label="Reset zoom"
            onClick={() => setT(IDENTITY)}
          >
            <TargetIcon size={13} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}

/** One file download through the usual anchor+blob path. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  // Give the navigation handler a beat before revoking (an immediate revoke
  // can race the download start).
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

interface DiagramCardProps {
  /** The fence's raw mermaid source (copy + MMD download payload). */
  source: string
  /** The block's stable state key (copy feedback); null degrades gracefully. */
  blockKey: string | null
  /** The per-block UI store (copied feedback) — passed down, no context hop. */
  ui: BlockUiState
  /** The plain source card to fall back to when rendering fails. */
  fallback: JSX.Element
}

export default function DiagramCard({ source, blockKey, ui, fallback }: DiagramCardProps): JSX.Element {
  // Keyed render state: the svg/failure read as current only for the exact
  // source they were produced from — a source change degrades to pending
  // (the fallback source card) without any effect-setState cascade.
  const [rendered, setRendered] = useState<{ source: string; svg: string } | null>(null)
  const [renderFailedFor, setRenderFailedFor] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  /** Which surface's download menu is open — Esc and outside-click close it. */
  const [menu, setMenu] = useState<'inline' | 'fullscreen' | null>(null)
  const inlineMenuRef = useRef<HTMLSpanElement | null>(null)
  const fsMenuRef = useRef<HTMLSpanElement | null>(null)

  const svg = rendered !== null && rendered.source === source ? rendered.svg : null
  const failed = renderFailedFor === source

  // Render on mount (the parse verdict already landed — this component only
  // mounts for parse-ok fences) and whenever the source changes.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const api = await import('./mermaid-api')
        const renderedSvg = await api.renderMermaidSvg(source)
        if (!cancelled) setRendered({ source, svg: renderedSvg })
      } catch {
        if (!cancelled) setRenderFailedFor(source)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [source])

  // One Esc discipline: close the download menu first, then the overlay.
  useEffect(() => {
    if (menu === null && !fullscreen) return
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      if (menu !== null) setMenu(null)
      else setFullscreen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menu, fullscreen])

  // Outside-click closes the open menu (the surface's own wrapper is home).
  useEffect(() => {
    if (menu === null) return
    function onDown(event: MouseEvent): void {
      const wrap = menu === 'inline' ? inlineMenuRef.current : fsMenuRef.current
      if (wrap !== null && event.target instanceof Node && !wrap.contains(event.target)) setMenu(null)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [menu])

  async function copySource(): Promise<void> {
    try {
      await navigator.clipboard.writeText(source)
      if (blockKey !== null) ui.markCopied(blockKey)
    } catch {
      // Clipboard unavailable — leave the card as-is.
    }
  }

  function downloadSvg(): void {
    if (svg === null) return
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'mermaid-diagram.svg')
  }

  async function downloadPng(): Promise<void> {
    if (svg === null) return
    try {
      // Dynamic — the ONLY way anything reaches mermaid-api (ticket 59:
      // the mermaid chunk family never enters the main bundle).
      const api = await import('./mermaid-api')
      downloadBlob(await api.svgToPngBlob(svg), 'mermaid-diagram.png')
    } catch {
      // Rasterization failed — keep the card as-is (no error toast, Q7).
    }
  }

  function downloadMmd(): void {
    downloadBlob(new Blob([source], { type: 'text/plain;charset=utf-8' }), 'mermaid-diagram.mmd')
  }

  if (failed || svg === null) return fallback

  const copied = blockKey !== null && ui.copied.has(blockKey)

  const downloadMenu = (
    <Tooltip label="Download">
      <button
        type="button"
        className="md-block-btn"
        aria-label="Download diagram"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={() => setMenu((prev) => (prev === null ? 'inline' : null))}
      >
        <DownloadIcon size={13} />
      </button>
    </Tooltip>
  )

  const copyButton = (
    <Tooltip label="Copy">
      <button type="button" className="md-block-btn" aria-label="Copy diagram source" onClick={() => void copySource()}>
        {copied ? <CheckIcon size={13} className="md-copy-copied" /> : <CopyIcon size={13} />}
      </button>
    </Tooltip>
  )

  const fullscreenButton = (
    <Tooltip label="Fullscreen">
      <button
        type="button"
        className="md-block-btn"
        aria-label="Open diagram fullscreen"
        onClick={() => {
          setMenu(null)
          setFullscreen(true)
        }}
      >
        <FullscreenIcon size={13} />
      </button>
    </Tooltip>
  )

  const menuItems = (
    <>
      <button type="button" className="md-diagram-menu-item" onClick={downloadSvg}>
        Download SVG
      </button>
      <button type="button" className="md-diagram-menu-item" onClick={() => void downloadPng()}>
        Download PNG
      </button>
      <button type="button" className="md-diagram-menu-item" onClick={downloadMmd}>
        Download MMD
      </button>
    </>
  )

  return (
    <div className="md-diagram-card">
      <div className="md-diagram-head">
        <span className="md-code-lang">
          <CodeIcon size={12} />
          mermaid
        </span>
        <span className="md-diagram-tools">
          <span className="md-diagram-download" ref={inlineMenuRef}>
            {downloadMenu}
            {menu === 'inline' && <div className="md-diagram-menu">{menuItems}</div>}
          </span>
          {copyButton}
          {fullscreenButton}
        </span>
      </div>
      <DiagramCanvas svg={svg} />

      {fullscreen &&
        createPortal(
          <div className="md-diagram-fs" role="dialog" aria-modal="true" aria-label="Diagram fullscreen">
            <div className="md-diagram-head md-diagram-fs-head">
              <span className="md-code-lang">
                <CodeIcon size={12} />
                mermaid
              </span>
              <span className="md-diagram-tools">
                <span className="md-diagram-download" ref={fsMenuRef}>
                  <Tooltip label="Download">
                    <button
                      type="button"
                      className="md-block-btn"
                      aria-label="Download diagram"
                      aria-haspopup="menu"
                      aria-expanded={menu !== null}
                      onClick={() => setMenu((prev) => (prev === 'fullscreen' ? null : 'fullscreen'))}
                    >
                      <DownloadIcon size={13} />
                    </button>
                  </Tooltip>
                  {menu === 'fullscreen' && <div className="md-diagram-menu">{menuItems}</div>}
                </span>
                {copyButton}
                <Tooltip label="Close fullscreen">
                  <button
                    type="button"
                    className="md-block-btn"
                    aria-label="Close diagram fullscreen"
                    autoFocus
                    onClick={() => setFullscreen(false)}
                  >
                    <CloseIcon size={14} />
                  </button>
                </Tooltip>
              </span>
            </div>
            <DiagramCanvas svg={svg} />
          </div>,
          document.body
        )}
    </div>
  )
}
