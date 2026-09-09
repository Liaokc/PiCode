import { type JSX } from 'react'
import type { TurnGroup, TurnWorkItem } from '../../../shared/turn-collapse'
import { useElapsedSeconds } from './use-elapsed-seconds'
import { ChevronDownIcon, ChevronRightIcon, LoaderIcon, WandIcon } from './icons'
import ApprovalPill from './ApprovalPill'
import NarrationRow from './NarrationRow'
import ThinkingRow from './ThinkingRow'
import ToolCard from './ToolCard'

interface TurnWorkRowsProps {
  /** The items in transcript order — the container's fold body or the
   * after-answer segment (ticket 53). */
  items: readonly TurnWorkItem[]
  /** Deep-link a file-arg tool call into the Preview tab (ticket 07). */
  onOpenFile?: (path: string) => void
  /** Deep-link a bash tool call into the Bridge panel (ticket 18 feedback). */
  onShowInBridge?: (toolCallId: string) => void
  /** Approval-gate handlers — LIVE-PATH ONLY. Surfaces without a gate
   * (Live Follow, ticket 24) omit them; approval entries never occur there
   * (the structured payload carries none), so the pill simply doesn't render. */
  onApprove?: (toolCallId: string, remember: boolean) => void
  onDeny?: (toolCallId: string, reason: string) => void
}

/**
 * The work rows of a turn in transcript order — thinking, interim narration,
 * tool cards, approval pills. Shared by the fold container body and the
 * always-visible after-answer segment (ticket 53) so both render the same
 * row shapes with the same handlers.
 */
export function TurnWorkRows({ items, onOpenFile, onShowInBridge, onApprove, onDeny }: TurnWorkRowsProps): JSX.Element {
  return (
    <>
      {items.map((item) => {
        switch (item.kind) {
          case 'thinking':
            return <ThinkingRow key={item.key} part={item.part} />
          case 'narration':
            return <NarrationRow key={item.key} text={item.text} />
          case 'tool':
            return <ToolCard key={item.key} entry={item.entry} onOpenFile={onOpenFile} onShowInBridge={onShowInBridge} />
          case 'approval':
            // Gate-less surfaces (follow) never carry approval entries;
            // without handlers there is nothing to render.
            if (onApprove === undefined || onDeny === undefined) return null
            return <ApprovalPill key={item.key} entry={item.entry} onApprove={onApprove} onDeny={onDeny} />
        }
      })}
    </>
  )
}

interface TurnContainerProps {
  turn: TurnGroup
  /** Rendered open (live auto-expand, manual open, errored or pending-gate). */
  open: boolean
  onToggle: () => void
  /** Deep-link a file-arg tool call into the Preview tab (ticket 07). */
  onOpenFile?: (path: string) => void
  /** Deep-link a bash tool call into the Bridge panel (ticket 18 feedback). */
  onShowInBridge?: (toolCallId: string) => void
  /** Approval-gate handlers — LIVE-PATH ONLY. Surfaces without a gate
   * (Live Follow, ticket 24) omit them; approval entries never occur there
   * (the structured payload carries none), so the pill simply doesn't render. */
  onApprove?: (toolCallId: string, remember: boolean) => void
  onDeny?: (toolCallId: string, reason: string) => void
}

/**
 * The per-turn fold container (ticket 23, ZCode evidence
 * `z-turn-collapse-expanded.png` / collapsed `已工作 24 秒 ›`): one
 * "Working · Ns" row per turn; opening it reveals that turn's skill marker,
 * thinking rows, interim narration (ticket 53) and tool cards. The answer —
 * the turn's LAST text block (ticket 53) — renders outside; tools that ran
 * after the answer render below it, outside the fold too.
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
  onShowInBridge,
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
          <TurnWorkRows
            items={turn.work}
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
