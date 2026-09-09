import type { JSX } from 'react'
import type { TurnGroup } from '../../../shared/turn-collapse'
import Markdown from './Markdown'
import MessageActions from './MessageActions'
import { TurnWorkRows } from './TurnContainer'

interface AnswerBlockProps {
  turn: TurnGroup
  /** Fork affordance (ticket 16) — offered only when provided. The Live
   * Follow view omits it: forking runs through the ACTIVE session's host,
   * which a read-only follow has none of. The anchor is the ANSWER's entry —
   * the turn's last text-bearing entry (ticket 53 kept the semantics). */
  onFork?: (entryId: string) => void
  /** Deep-link handlers for the after-answer tool cards (ticket 53) — the
   * same surfaces the container rows get; gate-less surfaces omit them. */
  onOpenFile?: (path: string) => void
  onShowInBridge?: (toolCallId: string) => void
  onApprove?: (toolCallId: string, remember: boolean) => void
  onDeny?: (toolCallId: string, reason: string) => void
}

/**
 * The turn's answer (ticket 53): exactly the turn's LAST text block — the
 * text that stays visible around the fold; streamed live, action row when
 * settled. Tools that ran AFTER the answer render below it, always visible,
 * in transcript order (ZCode rule, Q11a). Earlier text is interim narration
 * inside the fold container, never here.
 *
 * Shared by the live ChatView and the Live Follow view (ticket 24) so both
 * render the same answer shape — true three-surface sharing (chat / replay /
 * follow) happens at the turn-architecture level (groupTurns + TurnContainer
 * + AnswerBlock), not at the whole-entry level.
 */
export default function AnswerBlock({
  turn,
  onFork,
  onOpenFile,
  onShowInBridge,
  onApprove,
  onDeny
}: AnswerBlockProps): JSX.Element {
  const answer = turn.answer
  return (
    <div className="msg msg-assistant">
      {answer !== null && <Markdown key={answer.key} text={answer.text} streaming={answer.streaming} />}
      {!turn.live && answer !== null && answer.text.trim() !== '' && (
        <MessageActions text={answer.text} entryId={answer.entryId} onFork={onFork} />
      )}
      {turn.afterAnswer.length > 0 && (
        <div className="turn-after-answer">
          <TurnWorkRows
            items={turn.afterAnswer}
            onOpenFile={onOpenFile}
            onShowInBridge={onShowInBridge}
            onApprove={onApprove}
            onDeny={onDeny}
          />
        </div>
      )}
    </div>
  )
}
