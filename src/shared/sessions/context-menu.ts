/**
 * Session-row context menu model (ticket 35, against z-context-menu.png):
 * nine entries in ZCode's group order —
 *
 *   Pin task / Rename task / Archive task / Mark as Unread(↔Read)
 *   ─
 *   Reveal in Finder / Copy task path / Copy session file path / Copy session ID
 *   ─
 *   View call trace
 *
 * ZCode entries with no PiCode semantics (open in split, go-to-config,
 * feedback) are deliberately absent. The model is pure — pin/unpin and
 * unread/read label flips are decided here so the renderer only renders —
 * table-tested at Seam-1. All copy is English (vocabulary constraint).
 */

/** What one context-menu entry asks the app to do. `toggle-pin` and
 * `rename` are handled inside the sidebar (the pin preference and the
 * inline rename input live there); everything else is dispatched up to the
 * shell. `view-trace` seats the entry in ticket 35 — its consumption (the
 * call-trace tab) lands with ticket 36. */
export type SessionMenuAction =
  | 'toggle-pin'
  | 'rename'
  | 'archive'
  | 'toggle-unread'
  | 'reveal-in-finder'
  | 'copy-task-path'
  | 'copy-session-file'
  | 'copy-session-id'
  | 'view-trace'

/** The actions dispatched past the sidebar (everything except the two the
 * sidebar owns), plus `restore` — that one never appears in the row menu;
 * it comes from the archive view's one-click restore button. */
export type SessionRowAction = Exclude<SessionMenuAction, 'toggle-pin' | 'rename'> | 'restore'

export interface SessionMenuEntry {
  action: SessionMenuAction
  label: string
}

/** The menu's three groups; the renderer draws a separator BETWEEN groups
 * (z-context-menu.png's two hairlines). */
export function sessionMenuGroups(pinned: boolean, unread: boolean): SessionMenuEntry[][] {
  return [
    [
      { action: 'toggle-pin', label: pinned ? 'Unpin task' : 'Pin task' },
      { action: 'rename', label: 'Rename task' },
      { action: 'archive', label: 'Archive task' },
      { action: 'toggle-unread', label: unread ? 'Mark as Read' : 'Mark as Unread' }
    ],
    [
      { action: 'reveal-in-finder', label: 'Reveal in Finder' },
      { action: 'copy-task-path', label: 'Copy task path' },
      { action: 'copy-session-file', label: 'Copy session file path' },
      { action: 'copy-session-id', label: 'Copy session ID' }
    ],
    [{ action: 'view-trace', label: 'View call trace' }]
  ]
}

/** Flat label list (test/inspection convenience). */
export function sessionMenuLabels(groups: readonly SessionMenuEntry[][]): string[] {
  return groups.flat().map((entry) => entry.label)
}
