import { describe, expect, it } from 'vitest'
import {
  EDITABLE_FOCUS_SELECTOR,
  FOCUS_KEEP_SELECTOR,
  RECLAIM_CLICK_SELECTOR,
  shouldComposerReclaimFocus,
  type FocusedSite
} from '../../src/shared/composer/focus-discipline'

/** Shorthand: a plain focused control (button-like, not editable, not kept). */
const control: FocusedSite = { tag: 'button', editable: false, kept: false }

describe('shouldComposerReclaimFocus — the R16 blur-back decision (ticket 98)', () => {
  it('reclaims when focus fell off entirely (the clicked control unmounted — menu rows, palettes)', () => {
    expect(shouldComposerReclaimFocus(null)).toBe(true)
  })

  it('reclaims when a control kept focus (a button the pointer just activated)', () => {
    expect(shouldComposerReclaimFocus(control)).toBe(true)
    expect(shouldComposerReclaimFocus({ ...control, tag: 'div' })).toBe(true)
  })

  it('never takes focus from an editable — the caret belongs to whoever focused it', () => {
    const editable: FocusedSite = { tag: 'input', editable: true, kept: false }
    expect(shouldComposerReclaimFocus(editable)).toBe(false)
    // Rename fields, search inputs, xterm's helper textarea — all editables,
    // regardless of tag.
    expect(shouldComposerReclaimFocus({ tag: 'textarea', editable: true, kept: false })).toBe(false)
  })

  it('never takes focus from a data-focus-keep surface (image preview overlay, settings shell)', () => {
    expect(shouldComposerReclaimFocus({ ...control, kept: true })).toBe(false)
  })

  it('editable + kept both hold — kept alone is enough, but editables never lose the caret either way', () => {
    expect(shouldComposerReclaimFocus({ tag: 'input', editable: true, kept: true })).toBe(false)
  })
})

describe('focus-discipline selectors (ticket 98)', () => {
  it('the click selector covers every button-like control the sweep found', () => {
    for (const fragment of ['button', '[role="button"]', '[role="option"]', '[role="menuitem"]', '[role="menuitemradio"]', '[role="tab"]']) {
      expect(RECLAIM_CLICK_SELECTOR).toContain(fragment)
    }
  })

  it('the editable selector covers every caret owner', () => {
    for (const fragment of ['input', 'textarea', 'select', '[contenteditable="true"]', '[contenteditable=""]']) {
      expect(EDITABLE_FOCUS_SELECTOR).toContain(fragment)
    }
  })

  it('the keep marker is a data attribute selector', () => {
    expect(FOCUS_KEEP_SELECTOR).toBe('[data-focus-keep]')
  })
})
