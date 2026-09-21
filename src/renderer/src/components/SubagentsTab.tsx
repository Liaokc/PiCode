import { useState, type JSX } from 'react'
import { subagentDirectoryFromEntries, ENDED_VISIBLE_INITIAL, ENDED_PAGE_STEP, type SubagentDirectoryRow } from '../../../shared/subagents/directory'
import type { SubagentRowState } from '../../../shared/subagents/types'
import type { ChatEntry } from '../../../shared/chat-reducer'
import { relativeTime } from '../../../shared/sessions/group'
import { useNowTick } from './use-now'
import { StopButton, StopConfirmPopover, stopConfirmLabels } from './StopConfirm'

/**
 * The side panel's Subagents directory tab (ticket 90, ZCode
 * subagentDirectory composition — z17-subagent-dir): the focused session's
 * subagent runs in two fixed sections — Running (Running/Waiting/Blocked)
 * and Ended (Completed/Failed/Cancelled/Lost) — with the seven-state badge,
 * the run title, a relative time and a one-line result preview per row.
 * "Show 20 more" pages the Ended section (ZCode: fixed copy, 20-per-step).
 *
 * Data discipline (ADR-0002 spirit): the rows replay the parent session's
 * own subagent tool-call records (the transcript — PRIMARY source, rebuilt
 * on reopen); the live states the host bridge forwards (status.json
 * artifacts + lifecycle events) refine the badges. Artifacts are live-only:
 * a run with no artifact and no recorded completion projects as Lost, never
 * invented. Empty Running section: "No running subagents" (ZCode copy).
 */

interface SubagentsTabProps {
  /** The focused session's transcript entries (live + replay isomorphic). */
  entries: readonly ChatEntry[]
  /** Live run states the host bridge reported (artifact reads + deltas). */
  runs: Readonly<Record<string, import('../../../shared/subagents/types').SubagentRunState>>
  /** Run ids with an accepted stop request (ticket 101) — the Stopping
   * overlay's source (the registry folds the stop receipts). */
  stopping?: ReadonlySet<string>
  /** Which session the entries belong to — the component remounts on focus
   * switch (the App keys it), so paging resets per session. */
  sessionId: string
  /** Open one run's conversation tab (ticket 99): the row click deep-links
   * into the side panel's subagent-chat slot. Absent → rows are inert. */
  onOpenChat?: (row: SubagentDirectoryRow) => void
  /** Stop one running run (ticket 101): the row's square stop button →
   * the confirm popover → THIS callback (async → the stop RPC; foreground →
   * the parent turn's abort). Absent → no stop affordance. */
  onStop?: (row: SubagentDirectoryRow) => void
}

/** Badge copy: the seven-state vocabulary, verbatim (ZCode calibration). */
const STATE_LABELS: Record<SubagentRowState, string> = {
  running: 'Running',
  waiting: 'Waiting',
  blocked: 'Blocked',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  lost: 'Lost'
}

export default function SubagentsTab({ entries, runs, stopping, onOpenChat, onStop }: SubagentsTabProps): JSX.Element {
  const [visibleEnded, setVisibleEnded] = useState(ENDED_VISIBLE_INITIAL)
  const now = useNowTick(30_000)
  // A focus switch remounts this tab (the App keys by session id), so the
  // paging resets with the session; within one session's view the step
  // persists (memory-level view state, the group-fold precedent).
  // confirmRow: the id of the row whose stop confirm popover is open — one
  // at a time (the popover anchors inside its row).
  const [confirmRow, setConfirmRow] = useState<string | null>(null)

  const model = subagentDirectoryFromEntries(entries, runs, visibleEnded, stopping)
  const noRuns = model.running.length === 0 && model.endedTotal === 0

  return (
    <div className="subagents-view" data-testid="subagents-tab">
      <section className="subagents-section" aria-label="Running">
        <h3 className="subagents-section-title">
          Running <span className="subagents-section-count">· {model.running.length}</span>
        </h3>
        {model.running.length === 0 ? (
          <p className="subagents-empty">No running subagents</p>
        ) : (
          <div className="subagents-rows">
            {model.running.map((row) => (
              <DirectoryRow
                key={row.id}
                row={row}
                now={now}
                onOpenChat={onOpenChat}
                onStop={onStop}
                confirmOpen={confirmRow === row.id}
                onConfirmOpen={(open) => setConfirmRow(open ? row.id : null)}
              />
            ))}
          </div>
        )}
      </section>
      {model.endedTotal > 0 && (
        <section className="subagents-section" aria-label="Ended">
          <h3 className="subagents-section-title">
            Ended <span className="subagents-section-count">· {model.endedTotal}</span>
          </h3>
          <div className="subagents-rows">
            {model.ended.map((row) => (
              <DirectoryRow key={row.id} row={row} now={now} onOpenChat={onOpenChat} />
            ))}
          </div>
          {model.showMoreVisible && (
            <button
              type="button"
              className="subagents-show-more"
              onClick={() => setVisibleEnded((v) => v + ENDED_PAGE_STEP)}
            >
              Show 20 more
            </button>
          )}
        </section>
      )}
      {noRuns && (
        <p className="subagents-hint">
          Subagent runs this session records appear here. Live states arrive while a run is in flight.
        </p>
      )}
    </div>
  )
}

/** The badge text for one row: the seven-state vocabulary, with the stop
 * flow's honest Stopping overlay (ticket 101) on live rows. */
function badgeText(row: SubagentDirectoryRow): string {
  return row.stopping ? 'Stopping' : STATE_LABELS[row.state]
}

function DirectoryRow({
  row,
  now,
  onOpenChat,
  onStop,
  confirmOpen = false,
  onConfirmOpen
}: {
  row: SubagentDirectoryRow
  now: number
  onOpenChat?: (row: SubagentDirectoryRow) => void
  onStop?: (row: SubagentDirectoryRow) => void
  /** The confirm machinery is only wired for Running rows (the ended rows
   * render without it). */
  confirmOpen?: boolean
  onConfirmOpen?: (open: boolean) => void
}): JSX.Element {
  const timeMs = row.state === 'running' || row.state === 'waiting' || row.state === 'blocked' ? row.startedAtMs : row.endedAtMs ?? row.startedAtMs
  // The stop affordance (ticket 101): running rows only — the RPC stop
  // rejects queued/paused runs, so a button that always fails is dishonest —
  // never while the stop is already accepted (stopping twice is not a
  // thing), and only when the caller wires the stop flow.
  const stoppable = onStop !== undefined && !row.stopping && row.state === 'running'
  return (
    <div
      className={`subagents-row subagents-row-${row.state}${onOpenChat !== undefined ? ' subagents-row-clickable' : ''}`}
      data-subagent-row={row.id}
      role={onOpenChat !== undefined ? 'button' : undefined}
      tabIndex={onOpenChat !== undefined ? 0 : undefined}
      aria-label={onOpenChat !== undefined ? `Open ${row.title} conversation` : undefined}
      onClick={onOpenChat !== undefined ? () => onOpenChat(row) : undefined}
      onKeyDown={
        onOpenChat !== undefined
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onOpenChat(row)
              }
            }
          : undefined
      }
    >
      <span className={`subagents-badge subagents-badge-${row.stopping ? 'stopping' : row.state}`} data-subagent-badge={row.id}>
        {badgeText(row)}
      </span>
      <div className="subagents-row-main">
        <div className="subagents-row-title">
          <span className="subagents-row-title-text">{row.title}</span>
          {row.nestedCount > 0 && <span className="subagents-row-nested">+{row.nestedCount} nested</span>}
          {row.childCount > 1 && <span className="subagents-row-fanout">{row.childCount} children</span>}
        </div>
        {(row.preview !== null || row.currentTool !== null) && (
          <div className="subagents-row-preview">{row.currentTool ?? row.preview}</div>
        )}
      </div>
      <span className="subagents-row-agent">{row.agent}</span>
      <span className="subagents-row-time">{timeMs > 0 ? relativeTime(timeMs, now) : ''}</span>
      {stoppable && onConfirmOpen !== undefined && (
        <StopButton
          label={`Stop ${row.title}`}
          active={confirmOpen}
          onBegin={() => onConfirmOpen(true)}
        />
      )}
      {confirmOpen && onConfirmOpen !== undefined && (
        <StopConfirmPopover
          labels={stopConfirmLabels(row.title, row.asyncId === null)}
          onConfirm={() => {
            onConfirmOpen(false)
            onStop?.(row)
          }}
          onCancel={() => onConfirmOpen(false)}
        />
      )}
    </div>
  )
}
