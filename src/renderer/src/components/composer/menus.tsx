import { useEffect, useLayoutEffect, useRef, useState, type JSX, type KeyboardEvent, type RefObject } from 'react'
import type { AccessMode, ThinkingLevel } from '../../../../shared/contract'
import { ACCESS_MODES, accessModeHint, accessModeLabel } from '../../../../shared/composer/access'
import { clampIndex, flatMenuKey } from '../../../../shared/composer/menu-keys'
import { shouldCloseOnOutsideMousedown } from '../../../../shared/composer/outside-close'
import { CheckIcon, ChevronRightIcon, ShieldCheckIcon } from '../icons'

/** English labels for Pi thinking levels (the dropdown under "Max"). */
export const THINKING_LABELS: Record<ThinkingLevel, string> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
  max: 'Max'
}

export function thinkingLabel(level: ThinkingLevel): string {
  return THINKING_LABELS[level] ?? level
}

/** The card-to-chip air gap of the button-hug anchor (ticket 138): the
 * ZCode frames (z19-menu-1/2) sit the open card's bottom edge ≈2px above
 * the opening chip's top edge — touching, not floating. */
const CHIP_HUG_GAP = 2

/** Floating card docked above the composer (screenshot 06's menu shape). */
export function ComposerPopover({
  children,
  align = 'left',
  onClose,
  label,
  captureKeys = false,
  className,
  anchorRef
}: {
  children: JSX.Element
  /** 'left'/'right' dock the card to the composer's edges; 'chip' (ticket
   * 122, spec R5) left-aligns the card with the OPENING CHIP's viewport
   * left edge — clamped so a narrow window never pushes it out. Ticket
   * 138 (z19-menu-* rework) completes the anchor: the card also HUGS the
   * chip — its bottom edge rides the chip's top edge — instead of
   * floating above the input area. */
  align?: 'left' | 'right' | 'chip'
  onClose: () => void
  label: string
  /** Steal focus so chip-opened menus own the keyboard directly. */
  captureKeys?: boolean
  /** Extra class on the popover root (e.g. the thinking menu's narrow card). */
  className?: string
  /** Ticket 70: the element that opened this popover (the owning chip).
   * A mousedown on it is NOT an outside click — the chip's own click
   * toggle owns the close (otherwise mousedown closes, click reopens,
   * and the chip can never close its own menu). Also the 'chip' align
   * anchor (ticket 122): the measured left edge comes from this element. */
  anchorRef?: RefObject<HTMLElement | null>
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  // Ticket 122 (spec R5) + 138: chip-anchored x AND y. The card is
  // steered onto the chip — left edge onto the chip's left edge, bottom
  // edge CHIP_HUG_GAP above the chip's top edge (the z19-menu-* hug) —
  // by measuring its OWN rendered position and applying the delta
  // (clamped so a narrow window never pushes it out). This self-correcting
  // shape is immune to which ancestor ends up the containing block —
  // composer borders, padding or transforms cannot skew it. The base rule
  // for chip cards is bottom: 0 (a finite px the delta math can read; the
  // old calc(100% + 8px) parsed to NaN), and the steer lands before paint.
  //
  // The x clamp spans the WHOLE cascade, not just the wrapper: the model
  // card (ticket 138) hangs OUTSIDE the wrapper box (left: 196px + its own
  // 190px), so an unspanned clamp would let it cross the window edge
  // while the wrapper itself sits legal.
  //
  // The anchor is TRACKED, not snapshotted: the chip's own box moves while
  // the menu is open (its label settles as the auth-probe report joins,
  // window resizes reflow the footer). Three re-steer triggers, all
  // delta-gated (a settled card makes each a no-op): a re-run after EVERY
  // render of this popover (chip moves ride React state changes — label
  // text is state), a ResizeObserver on the chip (box changes with no
  // render), and the window resize listener (viewport clamp). The effect
  // is intentionally dep-less: the popover re-renders on every hover/
  // pick/state tick, and each run re-measures.
  const [chipPos, setChipPos] = useState<{ left: number; bottom: number } | null>(null)
  useLayoutEffect(() => {
    if (align !== 'chip') return
    function measure(): void {
      const chip = anchorRef?.current
      const card = ref.current
      if (!chip || !card) return
      const rect = card.getBoundingClientRect()
      if (rect.width === 0) return
      const chipRect = chip.getBoundingClientRect()
      // The clamp spans the cascade's full painted width (wrapper + any
      // out-of-flow second card), not the wrapper box alone.
      const models = card.querySelector('.cmp-cascade-models')
      const spanRight = models instanceof HTMLElement ? models.getBoundingClientRect().right : rect.right
      const spanWidth = Math.max(rect.width, spanRight - rect.left)
      const min = 8
      const max = Math.max(min, window.innerWidth - 8 - spanWidth)
      const targetLeft = Math.min(Math.max(chipRect.left, min), max)
      const targetBottom = chipRect.top - CHIP_HUG_GAP
      const deltaX = targetLeft - rect.left
      const deltaY = targetBottom - rect.bottom
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return
      // The current applied left/bottom (the base rules' 0 or a previous
      // inline value); 'auto' means there is nothing to steer.
      const computed = getComputedStyle(card)
      const currentLeft = Number.parseFloat(computed.left)
      const currentBottom = Number.parseFloat(computed.bottom)
      if (!Number.isFinite(currentLeft) || !Number.isFinite(currentBottom)) return
      setChipPos({ left: currentLeft + deltaX, bottom: currentBottom - deltaY })
    }
    measure()
    const chip = anchorRef?.current
    const observer = chip instanceof HTMLElement ? new ResizeObserver(measure) : null
    if (observer && chip instanceof HTMLElement) observer.observe(chip)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  })

  // Ticket 98: a captureKeys popover owns the keyboard — but the keyboard
  // model (flatMenuKey) listens on the list container, and a plain autoFocus
  // on THIS root div puts focus where keydowns never pass through a child
  // (real ↑↓/Enter died on the container; only the synthetic dispatches
  // reached the list). Put the captured focus ON the selected row instead,
  // inside the list: real keydowns bubble into flatMenuKey exactly like the
  // synthetic ones, Enter picks, Escape closes, and after the close the
  // composer's menu-close path hands the caret back to the input (R16).
  // Rows suppress the focus ring — their keyboard indicator is the gray
  // selection highlight (the 1.6 tickets 68/69 model, untouched). The
  // empty-catalog popover renders no rows and keeps the container focus.
  useLayoutEffect(() => {
    if (!captureKeys) return
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
  }, [captureKeys])

  useEffect(() => {
    function onDown(event: MouseEvent): void {
      // Ticket 70: the decision is the ONE shared rule (Seam-1,
      // outside-close.ts) — popover members never close, the owning chip
      // is exempt (its click toggle closes), everything else closes.
      if (shouldCloseOnOutsideMousedown({ popover: ref.current, anchor: anchorRef?.current ?? null, target: event.target })) onClose()
    }
    function onKey(event: globalThis.KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    // mousedown (not click) so picking a row inside another card still works.
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, anchorRef])

  return (
    <div
      ref={ref}
      className={`cmp-popover cmp-popover-${align}${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-label={label}
      tabIndex={captureKeys ? -1 : undefined}
      autoFocus={captureKeys || undefined}
      style={chipPos !== null ? { left: chipPos.left, bottom: chipPos.bottom, right: 'auto' } : undefined}
      // Ticket 98: a captureKeys popover owns its focus lifecycle (the
      // capture sits on the selected row until the close path hands it
      // back) — the document-level click discipline must not reclaim the
      // caret while it is open. The text menus (captureKeys=false) never
      // hold focus, so they need no marker.
      data-focus-keep={captureKeys || undefined}
    >
      {children}
    </div>
  )
}

interface MenuRowProps {
  selected: boolean
  onSelect: () => void
  onHover?: () => void
  children: JSX.Element
}

/** Ticket 72 (found by the electron smoke's keyboard walk): a keyboard
 * selection change scrollIntoViews the list, and when the physical pointer
 * happens to rest over the menu the rows slide UNDER it — Chromium fires a
 * boundary event on the newly-under-cursor row even though the pointer
 * never moved, and a naive onMouseEnter let that hover STEAL the keyboard
 * selection mid-walk (the highlight kept snapping back to the row under the
 * parked cursor). A scroll-induced enter carries the SAME clientX/Y as the
 * last real mouse event, so hover counts only when the pointer actually
 * moved between mouse events. Module-level: the check spans menus and
 * remounts — a fresh popover opening under a stationary pointer is exactly
 * the no-movement case too (the first real hover needs a real move). */
let lastMouseX = Number.NaN
let lastMouseY = Number.NaN

/** One navigable row of a popover menu. */
export function MenuRow({ selected, onSelect, onHover, children }: MenuRowProps): JSX.Element {
  const ref = useRef<HTMLButtonElement>(null)
  // Ticket 69: the selected row always scrolls into view — keyboard
  // navigation can never walk the gray highlight past the list edge
  // (pi16-menu-no-scroll). block:'nearest' is a no-op while the row is
  // already visible, and the effect deps pin it to selection CHANGES only
  // (the red line: no per-render scrolling; hover rides the same selected
  // flag, so mouse and keyboard share one selection model).
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  return (
    <button
      ref={ref}
      type="button"
      className={selected ? 'cmp-menu-row cmp-menu-row-selected' : 'cmp-menu-row'}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      onMouseEnter={(e) => {
        const moved = e.clientX !== lastMouseX || e.clientY !== lastMouseY
        lastMouseX = e.clientX
        lastMouseY = e.clientY
        if (moved) onHover?.()
      }}
    >
      {children}
    </button>
  )
}

/** Footer hint line shared by the command/file menus. */
export function MenuHint(): JSX.Element {
  return (
    <div className="cmp-menu-hint">
      <span className="cmp-menu-hint-icon">⌕</span>
      Type to search commands and skills · ↑↓ navigate · Enter run · Esc close
    </div>
  )
}

/** Access Mode chip menu — the three approval-gate tiers (NOT trust). */
export function AccessMenu({
  current,
  chipRef,
  onPick,
  onClose
}: {
  current: AccessMode
  /** The access chip that owns this menu (ticket 70: its mousedown is
   * exempt from the outside-close — its click toggle owns the close). */
  chipRef: RefObject<HTMLElement | null>
  onPick: (mode: AccessMode) => void
  onClose: () => void
}): JSX.Element {
  const [index, setIndex] = useState(Math.max(0, ACCESS_MODES.indexOf(current)))

  function pick(mode: AccessMode): void {
    onPick(mode)
    onClose()
  }

  return (
    <ComposerPopover label="Access Mode" onClose={onClose} captureKeys anchorRef={chipRef}>
      <div className="cmp-menu-list" role="listbox" aria-label="Access Mode" onKeyDown={(e) => flatMenuKey(e, ACCESS_MODES.length, index, setIndex, (i) => pick(ACCESS_MODES[i]!), onClose)}>
        {ACCESS_MODES.map((mode, i) => (
          <MenuRow key={mode} selected={i === index} onSelect={() => pick(mode)} onHover={() => setIndex(i)}>
            <span className="cmp-access-row">
              <ShieldCheckIcon size={14} className={`cmp-access-shield cmp-access-shield-${mode}`} />
              <span className="cmp-access-row-text">
                <span className="cmp-menu-title">{accessModeLabel(mode)}</span>
                <span className="cmp-menu-desc">{accessModeHint(mode)}</span>
              </span>
              {current === mode && (
                <span className="cmp-menu-check">
                  <CheckIcon size={13} />
                </span>
              )}
            </span>
          </MenuRow>
        ))}
      </div>
    </ComposerPopover>
  )
}

/** Thinking Level dropdown — straight through to the session's levels. */
export function ThinkingMenu({
  levels,
  current,
  chipRef,
  onPick,
  onClose
}: {
  levels: ThinkingLevel[]
  current: ThinkingLevel | null
  /** The thinking chip that owns this menu (ticket 70 — see AccessMenu). */
  chipRef: RefObject<HTMLElement | null>
  onPick: (level: ThinkingLevel) => void
  onClose: () => void
}): JSX.Element {
  const [index, setIndex] = useState(Math.max(0, levels.indexOf(current ?? 'off')))

  function pick(level: ThinkingLevel): void {
    onPick(level)
    onClose()
  }

  return (
    <ComposerPopover label="Thinking Level" align="chip" onClose={onClose} captureKeys className="cmp-popover-thinking" anchorRef={chipRef}>
      <div
        className="cmp-menu-list"
        role="listbox"
        aria-label="Thinking Level"
        onKeyDown={(e) => flatMenuKey(e, levels.length, index, setIndex, (i) => pick(levels[i]!), onClose)}
      >
        {levels.map((level, i) => (
          <MenuRow key={level} selected={i === index} onSelect={() => pick(level)} onHover={() => setIndex(i)}>
            <span className="cmp-inline-row">
              <span className="cmp-menu-title">{thinkingLabel(level)}</span>
              {current === level && (
                <span className="cmp-menu-check">
                  <CheckIcon size={13} />
                </span>
              )}
            </span>
          </MenuRow>
        ))}
      </div>
    </ComposerPopover>
  )
}

/** Provider → model cascade (screenshot 07): providers left, models right.
 * Ticket 41: an empty catalog renders a styled hint instead of a blank
 * panel — the blank dropdown is gone everywhere (the new-task empty state
 * passes its specific hint; other callers get the generic one). */
export function ModelMenu({
  providers,
  current,
  emptyHint,
  chipRef,
  onPick,
  onClose
}: {
  providers: { providerId: string; name: string; models: { providerId: string; modelId: string; name: string }[] }[]
  current: { providerId: string; modelId: string } | null
  emptyHint?: string
  /** The model chip that owns this menu (ticket 70 — see AccessMenu). */
  chipRef: RefObject<HTMLElement | null>
  onPick: (providerId: string, modelId: string) => void
  onClose: () => void
}): JSX.Element {
  const activeProvider = current ? Math.max(0, providers.findIndex((p) => p.providerId === current.providerId)) : 0
  const [providerIndex, setProviderIndex] = useState(activeProvider)
  const group = providers[providerIndex]
  const [modelIndex, setModelIndex] = useState(0)
  const providersRef = useRef<HTMLDivElement | null>(null)
  const modelsRef = useRef<HTMLDivElement | null>(null)

  // Keep the highlighted model inside the active provider's list.
  const modelCount = group?.models.length ?? 0
  const clampedIndex = clampIndex(modelIndex, modelCount)

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      // Ticket 69: the provider axis clamps through the SAME clampIndex as
      // every other menu axis — one end-of-list rule everywhere (no wrap).
      setProviderIndex(clampIndex(providerIndex + (event.key === 'ArrowRight' ? 1 : -1), providers.length))
      return
    }
    if (flatMenuKey(event, modelCount, clampedIndex, setModelIndex, (i) => pick(i), onClose)) return
  }

  function pick(i: number): void {
    const model = group?.models[i]
    if (!model) return
    onPick(model.providerId, model.modelId)
    onClose()
  }

  // Ticket 138 (z19-menu-* composition): the model card is a SEPARATE
  // panel that hangs off the HOVERED provider row — its top edge rides
  // that row's top edge (z19-menu-2: the open submenu aligns to the
  // highlighted row, z19-menu-1: the first row) — and it never dangles
  // past the window's bottom edge. Measured viewport-relative (this
  // file's dep-less idiom) so a scrolled provider column keeps the
  // alignment honest; written imperatively (no state churn — the values
  // are pure geometry). The scroll listener re-syncs after the selected
  // row's scrollIntoView (MenuRow, passive) moves rows inside the
  // provider column; resize re-clamps the viewport cap.
  useLayoutEffect(() => {
    const providersPanel = providersRef.current
    const modelsPanel = modelsRef.current
    if (!providersPanel || !modelsPanel) return
    const place = (): void => {
      const row = providersPanel.querySelectorAll<HTMLElement>('.cmp-menu-row')[providerIndex]
      const panelRect = providersPanel.getBoundingClientRect()
      if (!(row instanceof HTMLElement) || panelRect.height === 0) return
      modelsPanel.style.top = `${row.getBoundingClientRect().top - panelRect.top}px`
      const modelsRect = modelsPanel.getBoundingClientRect()
      const available = window.innerHeight - 8 - modelsRect.top
      modelsPanel.style.maxHeight = `${Math.max(96, Math.min(320, available))}px`
    }
    place()
    window.addEventListener('resize', place)
    providersPanel.addEventListener('scroll', place, { passive: true })
    return () => {
      window.removeEventListener('resize', place)
      providersPanel.removeEventListener('scroll', place)
    }
  })

  if (providers.length === 0) {
    return (
      <ComposerPopover label="Select model" align="chip" onClose={onClose} captureKeys anchorRef={chipRef}>
        <div className="cmp-menu-empty" role="status">
          {emptyHint ?? 'No models available'}
        </div>
      </ComposerPopover>
    )
  }

  return (
    <ComposerPopover label="Select model" align="chip" onClose={onClose} captureKeys className="cmp-popover-cascade" anchorRef={chipRef}>
      <div className="cmp-cascade" role="listbox" aria-label="Select model" onKeyDown={onKey}>
        <div ref={providersRef} className="cmp-cascade-col cmp-cascade-providers">
          {providers.map((provider, i) => (
            <MenuRow
              key={provider.providerId}
              selected={i === providerIndex}
              onSelect={() => setProviderIndex(i)}
              onHover={() => setProviderIndex(i)}
            >
              <span className="cmp-inline-row">
                <span className="cmp-menu-title">{provider.name}</span>
                <span className="cmp-menu-spring" />
                {current?.providerId === provider.providerId && (
                  <span className="cmp-menu-check">
                    <CheckIcon size={13} />
                  </span>
                )}
                <ChevronRightIcon size={12} />
              </span>
            </MenuRow>
          ))}
        </div>
        <div ref={modelsRef} className="cmp-cascade-col cmp-cascade-models">
          {group?.models.map((model, i) => (
            <MenuRow
              key={model.modelId}
              selected={i === clampedIndex}
              onSelect={() => pick(i)}
              onHover={() => setModelIndex(i)}
            >
              <span className="cmp-inline-row">
                <span className="cmp-menu-title">{model.name}</span>
                {current?.providerId === model.providerId && current?.modelId === model.modelId && (
                  <span className="cmp-menu-check">
                    <CheckIcon size={13} />
                  </span>
                )}
              </span>
            </MenuRow>
          ))}
        </div>
      </div>
    </ComposerPopover>
  )
}
