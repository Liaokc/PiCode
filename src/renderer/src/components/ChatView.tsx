import { useEffect, useRef, type JSX } from 'react'
import type { ChatState } from '../../../shared/chat-reducer'
import Composer from './Composer'

interface ChatViewProps {
  chat: ChatState
  creating: boolean
  onSend: (text: string) => void
  onStop: () => void
}

/**
 * Live transcript over the bottom-docked composer (screenshot 01). All state
 * comes from the Seam-1 contract via the chat reducer; this component only
 * renders and issues commands.
 */
export default function ChatView({ chat, creating, onSend, onStop }: ChatViewProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastLength = useRef(0)

  // Keep the newest content in view while streaming.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const grew = chat.messages.length !== lastLength.current
    lastLength.current = chat.messages.length
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160
    if (grew || nearBottom) el.scrollTop = el.scrollHeight
  }, [chat.messages])

  const noSession = chat.session === null

  return (
    <div className="chat-view">
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
