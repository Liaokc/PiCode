import { useEffect, useRef, useState, type Dispatch, type JSX, type KeyboardEvent, type RefObject } from 'react'
import {
  buildTabMenu,
  panelTabKey,
  panelTabLabel,
  type PanelAction,
  type PanelState,
  type PanelTabId,
  type TabMenuEntry
} from '../../../shared/panel-model'
import { relativeTime } from '../../../shared/sessions/group'
import Tooltip from './Tooltip'
import { useNowTick } from './use-now'
import { CloseIcon, CodeIcon, FileTextIcon, HistoryIcon, PulseIcon, SearchIcon } from './icons'

/**
 * Tab management dropdown (ticket 31, against z-tab-dropdown.png): a search
 * box (match counter + ↑↓ navigation + clear), the open tabs, and the
 * recently closed history (relative time, one click reopens). The ⌄ button
 * in the tab strip owns the toggling; this menu closes on outside mouse-down
 * and Escape. Row/section data comes from the pure buildTabMenu model.
 */

interface PanelTabMenuProps {
  panel: PanelState
  dispatch: Dispatch<PanelAction>
  onClose: () => void
  /** The strip's ⌄ anchor — mouse-downs inside it belong to the toggle. */
  anchorRef: RefObject<HTMLDivElement | null>
}

/** Glyph per tab kind: documents for Review, code for file tabs, history
 * for the call-trace slot (consumption lands with ticket 36). */
export function panelTabGlyph(tab: PanelTabId): JSX.Element {
  if (tab.kind === 'review') return <FileTextIcon size={12} />
  if (tab.kind === 'trace') return <HistoryIcon size={12} />
  if (tab.kind === 'subagent-chat') return <PulseIcon size={12} />
  return <CodeIcon size={12} />
}

export default function PanelTabMenu({ panel, dispatch, onClose, anchorRef }: PanelTabMenuProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const menu = buildTabMenu(panel.openTabs, panel.recentlyClosed, query)
  // Relative timestamps stay honest while the menu sits open.
  const now = useNowTick(30_000)

  // Outside mouse-down closes — except on the strip's ⌄ anchor, whose click
  // toggles the menu itself (a bare outside-check would close-then-reopen).
  useEffect(() => {
    function onDown(event: MouseEvent): void {
      const target = event.target
      if (rootRef.current instanceof Element && rootRef.current.contains(target as Node)) return
      if (anchorRef.current instanceof Element && anchorRef.current.contains(target as Node)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose, anchorRef])

  // Typing restarts navigation at the first match.
  function onQueryChange(next: string): void {
    setQuery(next)
    setIndex(0)
  }

  function openEntry(entry: TabMenuEntry): void {
    dispatch({ type: 'open-tab', tab: entry.tab })
    onClose()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndex((i) => (menu.matches.length === 0 ? 0 : (i + 1) % menu.matches.length))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndex((i) => (menu.matches.length === 0 ? 0 : (i - 1 + menu.matches.length) % menu.matches.length))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const entry = menu.matches[index]
      if (entry) openEntry(entry)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (query !== '') onQueryChange('')
      else onClose()
    }
  }

  return (
    <div ref={rootRef} className="panel-tab-menu" role="dialog" aria-label="Tab manager">
      <div className="panel-tab-menu-search">
        <SearchIcon size={13} />
        <input
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search tabs…"
          aria-label="Search tabs"
          spellCheck={false}
        />
        {query !== '' && (
          <span className="panel-tab-menu-count" aria-label={`${menu.matches.length} matching tabs`}>
            {index + 1}/{menu.matches.length}
          </span>
        )}
        {query !== '' && (
          <Tooltip label="Clear search">
            <button type="button" className="panel-tab-menu-clear" aria-label="Clear search" onClick={() => onQueryChange('')}>
              <CloseIcon size={11} />
            </button>
          </Tooltip>
        )}
      </div>

      <div className="panel-tab-menu-list">
        {menu.matches.length === 0 && <div className="panel-tab-menu-empty">No matching tabs.</div>}

        {menu.open.length > 0 && <div className="panel-tab-menu-section">Open Tabs</div>}
        {menu.open.map((entry) => (
          <MenuRow
            key={panelTabKey(entry.tab)}
            entry={entry}
            selected={menu.matches[index] === entry}
            time={null}
            onSelect={() => openEntry(entry)}
            onHover={() => setIndex(menu.matches.indexOf(entry))}
            onClose={() => {
              dispatch({ type: 'close-tab', tab: entry.tab, at: Date.now() })
              setIndex(0)
            }}
          />
        ))}

        {menu.recent.length > 0 && <div className="panel-tab-menu-section">Recently Closed Tabs</div>}
        {menu.recent.map((entry) => (
          <MenuRow
            key={panelTabKey(entry.tab)}
            entry={entry}
            selected={menu.matches[index] === entry}
            time={relativeTime(entry.closedAt ?? 0, now)}
            onSelect={() => openEntry(entry)}
            onHover={() => setIndex(menu.matches.indexOf(entry))}
            onClose={null}
          />
        ))}
      </div>
    </div>
  )
}

/** One dropdown row: glyph + label (+ relative time), whole-row click
 * activates/reopens; open-tab rows carry an inline close. */
function MenuRow({
  entry,
  selected,
  time,
  onSelect,
  onHover,
  onClose
}: {
  entry: TabMenuEntry
  selected: boolean
  time: string | null
  onSelect: () => void
  onHover: () => void
  /** null = recently closed rows have no inline close (click reopens). */
  onClose: (() => void) | null
}): JSX.Element {
  const label = panelTabLabel(entry.tab)
  const title =
    entry.tab.kind === 'file' ? entry.tab.path : entry.tab.kind === 'trace' ? entry.tab.sessionFile : label
  return (
    <div className={`panel-menu-row${selected ? ' panel-menu-row-selected' : ''}`} title={title} onMouseEnter={onHover}>
      <button type="button" className="panel-menu-row-main" onClick={onSelect}>
        {panelTabGlyph(entry.tab)}
        <span className="panel-menu-row-label">{label}</span>
        {time !== null && <span className="panel-menu-row-time">{time}</span>}
      </button>
      {onClose !== null && (
        <Tooltip label={`Close ${label} tab`}>
          <button type="button" className="panel-tab-close" aria-label={`Close ${label} tab`} onClick={onClose}>
            <CloseIcon size={11} />
          </button>
        </Tooltip>
      )}
    </div>
  )
}
