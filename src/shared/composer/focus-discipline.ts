/**
 * The button focus discipline (ticket 98, spec R16 — spec.md: 鼠标激活与菜单
 * 键盘选择完成后按钮立即 blur、焦点归还 composer 输入框；focus 圈仅
 * :focus-visible 呈现). Pure decisions over a minimal structural shape —
 * the DOM satisfies it structurally (the MenuKeyEvent / outside-close
 * precedent: shared code imports no DOM), so the table-driven suite runs
 * in the node environment.
 *
 * The defect it decides away: buttons RETAIN focus after a pointer
 * activation (the + attach button, the History toggle, the send button…),
 * and a popover's unmount drops focus onto <body> (menu picks, Escapes).
 * In both states the browser routes the next Enter into the focused
 * button — or nowhere — instead of the composer's send path. The rule:
 * after a pointer click on a disciplined control, the ONLY elements allowed
 * to hold focus are caret owners (editables) and surfaces that explicitly
 * opt out (data-focus-keep); everything else hands focus back to the
 * composer input, where Enter always sends.
 */

/** The interactive controls a pointer click must not leave focused: every
 * real <button> plus the ARIA button-likes the sweep found (the sidebar
 * filter/group menus' menuitem rows, the panel tab strip, the task-search
 * palette's option rows). The renderer glue adds its view-layer exceptions
 * (clickable div rows) on top of this — shared stays view-agnostic. */
export const RECLAIM_CLICK_SELECTOR =
  'button, [role="button"], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="tab"]'

/** The caret owners: elements whose focus a click flow must never take —
 * the composer textarea itself, rename fields, search inputs, the palette
 * input, xterm's helper textarea. */
export const EDITABLE_FOCUS_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""]'

/** The opt-out marker: a surface that owns its own focus lifecycle marks
 * its root with data-focus-keep (the image-preview overlay — its ❌ holds
 * focus for the walk keys and its unmount restore runs its own discipline;
 * the in-window settings shell — a hidden composer must never steal the
 * caret from live settings controls). */
export const FOCUS_KEEP_SELECTOR = '[data-focus-keep]'

/** The minimal structural shape of the focused element the decision reads.
 * The renderer glue computes the three flags from the live element. */
export interface FocusedSite {
  /** activeElement's tag, lowercase (diagnostics only — the flags decide). */
  tag: string
  /** The element matches EDITABLE_FOCUS_SELECTOR. */
  editable: boolean
  /** The element sits inside a FOCUS_KEEP_SELECTOR surface. */
  kept: boolean
}

/** Decide whether the composer reclaims the caret. `null` means focus fell
 * to nothing (body/documentElement — the focused control unmounted under
 * the click, e.g. a menu row that picked). One boolean, three inputs. */
export function shouldComposerReclaimFocus(active: FocusedSite | null): boolean {
  // Focus fell off an unmounted control: nobody owns the keyboard — the
  // composer must take it back or Enter dies on <body>.
  if (active === null) return true
  // A caret owner keeps it: rename inputs, search fields and the terminal
  // helper textarea were focused by a flow that owns the keyboard next.
  if (active.editable) return false
  // An opted-out surface (overlay, settings shell) runs its own focus
  // lifecycle; the discipline never fights it.
  if (active.kept) return false
  // Everything else holding focus after a click is exactly the defect:
  // a button the pointer activated. Blur it back to the composer.
  return true
}
