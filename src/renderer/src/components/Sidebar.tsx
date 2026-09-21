import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type DragEvent,
  type JSX,
  type PointerEvent
} from 'react'
import type { SessionSummary } from '../../../shared/sessions/types'
import { clampSidebarWidth, type ShellUiAction } from '../../../shared/layout-model'
import { archivedList, filterArchived } from '../../../shared/sessions/archive'
import {
  filterHiddenGroups,
  groupSessions,
  isEmptyManualOrder,
  isSessionLive,
  projectLabel,
  relativeTime,
  timelineSessions,
  type ManualSidebarOrder,
  type SessionSort,
  type SessionView
} from '../../../shared/sessions/group'
import { moveGroupBefore, moveSessionBefore, snapshotManualOrder } from '../../../shared/sessions/reorder'
import { sessionMenuGroups, grayRowMenuGroups, type SessionMenuAction, type SessionRowAction } from '../../../shared/sessions/context-menu'
import {
  groupFoldReducer,
  initialFoldState,
  showMoreControl,
  visibleRowCount
} from '../../../shared/sessions/fold-model'
import { cwdRowState } from '../../../shared/sessions/cwd-liveness'
import { stripPendingGroups } from '../../../shared/sessions/pending-create'
import { sidebarDotState, sidebarRowState, type SidebarDotState } from '../../../shared/session-registry'
import { useNowTick } from './use-now'
import Tooltip from './Tooltip'
import FileBrowser from './FileBrowser'
import {
  ArchiveBoxIcon,
  ArrowUpIcon,
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  CloseIcon,
  EllipsisIcon,
  FilesListIcon,
  FilterIcon,
  FolderIcon,
  FoldIcon,
  GearIcon,
  GripDotsIcon,
  HistoryIcon,
  MessagePlusIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
  UnfoldIcon,
} from './icons'

/** Context-menu clamp (viewport fit): keeps the fixed-position menu inside
 * the window no matter where the row was right-clicked. Generous — the real
 * menu is ~200×300; clipping a few px of shadow is fine, losing an item is
 * not. */
const MENU_WIDTH_PX = 216
const MENU_HEIGHT_PX = 320

/** What one drag carries (ticket 84): a session row (within its OWN group —
 * cross-project moves are out of scope by red line: a session's project
 * identity is its file-header cwd) or a whole project group (grip handle). */
type SidebarDrag = { kind: 'session'; cwd: string; sessionId: string } | { kind: 'group'; cwd: string }

/** Where the current drag would land — the drop indicator + the commit
 * anchor. Session drops anchor "right before beforeId" (null = end of the
 * group); group drops anchor "right before beforeCwd" (null = last). */
type SidebarDropTarget = { kind: 'session'; cwd: string; beforeId: string | null } | { kind: 'group'; beforeCwd: string | null }

/** The row's HTML5 drag handlers, built per project-group row by the
 * Sidebar (pinned/timeline rows never receive one — they cannot drag). */
interface TaskRowDrag {
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDragEnd: (event: DragEvent<HTMLElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
}

/** Where + on which session the context menu is open (ticket 35). */
interface SessionMenuState {
  session: SessionSummary
  x: number
  y: number
}

interface SidebarProps {
  /** Open/closed shell state (⌘B / titlebar toggle, ticket 27). The sidebar
   * stays mounted while closed (ticket 40): the prop drives the closed
   * end-state styling only. */
  open: boolean
  sessions: SessionSummary[]
  /** Ticket 106: the optimistic New Task placeholders' renderer-local ids —
   * their rows render honestly ("starting…" where the time goes, no dot, no
   * rename/pin/archive/drag/menu) and never enter the manual arrangement. */
  pendingIds: ReadonlySet<string>
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
  /** Session ids archived from the sidebar lists (ticket 35): a local
   * preference projection — archived rows vanish from both views while ⌘K
   * still reaches them (hiding never makes a session unreachable). */
  archivedIds: ReadonlySet<string>
  onTogglePin: (session: SessionSummary) => void
  onOpenSession: (session: SessionSummary) => void
  onRenameSession: (session: SessionSummary, name: string) => void
  /** Everything the row context menu dispatches past the sidebar (ticket
   * 35): archive/restore, the unread toggle, the read-only reveal/copy
   * actions and the call-trace entry. Pin and rename stay here — the pin
   * preference and the inline rename input are sidebar-owned. */
  onSessionAction: (session: SessionSummary, action: SessionRowAction) => void
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
  /** The persisted filter-dropdown sort key (ticket 33): updated | created
   * | manual (ticket 84). */
  sort: SessionSort
  /** Persist a dropdown view choice (ticket 33). */
  onViewChange: (view: SessionView) => void
  /** Persist a dropdown sort choice (ticket 33). */
  onSortChange: (sort: SessionSort) => void
  /** The persisted drag arrangement (ticket 84); active only while `sort`
   * is 'manual' — switching back to Updated/Created keeps it stored. */
  manualOrder: ManualSidebarOrder
  /** Commit one drag (ticket 84): persist the new arrangement AND flip the
   * sort to 'manual' in one preference patch — the first drag auto-enters
   * Manual, later drags compose onto the stored order. */
  onCommitManualOrder: (order: ManualSidebarOrder) => void
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
  dimmed,
  pinned,
  pending,
  renaming,
  draft,
  onOpen,
  onTogglePin,
  onRename,
  onRenameStart,
  onRenameEnd,
  onDraftChange,
  onArchive,
  onContextMenu,
  drag,
  dropMark
}: {
  session: SessionSummary
  now: number
  /** Selection follows the view (ticket 28): the row whose view is on
   * screen — focused, or followed while Follow is active. */
  selected: boolean
  /** Fixed-slot dot state (ticket 20 + 25 + 28): orange / animated / green /
   * indigo unread / empty slot. */
  dot: SidebarDotState
  /** Gray row (ticket 54, Dimmed Row): the session's cwd is gone and no
   * host lives in this app. Pure display state — the row dims, a "cwd
   * missing" meta explains, and the click is intercepted upstream (App
   * answers with the explanation toast; zero resume). */
  dimmed: boolean
  /** Ticket 106: an optimistic New Task placeholder. The row shows only
   * what is known (the projected first-message title); its time slot reads
   * the honest "starting…" instead of a fabricated recency, and every
   * mutation/interaction is inert — nothing to open, pin, rename, archive,
   * drag or menu while the host is still booting. */
  pending: boolean
  pinned: boolean
  /** Controlled inline rename (ticket 35): WHICH row is renaming and the
   * draft live in the sidebar, so the context menu's Rename task enters the
   * same flow as a double-click — both call onRenameStart, no effect-joined
   * state. */
  renaming: boolean
  draft: string
  onOpen: () => void
  onTogglePin: () => void
  onRename: (name: string) => void
  onRenameStart: () => void
  onRenameEnd: () => void
  onDraftChange: (name: string) => void
  /** Archive from the row hover (ticket 35): the archive-box button that
   * temporarily takes the dot slot. */
  onArchive: () => void
  onContextMenu: (x: number, y: number) => void
  /** Project-group rows only (ticket 84): the row body drags within its own
   * group. Pinned and timeline rows never receive handlers — no drag. */
  drag?: TaskRowDrag
  /** Drop-indicator mark while a drag hovers this row (ticket 84). */
  dropMark?: 'above' | 'below' | null
}): JSX.Element {
  function commit(): void {
    const name = draft.trim()
    onRenameEnd()
    if (name !== '' && name !== session.title) onRename(name)
  }

  const cls = selected ? 'sb-task sb-task-active' : 'sb-task'
  const dropCls = dropMark ? ` sb-drop-${dropMark}` : ''

  return (
    <div
      className={dimmed ? `${cls} sb-task-dimmed${dropCls}` : `${cls}${dropCls}`}
      data-file={session.file}
      data-pending={pending || undefined}
      // Row-body drag (ticket 84); gray (dimmed) rows drag the same path.
      // The rename input must never fight an ancestor drag for selection.
      // Ticket 106: a pending placeholder never drags (drag is undefined).
      draggable={drag !== undefined && !renaming}
      onClick={pending ? undefined : onOpen}
      onDoubleClick={pending ? undefined : onRenameStart}
      {...(drag ?? {})}
      onContextMenu={(e) => {
        e.preventDefault()
        if (pending) return
        onContextMenu(e.clientX, e.clientY)
      }}
    >
      {/* Fixed slot (ticket 20): always rendered so every title's left edge
          aligns — the dot appears inside only for live states. Orange badge
          = parked at the approval gate (ticket 25); indigo = unread
          (ticket 28). On hover (ticket 35, grilling Q6①-i) the dot yields
          the slot to the archive button — a pure content swap inside the
          same box, so nothing overlaps and nothing shifts. */}
      <span className="sb-dot-slot">
        {dot === 'run-here' && <span className="sb-run-dot" aria-label="Running in PiCode" />}
        {dot === 'awaiting-approval' && <span className="sb-await-dot" aria-label="Awaiting approval" />}
        {dot === 'tui-live' && <span className="sb-live-dot" aria-label="Running in another window" />}
        {dot === 'unread' && <span className="sb-unread-dot" aria-label="Unread" />}
        {/* Ticket 106: a pending placeholder has no archive affordance — the
            slot stays empty (the row is not a session yet). */}
        {!pending && (
          <Tooltip label="Archive task">
            <button
              type="button"
              className="sb-arch-btn"
              aria-label={`Archive task: ${session.title}`}
              onClick={(e) => {
                e.stopPropagation()
                onArchive()
              }}
            >
              <ArchiveBoxIcon size={12} />
            </button>
          </Tooltip>
        )}
      </span>
      {renaming ? (
        <input
          className="sb-rename-input"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commit}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') onRenameEnd()
          }}
          autoFocus
        />
      ) : (
        <span className="sb-task-title">{session.title}</span>
      )}
      {/* Gray-row meta (ticket 54): the factual note where the row explains
          itself — no tooltip, no modal; the click toast carries the rest. */}
      {dimmed && <span className="sb-task-cwd-meta">cwd missing</span>}
      {/* Fixed-width time slot (ticket 34): hover fades ONLY the text —
          the slot itself never resizes, so nothing in the row shifts.
          Ticket 106: a pending placeholder shows the honest starting label
          instead of a recency the session file has not earned yet. */}
      <span className="sb-task-time">{pending ? 'starting…' : relativeTime(session.modifiedAt, now)}</span>
      {/* Reserved row-end slot (ticket 34, grilling Q5 decision a): the pin
          is the LAST child in every row — pinned rows keep it visible
          (orange), unpinned rows fade it in on hover at the same x.
          Ticket 106: a pending placeholder's pin is inert (nothing to pin
          yet — the real id does not exist). */}
      <Tooltip label={pinned ? 'Unpin' : 'Pin'}>
        <button
          type="button"
          className={pinned ? 'sb-pin-btn sb-pin-on' : 'sb-pin-btn'}
          aria-label={pinned ? 'Unpin task' : 'Pin task'}
          onClick={(e) => {
            e.stopPropagation()
            if (pending) return
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
  pendingIds,
  activeSessionId,
  followedFile,
  pinnedIds,
  inAppIds,
  runningIds,
  awaitingIds,
  unreadIds,
  archivedIds,
  onTogglePin,
  onOpenSession,
  onRenameSession,
  onSessionAction,
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
  manualOrder,
  onCommitManualOrder,
  width,
  dispatch
}: SidebarProps): JSX.Element | null {
  const now = useNowTick(30_000)
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  // Group fold shapes (ticket 39): the pure shape machine owns rows shown,
  // the Show more/less step position and fold/unfold. Memory-level only —
  // nothing here reaches preferences, so a restart returns every group to
  // the default shape (spec R5, Q5).
  const [folds, dispatchFold] = useReducer(groupFoldReducer, undefined, initialFoldState)
  /** The project group whose ⋯ menu is open (ticket 19); null = none. */
  const [groupMenuCwd, setGroupMenuCwd] = useState<string | null>(null)
  /** The project whose files the sidebar is browsing (ticket 26); null =
   * the regular task list. Back unmounts the browser, so no tree state
   * survives the return (acceptance: the browser leaves no residue). */
  const [browserTarget, setBrowserTarget] = useState<{ cwd: string; project: string } | null>(null)
  /** The archive list view behind the archive button (ticket 35) — the same
   * whole-sidebar swap the file browser uses. */
  const [showArchived, setShowArchived] = useState(false)
  /** The session-row context menu (ticket 35); null = closed. */
  const [menu, setMenu] = useState<SessionMenuState | null>(null)
  /** Which row's inline rename is active (controlled TaskItem state — the
   * context menu's Rename task enters the same flow as a double-click). */
  const [renamingFile, setRenamingFile] = useState<string | null>(null)
  /** The rename input's draft, seeded by startRename — both the menu and
   * the double-click go through it, so no effect ever syncs the draft. */
  const [renameDraft, setRenameDraft] = useState('')

  // Drag-reorder state (ticket 84): the drag payload rides a ref (the HTML5
  // DataTransfer is unreadable during dragover), the drop indicator in
  // state. setDrop skips no-op writes so dragover's firehose doesn't
  // re-render the list per pixel.
  const dragRef = useRef<SidebarDrag | null>(null)
  const [dropTarget, setDropTarget] = useState<SidebarDropTarget | null>(null)
  function sameTarget(a: SidebarDropTarget | null, b: SidebarDropTarget | null): boolean {
    if (a === null || b === null) return a === b
    if (a.kind !== b.kind) return false
    return a.kind === 'session'
      ? b.kind === 'session' && a.cwd === b.cwd && a.beforeId === b.beforeId
      : b.kind === 'group' && a.beforeCwd === b.beforeCwd
  }
  function setDrop(next: SidebarDropTarget | null): void {
    setDropTarget((prev) => (sameTarget(prev, next) ? prev : next))
  }

  // Sidebar width drag (ticket 29): pointermove NEVER dispatches — the raw
  // width is rAF-coalesced and written straight to the aside's style (the
  // ticket-30 side-panel pattern, mirrored for the left pane), so a full
  // task list never re-renders mid-drag. The reducer commit happens once,
  // on pointerup; clampSidebarWidth is shared with the reducer so the live
  // write and the commit can never disagree.
  //
  // Ticket 40: the drag writes BOTH the pane and its pinned content wrapper
  // (the content follows the edge 1:1, exactly as before), flips the
  // pane-motion drag rule (size transition off), and clears its inline
  // writes on release so the App-projected variables own the geometry again.
  const drag = useRef<{ startX: number; startWidth: number; width: number; raf: number } | null>(null)
  const frameRef = useRef<HTMLElement | null>(null)
  const pinRef = useRef<HTMLDivElement | null>(null)

  function startResize(event: PointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    drag.current = { startX: event.clientX, startWidth: width, width, raf: 0 }
    // Pane-motion drag rule (ticket 40): size transition off while dragging.
    frameRef.current?.setAttribute('data-resizing', '')
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
      const px = `${d.width}px`
      if (frameRef.current) frameRef.current.style.width = px
      if (pinRef.current) pinRef.current.style.width = px
    })
  }

  function endResize(event: PointerEvent<HTMLDivElement>): void {
    const d = drag.current
    drag.current = null
    frameRef.current?.removeAttribute('data-resizing')
    if (d) {
      if (d.raf !== 0) cancelAnimationFrame(d.raf)
      // Single state commit per drag; the reducer clamps with the same
      // clampSidebarWidth the DOM writes used, so nothing jumps. The
      // dispatch persists the change to preferences (App-level wrapper).
      dispatch({ type: 'set-sidebar-width', width: d.width })
    }
    // The committed width re-enters through the App-projected variables —
    // clear the drag's inline writes so the variables own the geometry
    // again (the dispatch above flushes before the next paint, so no
    // intermediate frame shows the stale variable).
    if (frameRef.current) frameRef.current.style.width = ''
    if (pinRef.current) pinRef.current.style.width = ''
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  // Ticket 35 × 33 composed pipeline: archiving is the MOST-UPSTREAM pure
  // projection over the session index (the filterHiddenGroups invariant:
  // hiding never makes a session unreachable) — BOTH sidebar views and the
  // Pinned section draw from `listed`; ⌘K search and the follow/resume
  // paths still receive the UNFILTERED index. The ticket-33 dropdown
  // pipelines consume the listed (archive-filtered) sessions with the
  // persisted sort; the ticket-33 text filter is retired (⌘K covers search).
  const listed = useMemo(() => filterArchived(sessions, archivedIds), [sessions, archivedIds])
  const grouped = useMemo(
    () => groupSessions(listed, pinnedIds, sort, manualOrder),
    [listed, pinnedIds, sort, manualOrder]
  )
  const timeline = useMemo(
    () => timelineSessions(listed, pinnedIds, sort, manualOrder),
    [listed, pinnedIds, sort, manualOrder]
  )
  const visibleProjectGroups = useMemo(
    () => filterHiddenGroups(grouped.groups, hiddenCwds),
    [grouped.groups, hiddenCwds]
  )
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null
  /** The archive button's view rows (ticket 35): exactly the archived
   * sessions, newest first, one click from restore. */
  const archived = useMemo(() => archivedList(sessions, archivedIds), [sessions, archivedIds])

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

  // Outside click / Escape closes the session context menu (ticket 35).
  useEffect(() => {
    if (menu === null) return
    function onPointerDown(event: MouseEvent): void {
      if (event.target instanceof Element && event.target.closest('.sb-context-menu')) return
      setMenu(null)
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])

  /** Open the row context menu at the cursor, clamped into the viewport. */
  function openSessionMenu(session: SessionSummary, x: number, y: number): void {
    setRenamingFile(null)
    setMenu({
      session,
      x: Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH_PX)),
      y: Math.max(8, Math.min(y, window.innerHeight - MENU_HEIGHT_PX))
    })
  }

  /** Dispatch one menu entry. Pin and rename are sidebar-owned; everything
   * else rides onSessionAction to the shell. */
  function runMenuAction(session: SessionSummary, action: SessionMenuAction): void {
    setMenu(null)
    if (action === 'rename') {
      startRename(session)
      return
    }
    if (action === 'toggle-pin') {
      onTogglePin(session)
      return
    }
    onSessionAction(session, action)
  }

  /** Enter inline rename with a fresh draft (double-click + menu entry). */
  function startRename(session: SessionSummary): void {
    setRenameDraft(session.name ?? session.title)
    setRenamingFile(session.file)
  }

  /** Fixed-slot dot state for one row (ticket 20 + 25 + 28): orange = parked
   * at the approval gate, animated = running in this app, green = written by
   * another end (120s rule), indigo = unread, empty = idle. An in-app
   * session never shows the TUI dot — its mtime is ours. Ticket 106: a
   * pending placeholder shows the EMPTY slot — its dispatch-clock mtime
   * would otherwise read as the green live-elsewhere dot, a liveness claim
   * the not-yet-born session cannot make. */
  function dotFor(s: SessionSummary): SidebarDotState {
    if (pendingIds.has(s.id)) return 'idle'
    return sidebarDotState(
      awaitingIds.has(s.id),
      runningIds.has(s.id),
      inAppIds.has(s.id),
      isSessionLive(s, now),
      unreadIds.has(s.id)
    )
  }

  /** Gray row (ticket 54, Dimmed Row): the session's cwd is gone and no
   * host lives in this app (the warning state — cwd gone but a live host —
   * keeps the row normal; its banner shows in the session view instead).
   * Status-dot vocabulary untouched: dimming is row opacity + meta. */
  function dimmedFor(s: SessionSummary): boolean {
    return cwdRowState(s.cwdMissing === true, inAppIds.has(s.id)) === 'dimmed'
  }

  // ---- drag-reorder commit (ticket 84) ----

  /** The arrangement the drop composes onto: the first drag EVER snapshots
   * the current render (so Manual activates without rows jumping); every
   * later drag composes onto the stored order — preserved across
   * Updated/Created detours, never silently rebuilt. Ticket 106: pending
   * placeholders are stripped first — their synthetic ids must never enter
   * the persisted arrangement. */
  function manualBase(): ManualSidebarOrder {
    return isEmptyManualOrder(manualOrder) ? snapshotManualOrder(stripPendingGroups(grouped, pendingIds)) : manualOrder
  }

  /** One drop, committed: apply the anchored move and persist — the App
   * wrapper writes order + sort:'manual' in ONE preference patch (first
   * drag auto-enters Manual; later drops are idempotent on the sort). */
  function commitDrop(target: SidebarDropTarget): void {
    const d = dragRef.current
    dragRef.current = null
    setDrop(null)
    if (d === null) return
    if (d.kind === 'session') {
      if (target.kind !== 'session' || d.cwd !== target.cwd) return
      // Ticket 106: the rendered list handed to the reconcile excludes
      // placeholders — a drop mid-boot cannot bake a synthetic id into the
      // stored order.
      const rendered =
        grouped.groups
          .find((g) => g.cwd === d.cwd)
          ?.sessions.filter((s) => !pendingIds.has(s.id))
          .map((s) => s.id) ?? []
      onCommitManualOrder(moveSessionBefore(manualBase(), d.cwd, d.sessionId, target.beforeId, rendered))
      return
    }
    if (target.kind !== 'group') return
    onCommitManualOrder(
      moveGroupBefore(manualBase(), d.cwd, target.beforeCwd, grouped.groups.map((g) => g.cwd))
    )
  }

  /** The session drop target from ONE event's geometry (top/bottom half of
   * the row). Both dragover and drop derive it from the event — the drop
   * never reads the indicator state, so a drop dispatched in the same task
   * as its dragover (test drivers) lands exactly like a real one. */
  function sessionDropTargetFrom(
    event: DragEvent<HTMLElement>,
    session: SessionSummary,
    rows: SessionSummary[],
    index: number,
    endBeforeId: string | null
  ): SidebarDropTarget {
    const rect = event.currentTarget.getBoundingClientRect()
    const above = event.clientY < rect.top + rect.height / 2
    const beforeId = above ? session.id : index + 1 < rows.length ? rows[index + 1].id : endBeforeId
    return { kind: 'session', cwd: session.cwd, beforeId }
  }

  /** The group drop target from ONE event's geometry against its section
   * (top half = before this group, bottom half = after it). */
  function groupDropTargetFrom(
    event: DragEvent<HTMLElement>,
    group: { cwd: string },
    groupIndex: number
  ): SidebarDropTarget {
    const rect = event.currentTarget.getBoundingClientRect()
    const above = event.clientY < rect.top + rect.height / 2
    const beforeCwd = above ? group.cwd : (visibleProjectGroups[groupIndex + 1]?.cwd ?? null)
    return { kind: 'group', beforeCwd }
  }

  /** Per-row drag handlers for one project-group row (row-body drag, same
   * group only — cross-project moves are refused at the dragover gate, so
   * the browser shows the not-allowed cursor and the drop never lands). */
  function rowDrag(
    group: { cwd: string },
    session: SessionSummary,
    rows: SessionSummary[],
    index: number,
    endBeforeId: string | null
  ): TaskRowDrag {
    return {
      onDragStart: (event) => {
        dragRef.current = { kind: 'session', cwd: group.cwd, sessionId: session.id }
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', session.id)
      },
      onDragEnd: () => {
        dragRef.current = null
        setDrop(null)
      },
      onDragOver: (event) => {
        const d = dragRef.current
        if (d === null || d.kind !== 'session' || d.cwd !== group.cwd) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setDrop(sessionDropTargetFrom(event, session, rows, index, endBeforeId))
      },
      onDrop: (event) => {
        const d = dragRef.current
        if (d === null || d.kind !== 'session' || d.cwd !== group.cwd) return
        event.preventDefault()
        commitDrop(sessionDropTargetFrom(event, session, rows, index, endBeforeId))
      }
    }
  }

  // Ticket 40: the sidebar STAYS MOUNTED while closed — the closed end
  // state (size 0 + opacity 0 + pointer-events/visibility) is styled via
  // [data-closed], and the open/close run is a width/opacity transition of
  // the App-projected variables. Content keeps its real width inside the
  // pinned wrapper, so closing CLIPS the task list instead of reflowing it.
  return (
    <aside ref={frameRef} className="sidebar" data-closed={open ? undefined : ''}>
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
      <div className="sidebar-clip">
        <div className="sidebar-pin" ref={pinRef}>
      {browserTarget !== null ? (
        <FileBrowser
          key={browserTarget.cwd}
          cwd={browserTarget.cwd}
          project={browserTarget.project}
          onBack={() => setBrowserTarget(null)}
          onOpenFile={onOpenPreview}
        />
      ) : showArchived ? (
        <ArchivedView sessions={archived} onRestore={(s) => onSessionAction(s, 'restore')} onBack={() => setShowArchived(false)} />
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
          <Tooltip label="Archived tasks">
            <button
              type="button"
              className="sb-icon-btn"
              aria-label="Archived tasks"
              onClick={() => {
                setBrowserTarget(null)
                setMenu(null)
                setShowArchived(true)
              }}
            >
              <ArchiveBoxIcon />
            </button>
          </Tooltip>
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
            {/* Manual (ticket 84): the drag arrangement. Picking it before
                any drag renders exactly the Updated layout (empty order);
                the first drag snapshots the current render, later drags
                compose onto the stored arrangement. */}
            <button
              type="button"
              role="menuitemradio"
              aria-checked={sort === 'manual'}
              className="sb-filter-menu-item"
              onClick={() => {
                onSortChange('manual')
                setFilterMenuOpen(false)
              }}
            >
              <GripDotsIcon size={14} />
              <span>Manual</span>
              {sort === 'manual' && <CheckIcon size={14} className="sb-filter-check" />}
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
                dimmed={dimmedFor(s)}
                pinned
                pending={pendingIds.has(s.id)}
                renaming={renamingFile === s.file}
                draft={renameDraft}
                onOpen={() => onOpenSession(s)}
                onTogglePin={() => onTogglePin(s)}
                onRename={(name) => onRenameSession(s, name)}
                onRenameStart={() => startRename(s)}
                onRenameEnd={() => setRenamingFile(null)}
                onDraftChange={setRenameDraft}
                onArchive={() => onSessionAction(s, 'archive')}
                onContextMenu={(x, y) => openSessionMenu(s, x, y)}
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
              {/* The section row's resident action pair (ticket 95): one
                  click folds / unfolds EVERY listed group. The spot the
                  section-row grip vacated (ticket 84) is exactly this. Each
                  group keeps its pre-fold shape memory (ticket 39) — the
                  reducer flips only `folded` — and hidden projects are not
                  in the list, so they are untouched. Memory-level like the
                  single-group toggle: a restart returns every group to the
                  default shape. Timeline has no groups, so this whole row
                  (buttons included) renders only in the Projects view. */}
              <Tooltip label="Collapse all">
                <button
                  type="button"
                  className="sb-section-action"
                  aria-label="Collapse all"
                  onClick={() => dispatchFold({ type: 'collapse-all', cwds: visibleProjectGroups.map((g) => g.cwd) })}
                >
                  <FoldIcon size={13} />
                </button>
              </Tooltip>
              <Tooltip label="Expand all">
                <button
                  type="button"
                  className="sb-section-action"
                  aria-label="Expand all"
                  onClick={() => dispatchFold({ type: 'expand-all', cwds: visibleProjectGroups.map((g) => g.cwd) })}
                >
                  <UnfoldIcon size={13} />
                </button>
              </Tooltip>
            </div>

            {visibleProjectGroups.map((group, groupIndex) => {
              // Fold + pagination come from the shape machine (ticket 39):
              // the header row's click folds/unfolds the WHOLE group, the
              // remembered step survives folds, Show more steps +5, Show
              // less resets in one click.
              const rowCount = visibleRowCount(folds, group.cwd, group.sessions.length)
              const control = showMoreControl(folds, group.cwd, group.sessions.length)
              const rows = group.sessions.slice(0, rowCount)
              // The anchor id meaning "insert at the visible end" (ticket
              // 84): the first HIDDEN row when pagination hides any, else
              // null = the group's absolute end. Drops below the last
              // rendered row and its indicator both use it, so a drop into
              // a partly shown group lands right below what the user sees.
              const endBeforeId = rowCount < group.sessions.length ? (group.sessions[rowCount]?.id ?? null) : null
              const menuOpen = groupMenuCwd === group.cwd
              const groupDropCls =
                dropTarget !== null && dropTarget.kind === 'group'
                  ? dropTarget.beforeCwd === group.cwd
                    ? ' sb-drop-above'
                    : dropTarget.beforeCwd === null && groupIndex === visibleProjectGroups.length - 1
                      ? ' sb-drop-below'
                      : ''
                  : ''
              return (
                <section
                  key={group.cwd}
                  data-cwd={group.cwd}
                  className={`sb-group${groupDropCls}`}
                  onDragOver={(e) => {
                    // Group-level drop zones (ticket 84): top half = before
                    // this group, bottom half = after it. Fires for group
                    // drags only; session drags are refused here (no
                    // preventDefault → not-allowed cursor → no drop).
                    const d = dragRef.current
                    if (d === null || d.kind !== 'group') return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDrop(groupDropTargetFrom(e, group, groupIndex))
                  }}
                  onDrop={(e) => {
                    const d = dragRef.current
                    if (d === null || d.kind !== 'group') return
                    e.preventDefault()
                    commitDrop(groupDropTargetFrom(e, group, groupIndex))
                  }}
                >
                  <div className="sb-group-header" onClick={() => dispatchFold({ type: 'toggle-fold', cwd: group.cwd })}>
                    <FolderIcon />
                    <span>{group.project}</span>
                    <span className="sb-section-spacer" />
                    {/* Caret deleted (ticket 39): one control, one job — the
                        group row's click owns folding. No count either (Q9). */}
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
                            setShowArchived(false)
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
                    {/* The grip is the REAL drag handle now (ticket 84):
                        dragging it reorders the group; the section-level
                        dragover/drop pair above carries the drop. The ghost
                        image is the whole header row (ZCode's move form). */}
                    <span
                      className="sb-grip-handle"
                      aria-label={`Drag to reorder ${group.project}`}
                      draggable
                      onDragStart={(e) => {
                        dragRef.current = { kind: 'group', cwd: group.cwd }
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', group.cwd)
                        const header = e.currentTarget.closest('.sb-group-header')
                        if (header instanceof HTMLElement) {
                          try {
                            e.dataTransfer.setDragImage(header, 12, 12)
                          } catch {
                            // Synthetic (untrusted) events cannot set drag
                            // images — the default grip ghost is fine.
                          }
                        }
                      }}
                      onDragEnd={() => {
                        dragRef.current = null
                        setDrop(null)
                      }}
                    >
                      <GripDotsIcon className="sb-grip" />
                    </span>
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
                  {rows.map((s, rowIndex) => (
                    <TaskItem
                      key={s.file}
                      session={s}
                      now={now}
                      selected={sidebarRowState(activeSessionId, followedFile, s.id, s.file) === 'selected'}
                      dot={dotFor(s)}
                      dimmed={dimmedFor(s)}
                      pinned={false}
                      pending={pendingIds.has(s.id)}
                      renaming={renamingFile === s.file}
                      draft={renameDraft}
                      onOpen={() => onOpenSession(s)}
                      onTogglePin={() => onTogglePin(s)}
                      onRename={(name) => onRenameSession(s, name)}
                      onRenameStart={() => startRename(s)}
                      onRenameEnd={() => setRenamingFile(null)}
                      onDraftChange={setRenameDraft}
                      onArchive={() => onSessionAction(s, 'archive')}
                      onContextMenu={(x, y) => openSessionMenu(s, x, y)}
                      drag={pendingIds.has(s.id) ? undefined : rowDrag(group, s, rows, rowIndex, endBeforeId)}
                      dropMark={
                        dropTarget !== null && dropTarget.kind === 'session' && dropTarget.cwd === group.cwd
                          ? dropTarget.beforeId === s.id
                            ? 'above'
                            : dropTarget.beforeId === endBeforeId && rowIndex === rows.length - 1
                              ? 'below'
                              : null
                          : null
                      }
                    />
                  ))}
                  {control !== null && (
                    <div
                      className="sb-show-more"
                      onClick={() =>
                        dispatchFold(
                          control === 'more'
                            ? { type: 'show-more', cwd: group.cwd, total: group.sessions.length }
                            : { type: 'show-less', cwd: group.cwd }
                        )
                      }
                    >
                      {control === 'more' ? 'Show more' : 'Show less'}
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
                dimmed={dimmedFor(s)}
                pinned={false}
                pending={pendingIds.has(s.id)}
                renaming={renamingFile === s.file}
                draft={renameDraft}
                onOpen={() => onOpenSession(s)}
                onTogglePin={() => onTogglePin(s)}
                onRename={(name) => onRenameSession(s, name)}
                onRenameStart={() => startRename(s)}
                onRenameEnd={() => setRenamingFile(null)}
                onDraftChange={setRenameDraft}
                onArchive={() => onSessionAction(s, 'archive')}
                onContextMenu={(x, y) => openSessionMenu(s, x, y)}
              />
            ))}
          </>
        )}

        {sessions.length === 0 && (
          <div className="sb-empty-hint">No tasks yet — press ⌘N to start one.</div>
        )}
        {listed.length === 0 && sessions.length > 0 && (
          <div className="sb-empty-hint">All tasks are archived — restore from the Archived view.</div>
        )}
      </div>
      </>
      )}

      {/* Session-row context menu (ticket 35, z-context-menu.png): nine
          entries in three groups, hairline between groups. Rendered at the
          sidebar root so row scrolls never move it; fixed-position at the
          clamped cursor point. */}
      {menu !== null && (
        <div
          className="sb-context-menu"
          role="menu"
          aria-label="Task actions"
          style={{ left: menu.x, top: menu.y }}
        >
          {(dimmedFor(menu.session) ? grayRowMenuGroups() : sessionMenuGroups(pinnedIds.has(menu.session.id), unreadIds.has(menu.session.id))).map((group, gi) => (
            <div key={gi} className="sb-context-group">
              {group.map((entry) => (
                <button
                  key={entry.action}
                  type="button"
                  role="menuitem"
                  className="sb-context-item"
                  data-menu-action={entry.action}
                  onClick={() => runMenuAction(menu.session, entry.action)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          ))}
        </div>
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
        </div>
      </div>
    </aside>
  )
}

/**
 * The archive button's view (ticket 35): the whole sidebar swaps into
 * it — the same mode switch the file browser uses. Exactly the archived
 * sessions, newest first; each row one click from restore. Rows are
 * display-only (opening an archived task goes through ⌘K, the reachability
 * invariant), the account bar below stays as persistent chrome.
 */
function ArchivedView({
  sessions,
  onRestore,
  onBack
}: {
  sessions: SessionSummary[]
  onRestore: (session: SessionSummary) => void
  onBack: () => void
}): JSX.Element {
  const now = useNowTick(30_000)
  return (
    <div className="sb-archived">
      <div className="sb-archived-bar">
        <Tooltip label="Back to tasks">
          <button type="button" className="sb-icon-btn" aria-label="Back to tasks" onClick={onBack}>
            <ChevronLeftIcon />
          </button>
        </Tooltip>
        <span className="sb-archived-title">Archived</span>
        <span className="sb-archived-count">{sessions.length}</span>
      </div>
      <div className="sb-scroll">
        {sessions.length === 0 && <div className="sb-empty-hint">No archived tasks.</div>}
        {sessions.map((s) => (
          <div key={s.file} className="sb-archived-row" data-file={s.file}>
            <span className="sb-archived-main">
              <span className="sb-archived-title-text">{s.title}</span>
              <span className="sb-archived-project">{projectLabel(s.cwd)}</span>
            </span>
            <span className="sb-task-time">{relativeTime(s.modifiedAt, now)}</span>
            <Tooltip label="Restore task">
              <button
                type="button"
                className="sb-restore-btn"
                aria-label={`Restore task: ${s.title}`}
                onClick={() => onRestore(s)}
              >
                <ArrowUpIcon size={13} />
              </button>
            </Tooltip>
          </div>
        ))}
      </div>
    </div>
  )
}
