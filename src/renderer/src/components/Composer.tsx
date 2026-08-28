import { useEffect, useRef, useState, type ClipboardEvent, type JSX, type KeyboardEvent } from 'react'
import type { AccessMode, ImageAttachment, ModelRef, ProviderModels, SlashCommandItem, ThinkingLevel } from '../../../shared/contract'
import type { ChatQueue } from '../../../shared/chat-reducer'
import { applyMention, mentionQueryAt } from '../../../shared/composer/mention'
import { accessModeLabel } from '../../../shared/composer/access'
import { AccessMenu, ModelMenu, ThinkingMenu, thinkingLabel } from './composer/menus'
import { FileMenu, SlashMenu } from './composer/list-menus'
import { ArrowUpIcon, CloseIcon, GaugeIcon, PlusIcon, ShieldCheckIcon, StopIcon } from './icons'
import QueuePanel from './QueuePanel'

/** Composer-relevant slices of the chat state (all contract-pushed). */
export interface ComposerChat {
  accessMode: AccessMode
  model: ModelRef | null
  thinkingLevel: ThinkingLevel | null
  availableLevels: ThinkingLevel[]
  providers: ProviderModels[]
  slashCommands: SlashCommandItem[]
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
}

interface ComposerProps extends ComposerApi {
  busy: boolean
  disabled: boolean
  placeholder: string
  chat: ComposerChat
  /** Live steering/follow-up queue (SDK-authoritative, contract-pushed). */
  queue: ChatQueue
}

type MenuState = 'slash' | 'files' | 'access' | 'model' | 'thinking' | null

/** Window events the `/model` and `/thinking` built-ins dispatch (App → Composer). */
export const OPEN_MODEL_MENU_EVENT = 'picode:open-model-menu'
export const OPEN_THINKING_MENU_EVENT = 'picode:open-thinking-menu'

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
  onBuiltinCommand
}: ComposerProps): JSX.Element {
  const [value, setValue] = useState('')
  const [caret, setCaret] = useState(0)
  const [images, setImages] = useState<LocalImage[]>([])
  const [queuedMode, setQueuedMode] = useState<'follow-up' | 'steer'>('follow-up')
  const [menu, setMenu] = useState<MenuState>(null)
  const [menuIndex, setMenuIndex] = useState(0)
  const [fileOptions, setFileOptions] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileSeq = useRef(0)
  const fileListRequest = useRef<string | null>(null)
  const fileDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mention = mentionQueryAt(value, caret)
  const slashQuery = value.startsWith('/') ? value.slice(1) : null

  // `file_list` replies correlate here — request/response, not reducer state.
  useEffect(() => {
    return window.picode.chat.onHostEvent((event) => {
      if (event.type === 'file_list' && event.requestId === fileListRequest.current) {
        setFileOptions(event.files)
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

  function syncCaret(el: HTMLTextAreaElement): void {
    const nextMention = mentionQueryAt(el.value, el.selectionStart)
    setCaret(el.selectionStart)
    if (nextMention !== null) {
      if (menu === null) {
        setMenu('files')
        setMenuIndex(0)
        refreshFileList(nextMention)
      }
      return
    }
    // Triggers gone → close text menus.
    if (menu === 'files' || (menu === 'slash' && !el.value.startsWith('/'))) setMenu(null)
  }

  function handleChange(el: HTMLTextAreaElement): void {
    const next = el.value
    setValue(next)
    setCaret(el.selectionStart)
    if (next.startsWith('/')) {
      setMenu('slash')
      setMenuIndex(0)
      return
    }
    const query = mentionQueryAt(next, el.selectionStart)
    if (query !== null) {
      setMenu('files')
      setMenuIndex(0)
      refreshFileList(query)
      return
    }
    if (menu === 'slash' || menu === 'files') setMenu(null)
  }

  function handleMenuKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (menu !== 'slash' && menu !== 'files') return false
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setMenuIndex((i) => i + 1)
      return true
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setMenuIndex((i) => Math.max(0, i - 1))
      return true
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const rows = document.querySelectorAll('.cmp-popover .cmp-menu-row')
      if (rows.length === 0) {
        // No matches — send the raw text (the SDK passes unknown /commands
        // through untouched).
        setMenu(null)
        dispatch()
        return true
      }
      const clamped = Math.min(menuIndex, rows.length - 1)
      ;(rows[clamped] as HTMLButtonElement | undefined)?.click()
      return true
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setMenu(null)
      return true
    }
    return false
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (handleMenuKey(event)) return
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      dispatch()
    }
  }

  function dispatch(): void {
    const text = value.trim()
    const payload = images.map((img) => ({ mimeType: img.mimeType, data: img.data }))
    if (text === '' && payload.length === 0) return
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

  const modelLabel = chat.model
    ? `${chat.providers.find((p) => p.providerId === chat.model?.providerId)?.name ?? chat.model.providerId}/${modelShortId(chat.model)}`
    : 'Select Model'

  return (
    <section className="composer" aria-label="Composer">
      {menu === 'slash' && (
        <SlashMenu
          commands={chat.slashCommands}
          query={slashQuery ?? ''}
          index={menuIndex}
          onIndex={setMenuIndex}
          onInsert={(text) => updateValue(text)}
          onBuiltin={(name) => {
            onBuiltinCommand(name)
            setValue('')
            setMenu(null)
          }}
          onClose={() => setMenu(null)}
        />
      )}
      {menu === 'files' && (
        <FileMenu
          files={fileOptions}
          query={mention ?? ''}
          index={menuIndex}
          onIndex={setMenuIndex}
          onPick={(path) => {
            const applied = applyMention(value, caret, path)
            updateValue(applied.text, applied.caret)
          }}
          onClose={() => setMenu(null)}
        />
      )}
      {menu === 'access' && (
        <AccessMenu current={chat.accessMode} onPick={onSetAccessMode} onClose={() => setMenu(null)} />
      )}
      {menu === 'model' && (
        <ModelMenu providers={chat.providers} current={chat.model} onPick={onSetModel} onClose={() => setMenu(null)} />
      )}
      {menu === 'thinking' && (
        <ThinkingMenu
          levels={chat.availableLevels}
          current={chat.thinkingLevel}
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
        <button
          type="button"
          className="cmp-icon-btn"
          aria-label="Attach images"
          title="Attach images"
          disabled={disabled}
          onClick={() => void pickImages()}
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          className={chat.accessMode === 'full-access' ? 'cmp-chip cmp-access' : 'cmp-chip cmp-access cmp-access-soft'}
          disabled={disabled}
          onClick={() => setMenu(menu === 'access' ? null : 'access')}
        >
          <ShieldCheckIcon />
          <span>{accessModeLabel(chat.accessMode)}</span>
          <span className="cmp-caret">⌄</span>
        </button>
        <span className="composer-spring" />
        <button
          type="button"
          className="cmp-chip cmp-muted"
          disabled={disabled}
          onClick={() => setMenu(menu === 'model' ? null : 'model')}
        >
          <span>{modelLabel}</span>
          <span className="cmp-caret">⌄</span>
        </button>
        <button
          type="button"
          className="cmp-chip cmp-muted"
          disabled={disabled || chat.availableLevels.length === 0}
          onClick={() => setMenu(menu === 'thinking' ? null : 'thinking')}
        >
          <GaugeIcon />
          <span>{chat.thinkingLevel ? thinkingLabel(chat.thinkingLevel) : 'Thinking'}</span>
          <span className="cmp-caret">⌄</span>
        </button>
        {busy ? (
          <>
            <div className="cmp-queued-toggle" role="radiogroup" aria-label="While the agent runs">
              <button
                type="button"
                className={queuedMode === 'steer' ? 'cmp-queued-opt cmp-queued-opt-on' : 'cmp-queued-opt'}
                aria-pressed={queuedMode === 'steer'}
                title="Inject into the current turn"
                onClick={() => setQueuedMode('steer')}
              >
                Steer
              </button>
              <button
                type="button"
                className={queuedMode === 'follow-up' ? 'cmp-queued-opt cmp-queued-opt-on' : 'cmp-queued-opt'}
                aria-pressed={queuedMode === 'follow-up'}
                title="Queue after the current turn"
                onClick={() => setQueuedMode('follow-up')}
              >
                Follow-up
              </button>
            </div>
            <button type="button" className="cmp-stop" aria-label="Stop generating" onClick={onStop}>
              <StopIcon />
            </button>
          </>
        ) : (
          <button
            type="button"
            className="cmp-send"
            aria-label="Send message"
            disabled={disabled || (value.trim() === '' && images.length === 0)}
            onClick={dispatch}
          >
            <ArrowUpIcon />
          </button>
        )}
      </footer>
    </section>
  )
}

function modelShortId(model: ModelRef): string {
  return model.modelId
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read the image'))
    reader.readAsDataURL(file)
  })
}
