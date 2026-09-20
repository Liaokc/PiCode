import { useEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { replayEntry } from '../../../shared/chat-reducer'
import { groupTurns } from '../../../shared/turn-collapse'
import { isNearBottom, nextHeldAway, nextSendLatch, shouldAutoScroll } from '../../../shared/scroll-stay'
import {
  normalizeTranscriptPayload,
  rowIsLive,
  steerReceiptCopy,
  type SteerReceipt,
  type SubagentTranscriptPayload
} from '../../../shared/subagents/chat-model'
import type { SubagentDirectoryRow } from '../../../shared/subagents/directory'
import { subagentChatStore } from './subagent-chat-store'
import TurnContainer from './TurnContainer'
import AnswerBlock from './AnswerBlock'
import UserBubble from './UserBubble'
import { ArrowUpIcon, ChevronDownIcon, LoaderIcon, PulseIcon } from './icons'

interface SubagentChatTabProps {
  /** The session that owns the run (steer commands target ITS host). */
  sessionId: string
  /** The projected directory row for this run (the App re-projects it on
   * every render so live badge flips reach the tab). Null while the row
   * context is gone (session closed) — the tab renders honestly idle. */
  row: SubagentDirectoryRow | null
  /** Send one steer through the run's own session host (the App targets
   * `session_command` and seeds the pending receipt). */
  onSteer: (sessionId: string, asyncId: string, requestId: string, text: string) => void
}

/**
 * One subagent's conversation tab (ticket 99, ZCode z17-subagent-chat): the
 * CHILD session's transcript rendered with the main transcript component
 * family (groupTurns + TurnContainer + AnswerBlock + UserBubble — the same
 * projection the live ChatView and the Live Follow use), over the child's
 * real session file tailed by the host's sessions service (the trace-follow
 * convention: snapshot + size-driven rebuilds, zero renderer polling).
 *
 * Running child: the composer send = steer (pi-subagents' RPC
 * acknowledged-delivery — nonRecoveringSteer semantics; the receipt lands
 * verbatim: delivered / queued / failed). Ended child: read-only, no
 * composer (resume-revival is deliberately out of scope for this ticket).
 * The × on the tab closes the VIEW only — a running child keeps running.
 *
 * Scroll semantics are the main transcript's (shared/scroll-stay): growth
 * sticks only near the bottom or under the reader's own agency (send /
 * jump), the wheel always wins, and the jump-to-latest button rides the
 * same latches.
 */

const STEER_PLACEHOLDER = 'Steer this subagent…'

export default function SubagentChatTab({ sessionId, row, onSteer }: SubagentChatTabProps): JSX.Element {
  const asyncDir = row?.asyncDir ?? null
  const live = row !== null && rowIsLive(row.state)
  const [payload, setPayload] = useState<SubagentTranscriptPayload | null>(null)
  const [draft, setDraft] = useState('')
  const [receipts, setReceipts] = useState<SteerReceipt[]>([])
  const [openTurns, setOpenTurns] = useState<ReadonlySet<string>>(new Set())
  const [collapsedLive, setCollapsedLive] = useState<ReadonlySet<string>>(new Set())

  // ---- the transcript follow (the sessions family's per-file tail) --------
  useEffect(() => {
    if (asyncDir === null) return
    let cancelled = false
    void window.picode.sessions.subagentTranscript(asyncDir, live).then((result) => {
      if (cancelled || result === null) return
      setPayload(normalizeTranscriptPayload(result))
    })
    return () => {
      cancelled = true
    }
  }, [asyncDir, live])

  useEffect(() => {
    if (asyncDir === null) return
    return window.picode.sessions.onSubagentTranscriptUpdate((pushed) => {
      if (pushed.asyncDir !== asyncDir) return
      const normalized = normalizeTranscriptPayload(pushed)
      if (normalized !== null) setPayload(normalized)
    })
  }, [asyncDir])

  // Settled runs stop the tail (the last push covered the final entries; a
  // one-shot re-read happens through the `live` flip above).
  useEffect(() => {
    if (asyncDir === null || live) return
    window.picode.sessions.unsubagentTranscriptFollow(asyncDir)
  }, [asyncDir, live])

  // ---- the steer receipts (this run's slice of the store) -----------------
  const receiptKey = row !== null ? (row.asyncId ?? row.id) : null
  useEffect(() => {
    if (receiptKey === null) return
    // Primitive deps only: the App re-projects the row object on every
    // render, but the subscription must not churn (set/clear + re-sync)
    // per host event.
    const sync = (): void => setReceipts(subagentChatStore.receiptsFor(sessionId, receiptKey))
    sync()
    return subagentChatStore.subscribe(sync)
  }, [sessionId, receiptKey])

  // ---- scroll-stay: the main transcript's exact latch machine -------------
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastEntryCount = useRef(0)
  const arrivalPending = useRef(true)
  const sendLatch = useRef(false)
  const returning = useRef(false)
  const lastScrollTop = useRef(0)
  const heldAway = useRef(false)
  const [jumpVisible, setJumpVisible] = useState(false)

  const entries = useMemo(() => (payload !== null ? payload.items.map(replayEntry) : []), [payload])
  const turns = useMemo(() => groupTurns(entries, live), [entries, live])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const grew = entries.length !== lastEntryCount.current
    lastEntryCount.current = entries.length
    if (arrivalPending.current) {
      el.scrollTop = el.scrollHeight
      setJumpVisible(false)
      if (entries.length > 0) arrivalPending.current = false
      return
    }
    const liveDelta = el.scrollTop - lastScrollTop.current
    advanceScrollLatches(liveDelta, el)
    const selfSent = sendLatch.current || returning.current
    if (selfSent) heldAway.current = false
    const nearBottom = isNearBottom(el)
    if (shouldAutoScroll({ nearBottom, heldAway: heldAway.current }, { grew }, selfSent)) {
      el.scrollTop = el.scrollHeight
    }
    setJumpVisible(!isNearBottom(el))
  }, [entries])

  function advanceScrollLatches(deltaPx: number, el: HTMLDivElement): void {
    heldAway.current = nextHeldAway(heldAway.current, deltaPx, el)
    sendLatch.current = nextSendLatch(sendLatch.current, deltaPx, el)
  }

  function handleScroll(): void {
    const el = scrollRef.current
    if (!el) return
    const top = el.scrollTop
    const moved = top - lastScrollTop.current
    advanceScrollLatches(moved, el)
    if (returning.current && (isNearBottom(el) || moved < -1)) {
      returning.current = false
    }
    lastScrollTop.current = top
    setJumpVisible(!isNearBottom(el))
  }

  function jumpToLatest(): void {
    const el = scrollRef.current
    if (!el) return
    returning.current = true
    heldAway.current = false
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' })
  }

  // ---- the fold machine (live streams expanded, settle collapses) ---------
  function toggleTurn(turnId: string, isLive: boolean): void {
    if (isLive) {
      setCollapsedLive((prev) => {
        const next = new Set(prev)
        if (next.has(turnId)) next.delete(turnId)
        else next.add(turnId)
        return next
      })
      return
    }
    setOpenTurns((prev) => {
      const next = new Set(prev)
      if (next.has(turnId)) next.delete(turnId)
      else next.add(turnId)
      return next
    })
  }

  // ---- steering ------------------------------------------------------------
  function sendSteer(): void {
    const text = draft.trim()
    if (text === '' || !live || row === null) return
    const asyncId = row.asyncId ?? row.id
    // Deterministic per tab: steer-<session>-<run>-<n> — the visual-QA
    // harnesses can predict it, and receipts sort by their own sequence.
    const sequence = subagentChatStore.receiptsFor(sessionId, asyncId).length + 1
    const requestId = `steer-${sessionId}-${asyncId}-${sequence}`
    subagentChatStore.steerSent(sessionId, asyncId, requestId)
    onSteer(sessionId, asyncId, requestId, text)
    // The send empties the composer (the main composer's rule) and the
    // user's own agency pins the bottom until arrival.
    setDraft('')
    sendLatch.current = true
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      sendSteer()
    }
  }

  // ---- render ---------------------------------------------------------------

  if (row === null) {
    return (
      <div className="subchat-view" data-testid="subagent-chat-tab">
        <div className="review-empty">
          <PulseIcon size={28} />
          <p className="review-empty-title">Subagent unavailable</p>
          <p className="review-empty-hint">The session this run belongs to is not open right now.</p>
        </div>
      </div>
    )
  }

  const error = payload?.error ?? null

  return (
    <div className="subchat-view" data-testid="subagent-chat-tab" data-subagent-chat={row.id}>
      <div className="subchat-head">
        <span className={`subchat-head-state subchat-head-state-${row.state}`}>{row.state}</span>
        <span className="subchat-head-agent">{row.agent}</span>
        {row.childCount > 1 && <span className="subchat-head-note">first of {row.childCount} children</span>}
      </div>
      {error !== null ? (
        <div className="review-empty">
          <PulseIcon size={28} />
          <p className="review-empty-title">Transcript unavailable</p>
          <p className="review-empty-hint">
            {error === 'artifact-missing' && 'The live artifacts for this run are gone — the child transcript cannot be resolved.'}
            {error === 'no-session-file' && 'This run recorded no child session file to display.'}
            {error === 'unreadable' && 'The child session file could not be read.'}
          </p>
        </div>
      ) : (
        <>
          <div className="subchat-body">
            <div ref={scrollRef} className="chat-scroll subchat-scroll" onScroll={handleScroll}>
              <div className="chat-thread">
                {turns.length === 0 && (
                  <div className="follow-empty">
                    {live ? 'The child session has not recorded anything yet…' : 'This run recorded no transcript.'}
                  </div>
                )}
                {turns.map((turn) => {
                  const open = turn.live ? !collapsedLive.has(turn.id) : openTurns.has(turn.id)
                  return (
                    <div key={turn.id}>
                      {turn.user !== null && <UserBubble entry={turn.user} />}
                      {turn.hasContainer && (
                        <TurnContainer turn={turn} open={open} onToggle={() => toggleTurn(turn.id, turn.live)} scrollRef={scrollRef} />
                      )}
                      {turn.answer !== null && <AnswerBlock turn={turn} />}
                    </div>
                  )
                })}
                {receipts.length > 0 && (
                  <div className="subchat-receipts" aria-live="polite">
                    {receipts.map((receipt) => (
                      <div
                        key={receipt.requestId}
                        className={`subchat-receipt subchat-receipt-${receipt.status}`}
                        data-subchat-receipt={receipt.status}
                      >
                        {receipt.status === 'pending' && <LoaderIcon size={11} className="subchat-receipt-icon spin" />}
                        {receipt.status !== 'pending' && <ArrowUpIcon size={11} className="subchat-receipt-icon" />}
                        <span>{steerReceiptCopy(receipt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="subchat-dock">
            <button
              type="button"
              className={jumpVisible ? 'chat-jump-btn chat-jump-btn-visible' : 'chat-jump-btn'}
              aria-label="Jump to latest"
              onClick={jumpToLatest}
            >
              <ChevronDownIcon size={14} />
            </button>
            {live ? (
              <div className="subchat-composer">
                <textarea
                  className="subchat-composer-input"
                  rows={1}
                  placeholder={STEER_PLACEHOLDER}
                  aria-label={STEER_PLACEHOLDER}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onComposerKeyDown}
                />
                <button
                  type="button"
                  className="subchat-composer-send"
                  aria-label="Send steer"
                  disabled={draft.trim() === ''}
                  onClick={sendSteer}
                >
                  <ArrowUpIcon size={14} />
                </button>
              </div>
            ) : (
              <div className="subchat-readonly" data-subchat-readonly="true">
                This run has ended — the transcript is read-only.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
