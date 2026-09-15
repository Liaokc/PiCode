import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import type { AccessMode, ThinkingLevel } from '../../../../shared/contract'
import { ACCESS_MODES, accessModeHint, accessModeLabel } from '../../../../shared/composer/access'
import { clampIndex, flatMenuKey } from '../../../../shared/composer/menu-keys'
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

/** Floating card docked above the composer (screenshot 06's menu shape). */
export function ComposerPopover({
  children,
  align = 'left',
  onClose,
  label,
  captureKeys = false,
  className
}: {
  children: JSX.Element
  align?: 'left' | 'right'
  onClose: () => void
  label: string
  /** Steal focus so chip-opened menus own the keyboard directly. */
  captureKeys?: boolean
  /** Extra class on the popover root (e.g. the thinking menu's narrow card). */
  className?: string
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(event: MouseEvent): void {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
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
  }, [onClose])

  return (
    <div
      ref={ref}
      className={`cmp-popover cmp-popover-${align}${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-label={label}
      tabIndex={captureKeys ? -1 : undefined}
      autoFocus={captureKeys || undefined}
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
      onMouseEnter={onHover}
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
  onPick,
  onClose
}: {
  current: AccessMode
  onPick: (mode: AccessMode) => void
  onClose: () => void
}): JSX.Element {
  const [index, setIndex] = useState(Math.max(0, ACCESS_MODES.indexOf(current)))

  function pick(mode: AccessMode): void {
    onPick(mode)
    onClose()
  }

  return (
    <ComposerPopover label="Access Mode" onClose={onClose} captureKeys>
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
  onPick,
  onClose
}: {
  levels: ThinkingLevel[]
  current: ThinkingLevel | null
  onPick: (level: ThinkingLevel) => void
  onClose: () => void
}): JSX.Element {
  const [index, setIndex] = useState(Math.max(0, levels.indexOf(current ?? 'off')))

  function pick(level: ThinkingLevel): void {
    onPick(level)
    onClose()
  }

  return (
    <ComposerPopover label="Thinking Level" align="right" onClose={onClose} captureKeys className="cmp-popover-thinking">
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
  onPick,
  onClose
}: {
  providers: { providerId: string; name: string; models: { providerId: string; modelId: string; name: string }[] }[]
  current: { providerId: string; modelId: string } | null
  emptyHint?: string
  onPick: (providerId: string, modelId: string) => void
  onClose: () => void
}): JSX.Element {
  const activeProvider = current ? Math.max(0, providers.findIndex((p) => p.providerId === current.providerId)) : 0
  const [providerIndex, setProviderIndex] = useState(activeProvider)
  const group = providers[providerIndex]
  const [modelIndex, setModelIndex] = useState(0)

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

  if (providers.length === 0) {
    return (
      <ComposerPopover label="Select model" align="right" onClose={onClose} captureKeys>
        <div className="cmp-menu-empty" role="status">
          {emptyHint ?? 'No models available'}
        </div>
      </ComposerPopover>
    )
  }

  return (
    <ComposerPopover label="Select model" align="right" onClose={onClose} captureKeys>
      <div className="cmp-cascade" role="listbox" aria-label="Select model" onKeyDown={onKey}>
        <div className="cmp-cascade-col">
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
        <div className="cmp-cascade-col">
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
