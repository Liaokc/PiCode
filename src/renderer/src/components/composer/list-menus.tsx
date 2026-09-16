import { type JSX, type KeyboardEvent } from 'react'
import type { SlashCommandItem } from '../../../../shared/contract'
import { clampIndex, flatMenuKey } from '../../../../shared/composer/menu-keys'
import { ComposerPopover, MenuHint, MenuRow } from './menus'

/**
 * The `/` command menu (screenshot 06): `/name` bold + description gray,
 * keyboard navigable, docked above the composer. Ticket 68: the composer
 * owns the trigger surface AND the filtering, and mounts this menu only
 * when rows exist — the zero-match state renders nothing (the "No matching
 * commands" box is gone) and Enter falls back to the send path.
 *
 * Ticket 69: this component is purely presentational. The pick decision
 * (insert vs built-in) lives in ONE place — the composer's pickTextMenuRow —
 * so the keyboard's Enter and a row's mouse click can never diverge.
 */
export function SlashMenu({
  rows,
  index,
  onIndex,
  onPickRow,
  onClose
}: {
  /** Pre-filtered rows; never empty (the composer gates on that). */
  rows: SlashCommandItem[]
  index: number
  onIndex: (i: number) => void
  /** The one pick path (ticket 69) — mouse clicks and keyboard Enter
   * both land here, in the composer. */
  onPickRow: (i: number) => void
  onClose: () => void
}): JSX.Element {
  const clamped = clampIndex(index, rows.length)

  function onKey(event: KeyboardEvent): void {
    flatMenuKey(event, rows.length, clamped, onIndex, onPickRow, onClose)
  }

  return (
    <ComposerPopover label="Commands" onClose={onClose}>
      <>
        <div className="cmp-menu-list" role="listbox" aria-label="Commands" onKeyDown={onKey}>
          {rows.map((row, i) => (
            <MenuRow key={`${row.source}:${row.name}`} selected={i === clamped} onSelect={() => onPickRow(i)} onHover={() => onIndex(i)}>
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
 * Ticket 69: presentational like the slash menu — the mention application
 * lives in the composer's single pick path.
 * Ticket 71: `truncated` appends the honest hint row at the list's tail —
 * only a capped walk sets it, so a missing candidate is explainable. It is
 * NOT a listbox row: keyboard selection never lands here.
 */
export function FileMenu({
  rows,
  index,
  truncated,
  onIndex,
  onPickRow,
  onClose
}: {
  /** Pre-filtered rows; never empty (the composer gates on that). */
  rows: string[]
  index: number
  /** The last candidate set was cut by the walk's entry cap. */
  truncated?: boolean
  onIndex: (i: number) => void
  /** The one pick path (ticket 69) — mouse clicks and keyboard Enter
   * both land here, in the composer. */
  onPickRow: (i: number) => void
  onClose: () => void
}): JSX.Element {
  const clamped = clampIndex(index, rows.length)

  function onKey(event: KeyboardEvent): void {
    flatMenuKey(event, rows.length, clamped, onIndex, onPickRow, onClose)
  }

  return (
    <ComposerPopover label="Attach context" onClose={onClose}>
      <>
        <div className="cmp-menu-list" role="listbox" aria-label="Attach context" onKeyDown={onKey}>
          {rows.map((row, i) => (
            <MenuRow key={row} selected={i === clamped} onSelect={() => onPickRow(i)} onHover={() => onIndex(i)}>
              <span className="cmp-file-row">{renderPath(row)}</span>
            </MenuRow>
          ))}
        </div>
        {truncated ? <div className="cmp-menu-truncated">truncated</div> : null}
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
