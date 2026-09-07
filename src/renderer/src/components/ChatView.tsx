import { Fragment, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { ChatState } from '../../../shared/chat-reducer'
import { groupTurns } from '../../../shared/turn-collapse'
import type { SessionTreePayload } from '../../../shared/sessions/types'
import Composer, { type ComposerApi } from './Composer'
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
  const lastLength = useRef(0)
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

  // Keep the newest content in view while streaming (and when a fold toggle
  // changes the transcript height while the reader sits at the bottom).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const grew = chat.entries.length !== lastLength.current
    lastLength.current = chat.entries.length
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (grew || nearBottom) el.scrollTop = el.scrollHeight
  }, [chat.entries, chat.expandedTurns])

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
      <div ref={scrollRef} className="chat-scroll">
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
                  assistant entries. */
                <div className="msg-user-block">
                  <div className="msg msg-user">{turn.userText}</div>
                  <MessageActions text={turn.userText} showTime={false} />
                </div>
              )}
              {(turn.hasWork || turn.live) && (
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
              {turn.answer.length > 0 && <AnswerBlock turn={turn} onFork={onFork} />}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="chat-dock">
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
          {...composerApi}
        />
      </div>
    </div>
  )
}

/** Window event the App dispatches for the `/name` builtin. */
export const RENAME_EVENT = 'picode:rename-session'
