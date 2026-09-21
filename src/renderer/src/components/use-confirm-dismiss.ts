import { useEffect, type RefObject } from 'react'

/**
 * Esc / outside-pointerdown dismissal for the inline confirm popovers
 * (ticket 101): either gesture CANCELS — never confirms. Capture-phase
 * window listeners so the popover closes before any underlying control can
 * react to the same event (the row click, the App-level Escape paths).
 */
export function useConfirmDismiss(active: boolean, ref: RefObject<HTMLElement | null>, onCancel: () => void): void {
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onCancel()
    }
    const onPointer = (event: PointerEvent): void => {
      const el = ref.current
      if (el === null) return
      if (event.target instanceof Node && el.contains(event.target)) return
      onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [active, ref, onCancel])
}
