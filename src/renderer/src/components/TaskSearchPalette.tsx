import { useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { nextSelectionIndex, searchTasks } from '../../../shared/task-search'
import { projectLabel, relativeTime } from '../../../shared/sessions/group'
import type { SessionSummary } from '../../../shared/sessions/types'
import { FolderIcon, SearchIcon } from './icons'

interface TaskSearchPaletteProps {
  sessions: SessionSummary[]
  /** Jump to the picked task (resume / Live Follow — the sidebar's handler). */
  onOpenSession: (session: SessionSummary) => void
  onClose: () => void
}

/**
 * ⌘K task search (ticket 11, user story 49): a quick-switcher palette over
 * TASKS ONLY. Invoke → type to filter → ↑↓ to select → Enter to jump, all
 * without touching the mouse; Esc or a backdrop click closes. Mouse clicks
 * still work, they are just never required. Mounted only while open, so the
 * query and selection start fresh on every invoke.
 */
export default function TaskSearchPalette({ sessions, onOpenSession, onClose }: TaskSearchPaletteProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [now] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the input as soon as the palette mounts (invoke → type immediately).
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const hits = useMemo(() => searchTasks(sessions, query), [sessions, query])
  const clampedIndex = Math.min(index, Math.max(0, hits.length - 1))

  function pick(session: SessionSummary): void {
    onOpenSession(session)
    onClose()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndex((current) => nextSelectionIndex(Math.min(current, hits.length - 1), 1, hits.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndex((current) => nextSelectionIndex(Math.min(current, hits.length - 1), -1, hits.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const hit = hits[clampedIndex]
      if (hit) pick(hit)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div
        className="palette-panel"
        role="dialog"
        aria-label="Search tasks"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="palette-input-row">
          <SearchIcon size={14} />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Search tasks"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setIndex(0)
            }}
            onKeyDown={onKeyDown}
            aria-label="Search tasks"
          />
        </div>

        <div className="palette-list" role="listbox" aria-label="Matching tasks">
          {hits.map((session, i) => (
            <button
              key={session.file}
              type="button"
              role="option"
              aria-selected={i === clampedIndex}
              className={i === clampedIndex ? 'palette-item palette-item-active' : 'palette-item'}
              onClick={() => pick(session)}
              onMouseEnter={() => setIndex(i)}
            >
              <span className="palette-item-title">{session.title}</span>
              <span className="palette-item-meta">
                <FolderIcon size={11} />
                {projectLabel(session.cwd)}
                <span className="palette-item-time">{relativeTime(session.modifiedAt, now)}</span>
              </span>
            </button>
          ))}
          {hits.length === 0 && (
            <div className="palette-empty">
              {sessions.length === 0 ? 'No tasks yet — press ⌘N to start one.' : 'No tasks match your search.'}
            </div>
          )}
        </div>

        <div className="palette-hint">↑↓ navigate · ↵ open · Esc close</div>
      </div>
    </div>
  )
}
