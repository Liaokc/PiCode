import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type JSX, type KeyboardEvent } from 'react'
import type { AccessMode, ImageAttachment, ModelRef, ProviderModels, SlashCommandItem, ThinkingLevel } from '../../../shared/contract'
import type { ChatQueue } from '../../../shared/chat-reducer'
import type { ContextRingInput } from '../../../shared/context-ring'
import { composerDraft, type ComposerDraft, type ComposerDraftEntry, type ComposerDraftOwner } from '../../../shared/composer/drafts'
import { applyMention, filterFiles, splitTruncatedFiles } from '../../../shared/composer/mention'
import { accessModeLabel } from '../../../shared/composer/access'
import { gateSlashCommand } from '../../../shared/composer/slash-gate'
import { textMenuSurface } from '../../../shared/composer/menu-surface'
import { filterCommands, pickCommand } from '../../../shared/composer/commands'
import { clampIndex, flatMenuKey } from '../../../shared/composer/menu-keys'
import { composerDensity, thinkingBarFraction, thinkingBarShimmers, type ComposerDensity } from '../../../shared/composer/density'
import {
  composerAutoGrowHeight,
  composerExpandHeight,
  reduceComposerExpand,
  type ComposerExpandEvent,
  type ComposerExpandState
} from '../../../shared/composer/expand'
import { AccessMenu, ModelMenu, ThinkingMenu, thinkingLabel } from './composer/menus'
import { FileMenu, SlashMenu } from './composer/list-menus'
import ContextRing from './ContextRing'
import { ArrowUpIcon, CloseIcon, CubeIcon, FoldIcon, GaugeIcon, PlusIcon, ShieldCheckIcon, StopIcon, UnfoldIcon } from './icons'
import QueuePanel from './QueuePanel'
import Tooltip from './Tooltip'

/** Composer-relevant slices of the chat state (all contract-pushed). */
export interface ComposerChat {
  accessMode: AccessMode
  model: ModelRef | null
  thinkingLevel: ThinkingLevel | null
  availableLevels: ThinkingLevel[]
  providers: ProviderModels[]
  slashCommands: SlashCommandItem[]
  /** Ticket 41 (new-task empty state): the displayed chip value is Pi's own
   * fallback (not a user preference) — the chip tags it "default". In-session
   * slices never set these: every contract-pushed value is the session's own. */
  modelIsDefault?: boolean
  thinkingIsDefault?: boolean
  /** Ticket 80 (new-task empty state): the displayed access tier is the
   * gate's own fallback (no pick made) — the chip tags it "default". The
   * same rule as modelIsDefault/thinkingIsDefault; in-session slices never
   * set it (the session's tier is its own state). */
  accessIsDefault?: boolean
  /** Styled hint for the model menu when the catalog is empty (ticket 41:
   * the blank dropdown is replaced everywhere a menu finds no providers). */
  modelMenuHint?: string | null
}

/** Everything the composer can do to the rest of the app. */
export interface ComposerApi {
  onSend: (text: string, images: ImageAttachment[]) => void
  onSteer: (text: string, images: ImageAttachment[]) => void
  onFollowUp: (text: string, images: ImageAttachment[]) => void
  onStop: () => void
  onSetAccessMode: (mode: AccessMode) => void
  onSetModel: (providerId: string, modelId: string) => void
  onSetThinkingLevel: (level: ThinkingLevel) => void
  onClearQueue: () => void
  onListFiles: (requestId: string, query: string) => void
  onPickImages: () => Promise<ImageAttachment[]>
  onBuiltinCommand: (name: string) => void
  /** A retired `/` command was typed by hand (ticket 38): the composer
   * blocked the send; the app raises the pointer toast. */
  onSlashHint: (hint: string) => void
}

interface ComposerProps extends ComposerApi {
  busy: boolean
  disabled: boolean
  placeholder: string
  chat: ComposerChat
  /** Live steering/follow-up queue (SDK-authoritative, contract-pushed). */
  queue: ChatQueue
  /** Ticket 74: the draft to restore on MOUNT — the parked slot content for
   * this surface. Read exactly once (the state initializers); slots only
   * change while the view is elsewhere, and every view switch remounts the
   * composer, so the mount-time value is always the current slot. */
  initialDraft?: ComposerDraft | null
  /** Ticket 74: the live-draft bridge. The composer rewrites this ref every
   * render (owner-tagged, latest-value pattern) and the App parks the last
   * entry into the matching slot at every view switch — a ref write, so no
   * per-keystroke renders. Absent = the surface opts out (no parking). */
  draftBridgeRef?: { current: ComposerDraftEntry | null }
  /** Ticket 74: which slot this composer's draft belongs to; required for
   * the bridge to carry an entry (an unowned bridge write is skipped). */
  draftOwner?: ComposerDraftOwner
  /** Ticket 77 (context ring, CONTEXT.md: 上下文圆环): the ring's raw inputs.
   * ONLY the ChatView surface passes it (回底钮先例: FollowView has no
   * composer, the New Task empty state has no session to measure) — absent
   * or null renders no ring at all, so the shared component stays
   * surface-honest. The Seam-1 model (`shared/context-ring`) owns every
   * grey/arc/hover decision. */
  contextRing?: ContextRingInput | null
}

type MenuState = 'slash' | 'files' | 'access' | 'model' | 'thinking' | null

/** Window events the `/model` and `/thinking` built-ins dispatch (App → Composer). */
export const OPEN_MODEL_MENU_EVENT = 'picode:open-model-menu'
export const OPEN_THINKING_MENU_EVENT = 'picode:open-thinking-menu'

/** Window event the App shell dispatches when the global ⌘E chord resolves
 * (ticket 57): the keymap produces `toggle-composer-expand` and the App
 * routes it here — exactly ONE composer is mounted at a time (the focused
 * session's view or the New Task empty state; the component is shared), so
 * the mounted instance owns the state change. FollowView mounts none, so
 * following is a natural no-op. */
export const TOGGLE_EXPAND_EVENT = 'picode:toggle-composer-expand'

interface LocalImage {
  id: number
  mimeType: string
  /** Raw base64 payload (no data: prefix) — goes over the contract. */
  data: string
  /** data: URL for the local thumbnail. */
  preview: string
  label: string
}

let imageSeq = 0

/**
 * The ZCode composer card at full spec (ticket 05): input line with @-mention
 * and `/`-command completion, image attachments, Access Mode chip (approval-
 * gate tiers), provider→model cascade, thinking dropdown, and an explicit
 * Steer / Follow-up choice while the agent runs. All agent behavior flows
 * through ParentToHost commands; all state arrives via the contract stream.
 */
export default function Composer({
  busy,
  disabled,
  placeholder,
  chat,
  queue,
  initialDraft = null,
  draftBridgeRef,
  draftOwner,
  contextRing,
  onSend,
  onSteer,
  onFollowUp,
  onStop,
  onSetAccessMode,
  onSetModel,
  onSetThinkingLevel,
  onClearQueue,
  onListFiles,
  onPickImages,
  onBuiltinCommand,
  onSlashHint
}: ComposerProps): JSX.Element {
  /** Ticket 74: restore the parked draft at mount — the state initializers
   * read the slot exactly once. The caret starts at the restored text's end
   * (menu surfaces stay closed until the user interacts). */
  const [value, setValue] = useState(initialDraft?.text ?? '')
  const [caret, setCaret] = useState(initialDraft?.text.length ?? 0)
  const [images, setImages] = useState<LocalImage[]>(() => localImagesFromDraft(initialDraft))
  const [queuedMode, setQueuedMode] = useState<'follow-up' | 'steer'>('follow-up')
  const [menu, setMenu] = useState<MenuState>(null)
  const [menuIndex, setMenuIndex] = useState(0)
  const [fileOptions, setFileOptions] = useState<string[]>([])
  /** Ticket 71: the last `file_list` reply came from a capped walk — the @
   * menu appends the honest "truncated" hint row while this is set. */
  const [filesTruncated, setFilesTruncated] = useState(false)
  /** 输入展开 (ticket 49): component-local, never persisted — the next turn
   * and the next session both start from the resting composer. The state
   * is the Seam-1 machine's state; `expanded` below is its boolean view. */
  const [expandState, setExpandState] = useState<ComposerExpandState>('collapsed')
  const expanded = expandState === 'expanded'
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sectionRef = useRef<HTMLElement | null>(null)
  // Ticket 70: the three chip elements — handed to their menus as the
  // outside-close anchor, so a mousedown on the owning chip no longer
  // closes the menu (the chip's own click toggle completes the close;
  // mousedown-close + click-toggle used to bounce the menu right back).
  const accessChipRef = useRef<HTMLButtonElement | null>(null)
  const modelChipRef = useRef<HTMLButtonElement | null>(null)
  const thinkingChipRef = useRef<HTMLButtonElement | null>(null)
  const fileSeq = useRef(0)
  const fileListRequest = useRef<string | null>(null)
  const fileDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Ticket 68: the query the open text menu was last synced with — the
   * keyboard-selection reset and the candidate refetch ride on its change. */
  const menuQueryRef = useRef<string | null>(null)

  // Ticket 74: publish the live draft (owner-tagged) after every commit —
  // the App parks the latest entry into the matching slot at view-switch
  // time, before any unmount can lose the component-local state. A layout
  // effect (not a render-phase write — the ref is parent-owned) keeps the
  // bridge current at every event handler: layout effects run synchronously
  // with the commit, before the next event can fire, so the parked draft is
  // always what the composer last showed. Zero extra renders, no
  // per-keystroke cost (the ticket 30/46 red line).
  useLayoutEffect(() => {
    if (draftBridgeRef === undefined || draftOwner === undefined) return
    draftBridgeRef.current = {
      owner: draftOwner,
      draft: composerDraft(value, images.map((img) => ({ mimeType: img.mimeType, data: img.data })))
    }
  })

  // Staged label degradation (ZCode parity, ticket-29 feedback): the footer
  // sheds text as the panes crowd the main zone. Measured on the composer
  // card itself; setDensity bails out on unchanged values, so a drag only
  // re-renders at stage boundaries (≤ 2 per drag), never per frame.
  const [density, setDensity] = useState<ComposerDensity>('full')
  useEffect(() => {
    const section = sectionRef.current
    if (!section || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width !== undefined) setDensity(composerDensity(width))
    })
    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  // Ticket 68: ONE trigger-surface decision (Seam-1, menu-surface.ts) rules
  // both text menus — open only while the caret sits inside the first-line
  // leading token. The surface says WHICH menu the position calls for; the
  // filtered rows decide whether it renders at all: zero matches render
  // nothing (the "No matching commands/files" box is gone) and Enter
  // falls back to the send path.
  const surface = textMenuSurface(value, caret)
  const slashRows = surface?.kind === 'slash' ? filterCommands(chat.slashCommands, surface.query) : []
  const fileRows = surface?.kind === 'files' ? filterFiles(fileOptions, surface.query) : []

  // 输入展开 (ticket 49): adaptive height, applied imperatively — height
  // lives OUTSIDE React state so typing re-measures and re-styles the
  // textarea without a single setState — no per-keystroke render storm
  // (the ticket 30/46 red line). Every decision is the Seam-1 projection
  // (expand.ts); this only measures and applies.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    if (expanded) {
      applyExpandHeight(el)
      return
    }
    // Measure honestly: reset to auto first — a clamped element reports its
    // clamped client height as scrollHeight, never the smaller content, so
    // shrinking would stick at the cap without the reset.
    el.style.height = 'auto'
    el.style.height = `${composerAutoGrowHeight(el.scrollHeight)}px`
  }, [value, expanded])

  // While expanded, a window resize re-projects the expanded height against
  // the new main-zone height (imperative, same no-setState path).
  useEffect(() => {
    if (!expanded) return
    function onResize(): void {
      applyExpandHeight(textareaRef.current)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [expanded])

  // `file_list` replies correlate here — request/response, not reducer state.
  // Ticket 71: the truncation marker never reaches the candidates — the
  // composer strips it once and keeps it as the menu's hint flag.
  useEffect(() => {
    return window.picode.chat.onHostEvent((event) => {
      if (event.type === 'file_list' && event.requestId === fileListRequest.current) {
        const split = splitTruncatedFiles(event.files)
        setFileOptions(split.files)
        setFilesTruncated(split.truncated)
      }
    })
  }, [])

  // The `/model` and `/thinking` built-ins open their menus from anywhere.
  useEffect(() => {
    function openModel(): void {
      if (!disabled) setMenu('model')
    }
    function openThinking(): void {
      if (!disabled && chat.availableLevels.length > 0) setMenu('thinking')
    }
    window.addEventListener(OPEN_MODEL_MENU_EVENT, openModel)
    window.addEventListener(OPEN_THINKING_MENU_EVENT, openThinking)
    return () => {
      window.removeEventListener(OPEN_MODEL_MENU_EVENT, openModel)
      window.removeEventListener(OPEN_THINKING_MENU_EVENT, openThinking)
    }
  }, [disabled, chat.availableLevels.length])

  function refreshFileList(query: string): void {
    if (fileDebounce.current) clearTimeout(fileDebounce.current)
    fileDebounce.current = setTimeout(() => {
      const requestId = `f${fileSeq.current++}`
      fileListRequest.current = requestId
      onListFiles(requestId, query)
    }, 120)
  }

  function updateValue(next: string, nextCaret?: number): void {
    setValue(next)
    const caretPos = nextCaret ?? next.length
    setCaret(caretPos)
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) {
        el.selectionStart = el.selectionEnd = caretPos
        el.focus()
      }
    })
  }

  /** Ticket 68: reconcile the open text menu with the trigger surface.
   * Every path that edits the text or moves the caret funnels here, so the
   * menu tracks the surface exactly: open while it resolves, closed the
   * moment it doesn't (newline, space, cursor out of the token), reopened
   * when the cursor re-enters. A fresh query resets the keyboard selection
   * and refetches file candidates; an unchanged one touches nothing (a
   * click that doesn't move the caret fires onSelect AND onClick). */
  function syncTextMenu(text: string, caretPos: number): void {
    const next = textMenuSurface(text, caretPos)
    if (next === null) {
      menuQueryRef.current = null
      if (menu === 'slash' || menu === 'files') setMenu(null)
      return
    }
    // Same menu kind AND same query: nothing to reconcile. (The kind must
    // match too — a one-event trigger swap, e.g. paste replacing '/ab'
    // with '@ab', keeps the query equal while the menu kind flips.)
    if (menu === next.kind && menuQueryRef.current === next.query) return
    menuQueryRef.current = next.query
    setMenu(next.kind)
    setMenuIndex(0)
    if (next.kind === 'files') refreshFileList(next.query)
  }

  function handleChange(el: HTMLTextAreaElement): void {
    setValue(el.value)
    setCaret(el.selectionStart)
    syncTextMenu(el.value, el.selectionStart)
  }

  /** Cursor moved without a text change (click / arrows): the same surface
   * decision governs — leaving the token closes, re-entering re-opens. */
  function syncCaret(el: HTMLTextAreaElement): void {
    setCaret(el.selectionStart)
    syncTextMenu(el.value, el.selectionStart)
  }

  /** Ticket 69: the ONE pick path for the open text menu — a row's mouse
   * click and the keyboard's Enter both land here, so the slash decision
   * (insert vs built-in) and the @-mention application exist exactly once
   * and can never diverge between mouse and keyboard. */
  function pickTextMenuRow(i: number): void {
    if (menu === 'slash') {
      const row = slashRows[i]
      if (!row) return
      const decision = pickCommand(row)
      if (decision.kind === 'insert') updateValue(decision.text)
      else {
        onBuiltinCommand(decision.name)
        setValue('')
      }
    } else if (menu === 'files') {
      const row = fileRows[i]
      if (!row) return
      const applied = applyMention(value, caret, row)
      updateValue(applied.text, applied.caret)
    } else {
      return
    }
    setMenu(null)
  }

  function handleMenuKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (menu !== 'slash' && menu !== 'files') return false
    const count = (menu === 'slash' ? slashRows : fileRows).length
    // Zero matches render no menu (ticket 68): the surface may still be
    // "open", but with nothing mounted the keys belong to the textarea —
    // arrows move the caret, and Enter falls through to the send path
    // below (unknown /commands pass through to the SDK untouched).
    if (count === 0) return false
    // Ticket 69: ONE keyboard rule — the same shared flatMenuKey every
    // composer menu uses (clamped ends, Enter picks, Escape closes; the
    // old ad-hoc intercept here had an unbounded ArrowDown). Shift+Enter
    // returns false inside it, so the newline path below keeps owning the
    // modified key in every menu state.
    return flatMenuKey(event, count, clampIndex(menuIndex, count), setMenuIndex, pickTextMenuRow, () => setMenu(null))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (handleMenuKey(event)) return
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      dispatch()
      return
    }
    // 输入展开 (ticket 49), collapse path ②: Esc reverts the expanded input
    // — but never while a menu owns the key (the slash/file menus intercept
    // above; the chip menus keep their own document-level Escape handler,
    // so the guard skips those too).
    if (event.key === 'Escape' && expanded && menu === null) {
      event.preventDefault()
      transitionExpand('escape')
    }
  }

  /** 输入展开 (ticket 49): apply one expand-machine event (Seam-1). Every
   * path — the button's toggle, the global ⌘E chord (ticket 57), and all
   * collapse routes — goes through here; afterwards the textarea takes
   * focus back so the keyboard (or post-send) flow keeps going. */
  const transitionExpand = useCallback((event: ComposerExpandEvent): void => {
    setExpandState((current) => reduceComposerExpand(current, event))
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  // 输入展开 (ticket 57): the App shell resolves the global ⌘E chord and
  // dispatches it to the mounted composer (see TOGGLE_EXPAND_EVENT). The
  // machine treats the chord as its own 'key' event: collapsed↔expanded
  // toggle, self-inverting — the keyboard twin of the button's click.
  useEffect(() => {
    function toggleFromKeymap(): void {
      transitionExpand('key')
    }
    window.addEventListener(TOGGLE_EXPAND_EVENT, toggleFromKeymap)
    return () => window.removeEventListener(TOGGLE_EXPAND_EVENT, toggleFromKeymap)
  }, [transitionExpand])

  function toggleExpand(): void {
    transitionExpand('toggle')
  }

  function dispatch(): void {
    const text = value.trim()
    const payload = images.map((img) => ({ mimeType: img.mimeType, data: img.data }))
    if (text === '' && payload.length === 0) return
    // Ticket 38: a hand-typed retired command never reaches the session —
    // neither as a normal send nor queued while the agent runs. Toast points
    // at the owning control instead.
    const gate = gateSlashCommand(text)
    if (gate) {
      onSlashHint(gate.hint)
      return
    }
    if (disabled) return
    if (busy) {
      if (queuedMode === 'steer') onSteer(text, payload)
      else onFollowUp(text, payload)
    } else {
      onSend(text, payload)
    }
    setValue('')
    setCaret(0)
    setImages([])
    setMenu(null)
    menuQueryRef.current = null
    // 输入展开 (ticket 49), collapse path ③: the message is on its way, so
    // the next turn starts from the resting composer.
    if (expanded) transitionExpand('sent')
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>): void {
    const files = [...event.clipboardData.items]
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
    if (files.length === 0) return
    event.preventDefault()
    for (const file of files) void addImageFile(file, 'Pasted image')
  }

  async function addImageFile(file: File, label: string): Promise<void> {
    const dataUrl = await readFileAsDataUrl(file)
    const data = dataUrl.slice(dataUrl.indexOf(',') + 1)
    setImages((prev) => [
      ...prev,
      { id: imageSeq++, mimeType: file.type || 'image/png', data, preview: dataUrl, label }
    ])
  }

  async function pickImages(): Promise<void> {
    const picked = await onPickImages()
    setImages((prev) => [
      ...prev,
      ...picked.map((img) => ({
        id: imageSeq++,
        mimeType: img.mimeType,
        data: img.data,
        preview: `data:${img.mimeType};base64,${img.data}`,
        label: 'Image'
      }))
    ])
  }

  const modelName = chat.model ? modelShortId(chat.model) : null
  const modelProviderName = chat.model
    ? chat.providers.find((p) => p.providerId === chat.model?.providerId)?.name ?? chat.model.providerId
    : null
  const modelFullLabel = modelName !== null ? `${modelProviderName}/${modelName}` : 'Select Model'
  const modelTooltip = chat.model ? modelFullLabel : 'Select model'
  const accessTooltip = accessModeLabel(chat.accessMode)
  const thinkingTooltip = chat.thinkingLevel ? thinkingLabel(chat.thinkingLevel) : 'Thinking'

  return (
    <section ref={sectionRef} className="composer" aria-label="Composer">
      {menu === 'slash' && slashRows.length > 0 && (
        <SlashMenu
          rows={slashRows}
          index={menuIndex}
          onIndex={setMenuIndex}
          onPickRow={pickTextMenuRow}
          onClose={() => setMenu(null)}
        />
      )}
      {menu === 'files' && fileRows.length > 0 && (
        <FileMenu
          rows={fileRows}
          index={menuIndex}
          truncated={filesTruncated}
          onIndex={setMenuIndex}
          onPickRow={pickTextMenuRow}
          onClose={() => setMenu(null)}
        />
      )}
      {menu === 'access' && (
        <AccessMenu current={chat.accessMode} chipRef={accessChipRef} onPick={onSetAccessMode} onClose={() => setMenu(null)} />
      )}
      {menu === 'model' && (
        <ModelMenu
          providers={chat.providers}
          current={chat.model}
          emptyHint={chat.modelMenuHint ?? undefined}
          chipRef={modelChipRef}
          onPick={onSetModel}
          onClose={() => setMenu(null)}
        />
      )}
      {menu === 'thinking' && (
        <ThinkingMenu
          levels={chat.availableLevels}
          current={chat.thinkingLevel}
          chipRef={thinkingChipRef}
          onPick={onSetThinkingLevel}
          onClose={() => setMenu(null)}
        />
      )}

      <textarea
        ref={textareaRef}
        className="composer-input"
        placeholder={
          disabled
            ? placeholder
            : busy
              ? queuedMode === 'steer'
                ? 'Steering — Enter injects into the current turn'
                : 'Follow-up — Enter queues after the current turn'
              : placeholder
        }
        aria-label="Message composer"
        value={value}
        disabled={disabled}
        onChange={(e) => handleChange(e.target)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onSelect={(e) => syncCaret(e.target as HTMLTextAreaElement)}
        onClick={(e) => syncCaret(e.target as HTMLTextAreaElement)}
      />

      {/* 输入展开 (ticket 49): the operator-approved deviation from ZCode —
          a persistent button at the card's top-right that opens the input
          IN PLACE at about half the main zone, pushing the transcript down
          (no overlay, no fullscreen). The global ⌘E chord (ticket 57) is
          this button's shortcut, so the tooltip shows ONLY the ⌘E keycap
          (Tooltip discipline — a shortcut replaces any description); the
          icon flips to the collapse glyph while expanded. */}
      <Tooltip shortcut="⌘E">
        <button
          type="button"
          className="composer-expand"
          aria-label="Expand input"
          aria-expanded={expanded}
          onClick={toggleExpand}
        >
          {expanded ? <FoldIcon size={14} /> : <UnfoldIcon size={14} />}
        </button>
      </Tooltip>

      {images.length > 0 && (
        <div className="composer-attachments" aria-label="Attached images">
          {images.map((img) => (
            <figure key={img.id} className="composer-attachment">
              <img src={img.preview} alt={img.label} />
              <button
                type="button"
                className="composer-attachment-remove"
                aria-label={`Remove ${img.label}`}
                onClick={() => setImages((prev) => prev.filter((a) => a.id !== img.id))}
              >
                <CloseIcon size={10} />
              </button>
            </figure>
          ))}
        </div>
      )}

      {busy && <QueuePanel queue={queue} onClear={onClearQueue} />}

      <footer className="composer-footer">
        <Tooltip label="Attach images">
          <button
            type="button"
            className="cmp-icon-btn"
            aria-label="Attach images"
            disabled={disabled}
            onClick={() => void pickImages()}
          >
            <PlusIcon />
          </button>
        </Tooltip>
        {/* Staged degradation (ZCode parity, ticket-29 feedback): labels
            shed as the composer narrows — icon-only access, name-only model,
            and the green strength bar replacing the thinking label. The
            hidden label stays reachable via tooltip + aria-label; the full
            stage renders the exact pre-density DOM (no tooltip trigger). */}
        <Tooltip label={density === 'full' ? undefined : accessTooltip}>
          <button
            type="button"
            ref={accessChipRef}
            className={chat.accessMode === 'full-access' ? 'cmp-chip cmp-access' : 'cmp-chip cmp-access cmp-access-soft'}
            aria-label={`Access mode: ${accessTooltip}`}
            disabled={disabled}
            onClick={() => setMenu(menu === 'access' ? null : 'access')}
          >
            <ShieldCheckIcon />
            {density === 'full' && <span>{accessModeLabel(chat.accessMode)}</span>}
            {density === 'full' && chat.accessIsDefault && <span className="cmp-chip-default">default</span>}
            {density !== 'minimal' && <span className="cmp-caret">⌄</span>}
          </button>
        </Tooltip>
        <span className="composer-spring" />
        {contextRing != null && <ContextRing input={contextRing} />}
        <Tooltip label={density === 'minimal' ? modelTooltip : undefined}>
          <button
            type="button"
            ref={modelChipRef}
            className="cmp-chip cmp-muted"
            aria-label={modelName !== null ? `Model: ${modelName}` : 'Select model'}
            disabled={disabled}
            onClick={() => setMenu(menu === 'model' ? null : 'model')}
          >
            {density === 'minimal' ? (
              <CubeIcon />
            ) : (
              <span>{density === 'compact' ? modelName ?? modelFullLabel : modelFullLabel}</span>
            )}
            {density === 'full' && chat.modelIsDefault && chat.model !== null && (
              <span className="cmp-chip-default">default</span>
            )}
            {density !== 'minimal' && <span className="cmp-caret">⌄</span>}
          </button>
        </Tooltip>
        <Tooltip label={density === 'full' ? undefined : thinkingTooltip}>
          <button
            type="button"
            ref={thinkingChipRef}
            className="cmp-chip cmp-muted"
            aria-label={`Thinking: ${thinkingTooltip}`}
            disabled={disabled || chat.availableLevels.length === 0}
            onClick={() => setMenu(menu === 'thinking' ? null : 'thinking')}
          >
            <GaugeIcon />
            {density === 'full' && <span>{chat.thinkingLevel ? thinkingLabel(chat.thinkingLevel) : 'Thinking'}</span>}
            {density === 'full' && chat.thinkingIsDefault && chat.thinkingLevel !== null && (
              <span className="cmp-chip-default">default</span>
            )}
            {density === 'compact' && (
              <span
                className={thinkingBarShimmers(chat.thinkingLevel) ? 'cmp-think-bar cmp-think-shimmer' : 'cmp-think-bar'}
                role="img"
                aria-label={`Thinking strength ${thinkingTooltip}`}
              >
                <span
                  className="cmp-think-bar-fill"
                  style={{ height: `${Math.round(thinkingBarFraction(chat.thinkingLevel) * 100)}%` }}
                />
              </span>
            )}
            {density === 'full' && <span className="cmp-caret">⌄</span>}
          </button>
        </Tooltip>
        {busy ? (
          <>
            <div className="cmp-queued-toggle" role="radiogroup" aria-label="While the agent runs">
              <Tooltip label="Inject into the current turn">
                <button
                  type="button"
                  className={queuedMode === 'steer' ? 'cmp-queued-opt cmp-queued-opt-on' : 'cmp-queued-opt'}
                  aria-pressed={queuedMode === 'steer'}
                  onClick={() => setQueuedMode('steer')}
                >
                  Steer
                </button>
              </Tooltip>
              <Tooltip label="Queue after the current turn">
                <button
                  type="button"
                  className={queuedMode === 'follow-up' ? 'cmp-queued-opt cmp-queued-opt-on' : 'cmp-queued-opt'}
                  aria-pressed={queuedMode === 'follow-up'}
                  onClick={() => setQueuedMode('follow-up')}
                >
                  Follow-up
                </button>
              </Tooltip>
            </div>
            <Tooltip label="Stop">
              <button type="button" className="cmp-stop" aria-label="Stop generating" onClick={onStop}>
                <StopIcon />
              </button>
            </Tooltip>
          </>
        ) : (
          <Tooltip label="Send">
            <button
              type="button"
              className="cmp-send"
              aria-label="Send message"
              disabled={disabled || (value.trim() === '' && images.length === 0)}
              onClick={dispatch}
            >
              <ArrowUpIcon />
            </button>
          </Tooltip>
        )}
      </footer>
    </section>
  )
}

function modelShortId(model: ModelRef): string {
  return model.modelId
}

/** Ticket 74: rebuild the local attachment cards from a restored draft —
 * fresh local ids, data-URL previews rebuilt from the raw base64 payload
 * (the bridge carries the contract shape, previews never leave this file). */
function localImagesFromDraft(draft: ComposerDraft | null | undefined): LocalImage[] {
  return (draft?.images ?? []).map((img) => ({
    id: imageSeq++,
    mimeType: img.mimeType,
    data: img.data,
    preview: `data:${img.mimeType};base64,${img.data}`,
    label: 'Image'
  }))
}

/** 输入展开 (ticket 49): the height of the main zone the composer lives in
 * — the chat view in-session, the empty state on New Task — so the
 * expanded height is about HALF THAT ZONE regardless of which composer
 * renders. Falls back to the window when no region matches (defensive;
 * both surfaces always match today). */
function mainRegionHeight(el: HTMLTextAreaElement | null): number {
  const region = el?.closest('.chat-view, .empty-state')
  if (region instanceof HTMLElement) return region.clientHeight
  return typeof window === 'undefined' ? Number.NaN : window.innerHeight
}

/** 输入展开 (ticket 49): pin the textarea to the expanded projection — the
 * one shared apply for the layout effect and the resize listener. */
function applyExpandHeight(el: HTMLTextAreaElement | null): void {
  if (el) el.style.height = `${composerExpandHeight(mainRegionHeight(el))}px`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read the image'))
    reader.readAsDataURL(file)
  })
}
