import { type JSX, type KeyboardEvent } from 'react'
import type { SlashCommandItem } from '../../../../shared/contract'
import { pickCommand } from '../../../../shared/composer/commands'
import { ComposerPopover, MenuHint, MenuRow, flatMenuKey } from './menus'

/**
 * The `/` command menu (screenshot 06): `/name` bold + description gray,
 * keyboard navigable, docked above the composer. Ticket 68: the composer
 * owns the trigger surface AND the filtering, and mounts this menu only
 * when rows exist — the zero-match state renders nothing (the "No matching
 * commands" box is gone) and Enter falls back to the send path.
 */
export function SlashMenu({
  rows,
  index,
  onIndex,
  onInsert,
  onBuiltin,
  onClose
}: {
  /** Pre-filtered rows; never empty (the composer gates on that). */
  rows: SlashCommandItem[]
  index: number
  onIndex: (i: number) => void
  onInsert: (text: string) => void
  onBuiltin: (name: string) => void
  onClose: () => void
}): JSX.Element {
  const clamped = Math.min(index, rows.length - 1)

  function pick(i: number): void {
    const row = rows[i]
    if (!row) return
    const decision = pickCommand(row)
    if (decision.kind === 'insert') onInsert(decision.text)
    else onBuiltin(decision.name)
    onClose()
  }

  function onKey(event: KeyboardEvent): void {
    flatMenuKey(event, rows.length, clamped, onIndex, pick, onClose)
  }

  return (
    <ComposerPopover label="Commands" onClose={onClose}>
      <>
        <div className="cmp-menu-list" role="listbox" aria-label="Commands" onKeyDown={onKey}>
          {rows.map((row, i) => (
            <MenuRow key={`${row.source}:${row.name}`} selected={i === clamped} onSelect={() => pick(i)} onHover={() => onIndex(i)}>
              <span className="cmp-cmd-row">
                <span className="cmp-cmd-name">/{row.name}</span>
                <span className="cmp-menu-desc">
                  {row.description}
                  {row.argumentHint ? ` ${row.argumentHint}` : ''}
                </span>
              </span>
            </MenuRow>
          ))}
        </div>
        <MenuHint />
      </>
    </ComposerPopover>
  )
}

/**
 * The @-mention file menu: ranked candidate paths from the host's
 * `file_list` reply (correlated by requestId outside this component).
 * Ticket 68: same rule as the slash menu — pre-filtered by the composer,
 * mounted only when rows exist, never a "No matching files" box.
 */
export function FileMenu({
  rows,
  index,
  onIndex,
  onPick,
  onClose
}: {
  /** Pre-filtered rows; never empty (the composer gates on that). */
  rows: string[]
  index: number
  onIndex: (i: number) => void
  onPick: (path: string) => void
  onClose: () => void
}): JSX.Element {
  const clamped = Math.min(index, rows.length - 1)

  function pick(i: number): void {
    const row = rows[i]
    if (!row) return
    onPick(row)
    onClose()
  }

  function onKey(event: KeyboardEvent): void {
    flatMenuKey(event, rows.length, clamped, onIndex, pick, onClose)
  }

  return (
    <ComposerPopover label="Attach context" onClose={onClose}>
      <>
        <div className="cmp-menu-list" role="listbox" aria-label="Attach context" onKeyDown={onKey}>
          {rows.map((row, i) => (
            <MenuRow key={row} selected={i === clamped} onSelect={() => pick(i)} onHover={() => onIndex(i)}>
              <span className="cmp-file-row">{renderPath(row)}</span>
            </MenuRow>
          ))}
        </div>
        <MenuHint />
      </>
    </ComposerPopover>
  )
}

function renderPath(path: string): JSX.Element {
  const cut = path.lastIndexOf('/')
  if (cut === -1) return <span className="cmp-file-name">{path}</span>
  return (
    <>
      <span className="cmp-file-dir">{path.slice(0, cut + 1)}</span>
      <span className="cmp-file-name">{path.slice(cut + 1)}</span>
    </>
  )
}
