import { type JSX } from 'react'
import type { TurnGroup } from '../../../shared/turn-collapse'
import { useElapsedSeconds } from './use-elapsed-seconds'
import { ChevronDownIcon, ChevronRightIcon, LoaderIcon, WandIcon } from './icons'
import ApprovalPill from './ApprovalPill'
import ThinkingRow from './ThinkingRow'
import ToolCard from './ToolCard'

interface TurnContainerProps {
  turn: TurnGroup
  /** Rendered open (live auto-expand, manual open, errored or pending-gate). */
  open: boolean
  onToggle: () => void
  /** Deep-link a file-arg tool call into the Preview tab (ticket 07). */
  onOpenFile?: (path: string) => void
  onApprove: (toolCallId: string, remember: boolean) => void
  onDeny: (toolCallId: string, reason: string) => void
}

/**
 * The per-turn fold container (ticket 23, ZCode evidence
 * `z-turn-collapse-expanded.png` / collapsed `已工作 24 秒 ›`): one
 * "Working · Ns" row per turn; opening it reveals that turn's skill marker,
 * thinking rows and tool cards. The answer text renders outside — the
 * settled transcript shows only messages and answers.
 *
 * The header ticks seconds only for turns that actually streamed in this
 * view: replayed turns carry no recorded duration and degrade to a plain
 * row (same rule as replayed thinking rows, ticket 14).
 */
export default function TurnContainer({
  turn,
  open,
  onToggle,
  onOpenFile,
  onApprove,
  onDeny
}: TurnContainerProps): JSX.Element {
  const seconds = useElapsedSeconds(turn.live)
  // Turns that streamed in this view keep their ticked duration frozen after
  // settling (the hook retains its count once inactive); replayed turns never
  // tick and degrade to a duration-less row (same rule as replayed thinking,
  // ticket 14 — the session file records no turn duration).
  const timed = turn.live || seconds > 0

  return (
    <div className={`turn-container${open ? ' turn-container-open' : ''}`}>
      <button
        type="button"
        className="turn-container-header"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? 'Hide this turn\u2019s work' : 'Show this turn\u2019s work'}
      >
        {turn.live && <LoaderIcon size={13} className="turn-container-icon spin" />}
        <span className="turn-container-label">{turn.live ? 'Working' : 'Worked'}</span>
        {timed && (
          <>
            <span className="turn-container-sep">·</span>
            <span className="turn-container-duration">{Math.max(seconds, 1)}s</span>
          </>
        )}
        {open ? (
          <ChevronDownIcon size={13} className="turn-container-chevron" />
        ) : (
          <ChevronRightIcon size={13} className="turn-container-chevron" />
        )}
      </button>
      {open && (
        <div className="turn-container-body">
          {turn.skillName !== null && (
            <div className="skill-marker-row">
              <WandIcon size={13} className="skill-marker-icon" />
              <span className="skill-marker-label">Skill</span>
              <span className="skill-marker-name">{turn.skillName}</span>
            </div>
          )}
          {turn.work.map((item) => {
            switch (item.kind) {
              case 'thinking':
                return <ThinkingRow key={item.key} part={item.part} />
              case 'tool':
                return <ToolCard key={item.key} entry={item.entry} onOpenFile={onOpenFile} />
              case 'approval':
                return <ApprovalPill key={item.key} entry={item.entry} onApprove={onApprove} onDeny={onDeny} />
            }
          })}
        </div>
      )}
    </div>
  )
}
