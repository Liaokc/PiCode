import type { JSX } from 'react'
import {
  ExpandArrowsIcon,
  FilterIcon,
  FolderIcon,
  GearIcon,
  GripDotsIcon,
  HashIcon,
  PlusIcon,
  ProjectsFolderIcon,
  SearchIcon,
  TrashIcon
} from './icons'

interface TaskRow {
  title: string
  time: string
}

interface SidebarProps {
  open: boolean
  onOpenSettings: () => void
}

interface ProjectGroup {
  name: string
  tasks: TaskRow[]
  showMore: boolean
}

const PINNED_TASKS: TaskRow[] = [{ title: 'Pull init-branch transform fixes', time: '2h ago' }]

/**
 * Static skeleton rows shaped after screenshot 02's task list. Real Session
 * data starts flowing through the sidebar in ticket 04.
 */
const PROJECT_GROUPS: ProjectGroup[] = [
  {
    name: 'API Gateway',
    tasks: [
      { title: 'Upload pipeline smoke pass', time: 'just now' },
      { title: 'Fix redirect loop on login', time: '1h ago' },
      { title: 'Rate-limit middleware review', time: '3h ago' },
      { title: 'Draft v2 changelog', time: '6h ago' }
    ],
    showMore: true
  },
  {
    name: 'PiCode',
    tasks: [
      { title: 'Close out milestone M1', time: '1d ago' },
      { title: 'ADR notes: usage aggregator', time: '2d ago' }
    ],
    showMore: true
  }
]

function TaskItem({ task, active = false }: { task: TaskRow; active?: boolean }): JSX.Element {
  return (
    <div className={active ? 'sb-task sb-task-active' : 'sb-task'}>
      <span className="sb-task-title">{task.title}</span>
      <span className="sb-task-time">{task.time}</span>
    </div>
  )
}

export default function Sidebar({ open, onOpenSettings }: SidebarProps): JSX.Element | null {
  if (!open) return null

  return (
    <aside className="sidebar">
      <nav className="sb-actions">
        <button type="button" className="sb-action-row">
          <PlusIcon />
          <span>New Task</span>
          <kbd>⌘N</kbd>
        </button>
        <button type="button" className="sb-action-row">
          <SearchIcon />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
      </nav>

      <div className="sb-section-tools">
        <button type="button" className="sb-icon-btn" aria-label="Expand all sections">
          <ExpandArrowsIcon />
        </button>
        <div className="sb-view-pills">
          <button type="button" className="sb-pill-btn" aria-label="Group view">
            <HashIcon />
            Groups
          </button>
          <button type="button" className="sb-pill-btn sb-pill-active" aria-label="Projects view">
            <ProjectsFolderIcon />
            Projects
          </button>
        </div>
        <div className="sb-tool-icons">
          <button type="button" className="sb-icon-btn" aria-label="Filter tasks">
            <FilterIcon />
          </button>
          <button type="button" className="sb-icon-btn" aria-label="Deleted tasks">
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="sb-scroll">
        <div className="sb-section-label">Pinned</div>
        {PINNED_TASKS.map((t) => (
          <TaskItem key={t.title} task={t} />
        ))}

        <div className="sb-section-label sb-section-label-projects">
          <FolderIcon />
          Projects
          <span className="sb-section-spacer" />
          <GripDotsIcon />
        </div>

        {PROJECT_GROUPS.map((group) => (
          <section key={group.name} className="sb-group">
            <div className="sb-group-header">
              <FolderIcon />
              <span>{group.name}</span>
              <span className="sb-section-spacer" />
              <GripDotsIcon />
            </div>
            {group.tasks.map((task, i) => (
              <TaskItem key={task.title} task={task} active={group.name === 'API Gateway' && i === 0} />
            ))}
            {group.showMore && <div className="sb-show-more">Show more</div>}
          </section>
        ))}
      </div>

      <footer className="sb-account-bar">
        <span className="sb-avatar" aria-hidden="true">
          P
        </span>
        <span className="sb-account-name">No active session</span>
        <button type="button" className="sb-icon-btn" aria-label="Settings" onClick={onOpenSettings}>
          <GearIcon />
        </button>
      </footer>
    </aside>
  )
}
