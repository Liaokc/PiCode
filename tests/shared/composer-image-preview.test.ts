import { describe, expect, it } from 'vitest'
import { imagePreviewKeyAction, imagePreviewStep, imageDataUrl } from '../../src/shared/composer/image-preview'

/**
 * Ticket 91 (spec: composer 附件缩略图点击 → 全屏遮罩预览): the ONE key
 * decision + the ONE index step for the image-preview overlay, pure data
 * in / decision out, zero DOM dependency — the overlay component stays a
 * thin applier (the expand/outside-close seam precedent).
 *
 * The four exits the operator specified: Space / the top-right ❌ / Esc /
 * a click on mask blank. The first key half of that contract lives here:
 * Space and Escape both close; ←/→ walk the strip (ticket discretion) with
 * wrap-around so a long paste can be flipped through endlessly; any other
 * key is nobody's business (null — the overlay never acts on it).
 *
 * imageDataUrl is the shared seam for the full-resolution data: URL the
 * overlay renders (过采样缩放不糊 — the overlay must always see the raw
 * base64 payload, never a downscaled thumbnail): the composer's local
 * cards build it today, ticket 97's bubble thumbnails rebuild it from the
 * transcript's {mimeType, data} parts tomorrow.
 */

describe('imagePreviewKeyAction', () => {
  it('closes on Escape', () => {
    expect(imagePreviewKeyAction('Escape', 3)).toBe('close')
  })

  it('closes on Space (the operator-specified fourth exit key)', () => {
    expect(imagePreviewKeyAction(' ', 3)).toBe('close')
  })

  it('maps ArrowLeft to prev and ArrowRight to next when several images are open', () => {
    expect(imagePreviewKeyAction('ArrowLeft', 3)).toBe('prev')
    expect(imagePreviewKeyAction('ArrowRight', 3)).toBe('next')
  })

  it('never navigates a single-image preview (←/→ are no-ops there)', () => {
    expect(imagePreviewKeyAction('ArrowLeft', 1)).toBeNull()
    expect(imagePreviewKeyAction('ArrowRight', 1)).toBeNull()
  })

  it('acts on nothing else — typing keys, modifiers, Enter are all null', () => {
    for (const key of ['a', 'Enter', 'Tab', 'Backspace', 'ArrowDown', 'ArrowUp', 'Shift', 'Home']) {
      expect(imagePreviewKeyAction(key, 3)).toBeNull()
    }
  })

  it('closes even on a degenerate empty strip (the overlay should not be mounted, but the key stays honest)', () => {
    expect(imagePreviewKeyAction('Escape', 0)).toBe('close')
    expect(imagePreviewKeyAction('ArrowLeft', 0)).toBeNull()
  })
})

describe('imagePreviewStep', () => {
  it('steps forward and backward inside the strip', () => {
    expect(imagePreviewStep(0, 3, 'next')).toBe(1)
    expect(imagePreviewStep(1, 3, 'prev')).toBe(0)
  })

  it('wraps forward past the end and backward past the start', () => {
    expect(imagePreviewStep(2, 3, 'next')).toBe(0)
    expect(imagePreviewStep(0, 3, 'prev')).toBe(2)
  })

  it('wraps a two-image strip back onto itself', () => {
    expect(imagePreviewStep(0, 2, 'prev')).toBe(1)
    expect(imagePreviewStep(1, 2, 'next')).toBe(0)
  })

  it('keeps the index when there is nothing to step through (defensive: count ≤ 0)', () => {
    expect(imagePreviewStep(0, 0, 'next')).toBe(0)
    expect(imagePreviewStep(1, 0, 'prev')).toBe(1)
  })

  it('normalizes an out-of-range index back into the strip before stepping', () => {
    expect(imagePreviewStep(7, 3, 'next')).toBe(2) // 7 ≡ 1 (mod 3), then next
    expect(imagePreviewStep(-2, 3, 'prev')).toBe(0) // -2 ≡ 1 (mod 3), then prev
  })
})

describe('imageDataUrl', () => {
  it('builds the full-resolution data: URL from the raw base64 payload', () => {
    expect(imageDataUrl('image/png', 'aGk=')).toBe('data:image/png;base64,aGk=')
  })

  it('passes jpeg mime through unmangled', () => {
    expect(imageDataUrl('image/jpeg', 'zz')).toBe('data:image/jpeg;base64,zz')
  })
})
