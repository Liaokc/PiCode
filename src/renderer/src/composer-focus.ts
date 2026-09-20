/**
 * The renderer glue for the button focus discipline (ticket 98, spec R16).
 * The decisions live in the Seam-1 module (shared/composer/
 * focus-discipline.ts); this file is the only place that touches the live
 * DOM for them.
 *
 * Two halves:
 *   ① installComposerFocusDiscipline — the document-level click listener
 *     for the workspace window. After ANY completed click on a disciplined
 *     control (every button + ARIA button-like, plus the four clickable
 *     div rows the sweep found), a rAF-deferred probe asks the seam who
 *     may hold focus: caret owners and data-focus-keep surfaces keep it,
 *     everything else (a button the pointer activated, or the <body> a
 *     just-unmounted control dropped focus onto) hands it to the composer
 *     input — Enter always goes back to send.
 *   ② reclaimComposerFocus — the same probe on demand, for close paths
 *     that carry no click (chip-menu keyboard picks, Escapes, the ⌘K
 *     palette's keyboard jumps).
 *
 * The composer lookup is a class query on purpose: exactly ONE composer is
 * mounted at a time (the focused session's view or the New Task empty
 * state — the OPEN_MODEL_MENU_EVENT precedent), so `.composer-input` is
 * always the right input. Views without one (Live Follow) find nothing and
 * the probe is a no-op.
 */

import {
  EDITABLE_FOCUS_SELECTOR,
  FOCUS_KEEP_SELECTOR,
  RECLAIM_CLICK_SELECTOR,
  shouldComposerReclaimFocus,
  type FocusedSite
} from '../../shared/composer/focus-discipline'

/** The view-layer exceptions the R16 sweep found: real clickable rows that
 * are divs, not buttons (so RECLAIM_CLICK_SELECTOR misses them). Each one
 * acts as a control (opens a session / navigates the leaf / folds a group
 * / paginates a group) and must obey the same discipline — after the click
 * the caret belongs to the composer, not to <body>. */
const CLICKABLE_ROW_SELECTOR = '.tree-row, .sb-task, .sb-group-header, .sb-show-more'

/** One disciplined click = a click landing on a button-like control or one
 * of the clickable rows above. */
function isDisciplinedClick(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.closest(`${RECLAIM_CLICK_SELECTOR}, ${CLICKABLE_ROW_SELECTOR}`) !== null
}

/** Project the live activeElement onto the seam's structural shape. `null`
 * = no meaningful holder (nothing focused, or body/documentElement — focus
 * fell off an unmounted control). */
function focusedSite(): FocusedSite | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || active === document.body || active === document.documentElement) {
    return null
  }
  return {
    tag: active.tagName.toLowerCase(),
    editable: active.matches(EDITABLE_FOCUS_SELECTOR),
    kept: active.closest(FOCUS_KEEP_SELECTOR) !== null
  }
}

/** The rAF-deferred reclaim: run the seam decision AFTER the click's React
 * handlers have settled (a pick may have unmounted the clicked control and
 * a rename field may have autoFocus'd — the probe must see the END state).
 * Finding no composer (Live Follow) is a no-op, not an error. */
export function reclaimComposerFocus(): void {
  requestAnimationFrame(() => {
    if (!shouldComposerReclaimFocus(focusedSite())) return
    const composer = document.querySelector('.composer-input')
    if (composer instanceof HTMLElement && document.activeElement !== composer) composer.focus()
  })
}

/** Install the document-level click discipline. Returns the uninstaller
 * (the App effect's cleanup). */
export function installComposerFocusDiscipline(): () => void {
  function onClick(event: MouseEvent): void {
    if (isDisciplinedClick(event.target)) reclaimComposerFocus()
  }
  document.addEventListener('click', onClick)
  return () => document.removeEventListener('click', onClick)
}
