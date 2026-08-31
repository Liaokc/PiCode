import { createContext, useCallback, useContext, useEffect, useRef, useState, type Context, type Dispatch, type JSX, type ReactNode, type RefObject, type SetStateAction } from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import Tooltip from './Tooltip'
import { CheckIcon, CloseIcon, CodeIcon, CopyIcon, ExpandArrowsIcon, EyeIcon, WrapTextIcon } from './icons'
import { blockKey, codeLanguage, hastText, tableToMarkdown } from '../../../shared/markdown-blocks'

/**
 * Markdown rendering for assistant text parts (screenshot 04: rich markdown
 * with highlighted code). Streams render incrementally — partial markdown is
 * simply re-parsed on each delta. While `streaming`, a blinking caret follows
 * the last rendered block (CSS ::after).
 *
 * Block chrome (ticket 16): fenced code blocks render as cards (language
 * label + wrap toggle + copy) and tables as containers with copy / preview /
 * expand controls above them, matching the ZCode baseline. The overrides are
 * module-scope so streaming deltas never change component identity, and all
 * per-block button state (copied ✓, wrapped, expanded) is lifted into a
 * context keyed by the block's start position — a re-parse that remounts a
 * card cannot flicker the buttons (see `blockKey`).
 */

/** Feedback window after a successful copy, per ticket 16 (~1.5s). */
const COPIED_FEEDBACK_MS = 1500

/** Per-block UI state, keyed by `blockKey` (start position). */
interface BlockUiState {
  copied: ReadonlySet<string>
  wrapped: ReadonlySet<string>
  expanded: ReadonlySet<string>
  markCopied: (key: string) => void
  toggleWrapped: (key: string) => void
  toggleExpanded: (key: string) => void
}

const BlockUiContext: Context<BlockUiState | null> = createContext<BlockUiState | null>(null)

/** Flip one key in a state set (wrap / expand toggles share the shape). */
function toggleInSet(set: Dispatch<SetStateAction<ReadonlySet<string>>>, key: string): void {
  set((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
}

function useBlockUi(): BlockUiState {
  const ui = useContext(BlockUiContext)
  if (ui === null) throw new Error('block chrome used outside Markdown')
  return ui
}

/** Per-Markdown-instance block-state store (survives child remounts). */
function useBlockUiStore(): BlockUiState {
  const [copied, setCopied] = useState<ReadonlySet<string>>(new Set())
  const [wrapped, setWrapped] = useState<ReadonlySet<string>>(new Set())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const copiedTimers: RefObject<Map<string, ReturnType<typeof setTimeout>>> = useRef(new Map())

  const markCopied = useCallback((key: string): void => {
    setCopied((prev) => new Set(prev).add(key))
    const timers = copiedTimers.current
    const previous = timers.get(key)
    if (previous !== undefined) clearTimeout(previous)
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key)
        setCopied((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }, COPIED_FEEDBACK_MS)
    )
  }, [])

  const toggleWrapped = useCallback((key: string): void => {
    toggleInSet(setWrapped, key)
  }, [])

  const toggleExpanded = useCallback((key: string): void => {
    toggleInSet(setExpanded, key)
  }, [])

  return { copied, wrapped, expanded, markCopied, toggleWrapped, toggleExpanded }
}

interface PreProps extends ExtraProps {
  children?: ReactNode
}

/** Header row of a code card: language label left, wrap + copy right. */
function CodeBlockCard({ node, children }: PreProps): JSX.Element {
  const ui = useBlockUi()
  const key = blockKey(node)
  const language = codeLanguage(node)
  const copied = key !== null && ui.copied.has(key)
  const wrapped = key !== null && ui.wrapped.has(key)

  async function copy(): Promise<void> {
    if (node === undefined) return
    try {
      await navigator.clipboard.writeText(hastText(node))
      if (key !== null) ui.markCopied(key)
    } catch {
      // Clipboard unavailable — leave the card as-is.
    }
  }

  return (
    <div className="md-code-card">
      <div className="md-code-head">
        {language !== null && (
          <span className="md-code-lang">
            <CodeIcon size={12} />
            {language}
          </span>
        )}
        <span className="md-code-tools">
          <Tooltip label="Wrap lines">
            <button
              type="button"
              className={wrapped ? 'md-block-btn md-block-btn-on' : 'md-block-btn'}
              aria-label="Wrap lines"
              aria-pressed={wrapped}
              disabled={key === null}
              onClick={() => {
                if (key !== null) ui.toggleWrapped(key)
              }}
            >
              <WrapTextIcon size={13} />
            </button>
          </Tooltip>
          <Tooltip label="Copy">
            <button
              type="button"
              className="md-block-btn"
              aria-label="Copy code"
              onClick={() => void copy()}
            >
              {copied ? <CheckIcon size={13} className="md-copy-copied" /> : <CopyIcon size={13} />}
            </button>
          </Tooltip>
        </span>
      </div>
      <pre className={wrapped ? 'md-code-pre md-code-pre-wrapped' : 'md-code-pre'}>{children}</pre>
    </div>
  )
}

interface TableProps extends ExtraProps {
  children?: ReactNode
}

/** Table container: always-visible copy / preview / expand controls above the card. */
function TableCard({ node, children }: TableProps): JSX.Element {
  const ui = useBlockUi()
  const key = blockKey(node)
  const [previewing, setPreviewing] = useState(false)
  const copied = key !== null && ui.copied.has(key)
  const expanded = key !== null && ui.expanded.has(key)

  // Escape closes the preview from anywhere (the backdrop never holds focus).
  useEffect(() => {
    if (!previewing) return
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') setPreviewing(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [previewing])

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(tableToMarkdown(node))
      if (key !== null) ui.markCopied(key)
    } catch {
      // Clipboard unavailable — leave the card as-is.
    }
  }

  return (
    <div className="md-table-wrap">
      <div className="md-table-tools">
        <Tooltip label="Copy">
          <button type="button" className="md-block-btn" aria-label="Copy table" onClick={() => void copy()}>
            {copied ? <CheckIcon size={13} className="md-copy-copied" /> : <CopyIcon size={13} />}
          </button>
        </Tooltip>
        <Tooltip label={previewing ? 'Close table preview' : 'Preview table'}>
          <button
            type="button"
            className="md-block-btn"
            aria-label={previewing ? 'Close table preview' : 'Preview table'}
            aria-expanded={previewing}
            onClick={() => setPreviewing((prev) => !prev)}
          >
            <EyeIcon size={13} />
          </button>
        </Tooltip>
        <Tooltip label={expanded ? 'Collapse table' : 'Expand table'}>
          <button
            type="button"
            className={expanded ? 'md-block-btn md-block-btn-on' : 'md-block-btn'}
            aria-label={expanded ? 'Collapse table' : 'Expand table'}
            aria-pressed={expanded}
            disabled={key === null}
            onClick={() => {
              if (key !== null) ui.toggleExpanded(key)
            }}
          >
            <ExpandArrowsIcon size={13} />
          </button>
        </Tooltip>
      </div>
      <div className={expanded ? 'md-table-scroll md-table-scroll-expanded' : 'md-table-scroll'}>
        {/* react-markdown replaces the table element itself — its children are
          bare thead/tbody, so the container must re-wrap them in a real
          <table> (anonymous-table fixup would otherwise fake the layout). */}
        <table>{children}</table>
      </div>
      {previewing && (
        <div className="md-table-preview-backdrop" role="presentation" onClick={() => setPreviewing(false)}>
          <div
            className="md-table-preview"
            role="dialog"
            aria-modal="true"
            aria-label="Table preview"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="md-table-preview-head">
              <span>Table preview</span>
              <button
                type="button"
                className="md-block-btn"
                aria-label="Close table preview"
                autoFocus
                onClick={() => setPreviewing(false)}
              >
                <CloseIcon size={13} />
              </button>
            </div>
            <div className="md-table-preview-body">
              <table>{children}</table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Module scope: the override component identities must never change between
// renders, or streaming deltas would remount every card (state flicker).
const components: Components = {
  pre: CodeBlockCard,
  table: TableCard
}

export default function Markdown({
  text,
  streaming = false,
  chrome = true
}: {
  text: string
  streaming?: boolean
  /** Block chrome (code/table cards) — the transcript's default; the preview
   * reader turns it off to keep its bare reader layout (ticket 16 scope). */
  chrome?: boolean
}): JSX.Element {
  const store = useBlockUiStore()
  return (
    <BlockUiContext.Provider value={chrome ? store : null}>
      <div className={streaming ? 'md md-streaming' : 'md'}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={chrome ? components : undefined}>
          {text}
        </ReactMarkdown>
      </div>
    </BlockUiContext.Provider>
  )
}
