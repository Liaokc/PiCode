import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { greetingForHour } from '../../../shared/greeting'
import { filterWorkspaces } from '../../../shared/new-task'
import {
  clampThinkingLevelToLevels,
  findCatalogModel,
  resolveNewTaskThinkingLevels,
  type NewTaskModelChoice
} from '../../../shared/new-task-models'
import { type ModelRef, type ProviderModels, type ThinkingLevel } from '../../../shared/contract'
import { projectCommandMenu, type NewTaskCommandCatalog } from '../../../shared/new-task-commands'
import { projectLabel } from '../../../shared/sessions/group'
import { initialChatState } from '../../../shared/chat-reducer'
import type { ImageAttachment } from '../../../shared/contract'
import Composer, { type ComposerApi, type ComposerChat } from './Composer'
import {
  BugIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  FolderIcon,
  MonitorIcon,
  ProjectsFolderIcon,
  SearchIcon
} from './icons'

/** Quick-start chips with the reference's per-chip leading icon (screenshot 02). */
const QUICK_START_CHIPS: ReadonlyArray<{ label: string; icon: (props: { size: number }) => JSX.Element }> = [
  { label: 'Weekly Report', icon: CalendarIcon },
  { label: 'Bug Fix', icon: BugIcon },
  { label: 'Slide Maker', icon: MonitorIcon },
  { label: 'Idle Tasks', icon: ClockIcon }
]

/** Big faint brand mark floating above the empty-state greeting (screenshot 02). */
function WatermarkPi(): JSX.Element {
  return (
    <svg className="empty-mark" viewBox="0 0 360 250" fill="none" aria-hidden="true">
      <path d="M26 110 C110 92, 240 74, 336 62" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
      <path d="M52 106 L30 150" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
      <path d="M116 96 L96 232" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
      <path d="M212 84 C202 152, 178 208, 140 234" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
    </svg>
  )
}

interface EmptyStateProps {
  /** True while a session is being created after a start. */
  creating: boolean
  /** Resolved chip default (active session → last used → recent first); null = nothing known. */
  defaultProject: string | null
  /** Recent workspace cwds, most recent first — the dropdown's list. */
  recentProjects: readonly string[]
  // ---- ticket 41: the empty state's model/thinking slice ----
  /** The auth-probe catalog grouped for the cascade menu (may be empty). */
  providers: ProviderModels[]
  /** The chained chip default (preference → Pi fallback); null = nothing. */
  model: ModelRef | null
  /** The chained thinking default (preference → Pi's 'medium'). */
  thinkingLevel: ThinkingLevel | null
  /** The displayed chain value is Pi's own fallback → the chip tags it "default". */
  modelIsDefault: boolean
  thinkingIsDefault: boolean
  /** The model menu's empty-catalog hint (scanning / unconfigured / error). */
  modelMenuHint: string | null
  /** Ticket 52: the command catalog for the CURRENTLY SELECTED project —
   * null while the per-directory probe has not landed yet (the `/` menu is
   * truthfully empty until it does). */
  commandCatalog: NewTaskCommandCatalog | null
  /** Ticket 52: report the chip's effective selection whenever it changes
   * (mount included) — main probes that directory's command catalog. */
  onSelectedProjectChange: (cwd: string | null) => void
  /** Start the task in the given project; null degrades to the system folder
   * picker. The model/thinking choices made here ride `create_session`'s
   * defaults (ticket 41). */
  onStart: (project: string | null, text: string, images: ImageAttachment[], choice: NewTaskModelChoice) => void
  /** The dropdown's bottom "Open folder…" entry — the system folder picker. */
  onOpenFolder: () => Promise<string | null>
  /** Composer commands (slash built-ins still dispatch from the empty state). */
  composerApi: ComposerApi
}

/**
 * New-task empty state (ticket 17): greeting, project chip row above the
 * composer card and quick-start chip slots, matching ZCode's new-task screen.
 * ⌘N lands here — the system folder picker is no longer the entry path; the
 * chip preselects the project (see defaultProject) and the first send creates
 * the session in it, delivering the typed message via the pending chain.
 * Until the user picks a project from the dropdown the chip follows the
 * live-resolved default (the session index loads asynchronously at boot).
 *
 * Ticket 41: the composer chips are live here too — the model menu lists the
 * auth-probe catalog, the thinking menu offers all seven Pi levels, and the
 * chips show the chained default (preference → Pi fallback, tagged). Picks
 * made here override the chain and ride `create_session`'s defaults.
 */
export default function EmptyState({
  creating,
  defaultProject,
  recentProjects,
  providers,
  model,
  thinkingLevel,
  modelIsDefault,
  thinkingIsDefault,
  modelMenuHint,
  commandCatalog,
  onSelectedProjectChange,
  onStart,
  onOpenFolder,
  composerApi
}: EmptyStateProps): JSX.Element {
  // `VITE_PICODE_FAKE_HOUR` pins the greeting for deterministic screenshot QA.
  const pinnedHour = Number(import.meta.env.VITE_PICODE_FAKE_HOUR)
  const greeting = useMemo(
    () => greetingForHour(Number.isInteger(pinnedHour) ? pinnedHour : new Date().getHours()),
    [pinnedHour]
  )
  const idleChat = initialChatState()

  // Ticket 41: model/thinking picks made in the empty state. null = the chip
  // still follows the chained default; an explicit pick overrides it and
  // rides create_session's defaults (the pending-chain precedent, ticket 17).
  const [modelPick, setModelPick] = useState<{ providerId: string; modelId: string } | null>(null)
  const [thinkingPick, setThinkingPick] = useState<ThinkingLevel | null>(null)

  /** The displayed model: the explicit pick, else the chained default. The
   * thinking menu (and the chip's level) follow IT — the probe catalog
   * carries each model's supported levels, so unsupported levels never
   * show; unknown levels degrade to the full seven. */
  const shownModel: ModelRef | null =
    modelPick === null
      ? model
      : (findCatalogModel(providers, modelPick.providerId, modelPick.modelId) ?? {
          providerId: modelPick.providerId,
          modelId: modelPick.modelId,
          name: modelPick.modelId
        })
  const shownLevels = useMemo(() => resolveNewTaskThinkingLevels(providers, shownModel), [providers, shownModel])
  const shownLevel = useMemo(
    () => clampThinkingLevelToLevels(thinkingPick ?? thinkingLevel, shownLevels),
    [thinkingPick, thinkingLevel, shownLevels]
  )

  /** The empty state's composer slice: real catalog menu, chained chip
   * defaults, and the thinking menu filtered to the model's own levels. */
  const chat: ComposerChat = {
    ...idleChat,
    providers,
    model: shownModel,
    thinkingLevel: shownLevel,
    availableLevels: [...shownLevels],
    modelIsDefault: modelPick === null && modelIsDefault && model !== null,
    thinkingIsDefault: thinkingPick === null && thinkingIsDefault,
    modelMenuHint,
    // Ticket 52: the `/` menu lists the REAL prompt templates + skills for
    // the selected directory (no session-domain built-ins — the first
    // message parses them). Inserting a row only fills the composer; the
    // send path and SDK expansion are the in-session ones.
    slashCommands: projectCommandMenu(commandCatalog)
  }

  // Round-2 feedback (ticket 29): the empty state degrades with the main
  // zone instead of overflowing it. The quick-start chips hide (visibility
  // — no reflow jump) once they would run wider than the composer card,
  // and the greeting shrinks to stay on ONE line no wider than the composer
  // (ZCode behavior). One ResizeObserver drives both off the card's width.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const greetingRef = useRef<HTMLHeadingElement | null>(null)
  const chipsRef = useRef<HTMLDivElement | null>(null)
  const [chipsVisible, setChipsVisible] = useState(true)
  const [greetingFont, setGreetingFont] = useState<number | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const GREETING_BASE_PX = 33
    const measure = (): void => {
      const composer = root.querySelector('.composer')
      if (!(composer instanceof HTMLElement)) return
      const target = composer.clientWidth
      const greeting = greetingRef.current
      if (greeting !== null && target > 0) {
        // Measure on an OFF-SCREEN CLONE — the live node is React-owned:
        // direct style writes fight the reconciler (a skipped commit leaves
        // them stranded on the DOM, state and element disagreeing). The fit
        // is verified on the clone (font scaling is sub-linear), stepping
        // down until the line is within the target.
        const probe = greeting.cloneNode(true) as HTMLElement
        probe.style.position = 'absolute'
        probe.style.visibility = 'hidden'
        root.appendChild(probe)
        let size = GREETING_BASE_PX
        const widthAt = (px: number): number => {
          probe.style.fontSize = `${px}px`
          return probe.getBoundingClientRect().width
        }
        if (widthAt(size) > target) {
          size = Math.max(13, Math.ceil((size * (target - 2)) / widthAt(size)))
          while (size > 13 && widthAt(size) > target) size -= 1
        }
        probe.remove()
        // Base size fits as-is → null (React leaves the CSS default).
        setGreetingFont(size === GREETING_BASE_PX ? null : size)
      }
      const chips = chipsRef.current
      if (chips !== null) setChipsVisible(chips.scrollWidth <= target + 1)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    measure()
    return () => observer.disconnect()
  }, [greeting])

  /** undefined = follow the live default; otherwise the user's explicit pick. */
  const [override, setOverride] = useState<string | undefined>(undefined)
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const chipbarRef = useRef<HTMLDivElement>(null)

  const selected = override ?? defaultProject
  // Ticket 52: the effective selection drives the command catalog — report
  // every change (mount included) so main can probe the directory (debounced,
  // cached) and push the menu rows back down.
  useEffect(() => {
    onSelectedProjectChange(selected)
  }, [selected, onSelectedProjectChange])
  // The current choice is always visible and check-marked in the list — even
  // when it is only the last-used directory and not among the recents.
  const dropdownWorkspaces = useMemo(() => {
    if (selected === null || recentProjects.includes(selected)) return recentProjects
    return [selected, ...recentProjects]
  }, [selected, recentProjects])
  const filtered = useMemo(() => filterWorkspaces(dropdownWorkspaces, query), [dropdownWorkspaces, query])

  // Click outside closes the dropdown.
  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: MouseEvent): void {
      if (chipbarRef.current && event.target instanceof Node && !chipbarRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  async function pickFolder(): Promise<void> {
    const picked = await onOpenFolder()
    if (!picked) return
    setOverride(picked)
    setMenuOpen(false)
  }

  return (
    <div className="empty-state" ref={rootRef}>
      <WatermarkPi />
      <h1
        className="empty-greeting"
        ref={greetingRef}
        style={greetingFont !== null ? { fontSize: `${greetingFont}px` } : undefined}
      >
        {greeting}
      </h1>

      <div className="newtask-card">
        <div className="newtask-chipbar" ref={chipbarRef}>
          <button
            type="button"
            className="newtask-chip"
            title={selected ?? undefined}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <FolderIcon size={14} />
            <span>{selected ? projectLabel(selected) : 'Choose a project'}</span>
            <ChevronDownIcon size={12} className="cmp-caret" />
          </button>

          {menuOpen && (
            <div className="newtask-pop" role="listbox" aria-label="Recent workspaces">
              <div className="newtask-search">
                <SearchIcon size={14} />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search workspaces"
                  aria-label="Search workspaces"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setMenuOpen(false)
                    }
                  }}
                />
              </div>
              <div className="newtask-list">
                {filtered.map((cwd) => (
                  <button
                    key={cwd}
                    type="button"
                    role="option"
                    aria-selected={cwd === selected}
                    className={cwd === selected ? 'newtask-row newtask-row-current' : 'newtask-row'}
                    onClick={() => {
                      setOverride(cwd)
                      setMenuOpen(false)
                    }}
                  >
                    <FolderIcon size={14} />
                    <span className="newtask-row-label">{projectLabel(cwd)}</span>
                    {cwd === selected && <CheckIcon size={14} className="newtask-row-check" />}
                  </button>
                ))}
                {filtered.length === 0 && <div className="newtask-search-empty">No matching workspaces</div>}
              </div>
              <div className="newtask-pop-footer">
                <button type="button" className="newtask-row newtask-openfolder" onClick={() => void pickFolder()}>
                  <ProjectsFolderIcon size={14} />
                  <span className="newtask-row-label">Open folder…</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <Composer
          busy={false}
          disabled={creating}
          placeholder={creating ? 'Starting session…' : 'Ask anything — @ to add context, / for commands'}
          chat={chat}
          queue={idleChat.queue}
          {...composerApi}
          onSetModel={(providerId, modelId) => setModelPick({ providerId, modelId })}
          onSetThinkingLevel={(level) => setThinkingPick(level)}
          onSend={(text, images) =>
            onStart(selected, text, images, { model: modelPick, thinkingLevel: thinkingPick })
          }
        />
      </div>

      <div
        className="quick-chips"
        ref={chipsRef}
        role="list"
        aria-label="Quick starts"
        style={{ visibility: chipsVisible ? 'visible' : 'hidden' }}
      >
        {QUICK_START_CHIPS.map(({ label, icon: Icon }) => (
          <button key={label} type="button" className="quick-chip" role="listitem">
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
