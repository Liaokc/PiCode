/**
 * Pane open/close motion model (ticket 40): the dual-variable projection
 * behind the three collapsible panes — left sidebar (⌘B), side panel
 * (⌥⌘B), bottom dock (⌘J/⌥⌘J).
 *
 * ZCode-calibrated motion grammar (200ms ease-out, size + opacity together,
 * closed end state = size 0 + opacity 0 + pointer-events none):
 *
 *   - the OPEN/CLOSE variable (`--sidebar-w` / `--panel-w` / `--dock-h`)
 *     carries the ANIMATED pane size and is `0px` while closed, so the pane
 *     edge slides out of / back into its docking edge (left / right / bottom);
 *   - the CONTENT variable (`--sidebar-content-w` / `--panel-content-w` /
 *     `--dock-content-h`) carries the pane's REAL size at ALL times, so pane
 *     content is CLIPPED by the pane's clip wrapper instead of reflowing
 *     while the size animates — sidebar/panel text never re-wraps mid-motion
 *     and the terminal's xterm never refits per-frame (the ResizeObserver
 *     inside the pinned content stays silent).
 *
 * Pure and table-driven (Seam-1): App projects (open, size) per pane and
 * sets the six custom properties on `.app-shell`; the pane containers
 * consume them through app.css. Resizer drags bypass the projection
 * entirely (direct inline writes, ticket 30) and suppress the size
 * transition for the duration of the drag, so the 1:1 direct-write feel
 * never regresses.
 */

export interface PaneMotion {
  /** The animated pane size: `${size}px` when open, `0px` when closed. */
  readonly pane: string;
  /** The content's real size: `${size}px` at all times (never collapses
   * while a size exists — that constancy is the clip-not-reflow contract). */
  readonly content: string;
}

/** (open, size) → open/close variable + content variable. Non-positive
 * sizes collapse both variables (a pane with no real size has nothing to
 * pin its content to); the reducers' clamps keep real sizes positive. */
export function projectPaneMotion(open: boolean, size: number): PaneMotion {
  const px = `${Math.max(0, Math.round(size))}px`;
  return { pane: open ? px : "0px", content: px };
}
