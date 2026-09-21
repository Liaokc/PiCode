import { memo, useRef, type JSX, type RefObject } from 'react'
import type { TurnGroup, TurnWorkItem } from '../../../shared/turn-collapse'
import { useElapsedSeconds } from './use-elapsed-seconds'
import { useFoldAnchor } from './use-fold-anchor'
import { ChevronDownIcon, ChevronRightIcon, LoaderIcon } from './icons'
import ApprovalPill from './ApprovalPill'
import Markdown from './Markdown'
import NarrationRow from './NarrationRow'
import ThinkingRow from './ThinkingRow'
import ToolCard from './ToolCard'

/**
 * One inline text block of the live chronological stream (ticket 82): the
 * same markdown the settled answer renders, at the position where it
 * streamed inside the expanded container — never promoted, never demoted.
 * Memoized so settled stream blocks never re-parse on streaming deltas (the
 * R15 red line: the streaming path must not gain render work — only the
 * still-streaming tail re-parses, exactly like the pre-82 answer did).
 */
const StreamTextRow = memo(function StreamTextRow({ text, streaming }: { text: string; streaming: boolean }): JSX.Element {
  return (
    <div className="msg turn-stream-text">
      <Markdown text={text} streaming={streaming} />
    </div>
  )
})

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
 * The work rows of a turn in transcript order — thinking, inline stream
 * text (live, ticket 82), interim narration (settled), tool cards, approval
 * pills. Shared by the fold container body — which is the WHOLE turn's
 * chronological single stream while live (ticket 82) — and the settled
 * after-answer segment (ticket 56), so both render the same row shapes with
 * the same handlers. Post-answer thinking renders as the same collapsed
 * ThinkingRow the fold uses; a pending pill in the settled segment shows the
 * same controls a fold pill always had.
 */
export function TurnWorkRows({ items, onOpenFile, onShowInBridge, onApprove, onDeny }: TurnWorkRowsProps): JSX.Element {
  return (
    <>
      {items.map((item) => {
        switch (item.kind) {
          case 'thinking':
            return <ThinkingRow key={item.key} part={item.part} />
          case 'text':
            return <StreamTextRow key={item.key} text={item.text} streaming={item.streaming} />
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
  /** Ticket 94: the transcript scroll container this render lives in —
   * every view (ChatView, FollowView) passes its scroller so the fold-anchor
   * hook can hold the deterministic rule across folds: the header row stays
   * put off the bottom, the bottom stays pinned (fold-anchor.ts). The rule
   * is core to the container now — renders without a scroller have no
   * anchor to honor and don't exist. */
  scrollRef: RefObject<HTMLDivElement | null>
}

/**
 * The per-turn Worked container (ticket 23, ZCode evidence
 * `z-turn-collapse-expanded.png` / collapsed `已工作 24 秒 ›`; permanence
 * revised by ticket 55, live semantics by ticket 82): one "Working · Ns" row
 * per turn. While the turn streams, the opened body IS the turn's whole
 * chronological single stream — thinking rows, inline text blocks (full
 * markdown, ticket 82), tool cards, approval pills, in transcript order;
 * nothing is promoted below the container and nothing re-splits while
 * streaming. At settle the container folds and the ticket-53/56 composition
 * appears: the last text block lifts below as the answer, earlier text stays
 * inside as narration, post-answer rows join the always-visible segment.
 *
 * Ticket 55: EVERY turn with a user bubble owns this row — live
 * "Working · Ns" from the silent period (before the first work item) on,
 * settled "Worked · Ns"; the row never disappears. A zero-work turn's body
 * is empty, so the row is bare and INERT: no chevron, click no-op,
 * aria-disabled — expandable ⇔ body non-empty (Q12 ruling A).
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
  onDeny,
  scrollRef
}: TurnContainerProps): JSX.Element {
  const seconds = useElapsedSeconds(turn.live)
  // Ticket 94: the header element is the fold anchor — its viewport row is
  // what the deterministic rule holds still across open flips.
  const headerRef = useRef<HTMLButtonElement | null>(null)
  // Turns that streamed in this view keep their ticked duration frozen after
  // settling (the hook retains its count once inactive); replayed turns never
  // tick and degrade to a duration-less row (same rule as replayed thinking,
  // ticket 14 — the session file records no turn duration).
  const timed = turn.live || seconds > 0
  // Ticket 55: 可展开 ⇔ 体非空. The container itself is mounted across folds
  // (only the body unmounts), so the header timer survives folding and
  // reopening without resetting.
  const expandable = turn.hasWork
  // Ticket 94: every open flip of THIS container obeys the shared
  // deterministic anchor rule (pure model in shared/fold-anchor.ts) — the
  // same law for the click toggles, the settle auto-fold and the
  // pending-approval force-open, in every view that passes its scroller.
  // The click capture runs FIRST in the header's onClick: it reads the
  // viewport the user saw at click time (synchronous — no scroll event has
  // to have delivered yet).
  const captureFoldAnchor = useFoldAnchor(scrollRef, headerRef, expandable && open)

  return (
    <div className={`turn-container${expandable && open ? ' turn-container-open' : ''}`}>
      <button
        ref={headerRef}
        type="button"
        className="turn-container-header"
        onClick={expandable ? () => { captureFoldAnchor(); onToggle() } : undefined}
        aria-disabled={expandable ? undefined : true}
        aria-expanded={expandable ? open : undefined}
        aria-label={
          expandable ? (open ? 'Hide this turn\u2019s work' : 'Show this turn\u2019s work') : undefined
        }
      >
        {/* Ticket 103: the live spinner is a status signal, not faint chrome
            — larger diameter (13 → 16) and the brand accent (was --text-faint);
            position unchanged, collapsed keeps this single header ring. */}
        {turn.live && <LoaderIcon size={16} className="turn-container-icon spin" />}
        <span className="turn-container-label">{turn.live ? 'Working' : 'Worked'}</span>
        {timed && (
          <>
            <span className="turn-container-sep">·</span>
            <span className="turn-container-duration">{Math.max(seconds, 1)}s</span>
          </>
        )}
        {expandable &&
          (open ? (
            <ChevronDownIcon size={13} className="turn-container-chevron" />
          ) : (
            <ChevronRightIcon size={13} className="turn-container-chevron" />
          ))}
      </button>
      {expandable && open && (
        <div className="turn-container-body">
          {/* Ticket 97: the skill marker row is RETIRED — the skill story
              lives in the user bubble now (composite block, outside the
              fold, live/settled constant); rendering it here too would
              double-show it. A skill-only turn's body is empty, so its
              container is a bare inert row (hasWork rule). */}
          <TurnWorkRows
            items={turn.work}
            onOpenFile={onOpenFile}
            onShowInBridge={onShowInBridge}
            onApprove={onApprove}
            onDeny={onDeny}
          />
          {/* Ticket 103: the expanded live body's foot ring — the same
              spinner as the header's, left-aligned on the body's bottom
              edge (the head-and-tail "still working" mirror). Live only:
              at settle turn.live drops and both rings vanish; a folded or
              zero-work live turn renders the header ring alone (the body
              is not mounted there). */}
          {turn.live && (
            <div className="turn-container-live-foot" role="status">
              <LoaderIcon size={16} className="turn-container-foot-icon spin" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
