/**
 * Ticket 91 (composer 附件缩略图点击 → 全屏遮罩预览): the pure seam for the
 * image-preview overlay — the ONE key decision, the ONE index step, and the
 * ONE data-URL builder. Zero DOM dependency, so the overlay component stays
 * a thin applier (the expand / outside-close seam precedent) and ticket 97's
 * bubble thumbnails reuse the same overlay without re-deciding anything.
 *
 * The operator specified four exits: Space / the top-right ❌ / Esc / a
 * click on mask blank. The key half lives in imagePreviewKeyAction (Space
 * and Escape both close); the mask/❌ halves are the component's click
 * wiring. ←/→ walking is the ticket's own discretion, wrap-around so a
 * multi-image paste can be flipped through endlessly.
 */

/** What one keydown on the open overlay maps to. */
export type ImagePreviewKeyAction = 'close' | 'prev' | 'next'

/**
 * Map one keydown (the event's `key`) to an overlay action:
 *   Escape / ' ' (Space) → close — the two keyboard exits;
 *   ArrowLeft / ArrowRight → prev / next, but only when the strip holds
 *     more than one image (a single-image preview has nowhere to walk);
 *   anything else → null (the overlay never acts on it).
 */
export function imagePreviewKeyAction(key: string, imageCount: number): ImagePreviewKeyAction | null {
  if (key === 'Escape' || key === ' ') return 'close'
  if (imageCount > 1 && key === 'ArrowLeft') return 'prev'
  if (imageCount > 1 && key === 'ArrowRight') return 'next'
  return null
}

/**
 * The wrap-around index step for ←/→: prev/next walk the strip cyclically;
 * an out-of-range index clamps back in first; a degenerate (empty) strip
 * keeps the index — the caller cannot step anywhere real.
 */
export function imagePreviewStep(index: number, imageCount: number, action: 'prev' | 'next'): number {
  if (imageCount <= 0) return index
  const base = ((index % imageCount) + imageCount) % imageCount
  return action === 'next' ? (base + 1) % imageCount : (base - 1 + imageCount) % imageCount
}

/**
 * The full-resolution data: URL for one {mimeType, data} part — the ONLY
 * source the lightbox is allowed to render (过采样缩放不糊: the thumbnail's
 * 52px box crops the SAME full-size payload via CSS, so zooming costs
 * nothing; a downscaled preview copy would blur exactly what this ticket
 * exists to show).
 */
export function imageDataUrl(mimeType: string, data: string): string {
  return `data:${mimeType};base64,${data}`
}
