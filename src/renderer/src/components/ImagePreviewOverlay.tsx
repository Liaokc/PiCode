import { useEffect, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react'
import { imagePreviewKeyAction, imagePreviewStep } from '../../../shared/composer/image-preview'
import { CloseIcon } from './icons'

/**
 * The fullscreen image-preview overlay (ticket 91) — the mask mode the
 * deleted md-table-preview (ticket 87) established, inherited: fixed
 * backdrop over everything (z-index 90), centered content, top-right ❌,
 * Esc exits. The composer's attachment thumbnails open it today; ticket
 * 97's sent-message bubble thumbnails reuse the SAME component through the
 * minimal seam below — items are plain {src, label} data, the caller owns
 * the open state (index + onNavigate + onClose), and nothing in here knows
 * where the images came from.
 *
 * The four exits (operator-specified + Q11 additions):
 *   Space / Esc            → the shared key seam (image-preview.ts);
 *   the top-right ❌        → its own onClick;
 *   a click on mask blank  → the backdrop's own click (target === backdrop
 *                            — clicks on the image, the ❌ or the counter
 *                            chip are NOT blank and never close).
 *
 * 过采样缩放不糊: the lightbox renders whatever src it is handed at up to
 * 90vw/84vh — the composer hands the FULL-resolution data: URL (the 52px
 * thumbnail crops that same payload via CSS), so enlargement samples the
 * real pixels and nothing is upscaled from a small copy.
 *
 * Focus discipline: mount captures the focused element BEFORE the ❌'s
 * autoFocus applies (state-initializer capture — read exactly once, the
 * draft-restore precedent), and unmount hands focus back to it — the a11y
 * dialog restore that makes the overlay self-contained for every caller.
 * The composer ADDITIONALLY re-takes the caret in its own onClose (ticket
 * 98's Enter-always-sends discipline — the restored thumbnail button must
 * never keep focus a Enter could re-fire).
 */

/** One previewable image: full-resolution source + its accessible name. */
export interface ImagePreviewItem {
  src: string
  label: string
}

interface ImagePreviewOverlayProps {
  /** The strip to preview; empty renders nothing (defensive — callers do
   * not open the overlay without images). */
  images: ImagePreviewItem[]
  /** Which image is showing (caller-owned, 0-based). */
  index: number
  /** ←/→ walking (wrap-around); absent for a single-image strip. */
  onNavigate: (next: number) => void
  /** Any of the four exits. */
  onClose: () => void
}

export default function ImagePreviewOverlay({
  images,
  index,
  onNavigate,
  onClose
}: ImagePreviewOverlayProps): JSX.Element | null {
  // Capture BEFORE mount commits (and before the ❌'s autoFocus steals
  // focus): at this moment the opener — the clicked thumbnail button — is
  // still the active element.
  const [restoreTo] = useState<HTMLElement | null>(
    () => (document.activeElement instanceof HTMLElement ? document.activeElement : null)
  )

  // Unmount restores focus to the opener when it is still in the document
  // (a view switch under the mask may have unmounted it — then nobody can
  // restore and forcing focus would be wrong).
  useEffect(() => {
    return () => {
      if (restoreTo !== null && restoreTo.isConnected) restoreTo.focus()
    }
  }, [restoreTo])

  // The key exits: ONE document-level keydown while the overlay is open.
  // It runs in the document phase — before the app's window-level Escape
  // handler — and preventDefaults every key it owns, so Escape can never
  // also park the composer draft or leave the new-task state (the app
  // handler's defaultPrevented guard).
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const action = imagePreviewKeyAction(event.key, images.length)
      if (action === null) return
      event.preventDefault()
      if (action === 'close') onClose()
      else onNavigate(imagePreviewStep(index, images.length, action))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [images.length, index, onNavigate, onClose])

  if (images.length === 0) return null
  const current = images[Math.min(index, images.length - 1)]

  /** Mask-blank clicks close; anything the overlay shows (image, ❌,
   * counter) is a child of the backdrop and never matches. */
  function onBackdropClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div className="image-preview-backdrop" role="presentation" onClick={onBackdropClick}>
      <div
        className="image-preview-stage"
        role="dialog"
        aria-modal="true"
        aria-label={`Image preview: ${current.label}`}
      >
        <img className="image-preview-img" src={current.src} alt={current.label} draggable={false} />
      </div>
      <button
        type="button"
        className="image-preview-close"
        aria-label="Close image preview"
        autoFocus
        onClick={onClose}
      >
        <CloseIcon size={14} />
      </button>
      {images.length > 1 && (
        <span className="image-preview-count" aria-label="Image position">
          {Math.min(index, images.length - 1) + 1}/{images.length}
        </span>
      )}
    </div>
  )
}
