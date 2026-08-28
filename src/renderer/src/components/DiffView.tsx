import { useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { ReviewFileEntry } from '../../../shared/review/types'
import type { DiffRow } from '../../../shared/review/types'
import { unifiedRenderRows } from '../../../shared/review/parse'
import { splitRenderRows, type SplitRow } from '../../../shared/review/split'
import { DIFF_ROW_HEIGHT_PX, visibleRange } from '../../../shared/review/window'

type DiffMode = 'unified' | 'split'

interface DiffViewProps {
  file: ReviewFileEntry
  mode: DiffMode
}

const SIGN: Record<string, string> = { context: ' ', del: '−', add: '+' }

function lineNo(row: DiffRow): string {
  if (row.kind === 'add') return String(row.newLine)
  if (row.kind === 'del' || row.kind === 'context') return String(row.oldLine)
  return ''
}

function UnifiedLine({ row }: { row: DiffRow }): JSX.Element {
  if (row.kind === 'meta') {
    return (
      <div className="diff-line diff-meta">
        <span className="diff-text">{row.text}</span>
      </div>
    )
  }
  const oldNo = row.kind === 'add' ? '' : String(row.oldLine)
  const newNo = row.kind === 'del' ? '' : String(row.newLine)
  return (
    <div className={`diff-line diff-${row.kind}`}>
      <span className="diff-gutter">{oldNo}</span>
      <span className="diff-gutter">{newNo}</span>
      <span className="diff-sign">{SIGN[row.kind]}</span>
      <span className="diff-text">{row.text}</span>
    </div>
  )
}

function SplitSide({ pair, side }: { pair: SplitRow; side: 'left' | 'right' }): JSX.Element {
  const cell = pair[side]
  if (cell === null || cell.kind === 'meta') {
    return <div className="diff-cell diff-blank" />
  }
  return (
    <div className={`diff-cell diff-${cell.kind}`}>
      <span className="diff-gutter">{lineNo(cell)}</span>
      <span className="diff-sign">{SIGN[cell.kind]}</span>
      <span className="diff-text">{cell.text}</span>
    </div>
  )
}

/**
 * Read-only diff renderer for one file. Large patches scroll smoothly
 * because only the visible row window (plus a small overscan) is mounted;
 * the math comes from the tested `visibleRange` helper and rows have a
 * fixed height, so the scroll space is two spacer blocks.
 */
export default function DiffView({ file, mode }: DiffViewProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(480)

  const rows = useMemo(() => (mode === 'split' ? splitRenderRows(file) : unifiedRenderRows(file)), [file, mode])

  // Measure the viewport (panel width and window size both affect it).
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = (): void => setViewportHeight(el.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (file.binary) {
    return (
      <div className="diff-placeholder">
        <p>Binary file not shown.</p>
      </div>
    )
  }
  if (file.hunks.length === 0) {
    return (
      <div className="diff-placeholder">
        <p>No content changes in this file.</p>
      </div>
    )
  }

  const { start, end } = visibleRange(scrollTop, viewportHeight, rows.length)
  const slice = rows.slice(start, end)

  return (
    <div ref={scrollRef} className="diff-scroll" onScroll={() => setScrollTop(scrollRef.current?.scrollTop ?? 0)}>
      <div className={`diff-inner diff-mode-${mode}`} style={{ paddingTop: start * DIFF_ROW_HEIGHT_PX, paddingBottom: (rows.length - end) * DIFF_ROW_HEIGHT_PX }}>
        {slice.map((entry, index) => {
          if (entry.kind === 'hunk-header') {
            return (
              <div key={`h${index}`} className="diff-hunk-header">
                {entry.header}
              </div>
            )
          }
          if (entry.kind === 'row') return <UnifiedLine key={`u${index}`} row={entry.row} />
          if (entry.left !== null && entry.left.kind === 'meta') {
            return (
              <div key={`m${index}`} className="diff-line diff-meta">
                <span className="diff-text">{entry.left.text}</span>
              </div>
            )
          }
          return (
            <div key={`s${index}`} className="diff-split-row">
              <SplitSide pair={entry} side="left" />
              <SplitSide pair={entry} side="right" />
            </div>
          )
        })}
      </div>
    </div>
  )
}
