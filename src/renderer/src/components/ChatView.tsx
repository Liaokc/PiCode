import { Fragment, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { ChatEntry, ChatState } from '../../../shared/chat-reducer'
import {
  IDLE_BOTTOM_SEQUENCE_IDLE,
  USER_SCROLL_QUIET_MS,
  closeIdleBottomSequence,
  isNearBottom,
  nextHeldAway,
  nextIdleBottomPin,
  nextSendLatch,
  shouldAutoScroll,
  type IdleBottomSequence
} from '../../../shared/scroll-stay'
import { groupTurns } from '../../../shared/turn-collapse'
import type { ComposerDraft, ComposerDraftEntry } from '../../../shared/composer/drafts'
import type { SessionTreePayload } from '../../../shared/sessions/types'
import Composer, { type ComposerApi } from './Composer'
import NavigatorRail from './NavigatorRail'
import TreePanel from './TreePanel'
import TurnContainer from './TurnContainer'
import TurnFileBar from './TurnFileBar'
import AnswerBlock from './AnswerBlock'
import MessageActions from './MessageActions'
import Tooltip from './Tooltip'
import UserBubble from './UserBubble'
import { ChevronDownIcon, GitBranchIcon, PencilIcon } from './icons'

interface ChatViewProps {
  chat: ChatState
  creating: boolean
  /** CWD Banner fact (ticket 54): true while THIS session's working
   * directory is gone and its host is still alive in this app. Purely
   * derived — no dismiss state exists; the banner appears/vanishes with the
   * flag (the index's 2s cwd stat), and only ever in this session's view. */
  cwdMissing?: boolean
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
  /** 编辑重发 (ticket 79): edit & resend a settled user message — the App
   * prefills the composer (original text + images) and navigates the leaf to
   * the message's parent. Undefined rendering as no Edit affordance. */
  onEditMessage?: (entryId: string) => void
  onCloseTree: () => void
  /** Deep-link a file-arg tool call into the Preview tab (ticket 07). */
  onOpenFile?: (path: string) => void
  /** Deep-link a bash tool call into the Bridge panel (ticket 18 feedback). */
  onShowInBridge?: (toolCallId: string) => void
  /** Fold/unfold one turn's work container (ticket 23). */
  onToggleTurn: (turnId: string) => void
  /** Ticket 129: toggle one thinking row's expansion (routed to the focused
   * session's registry state; the row's open state reads back from
   * `chat.expandedThinking` — remembered across every remount). */
  onToggleThinking: (key: string) => void
  /** Open one turn's file changes in the side panel's turn-diff tab (ticket 78). */
  onReviewTurn?: (turnId: string) => void
  /** Composer commands + the chat slices the composer menus render. */
  composerApi: ComposerApi
  /** Ticket 74: the focused session's parked composer draft, restored by the
   * composer at mount; null = start empty. */
  initialDraft?: ComposerDraft | null
  /** Ticket 74: the App's live-draft bridge (owner-tagged; the composer
   * rewrites it every render, the App parks it at view-switch time). */
  draftBridgeRef?: { current: ComposerDraftEntry | null }
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
  cwdMissing = false,
  tree,
  branch,
  treeOpen,
  onToggleTree,
  onRename,
  onNavigateTree,
  onFork,
  onEditMessage,
  onCloseTree,
  onOpenFile,
  onShowInBridge,
  onToggleTurn,
  onToggleThinking,
  onReviewTurn,
  composerApi,
  initialDraft = null,
  draftBridgeRef,
  onApprove,
  onDeny
}: ChatViewProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Ticket 83: the History button owns the TreePanel — its ref is the
  // outside-close anchor (the mid-press half of a button toggle must not
  // close the panel; the click toggle does).
  const treeBtnRef = useRef<HTMLButtonElement>(null)
  // Ticket 45 scroll-stay bookkeeping: growth detection by reference (every
  // reducer rewrite of entries), the focused session's id, and the two pin
  // latches — send (ticket 93: armed by the user's own send and held UNTIL
  // THE BOTTOM IS REACHED or an upward gesture takes over — no longer one
  // decision pass) and jump travel (until the bottom is reached or the
  // user's own scroll takes over). Ticket 94: fold toggles are NOT growth —
  // expandedTurns left the grew check; a toggle's scroll is the fold-anchor
  // rule's (shared/fold-anchor.ts: header row restored, or the bottom kept
  // when pinned), and the streaming stick must not fight it near the band.
  const lastEntries = useRef<ChatEntry[] | null>(null)
  const lastSessionId = useRef<string | null>(null)
  const arrivalPending = useRef(true)
  const sendLatch = useRef(false)
  const returning = useRef(false)
  const lastScrollTop = useRef(0)
  // Ticket 119: the last user scroll input (wheel/pointer) timestamp — the
  // scroll-event re-pin arm’s ownership gate (a reader’s own gesture always
  // wins; only engine-driven moves are re-pinned).
  const lastUserScrollAtRef = useRef(0)
  // Ticket 119: the idle bottom-pin sequence latch (Seam 1 state) — armed
  // while an idle reader sits on the bottom, closed by their own scroll
  // away or a running agent.
  const idleBottomSeqRef = useRef<IdleBottomSequence>(IDLE_BOTTOM_SEQUENCE_IDLE)
  // Ticket 75 adds the reader-held-away latch: any upward scroll movement
  // holds the viewport away from the bottom (the wheel always wins); a
  // downward return into the bottom band, the user's own send or a
  // jump-to-latest click clears it. Ref-only — the scroll listener and the
  // stick effect write it, the stick effect reads it: zero extra renders.
  const heldAway = useRef(false)
  const [jumpVisible, setJumpVisible] = useState(false)
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

  // Ticket 45: the stick decision is the Seam-1 pure function
  // shouldAutoScroll — the viewport pins to the bottom only while the reader
  // is already near it or their own agency asks for it (send / jump click).
  // Growth alone NEVER yanks a reader who scrolled away (Q12 behavior
  // change), and — ticket 75 — never one who wheeled up either: an upward
  // scroll gesture sets the held-away latch and mutes the in-band strong
  // stick until they return to the bottom band or their own agency asks.
  // A freshly focused transcript has no reading position to
  // preserve, so arrival pins the bottom until the content has landed
  // (a resumed session arrives over two passes: session_created empties the
  // transcript, history_loaded replays it).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const sessionId = chat.session?.sessionId ?? null
    if (sessionId !== lastSessionId.current) {
      lastSessionId.current = sessionId
      arrivalPending.current = true
      lastEntries.current = null
      heldAway.current = false
      sendLatch.current = false
    }
    const grew = chat.entries !== lastEntries.current
    lastEntries.current = chat.entries
    if (arrivalPending.current) {
      el.scrollTop = el.scrollHeight
      setJumpVisible(false)
      if (chat.entries.length > 0) arrivalPending.current = false
      return
    }
    // Ticket 75/93: movements whose scroll events have not delivered yet
    // (they landed between the last scroll event and this pass) read here
    // via the live delta — the same transitions the scroll listener runs
    // (advanceScrollLatches below), so a gesture can never be coalesced
    // away by a same-frame growth yank and the send latch can never
    // out-rank a gesture that already happened.
    const liveDelta = el.scrollTop - lastScrollTop.current
    advanceScrollLatches(liveDelta, el)
    // The user's own agency (own send, jump travel) asks for the bottom and
    // clears the hold (自发送/跳转复位) — the FRESH gesture outranks any hold
    // that predates it; a gesture that came after (the takeover above) has
    // already disarmed the latch.
    const selfSent = sendLatch.current || returning.current
    if (selfSent) heldAway.current = false
    const nearBottom = isNearBottom(el)
    if (shouldAutoScroll({ nearBottom, heldAway: heldAway.current }, { grew }, selfSent)) {
      el.scrollTop = el.scrollHeight
    }
    setJumpVisible(!isNearBottom(el))
  }, [chat.entries, chat.expandedTurns, chat.session])

  // Ticket 75/93: the two scroll-stream latches advance together on every
  // movement sample — the scroll listener and the stick effect (live-delta
  // replay) run the SAME transition, so a gesture is never coalesced away
  // by a same-frame growth yank and the send latch never out-ranks a
  // gesture that already happened. Ref-only — zero extra renders.
  function advanceScrollLatches(deltaPx: number, el: HTMLDivElement): void {
    heldAway.current = nextHeldAway(heldAway.current, deltaPx, el)
    sendLatch.current = nextSendLatch(sendLatch.current, deltaPx, el)
  }

  // Ticket 45: track the reader's position for the Jump-to-Latest button,
  // and end the jump travel when it arrives — or when the user scrolls
  // upward mid-travel (their wheel took over; the pin must not survive it
  // and yank them back on the next growth pass). Ticket 75 rides the same
  // scroll stream: any real upward movement holds the viewport away (the
  // wheel always wins), a downward return into the bottom band clears it
  // (the next growth pass resumes following — 滚回底部恢复吸底). Ticket 93:
  // the send latch rides the same stream — an upward gesture disarms the
  // send agency outright (the wheel outranks the pin), reaching the bottom
  // settles it (arrival).
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
    // Ticket 119’s second arm: the engine can natively restore the scroll
    // position on relayouts that change NO geometry (observed: the caret
    // mirror’s forced relayout ~200ms after the last keystroke moved the
    // pinned reader back to the pre-burst absolute — a scroll event with
    // no resize, so the ResizeObserver arm never fired). Every native
    // move does fire this handler, so the same Seam-1 re-pin runs here —
    // gated on "no user scroll input just happened" (wheel / pointer),
    // because the reader’s own gesture always wins (the ticket-75 law,
    // idle edition): a wheel-driven position is never re-pinned, an
    // engine-driven restore inside the sequence’s cumulative-shrink
    // bound is.
    if (!chat.agentRunning && performance.now() - lastUserScrollAtRef.current > USER_SCROLL_QUIET_MS) {
      const decision = nextIdleBottomPin(
        {
          snapshot: { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop, clientHeight: el.clientHeight },
          agentRunning: false
        },
        idleBottomSeqRef.current
      )
      idleBottomSeqRef.current = decision.next
      if (decision.scrollTopPx !== null && decision.scrollTopPx !== el.scrollTop) {
        el.scrollTop = decision.scrollTopPx
      }
    }
  }

  // Ticket 45 (CONTEXT.md: 回底钮): smooth travel back to the newest
  // content. The travel pin keeps the bottom pinned through growth that
  // lands mid-travel, so the click restores stickiness.
  function jumpToLatest(): void {
    const el = scrollRef.current
    if (!el) return
    returning.current = true
    heldAway.current = false // 跳转复位 — the click re-engages the bottom
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' })
  }

  // Ticket 45/93: the user's own send (send, steer, follow-up — and the
  // queued message's later injection rides this arming) arms the send
  // latch: the stick decision honors it every pass UNTIL the view reaches
  // the bottom (到达底部才清) or an upward gesture disarms it (滚轮赢).
  const withPin = (send: ComposerApi['onSend']): ComposerApi['onSend'] => (text, images) => {
    sendLatch.current = true
    send(text, images)
  }
  const pinnedComposerApi = useMemo<ComposerApi>(
    () => ({
      ...composerApi,
      onSend: withPin(composerApi.onSend),
      onSteer: withPin(composerApi.onSteer),
      onFollowUp: withPin(composerApi.onFollowUp)
    }),
    [composerApi]
  )

  // Ticket 119 (spec R18, CONTEXT.md: 空闲输入不动转录): idle composer
  // operations must never move the transcript — and, per the dev-app
  // instrumentation, the idle bug was never a scroll write: the composer
  // card's growth (auto-grow, the attachment strip, the expand glide)
  // shrinks this scroll cell's clientHeight, the untouched scrollTop lets
  // the viewport's bottom edge ride up over the content, and the tail rows
  // (the last message's Copy/Fork action row) slide under the composer.
  // This observer is the geometry arm the stick effect cannot be (its deps
  // never change on typing): on every clientHeight change it runs the
  // Seam-1 re-pin (nextIdleBottomPin) over a per-burst sequence latch —
  // a reader pinned at the bottom stays pinned across every shrink of the
  // burst (the tail rows never leave the view, including through the
  // engine's native pre-pin-restore that a single-shot check would read as
  // “off bottom”), while a reader who scrolls away on their own breaks the
  // sequence's cumulative-shrink bound and is left byte-for-byte
  // untouched; while the agent runs the whole arm stands down (the
  // ticket-93/94/75 scroll semantics own the view; zero regression). The
  // observer fires only on real geometry changes (a handful per draft —
  // never per keystroke) and its entire decision converges into the pure
  // model.
  // Ticket 119: listen for the user’s own scroll inputs (wheel over the
  // transcript, pointer down on it — the scrollbar drag) so the
  // scroll-event re-pin arm can tell a reader gesture from an
  // engine-driven move (the ticket-75 law, idle edition). A wheel-UP is
  // stronger still (edge ②, the main agent’s adjudication): it is an
  // unambiguous leave-the-bottom gesture no engine move can produce, so
  // it closes the idle sequence immediately — even inside the
  // cumulative-shrink bound, where an observation alone would re-pin —
  // and the reader’s position then stands until they return to the
  // bottom (回底 re-arms, as ever).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const mark = (): void => {
      lastUserScrollAtRef.current = performance.now()
    }
    const markWheel = (e: WheelEvent): void => {
      mark()
      if (e.deltaY < 0) idleBottomSeqRef.current = closeIdleBottomSequence()
    }
    el.addEventListener('wheel', markWheel, { passive: true })
    el.addEventListener('pointerdown', mark, { passive: true })
    return () => {
      el.removeEventListener('wheel', markWheel)
      el.removeEventListener('pointerdown', mark)
    }
  }, [])
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    // Each running-state flip restarts the burst bookkeeping: a run's own
    // scroll passes (93/94/75) can change the geometry underneath a
    // sequence armed before it, and the sequence's baseline would be stale.
    idleBottomSeqRef.current = IDLE_BOTTOM_SEQUENCE_IDLE
    if (chat.agentRunning) return
    const observer = new ResizeObserver(() => {
      const decision = nextIdleBottomPin(
        {
          snapshot: { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop, clientHeight: el.clientHeight },
          agentRunning: false
        },
        idleBottomSeqRef.current
      )
      idleBottomSeqRef.current = decision.next
      if (decision.scrollTopPx !== null && decision.scrollTopPx !== el.scrollTop) {
        el.scrollTop = decision.scrollTopPx
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [chat.agentRunning])

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
        <button
          ref={treeBtnRef}
          type="button"
          className={treeOpen ? 'chat-topbar-btn chat-topbar-btn-open' : 'chat-topbar-btn'}
          onClick={onToggleTree}
        >
          History
          <ChevronDownIcon size={13} />
        </button>
        {treeOpen && (
          <TreePanel tree={tree} onNavigate={onNavigateTree} onFork={onFork} onClose={onCloseTree} anchorRef={treeBtnRef} />
        )}
      </div>
      {cwdMissing && (
        /* Ticket 54, CWD Banner: persistent warning at the top of the
           infected session's view — the three facts, no dismiss button (a
           critical fact cannot be accidentally hidden), gone the moment the
           directory is back (pure derived projection, no state). */
        <div className="cwd-banner" role="status" aria-label="Working directory missing">
          <div className="cwd-banner-title">Working directory missing</div>
          <ul className="cwd-banner-facts">
            <li>The session keeps running.</li>
            <li>File tools will fail until the directory is restored.</li>
            <li>After the session exits, it cannot be reopened from that directory.</li>
          </ul>
        </div>
      )}
      <div className="chat-body">
        <div ref={scrollRef} className="chat-scroll" onScroll={handleScroll}>
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
                    assistant entries. `data-turn-id` is the navigator rail's
                    scroll/anchor hook (ticket 46). Ticket 97: the bubble is a
                    COMPOSITE (skill + text + image thumbnails, presence
                    composition — the Seam-1 model decides); the skill story
                    lives here now, no longer inside the container. */
                  <div className="msg-user-block" data-turn-id={turn.id}>
                    <UserBubble entry={turn.user} />
                    {/* Ticket 79: Edit joins the persistent row — hidden while
                        the agent runs (agentRunning) and back the moment the
                        agent_end settle lands (derived, no extra state). */}
                    <MessageActions
                      text={turn.userText}
                      showTime={false}
                      onEdit={!chat.agentRunning && onEditMessage !== undefined ? () => onEditMessage(turn.id) : undefined}
                    />
                  </div>
                )}
                {turn.hasContainer && (
                  /* Ticket 55: the container row is unconditional for turns
                    with a user bubble (operator-approved ZCode deviation —
                    the old `(hasWork || turn.live)` empty-shell condition is
                    gone); the head segment's status quo lives in the model
                    too. Zero-work turns render a bare, non-expandable row. */
                  <TurnContainer
                    turn={turn}
                    /* Ticket 56: pendingApproval counts only pills inside the
                       fold — a pending pill below the answer never forces the
                       container (it is already visible; forcing it would slam
                       the fold shut on decision, jumping the two-state slot). */
                    open={chat.expandedTurns.has(turn.id) || turn.pendingApproval}
                    onToggle={() => onToggleTurn(turn.id)}
                    /* Ticket 129: the thinking rows' expansion state rides
                       the registry set — survives this view's every
                       remount. */
                    expandedThinking={chat.expandedThinking}
                    onToggleThinking={onToggleThinking}
                    /* Ticket 94: the transcript scroller — the deterministic
                       fold-anchor rule holds the header row / bottom pin
                       across this container's open flips. */
                    scrollRef={scrollRef}
                    onOpenFile={onOpenFile}
                    onShowInBridge={onShowInBridge}
                    onApprove={onApprove}
                    onDeny={onDeny}
                  />
                )}
                {turn.answer !== null && (
                  /* Ticket 53/82: the settled answer below the fold — a live
                    turn carries no answer (its text streams inline in the
                    container); at agent_end the last text part lifts here. */
                  <AnswerBlock
                    turn={turn}
                    expandedThinking={chat.expandedThinking}
                    onToggleThinking={onToggleThinking}
                    onFork={onFork}
                    onOpenFile={onOpenFile}
                    onShowInBridge={onShowInBridge}
                    onApprove={onApprove}
                    onDeny={onDeny}
                  />
                )}
                {turn.fileChanges.length > 0 && (
                  /* Ticket 78: the turn file bar — collapsed "N files changed
                     +X −Y" at the end of the always-visible segment (below
                     the answer; after the container on answer-less turns).
                     Ticket 92: settled-only — the model carries no
                     fileChanges while the turn streams, so the bar lands in
                     place at agent_end (stop/error turns settle through the
                     same path and keep theirs). */
                  <TurnFileBar turnId={turn.id} changes={turn.fileChanges} onReviewTurn={onReviewTurn} onOpenFile={onOpenFile} />
                )}
              </Fragment>
            ))}
          </div>
        </div>
        {/* Ticket 46: the turn navigator rides the transcript's left edge.
            It owns its hover/anchor state — transcript scroll/hover/click
            never re-render the chat. */}
        <NavigatorRail turns={turns} scrollRef={scrollRef} />
      </div>
      <div className="chat-dock">
        <Tooltip label="Jump to latest">
          <button
            type="button"
            className={jumpVisible ? 'chat-jump-btn chat-jump-btn-visible' : 'chat-jump-btn'}
            aria-label="Jump to latest"
            onClick={jumpToLatest}
          >
            <ChevronDownIcon size={14} />
          </button>
        </Tooltip>
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
          initialDraft={initialDraft}
          draftBridgeRef={draftBridgeRef}
          draftOwner={chat.session ? { kind: 'session', sessionId: chat.session.sessionId } : undefined}
          /* Ticket 77 (context ring): the ChatView-only ring input — the most
             recent assistant usage (reducer-pushed) over the current model's
             context window (ModelRef.contextWindow, absent → null). */
          contextRing={{ usage: chat.lastUsage, contextWindow: chat.model?.contextWindow ?? null }}
          {...pinnedComposerApi}
        />
      </div>
    </div>
  )
}

/** Window event the App dispatches for the `/name` builtin. */
export const RENAME_EVENT = 'picode:rename-session'
