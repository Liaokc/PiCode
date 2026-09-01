import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { SessionSummary } from '../../../shared/sessions/types'
import {
  filterSessions,
  groupSessions,
  isSessionLive,
  relativeTime
} from '../../../shared/sessions/group'
import { sidebarDotState } from '../../../shared/session-registry'
import { useNowTick } from './use-now'
import Tooltip from './Tooltip'
import {
  ChevronDownIcon,
  ExpandArrowsIcon,
  FilterIcon,
  FolderIcon,
  GearIcon,
  GripDotsIcon,
  HashIcon,
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
  /** The session currently focused in the chat view (highlighted row). */
  activeSessionId: string | null
  /** The session currently being followed read-only (highlighted row). */
  followedFile: string | null
  pinnedIds: ReadonlySet<string>
  /** Sessions whose host process is alive in this app (ticket 20): their dot
   * is app-owned (animated while running, empty slot when idle). */
  inAppIds: ReadonlySet<string>
  /** Sessions with a run in flight in this app (the animated dot). */
  runningIds: ReadonlySet<string>
  onTogglePin: (session: SessionSummary) => void
  onOpenSession: (session: SessionSummary) => void
  onRenameSession: (session: SessionSummary, name: string) => void
  onNewTask: () => void
  /** Open the ⌘K task-search palette (ticket 11). */
  onOpenSearch: () => void
  /** Open the settings window (ticket 10). */
  onOpenSettings: () => void
}

function TaskItem({
  session,
  now,
  state,
  dot,
  pinned,
  onOpen,
  onTogglePin,
  onRename
}: {
  session: SessionSummary
  now: number
  state: 'idle' | 'active' | 'followed'
  /** Fixed-slot dot state (ticket 20): animated / green / empty slot. */
  dot: 'run-here' | 'tui-live' | 'idle'
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

  const cls =
    state === 'active' ? 'sb-task sb-task-active' : state === 'followed' ? 'sb-task sb-task-followed' : 'sb-task'

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
          aligns — the dot appears inside only for live states. */}
      <span className="sb-dot-slot">
        {dot === 'run-here' && <span className="sb-run-dot" aria-label="Running in PiCode" />}
        {dot === 'tui-live' && <span className="sb-live-dot" aria-label="Running in another window" />}
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
  onTogglePin,
  onOpenSession,
  onRenameSession,
  onNewTask,
  onOpenSearch,
  onOpenSettings
}: SidebarProps): JSX.Element | null {
  const now = useNowTick(30_000)
  const [filterOpen, setFilterOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'projects' | 'groups'>('projects')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const filterRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => filterSessions(sessions, query), [sessions, query])
  const grouped = useMemo(() => groupSessions(filtered, pinnedIds), [filtered, pinnedIds])
  const filtering = query.trim() !== ''
  const visibleGroups = view === 'projects' ? grouped.groups : [{ cwd: '', project: 'All tasks', sessions: filtered.filter((s) => !pinnedIds.has(s.id)) }]
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null

  /** Fixed-slot dot state for one row (ticket 20): animated = running in
   * this app, green = written by another end (120s rule), empty = idle. An
   * in-app session never shows the TUI dot — its mtime is ours. */
  function dotFor(s: SessionSummary): 'run-here' | 'tui-live' | 'idle' {
    return sidebarDotState(runningIds.has(s.id), inAppIds.has(s.id), isSessionLive(s, now))
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
                state={s.id === activeSessionId ? 'active' : s.file === followedFile ? 'followed' : 'idle'}
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
          return (
            <section key={group.cwd || 'all'} className="sb-group">
              <div className="sb-group-header" onClick={() => group.cwd !== '' && toggleExpanded(group.cwd)}>
                <FolderIcon />
                <span>{group.project}</span>
                <span className="sb-section-spacer" />
                {group.sessions.length > SHOW_FIRST && (
                  <ChevronDownIcon size={13} className={isExpanded ? 'sb-caret sb-caret-up' : 'sb-caret'} />
                )}
                <GripDotsIcon />
              </div>
              {group.sessions.length === 0 && filtering && (
                <div className="sb-empty-hint">No matching tasks</div>
              )}
              {shown.map((s) => (
                <TaskItem
                  key={s.file}
                  session={s}
                  now={now}
                  state={s.id === activeSessionId ? 'active' : s.file === followedFile ? 'followed' : 'idle'}
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
