import { Fragment, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { ChatEntry, ChatState } from '../../../shared/chat-reducer'
import { isNearBottom, shouldAutoScroll } from '../../../shared/scroll-stay'
import { groupTurns } from '../../../shared/turn-collapse'
import type { SessionTreePayload } from '../../../shared/sessions/types'
import Composer, { type ComposerApi } from './Composer'
import NavigatorRail from './NavigatorRail'
import TreePanel from './TreePanel'
import TurnContainer from './TurnContainer'
import AnswerBlock from './AnswerBlock'
import MessageActions from './MessageActions'
import Tooltip from './Tooltip'
import { ChevronDownIcon, GitBranchIcon, PencilIcon } from './icons'

interface ChatViewProps {
  chat: ChatState
  creating: boolean
  /** Latest tree payload from the host (null until the first one arrives). */
  tree: SessionTreePayload | null
  /** Read-only git branch of the focused session's workspace (ticket 21);
   * null (non-git workspace / not yet read) hides the badge entirely. */
  branch: string | null
  treeOpen: boolean
  onToggleTree: () => void
  onRename: (name: string) => void
  onNavigateTree: (entryId: string) => void
  onFork: (entryId: string) => void
  onCloseTree: () => void
  /** Deep-link a file-arg tool call into the Preview tab (ticket 07). */
  onOpenFile?: (path: string) => void
  /** Deep-link a bash tool call into the Bridge panel (ticket 18 feedback). */
  onShowInBridge?: (toolCallId: string) => void
  /** Fold/unfold one turn's work container (ticket 23). */
  onToggleTurn: (turnId: string) => void
  /** Composer commands + the chat slices the composer menus render. */
  composerApi: ComposerApi
  onApprove: (toolCallId: string, remember: boolean) => void
  onDeny: (toolCallId: string, reason: string) => void
}

/**
 * Live transcript over the bottom-docked composer (screenshot 01). All chat
 * state comes from the Seam-1 contract via the chat reducer; this component
 * only renders and issues commands. The slim topbar carries the session
 * title (double-click to rename), the read-only git branch badge (ticket 21,
 * hidden for non-git workspaces) and the branch-history dropdown (screenshot
 * 01 shows the same title + caret pattern at the top of the main zone).
 */
export default function ChatView({
  chat,
  creating,
  tree,
  branch,
  treeOpen,
  onToggleTree,
  onRename,
  onNavigateTree,
  onFork,
  onCloseTree,
  onOpenFile,
  onShowInBridge,
  onToggleTurn,
  composerApi,
  onApprove,
  onDeny
}: ChatViewProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Ticket 45 scroll-stay bookkeeping: growth detection by reference (every
  // reducer rewrite of entries/expandedTurns), the focused session's id, and
  // the two pin latches — send (one decision pass) and jump travel (until
  // the bottom is reached or the user's own scroll takes over).
  const lastEntries = useRef<ChatEntry[] | null>(null)
  const lastTurns = useRef<ReadonlySet<string> | null>(null)
  const lastSessionId = useRef<string | null>(null)
  const arrivalPending = useRef(true)
  const sendPin = useRef(false)
  const returning = useRef(false)
  const lastScrollTop = useRef(0)
  const [jumpVisible, setJumpVisible] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  /** Ticket 23: the flat transcript grouped into per-turn fold containers. */
  const turns = useMemo(() => groupTurns(chat.entries, chat.agentRunning), [chat.entries, chat.agentRunning])

  // Builtin `/name` requests focus the rename editor (window event from App).
  useEffect(() => {
    function focusRename(): void {
      setDraft(tree?.name ?? '')
      setRenaming(true)
    }
    window.addEventListener(RENAME_EVENT, focusRename)
    return () => window.removeEventListener(RENAME_EVENT, focusRename)
  }, [tree?.name])

  // Ticket 45: the stick decision is the Seam-1 pure function
  // shouldAutoScroll — the viewport pins to the bottom only while the reader
  // is already near it or their own agency asks for it (send / jump click).
  // Growth alone NEVER yanks a reader who scrolled away (Q12 behavior
  // change). A freshly focused transcript has no reading position to
  // preserve, so arrival pins the bottom until the content has landed
  // (a resumed session arrives over two passes: session_created empties the
  // transcript, history_loaded replays it).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const sessionId = chat.session?.sessionId ?? null
    if (sessionId !== lastSessionId.current) {
      lastSessionId.current = sessionId
      arrivalPending.current = true
      lastEntries.current = null
      lastTurns.current = null
    }
    const grew = chat.entries !== lastEntries.current || chat.expandedTurns !== lastTurns.current
    lastEntries.current = chat.entries
    lastTurns.current = chat.expandedTurns
    const selfSent = sendPin.current || returning.current
    sendPin.current = false
    if (arrivalPending.current) {
      el.scrollTop = el.scrollHeight
      setJumpVisible(false)
      if (chat.entries.length > 0) arrivalPending.current = false
      return
    }
    const nearBottom = isNearBottom(el)
    if (shouldAutoScroll({ nearBottom }, { grew }, selfSent)) {
      el.scrollTop = el.scrollHeight
    }
    setJumpVisible(!isNearBottom(el))
  }, [chat.entries, chat.expandedTurns, chat.session])

  // Ticket 45: track the reader's position for the Jump-to-Latest button,
  // and end the jump travel when it arrives — or when the user scrolls
  // upward mid-travel (their wheel took over; the pin must not survive it
  // and yank them back on the next growth pass).
  function handleScroll(): void {
    const el = scrollRef.current
    if (!el) return
    const top = el.scrollTop
    if (returning.current && (isNearBottom(el) || top < lastScrollTop.current - 1)) {
      returning.current = false
    }
    lastScrollTop.current = top
    setJumpVisible(!isNearBottom(el))
  }

  // Ticket 45 (CONTEXT.md: 回底钮): smooth travel back to the newest
  // content. The travel pin keeps the bottom pinned through growth that
  // lands mid-travel, so the click restores stickiness.
  function jumpToLatest(): void {
    const el = scrollRef.current
    if (!el) return
    returning.current = true
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' })
  }

  // Ticket 45: the user's own send (send, steer, follow-up) asks for the
  // bottom — the stick decision honors it on the pass that lands the
  // message (spec: 自发送置底).
  const withPin = (send: ComposerApi['onSend']): ComposerApi['onSend'] => (text, images) => {
    sendPin.current = true
    send(text, images)
  }
  const pinnedComposerApi = useMemo<ComposerApi>(
    () => ({
      ...composerApi,
      onSend: withPin(composerApi.onSend),
      onSteer: withPin(composerApi.onSteer),
      onFollowUp: withPin(composerApi.onFollowUp)
    }),
    [composerApi]
  )

  function startRename(): void {
    setDraft(tree?.name ?? '')
    setRenaming(true)
  }

  function commitRename(): void {
    setRenaming(false)
    const name = draft.trim()
    if (name !== '' && name !== tree?.name) onRename(name)
  }

  const title = tree?.name ?? chat.session?.cwd.split('/').pop() ?? 'Session'
  const noSession = chat.session === null

  return (
    <div className="chat-view">
      <div className="chat-topbar">
        {renaming ? (
          <input
            className="chat-title-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setRenaming(false)
            }}
            autoFocus
          />
        ) : (
          <span className="chat-topbar-title" title={chat.session?.cwd ?? title} onDoubleClick={startRename}>
            {title}
          </span>
        )}
        {branch !== null && (
          // Data reveal (CONTEXT.md tooltip rule): the full branch name rides
          // a native title — never the shortcut/description Tooltip.
          <span className="chat-topbar-branch" title={branch}>
            <GitBranchIcon size={11} />
            <span className="chat-topbar-branch-name">{branch}</span>
          </span>
        )}
        <Tooltip label="Rename">
          <button
            type="button"
            className="chat-topbar-btn"
            aria-label="Rename task"
            onClick={startRename}
          >
            <PencilIcon size={13} />
          </button>
        </Tooltip>
        <button type="button" className={treeOpen ? 'chat-topbar-btn chat-topbar-btn-open' : 'chat-topbar-btn'} onClick={onToggleTree}>
          History
          <ChevronDownIcon size={13} />
        </button>
        {treeOpen && <TreePanel tree={tree} onNavigate={onNavigateTree} onFork={onFork} onClose={onCloseTree} />}
      </div>
      <div className="chat-body">
        <div ref={scrollRef} className="chat-scroll" onScroll={handleScroll}>
          <div className="chat-thread">
            {chat.entries.length === 0 && !chat.agentRunning && (
              <div className="chat-empty-hint">No messages yet — describe what you need below.</div>
            )}
            {turns.map((turn) => (
              <Fragment key={turn.id}>
                {turn.user !== null && (
                  /* Ticket 44: the bubble and its persistent action row travel
                    as one right-aligned block. Copy carries the bubble's text —
                    the raw message as sent (the display text already strips the
                    injected skill prologue); no Fork — that anchor lives on
                    assistant entries. `data-turn-id` is the navigator rail's
                    scroll/anchor hook (ticket 46). */
                  <div className="msg-user-block" data-turn-id={turn.id}>
                    <div className="msg msg-user">{turn.userText}</div>
                    <MessageActions text={turn.userText} showTime={false} />
                  </div>
                )}
                {turn.hasContainer && (
                  /* Ticket 55: the container row is unconditional for turns
                    with a user bubble (operator-approved ZCode deviation —
                    the old `(hasWork || turn.live)` empty-shell condition is
                    gone); the head segment's status quo lives in the model
                    too. Zero-work turns render a bare, non-expandable row. */
                  <TurnContainer
                    turn={turn}
                    open={chat.expandedTurns.has(turn.id) || turn.pendingApproval}
                    onToggle={() => onToggleTurn(turn.id)}
                    onOpenFile={onOpenFile}
                    onShowInBridge={onShowInBridge}
                    onApprove={onApprove}
                    onDeny={onDeny}
                  />
                )}
                {turn.answer !== null && (
                  <AnswerBlock
                    turn={turn}
                    onFork={onFork}
                    onOpenFile={onOpenFile}
                    onShowInBridge={onShowInBridge}
                    onApprove={onApprove}
                    onDeny={onDeny}
                  />
                )}
              </Fragment>
            ))}
          </div>
        </div>
        {/* Ticket 46: the turn navigator rides the transcript's left edge.
            It owns its hover/anchor state — transcript scroll/hover/click
            never re-render the chat. */}
        <NavigatorRail turns={turns} scrollRef={scrollRef} />
      </div>
      <div className="chat-dock">
        <Tooltip label="Jump to latest">
          <button
            type="button"
            className={jumpVisible ? 'chat-jump-btn chat-jump-btn-visible' : 'chat-jump-btn'}
            aria-label="Jump to latest"
            onClick={jumpToLatest}
          >
            <ChevronDownIcon size={14} />
          </button>
        </Tooltip>
        <Composer
          busy={chat.agentRunning}
          disabled={creating || noSession}
          placeholder={
            noSession
              ? 'Session ended — rebuild or choose another folder to continue'
              : 'Ask anything — @ to add context, / for commands'
          }
          chat={chat}
          queue={chat.queue}
          {...pinnedComposerApi}
        />
      </div>
    </div>
  )
}

/** Window event the App dispatches for the `/name` builtin. */
export const RENAME_EVENT = 'picode:rename-session'
