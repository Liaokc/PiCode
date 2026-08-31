import { cloneElement, useEffect, useLayoutEffect, useRef, useState, type JSX, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import {
  TOOLTIP_GAP_PX,
  placeTooltip,
  resolveTooltipContent,
  type TooltipRect,
  type TooltipSize
} from '../../../shared/tooltip'

/** Hover dwell before the bubble appears (native-tooltip pacing). */
const SHOW_DELAY_MS = 400

/** Class marking a tooltip trigger; the host resolves hovers via closest(). */
export const TOOLTIP_TRIGGER_CLASS = 'tip-trigger'

interface TooltipProps {
  /** Short description state (icon-only controls without a shortcut). */
  label?: string
  /** Shortcut state — keycaps only, wins over `label` (ZCode rule). */
  shortcut?: string
  /** The single interactive element the bubble anchors to. */
  children: ReactElement<{ [key: string]: unknown }>
}

/**
 * Marks one control as a tooltip trigger (ticket 22, aligned with ZCode).
 * Pure data injection — the control keeps every prop it has, gains the
 * trigger class and two data attributes, and the single TooltipHost mounted
 * by the app shell does all listening, timing and rendering. A control with
 * a shortcut shows only its shortcut keycaps; one with only a description
 * shows that; empty input renders the child untouched.
 */
export default function Tooltip({ label, shortcut, children }: TooltipProps): JSX.Element {
  const content = resolveTooltipContent({ label, shortcut })
  if (content === null) return children
  const className = children.props['className']
  const merged = typeof className === 'string' && className !== '' ? `${className} ${TOOLTIP_TRIGGER_CLASS}` : TOOLTIP_TRIGGER_CLASS
  return cloneElement(children, {
    className: merged,
    'data-tip-label': content.kind === 'label' ? content.text : undefined,
    'data-tip-shortcut': content.kind === 'shortcut' ? content.keys.join('') : undefined
  })
}

/** What the host currently displays: resolved content plus trigger rect. */
interface ActiveTip {
  label?: string
  shortcut?: string
  anchor: TooltipRect
}

/**
 * The single tooltip surface (mount once per window). Delegated document
 * listeners resolve the hovered `.tip-trigger`, dwell 400ms, then show a
 * small light bubble with dark text — shortcut keycaps or a short
 * description, never both and never on session rows. The bubble portals to
 * document.body with fixed positioning so it escapes scroll containers, and
 * hides on scroll, resize, window blur, mouse-down and leave; keyboard
 * focus shows it instantly (:focus-visible only).
 */
export function TooltipHost(): JSX.Element {
  const [active, setActive] = useState<ActiveTip | null>(null)
  const [size, setSize] = useState<TooltipSize | null>(null)
  const bubbleRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const pending = { trigger: null as Element | null, timer: null as number | null }

    function clearTimer(): void {
      if (pending.timer !== null) {
        clearTimeout(pending.timer)
        pending.timer = null
      }
    }

    function hide(): void {
      clearTimer()
      pending.trigger = null
      setActive(null)
      setSize(null)
    }

    function show(trigger: Element): void {
      const label = trigger.getAttribute('data-tip-label') ?? undefined
      const shortcut = trigger.getAttribute('data-tip-shortcut') ?? undefined
      if (label === undefined && shortcut === undefined) return
      const rect = trigger.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      pending.trigger = trigger
      setActive({ label, shortcut, anchor: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } })
    }

    function schedule(trigger: Element): void {
      clearTimer()
      pending.trigger = trigger
      pending.timer = window.setTimeout(() => {
        pending.timer = null
        if (trigger.isConnected) show(trigger)
      }, SHOW_DELAY_MS)
    }

    function triggerFrom(target: EventTarget | null): Element | null {
      return target instanceof Element ? target.closest(`.${TOOLTIP_TRIGGER_CLASS}`) : null
    }

    function onMouseOver(event: MouseEvent): void {
      const trigger = triggerFrom(event.target)
      if (trigger === null || trigger === pending.trigger) return
      schedule(trigger)
    }

    function onMouseOut(event: MouseEvent): void {
      const trigger = triggerFrom(event.target)
      if (trigger === null || trigger !== pending.trigger) return
      if (event.relatedTarget instanceof Element && trigger.contains(event.relatedTarget)) return
      hide()
    }

    function onMouseDown(event: MouseEvent): void {
      if (triggerFrom(event.target) !== null) hide()
    }

    function onFocusIn(event: FocusEvent): void {
      const trigger = triggerFrom(event.target)
      // Keyboard focus opens instantly; mouse/programmatic focus does not.
      if (trigger === null || !trigger.matches(':focus-visible')) return
      show(trigger)
    }

    function onFocusOut(event: FocusEvent): void {
      const trigger = triggerFrom(event.target)
      if (trigger === null || trigger !== pending.trigger) return
      if (event.relatedTarget instanceof Element && trigger.contains(event.relatedTarget)) return
      hide()
    }

    function invalidate(): void {
      hide()
    }

    document.addEventListener('mouseover', onMouseOver)
    document.addEventListener('mouseout', onMouseOut)
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('scroll', invalidate, true)
    window.addEventListener('resize', invalidate)
    window.addEventListener('blur', invalidate)
    return () => {
      document.removeEventListener('mouseover', onMouseOver)
      document.removeEventListener('mouseout', onMouseOut)
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('scroll', invalidate, true)
      window.removeEventListener('resize', invalidate)
      window.removeEventListener('blur', invalidate)
      clearTimer()
    }
  }, [])

  // Measure the bubble, then place it — one layout pass, no flicker.
  useLayoutEffect(() => {
    if (active === null) return
    const el = bubbleRef.current
    if (el === null) return
    const rect = el.getBoundingClientRect()
    setSize((prev) =>
      prev !== null && prev.width === rect.width && prev.height === rect.height
        ? prev
        : { width: rect.width, height: rect.height }
    )
  }, [active])

  const placed =
    active !== null && size !== null
      ? placeTooltip(active.anchor, size, { width: window.innerWidth, height: window.innerHeight })
      : null

  const content = active !== null ? resolveTooltipContent({ label: active.label, shortcut: active.shortcut }) : null

  if (active === null || content === null) return <></>

  return createPortal(
    <div
      ref={bubbleRef}
      className={`tooltip-bubble tooltip-${placed?.placement ?? 'below'}`}
      role="tooltip"
      style={
        placed !== null
          ? { left: placed.x, top: placed.y }
          : { left: active.anchor.x, top: active.anchor.y + active.anchor.height + TOOLTIP_GAP_PX, visibility: 'hidden' }
      }
    >
      {content.kind === 'shortcut'
        ? content.keys.map((key, index) => (
            <kbd key={index} className="tooltip-key">
              {key}
            </kbd>
          ))
        : content.text}
    </div>,
    document.body
  )
}
