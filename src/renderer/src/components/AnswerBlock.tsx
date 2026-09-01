import type { JSX } from 'react'
import type { TurnGroup } from '../../../shared/turn-collapse'
import Markdown from './Markdown'
import MessageActions from './MessageActions'

interface AnswerBlockProps {
  turn: TurnGroup
  /** Fork affordance (ticket 16) — offered only when provided. The Live
   * Follow view omits it: forking runs through the ACTIVE session's host,
   * which a read-only follow has none of. */
  onFork?: (entryId: string) => void
}

/**
 * The turn's answer: assistant text parts, streamed live, action row when
 * settled (ticket 23 — the text that stays visible around the fold). The
 * fork anchor (ticket 16) is the turn's LAST text-bearing entry: forking
 * there keeps every entry of the answer's turn on the branched path.
 *
 * Shared by the live ChatView and the Live Follow view (ticket 24) so both
 * render the same answer shape — true three-surface sharing (chat / replay /
 * follow) happens at the turn-architecture level (groupTurns + TurnContainer
 * + AnswerBlock), not at the whole-entry level.
 */
export default function AnswerBlock({ turn, onFork }: AnswerBlockProps): JSX.Element {
  const fullText = turn.answer.map((p) => p.text).join('\n\n')
  const forkAnchor = turn.answer[turn.answer.length - 1]?.entryId

  return (
    <div className="msg msg-assistant">
      {turn.answer.map((part) => (
        <Markdown key={part.key} text={part.text} streaming={part.streaming} />
      ))}
      {!turn.live && fullText.trim() !== '' && (
        <MessageActions text={fullText} entryId={forkAnchor} onFork={onFork} />
      )}
    </div>
  )
}
