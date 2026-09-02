import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { SessionSummary } from '../../../shared/sessions/types'
import {
  filterHiddenGroups,
  filterSessions,
  groupSessions,
  isSessionLive,
  relativeTime
} from '../../../shared/sessions/group'
import { sidebarDotState, sidebarRowState, type SidebarDotState } from '../../../shared/session-registry'
import { useNowTick } from './use-now'
import Tooltip from './Tooltip'
import FileBrowser from './FileBrowser'
import {
  ChevronDownIcon,
  CloseIcon,
  EllipsisIcon,
  ExpandArrowsIcon,
  FilesListIcon,
  FilterIcon,
  FolderIcon,
  GearIcon,
  GripDotsIcon,
  HashIcon,
  MessagePlusIcon,
  PinIcon,
  PlusIcon,
  ProjectsFolderIcon,
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
  /** Open the ⌘K task-search palette (ticket 11). */
  onOpenSearch: () => void
  /** Open the settings window (ticket 10). */
  onOpenSettings: () => void
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
      <span className="sb-task-time">{relativeTime(session.modifiedAt, now)}</span>
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
  onOpenSettings
}: SidebarProps): JSX.Element | null {
  const now = useNowTick(30_000)
  const [filterOpen, setFilterOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'projects' | 'groups'>('projects')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  /** The project group whose ⋯ menu is open (ticket 19); null = none. */
  const [groupMenuCwd, setGroupMenuCwd] = useState<string | null>(null)
  /** The project whose files the sidebar is browsing (ticket 26); null =
   * the regular task list. Back unmounts the browser, so no tree state
   * survives the return (acceptance: the browser leaves no residue). */
  const [browserTarget, setBrowserTarget] = useState<{ cwd: string; project: string } | null>(null)
  const filterRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => filterSessions(sessions, query), [sessions, query])
  const grouped = useMemo(() => groupSessions(filtered, pinnedIds), [filtered, pinnedIds])
  // Ticket 19: hiding is a group-level projection — pinned rows and the
  // Groups all-tasks view below are untouched, so hidden sessions stay
  // reachable from both.
  const visibleProjectGroups = useMemo(
    () => filterHiddenGroups(grouped.groups, hiddenCwds),
    [grouped.groups, hiddenCwds]
  )
  const filtering = query.trim() !== ''
  const visibleGroups =
    view === 'projects'
      ? visibleProjectGroups
      : [{ cwd: '', project: 'All tasks', sessions: filtered.filter((s) => !pinnedIds.has(s.id)) }]
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
    <aside className="sidebar">
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
        {filterOpen && (
          <div className="sb-filter-row">
            <SearchIcon size={13} />
            <input
              ref={filterRef}
              className="sb-filter-input"
              placeholder="Filter tasks"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setQuery('')
                  setFilterOpen(false)
                }
              }}
            />
            {query !== '' && (
              <Tooltip label="Clear filter">
                <button type="button" className="sb-icon-btn" aria-label="Clear filter" onClick={() => setQuery('')}>
                  ×
                </button>
              </Tooltip>
            )}
          </div>
        )}
      </nav>

      <div className="sb-section-tools">
        <button type="button" className="sb-icon-btn" aria-label="Expand all sections">
          <ExpandArrowsIcon />
        </button>
        <div className="sb-view-pills">
          <button
            type="button"
            className={view === 'groups' ? 'sb-pill-btn sb-pill-active' : 'sb-pill-btn'}
            aria-label="Group view"
            onClick={() => setView('groups')}
          >
            <HashIcon />
            Groups
          </button>
          <button
            type="button"
            className={view === 'projects' ? 'sb-pill-btn sb-pill-active' : 'sb-pill-btn'}
            aria-label="Projects view"
            onClick={() => setView('projects')}
          >
            <ProjectsFolderIcon />
            Projects
          </button>
        </div>
        <div className="sb-tool-icons">
          <Tooltip label="Filter tasks">
            <button
              type="button"
              className={filterOpen ? 'sb-icon-btn sb-pill-active' : 'sb-icon-btn'}
              aria-label="Filter tasks"
              onClick={() => {
                setFilterOpen((v) => !v)
                requestAnimationFrame(() => filterRef.current?.focus())
              }}
            >
              <FilterIcon />
            </button>
          </Tooltip>
          <button type="button" className="sb-icon-btn" aria-label="Deleted tasks">
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="sb-scroll">
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

        <div className="sb-section-label sb-section-label-projects">
          <FolderIcon />
          Projects
          <span className="sb-section-spacer" />
          <GripDotsIcon />
        </div>

        {visibleGroups.map((group) => {
          const isExpanded = filtering || expanded.has(group.cwd)
          const shown = isExpanded ? group.sessions : group.sessions.slice(0, SHOW_FIRST)
          // The Groups view's flattened "All tasks" pseudo-group has no cwd —
          // hiding it is meaningless, so it gets no hover actions.
          const isRealGroup = group.cwd !== ''
          const menuOpen = isRealGroup && groupMenuCwd === group.cwd
          return (
            <section key={group.cwd || 'all'} className="sb-group">
              <div className="sb-group-header" onClick={() => isRealGroup && toggleExpanded(group.cwd)}>
                <FolderIcon />
                <span>{group.project}</span>
                <span className="sb-section-spacer" />
                {group.sessions.length > SHOW_FIRST && (
                  <ChevronDownIcon size={13} className={isExpanded ? 'sb-caret sb-caret-up' : 'sb-caret'} />
                )}
                {isRealGroup && (
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
                )}
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
              {group.sessions.length === 0 && filtering && (
                <div className="sb-empty-hint">No matching tasks</div>
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
              {isExpanded && !filtering && group.sessions.length > SHOW_FIRST && (
                <div className="sb-show-more" onClick={() => toggleExpanded(group.cwd)}>
                  Show less
                </div>
              )}
            </section>
          )
        })}

        {!filtering && sessions.length === 0 && (
          <div className="sb-empty-hint">
            No tasks yet — press ⌘N to start one.
          </div>
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
