import { useEffect, useRef, useState, type JSX } from 'react'
import type { ChatState } from '../../../shared/chat-reducer'
import type { SessionTreePayload } from '../../../shared/sessions/types'
import Composer from './Composer'
import TreePanel from './TreePanel'
import { ChevronDownIcon, PencilIcon } from './icons'

interface ChatViewProps {
  chat: ChatState
  creating: boolean
  /** Latest tree payload from the host (null until the first one arrives). */
  tree: SessionTreePayload | null
  treeOpen: boolean
  onToggleTree: () => void
  onRename: (name: string) => void
  onNavigateTree: (entryId: string) => void
  onFork: (entryId: string) => void
  onCloseTree: () => void
  onSend: (text: string) => void
  onStop: () => void
}

/**
 * Live transcript over the bottom-docked composer (screenshot 01). All chat
 * state comes from the Seam-1 contract via the chat reducer; this component
 * only renders and issues commands. The slim topbar carries the session
 * title (double-click to rename) and the branch-history dropdown (screenshot
 * 01 shows the same title + caret pattern at the top of the main zone).
 */
export default function ChatView({
  chat,
  creating,
  tree,
  treeOpen,
  onToggleTree,
  onRename,
  onNavigateTree,
  onFork,
  onCloseTree,
  onSend,
  onStop
}: ChatViewProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastLength = useRef(0)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')

  // Keep the newest content in view while streaming.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const grew = chat.messages.length !== lastLength.current
    lastLength.current = chat.messages.length
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (grew || nearBottom) el.scrollTop = el.scrollHeight
  }, [chat.messages])

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
        <button
          type="button"
          className="chat-topbar-btn"
          aria-label="Rename task"
          title="Rename (double-click title also works)"
          onClick={startRename}
        >
          <PencilIcon size={13} />
        </button>
        <button type="button" className={treeOpen ? 'chat-topbar-btn chat-topbar-btn-open' : 'chat-topbar-btn'} onClick={onToggleTree}>
          History
          <ChevronDownIcon size={13} />
        </button>
        {treeOpen && <TreePanel tree={tree} onNavigate={onNavigateTree} onFork={onFork} onClose={onCloseTree} />}
      </div>
      <div ref={scrollRef} className="chat-scroll">
        <div className="chat-thread">
          {chat.messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="msg msg-user">
                {message.text}
              </div>
            ) : (
              <div key={message.id} className="msg msg-assistant">
                {message.text}
                {message.streaming && <span className="msg-caret" aria-hidden="true" />}
              </div>
            )
          )}
        </div>
      </div>
      <div className="chat-dock">
        <Composer
          busy={chat.agentRunning}
          disabled={creating || noSession}
          placeholder={
            noSession
              ? 'Session ended — rebuild or choose another folder to continue'
              : chat.agentRunning
                ? 'The agent is working…'
                : 'Ask anything — @ to add context, / for commands'
          }
          onSend={onSend}
          onStop={onStop}
        />
      </div>
    </div>
  )
}
