import { useEffect, useMemo, useRef, useState, type Dispatch, type JSX, type PointerEvent } from 'react'
import type { SessionSummary } from '../../../shared/sessions/types'
import { clampSidebarWidth, type ShellUiAction } from '../../../shared/layout-model'
import {
  filterHiddenGroups,
  groupSessions,
  isSessionLive,
  relativeTime,
  timelineSessions,
  type SessionSort,
  type SessionView
} from '../../../shared/sessions/group'
import { sidebarDotState, sidebarRowState, type SidebarDotState } from '../../../shared/session-registry'
import { useNowTick } from './use-now'
import Tooltip from './Tooltip'
import FileBrowser from './FileBrowser'
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  EllipsisIcon,
  FilesListIcon,
  FilterIcon,
  FolderIcon,
  GearIcon,
  GripDotsIcon,
  HistoryIcon,
  MessagePlusIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon
} from './icons'

/** Rows shown per project group before "Show more". */
const SHOW_FIRST = 5

interface SidebarProps {
  open: boolean
  sessions: SessionSummary[]
  /** The session currently focused in the chat view. NOT the selected row
   * while Follow is active — selection follows the view (ticket 28). */
  activeSessionId: string | null
  /** The session file currently being followed read-only; while set, the
   * followed row carries the selected styling and the focused row reverts. */
  followedFile: string | null
  pinnedIds: ReadonlySet<string>
  /** Sessions whose host process is alive in this app (ticket 20): their dot
   * is app-owned (animated while running, empty slot when idle). */
  inAppIds: ReadonlySet<string>
  /** Sessions with a run in flight in this app (the animated dot). */
  runningIds: ReadonlySet<string>
  /** Sessions parked at the approval gate (ticket 25): the orange badge. */
  awaitingIds: ReadonlySet<string>
  /** Sessions with unread state (ticket 28): the indigo dot, masked by
   * higher-priority dots via sidebarDotState. */
  unreadIds: ReadonlySet<string>
  onTogglePin: (session: SessionSummary) => void
  onOpenSession: (session: SessionSummary) => void
  onRenameSession: (session: SessionSummary, name: string) => void
  /** Open the new-task state; a cwd PRESELECTS that project's chip
   * (ticket 19: the group row's hover action), undefined follows the
   * ticket-17 fallback chain. */
  onNewTask: (presetCwd?: string) => void
  /** Project cwds hidden from the Projects list (ticket 19; local
   * preference — sessions are untouched and stay searchable). */
  hiddenCwds: ReadonlySet<string>
  /** Hide one project group (ticket 19): local-only, recoverable in
   * Settings → General → Hidden projects. */
  onHideGroup: (cwd: string) => void
  /** Open one path (workspace-relative) in the side panel's File Preview
   * tab — the file browser's file click rides the ticket-07 channel. */
  onOpenPreview: (cwd: string, path: string) => void
  /** Open the ⌘K task-search palette (ticket 11) — the ONE search entry
   * since the sidebar's text-filter row retired (ticket 33). */
  onOpenSearch: () => void
  /** Open the settings window (ticket 10). */
  onOpenSettings: () => void
  /** The persisted filter-dropdown view (ticket 33): per-project groups or
   * the flat timeline. Owned by the shell's preferences; the dropdown is
   * only the picker. */
  view: SessionView
  /** The persisted filter-dropdown sort key (ticket 33): updated | created. */
  sort: SessionSort
  /** Persist a dropdown view choice (ticket 33). */
  onViewChange: (view: SessionView) => void
  /** Persist a dropdown sort choice (ticket 33). */
  onSortChange: (sort: SessionSort) => void
  /** Current sidebar width in px (ticket 29): the shell state seeds it from
   * preferences; the drag path writes the DOM directly and commits once on
   * pointerup. */
  width: number
  /** Shell dispatch for the width commits (ticket 29): set-sidebar-width on
   * pointerup, reset-sidebar-width on double-click. The App-level dispatch
   * persists each real change to preferences. */
  dispatch: Dispatch<ShellUiAction>
}

function TaskItem({
  session,
  now,
  selected,
  dot,
  pinned,
  onOpen,
  onTogglePin,
  onRename
}: {
  session: SessionSummary
  now: number
  /** Selection follows the view (ticket 28): the row whose view is on
   * screen — focused, or followed while Follow is active. */
  selected: boolean
  /** Fixed-slot dot state (ticket 20 + 25 + 28): orange / animated / green /
   * indigo unread / empty slot. */
  dot: SidebarDotState
  pinned: boolean
  onOpen: () => void
  onTogglePin: () => void
  onRename: (name: string) => void
}): JSX.Element {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(session.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  function commit(): void {
    const name = draft.trim()
    setRenaming(false)
    if (name !== '' && name !== session.title) onRename(name)
  }

  const cls = selected ? 'sb-task sb-task-active' : 'sb-task'

  return (
    <div
      className={cls}
      data-file={session.file}
      onClick={onOpen}
      onDoubleClick={() => {
        setDraft(session.name ?? session.title)
        setRenaming(true)
      }}
    >
      {/* Fixed slot (ticket 20): always rendered so every title's left edge
          aligns — the dot appears inside only for live states. Orange badge
          = parked at the approval gate (ticket 25); indigo = unread
          (ticket 28). */}
      <span className="sb-dot-slot">
        {dot === 'run-here' && <span className="sb-run-dot" aria-label="Running in PiCode" />}
        {dot === 'awaiting-approval' && <span className="sb-await-dot" aria-label="Awaiting approval" />}
        {dot === 'tui-live' && <span className="sb-live-dot" aria-label="Running in another window" />}
        {dot === 'unread' && <span className="sb-unread-dot" aria-label="Unread" />}
      </span>
      {renaming ? (
        <input
          ref={inputRef}
          className="sb-rename-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setRenaming(false)
          }}
          autoFocus
        />
      ) : (
        <span className="sb-task-title">{session.title}</span>
      )}
      {/* Fixed-width time slot (ticket 34): hover fades ONLY the text —
          the slot itself never resizes, so nothing in the row shifts. */}
      <span className="sb-task-time">{relativeTime(session.modifiedAt, now)}</span>
      {/* Reserved row-end slot (ticket 34, grilling Q5 decision a): the pin
          is the LAST child in every row — pinned rows keep it visible
          (orange), unpinned rows fade it in on hover at the same x. */}
      <Tooltip label={pinned ? 'Unpin' : 'Pin'}>
        <button
          type="button"
          className={pinned ? 'sb-pin-btn sb-pin-on' : 'sb-pin-btn'}
          aria-label={pinned ? 'Unpin task' : 'Pin task'}
          onClick={(e) => {
            e.stopPropagation()
            onTogglePin()
          }}
        >
          <PinIcon size={13} />
        </button>
      </Tooltip>
    </div>
  )
}

export default function Sidebar({
  open,
  sessions,
  activeSessionId,
  followedFile,
  pinnedIds,
  inAppIds,
  runningIds,
  awaitingIds,
  unreadIds,
  onTogglePin,
  onOpenSession,
  onRenameSession,
  onNewTask,
  hiddenCwds,
  onHideGroup,
  onOpenPreview,
  onOpenSearch,
  onOpenSettings,
  view,
  sort,
  onViewChange,
  onSortChange,
  width,
  dispatch
}: SidebarProps): JSX.Element | null {
  const now = useNowTick(30_000)
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  /** The project group whose ⋯ menu is open (ticket 19); null = none. */
  const [groupMenuCwd, setGroupMenuCwd] = useState<string | null>(null)
  /** The project whose files the sidebar is browsing (ticket 26); null =
   * the regular task list. Back unmounts the browser, so no tree state
   * survives the return (acceptance: the browser leaves no residue). */
  const [browserTarget, setBrowserTarget] = useState<{ cwd: string; project: string } | null>(null)

  // Sidebar width drag (ticket 29): pointermove NEVER dispatches — the raw
  // width is rAF-coalesced and written straight to the aside's style (the
  // ticket-30 side-panel pattern, mirrored for the left pane), so a full
  // task list never re-renders mid-drag. The reducer commit happens once,
  // on pointerup; clampSidebarWidth is shared with the reducer so the live
  // write and the commit can never disagree.
  const drag = useRef<{ startX: number; startWidth: number; width: number; raf: number } | null>(null)
  const frameRef = useRef<HTMLElement | null>(null)

  function startResize(event: PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    drag.current = { startX: event.clientX, startWidth: width, width, raf: 0 }
    // A vanished pointer (canceled mouse, synthetic event) must not kill the drag.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Moves still land while the button is held over the edge.
    }
  }

  function moveResize(event: PointerEvent<HTMLDivElement>): void {
    const d = drag.current
    if (!d) return
    // The LEFT pane's right edge: dragging right widens the sidebar.
    d.width = clampSidebarWidth(d.startWidth + (event.clientX - d.startX))
    if (d.raf !== 0) return
    d.raf = requestAnimationFrame(() => {
      d.raf = 0
      // Drag ended before this frame ran: the pointerup commit owns the DOM.
      if (drag.current !== d) return
      if (frameRef.current) frameRef.current.style.width = `${d.width}px`
    })
  }

  function endResize(event: PointerEvent<HTMLDivElement>): void {
    const d = drag.current
    drag.current = null
    if (d) {
      if (d.raf !== 0) cancelAnimationFrame(d.raf)
      // Single state commit per drag; the reducer clamps with the same
      // clampSidebarWidth the DOM writes used, so nothing jumps. The
      // dispatch persists the change to preferences (App-level wrapper).
      dispatch({ type: 'set-sidebar-width', width: d.width })
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  // Ticket 33: the two dropdown pipelines share the persisted sort key. The
  // projects view additionally projects away hidden groups; the timeline
  // flattens the WHOLE index — hiding never makes a session unreachable.
  const grouped = useMemo(() => groupSessions(sessions, pinnedIds, sort), [sessions, pinnedIds, sort])
  const timeline = useMemo(() => timelineSessions(sessions, pinnedIds, sort), [sessions, pinnedIds, sort])
  const visibleProjectGroups = useMemo(
    () => filterHiddenGroups(grouped.groups, hiddenCwds),
    [grouped.groups, hiddenCwds]
  )
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null

  // Outside click / Escape closes the group menu.
  useEffect(() => {
    if (groupMenuCwd === null) return
    function onPointerDown(event: MouseEvent): void {
      if (event.target instanceof Element && event.target.closest('.sb-group-actions, .sb-group-menu')) return
      setGroupMenuCwd(null)
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setGroupMenuCwd(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [groupMenuCwd])

  // Same dismissal contract for the filter dropdown (ticket 33).
  useEffect(() => {
    if (!filterMenuOpen) return
    function onPointerDown(event: MouseEvent): void {
      if (event.target instanceof Element && event.target.closest('.sb-tool-icons, .sb-filter-menu')) return
      setFilterMenuOpen(false)
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setFilterMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [filterMenuOpen])

  /** Fixed-slot dot state for one row (ticket 20 + 25 + 28): orange = parked
   * at the approval gate, animated = running in this app, green = written by
   * another end (120s rule), indigo = unread, empty = idle. An in-app
   * session never shows the TUI dot — its mtime is ours. */
  function dotFor(s: SessionSummary): SidebarDotState {
    return sidebarDotState(
      awaitingIds.has(s.id),
      runningIds.has(s.id),
      inAppIds.has(s.id),
      isSessionLive(s, now),
      unreadIds.has(s.id)
    )
  }

  function toggleExpanded(cwd: string): void {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(cwd)) next.delete(cwd)
      else next.add(cwd)
      return next
    })
  }

  if (!open) return null

  return (
    <aside ref={frameRef} className="sidebar" style={{ width }}>
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onDoubleClick={() => dispatch({ type: 'reset-sidebar-width' })}
      />
      {browserTarget !== null ? (
        <FileBrowser
          key={browserTarget.cwd}
          cwd={browserTarget.cwd}
          project={browserTarget.project}
          onBack={() => setBrowserTarget(null)}
          onOpenFile={onOpenPreview}
        />
      ) : (
      <>
      <nav className="sb-actions">
        <button
          type="button"
          className="sb-action-row"
          onClick={() => {
            onNewTask()
          }}
        >
          <PlusIcon />
          <span>New Task</span>
          <kbd>⌘N</kbd>
        </button>
        <button
          type="button"
          className="sb-action-row"
          onClick={onOpenSearch}
        >
          <SearchIcon />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
      </nav>

      {/* Tools row (ticket 33): the FilterIcon opens the ZCode-style
          view/sort dropdown; the text-filter row retired (⌘K covers search)
          and the dead Expand-all button is gone. The old Groups/Projects
          pills folded into the dropdown's View section. */}
      <div className="sb-section-tools">
        <div className="sb-tool-icons">
          <Tooltip label="Filter tasks">
            <button
              type="button"
              className={filterMenuOpen ? 'sb-icon-btn sb-icon-btn-active' : 'sb-icon-btn'}
              aria-label="Filter tasks"
              aria-haspopup="menu"
              aria-expanded={filterMenuOpen}
              onClick={() => setFilterMenuOpen((v) => !v)}
            >
              <FilterIcon />
            </button>
          </Tooltip>
          <button type="button" className="sb-icon-btn" aria-label="Deleted tasks">
            <TrashIcon />
          </button>
        </div>
        {filterMenuOpen && (
          <div className="sb-filter-menu" role="menu" aria-label="View and sort">
            <div className="sb-filter-menu-label">View</div>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={view === 'projects'}
              className="sb-filter-menu-item"
              onClick={() => {
                onViewChange('projects')
                setFilterMenuOpen(false)
              }}
            >
              <FolderIcon size={14} />
              <span>By project</span>
              {view === 'projects' && <CheckIcon size={14} className="sb-filter-check" />}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={view === 'timeline'}
              className="sb-filter-menu-item"
              onClick={() => {
                onViewChange('timeline')
                setFilterMenuOpen(false)
              }}
            >
              <ClockIcon size={14} />
              <span>Timeline</span>
              {view === 'timeline' && <CheckIcon size={14} className="sb-filter-check" />}
            </button>
            <div className="sb-filter-menu-sep" />
            <div className="sb-filter-menu-label">Sort by</div>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={sort === 'updated'}
              className="sb-filter-menu-item"
              onClick={() => {
                onSortChange('updated')
                setFilterMenuOpen(false)
              }}
            >
              <HistoryIcon size={14} />
              <span>Updated</span>
              {sort === 'updated' && <CheckIcon size={14} className="sb-filter-check" />}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={sort === 'created'}
              className="sb-filter-menu-item"
              onClick={() => {
                onSortChange('created')
                setFilterMenuOpen(false)
              }}
            >
              <CalendarIcon size={14} />
              <span>Created</span>
              {sort === 'created' && <CheckIcon size={14} className="sb-filter-check" />}
            </button>
          </div>
        )}
      </div>

      <div className="sb-scroll">
        {/* Pinned section (ticket 33): kept on top in BOTH views — the
            timeline flattens the body below it, never the pins. */}
        {grouped.pinned.length > 0 && (
          <>
            <div className="sb-section-label">Pinned</div>
            {grouped.pinned.map((s) => (
              <TaskItem
                key={s.file}
                session={s}
                now={now}
                selected={sidebarRowState(activeSessionId, followedFile, s.id, s.file) === 'selected'}
                dot={dotFor(s)}
                pinned
                onOpen={() => onOpenSession(s)}
                onTogglePin={() => onTogglePin(s)}
                onRename={(name) => onRenameSession(s, name)}
              />
            ))}
          </>
        )}

        {view === 'projects' ? (
          <>
            <div className="sb-section-label sb-section-label-projects">
              <FolderIcon />
              Projects
              <span className="sb-section-spacer" />
              <GripDotsIcon />
            </div>

            {visibleProjectGroups.map((group) => {
              const isExpanded = expanded.has(group.cwd)
              const shown = isExpanded ? group.sessions : group.sessions.slice(0, SHOW_FIRST)
              const menuOpen = groupMenuCwd === group.cwd
              return (
                <section key={group.cwd} className="sb-group">
                  <div className="sb-group-header" onClick={() => toggleExpanded(group.cwd)}>
                    <FolderIcon />
                    <span>{group.project}</span>
                    <span className="sb-section-spacer" />
                    {group.sessions.length > SHOW_FIRST && (
                      <ChevronDownIcon size={13} className={isExpanded ? 'sb-caret sb-caret-up' : 'sb-caret'} />
                    )}
                    <span className="sb-group-actions">
                      <Tooltip label="More actions">
                        <button
                          type="button"
                          className="sb-group-action"
                          aria-label={`Group actions: ${group.project}`}
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          onClick={(e) => {
                            e.stopPropagation()
                            setGroupMenuCwd(menuOpen ? null : group.cwd)
                          }}
                        >
                          <EllipsisIcon size={15} />
                        </button>
                      </Tooltip>
                      {/* Middle slot (ticket 26): ZCode's three-button hover
                          form — ⋯ / view files / new task. Swaps the whole
                          sidebar to this project's file browser. */}
                      <Tooltip label="View files">
                        <button
                          type="button"
                          className="sb-group-action"
                          aria-label={`View files in ${group.project}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setGroupMenuCwd(null)
                            setBrowserTarget({ cwd: group.cwd, project: group.project })
                          }}
                        >
                          <FilesListIcon size={15} />
                        </button>
                      </Tooltip>
                      <Tooltip label="New task">
                        <button
                          type="button"
                          className="sb-group-action"
                          aria-label={`New task in ${group.project}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setGroupMenuCwd(null)
                            onNewTask(group.cwd)
                          }}
                        >
                          <MessagePlusIcon size={15} />
                        </button>
                      </Tooltip>
                    </span>
                    <GripDotsIcon className="sb-grip" />
                  </div>
                  {menuOpen && (
                    <div className="sb-group-menu" role="menu" aria-label={`Group actions: ${group.project}`}>
                      <button
                        type="button"
                        role="menuitem"
                        className="sb-group-menu-item"
                        onClick={(e) => {
                          e.stopPropagation()
                          setGroupMenuCwd(null)
                          onHideGroup(group.cwd)
                        }}
                      >
                        <CloseIcon size={13} />
                        <span>Remove from sidebar</span>
                      </button>
                    </div>
                  )}
                  {shown.map((s) => (
                    <TaskItem
                      key={s.file}
                      session={s}
                      now={now}
                      selected={sidebarRowState(activeSessionId, followedFile, s.id, s.file) === 'selected'}
                      dot={dotFor(s)}
                      pinned={false}
                      onOpen={() => onOpenSession(s)}
                      onTogglePin={() => onTogglePin(s)}
                      onRename={(name) => onRenameSession(s, name)}
                    />
                  ))}
                  {!isExpanded && group.sessions.length > SHOW_FIRST && (
                    <div className="sb-show-more" onClick={() => toggleExpanded(group.cwd)}>
                      Show more
                    </div>
                  )}
                  {isExpanded && group.sessions.length > SHOW_FIRST && (
                    <div className="sb-show-more" onClick={() => toggleExpanded(group.cwd)}>
                      Show less
                    </div>
                  )}
                </section>
              )
            })}
          </>
        ) : (
          // Timeline view (ticket 33): every non-pinned session in ONE flat
          // list — no project headers, no per-group Show more — under the
          // pinned section above.
          <>
            {timeline.sessions.map((s) => (
              <TaskItem
                key={s.file}
                session={s}
                now={now}
                selected={sidebarRowState(activeSessionId, followedFile, s.id, s.file) === 'selected'}
                dot={dotFor(s)}
                pinned={false}
                onOpen={() => onOpenSession(s)}
                onTogglePin={() => onTogglePin(s)}
                onRename={(name) => onRenameSession(s, name)}
              />
            ))}
          </>
        )}

        {sessions.length === 0 && (
          <div className="sb-empty-hint">No tasks yet — press ⌘N to start one.</div>
        )}
      </div>
      </>
      )}

      <footer className="sb-account-bar">
        <span className="sb-avatar" aria-hidden="true">
          P
        </span>
        <span className="sb-account-name">{activeSession ? activeSession.title : 'No active session'}</span>
        <Tooltip label="Settings">
          <button type="button" className="sb-icon-btn" aria-label="Settings" onClick={onOpenSettings}>
            <GearIcon />
          </button>
        </Tooltip>
      </footer>
    </aside>
  )
}
