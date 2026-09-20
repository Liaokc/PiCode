/**
 * Group fold shape machine (ticket 39, spec R5): the Projects list's per-
 * group fold and Show more/Show less pagination as ONE pure reducer — the
 * panel-model precedent. The sidebar only dispatches; every projection the
 * DOM needs (how many rows, which control, folded or not) is a named
 * function here, so the whole shape table is testable without React.
 *
 * Semantics (Q5/Q9 decisions baked in):
 * - a group starts UNFOLDED showing the first SHOW_FIRST rows
 * - "Show more" reveals SHOW_MORE_STEP more rows per click, clamped to the
 *   group's size; once everything is shown the control flips to "Show less"
 * - "Show less" resets to the initial SHOW_FIRST rows in ONE click
 * - the group ROW's click folds/unfolds: folding hides ALL rows but keeps
 *   the pagination position; unfolding restores exactly the pre-fold shape
 * - there is no persistence here: shapes are memory-level, a fresh app
 *   starts every group at the default (restart returns to five)
 * - a folded group's header carries no count (Q9) — the header renders no
 *   count from this model at all
 *
 * Pure: no I/O, no time — table-tested at Seam-1.
 */

/** Rows shown per project group before "Show more" (and after "Show less"). */
export const SHOW_FIRST = 5

/** Extra rows each "Show more" click reveals. */
export const SHOW_MORE_STEP = 5

/** Fold/pagination shape of ONE project group. */
export interface GroupFoldShape {
  /** Rows shown while unfolded (clamped to the group's size at read time). */
  visible: number
  /** Folded groups render zero rows but keep `visible` for the unfold. */
  folded: boolean
}

/** The sidebar's fold state: one shape per group cwd. Groups missing from
 * the map read at the DEFAULT shape (unfolded, SHOW_FIRST) — the state only
 * ever stores what the user actually changed. */
export type GroupFoldState = Readonly<Record<string, GroupFoldShape>>

export type GroupFoldAction =
  /** The group ROW's click: fold when unfolded, unfold when folded. */
  | { type: 'toggle-fold'; cwd: string }
  /** The Projects section row's aggregate pair (ticket 95): one click folds
 * or unfolds EVERY LISTED group at once. The listed cwds ride the action —
 * the sidebar passes exactly the groups it renders, so hidden projects
 * (ticket 19) keep their exact shape. Each group's `visible` step is
 * preserved either way — collapse-all 记形状 / expand-all 复原, the
 * manual-toggle semantics scaled to every group (ticket 39 untouched). */
  | { type: 'collapse-all'; cwds: readonly string[] }
  | { type: 'expand-all'; cwds: readonly string[] }
  /** Reveal SHOW_MORE_STEP more rows, clamped to the group's total. */
  | { type: 'show-more'; cwd: string; total: number }
  /** Reset to the initial page in one click. */
  | { type: 'show-less'; cwd: string }

/** The shape every group starts at — and returns to after a restart (Q5:
 * memory-level, never persisted). */
export function defaultFoldShape(): GroupFoldShape {
  return { visible: SHOW_FIRST, folded: false }
}

export function initialFoldState(): GroupFoldState {
  return {}
}

/** Shape of one group as the machine holds it; groups missing from the map
 * read at the default shape. */
export function foldShapeOf(state: GroupFoldState, cwd: string): GroupFoldShape {
  return state[cwd] ?? defaultFoldShape()
}

/** Rows of a group the list should render: zero when folded, else the
 * remembered step clamped to the group's CURRENT size (lists shrink and
 * grow on disk — a stale step must never overflow or go negative). */
export function visibleRowCount(state: GroupFoldState, cwd: string, total: number): number {
  const shape = foldShapeOf(state, cwd)
  if (shape.folded) return 0
  return Math.min(Math.max(shape.visible, 0), Math.max(total, 0))
}

/** Which pagination control renders under a group's rows: null when the
 * group fits the initial page or is folded; 'more' while rows remain
 * hidden; 'less' once everything is shown (one click back to SHOW_FIRST). */
export function showMoreControl(state: GroupFoldState, cwd: string, total: number): 'more' | 'less' | null {
  const shape = foldShapeOf(state, cwd)
  if (shape.folded || total <= SHOW_FIRST) return null
  return visibleRowCount(state, cwd, total) < total ? 'more' : 'less'
}

export function groupFoldReducer(state: GroupFoldState, action: GroupFoldAction): GroupFoldState {
  switch (action.type) {
    case 'toggle-fold': {
      const shape = foldShapeOf(state, action.cwd)
      // Folding keeps `visible` untouched — that IS the shape memory the
      // unfold restores (collapse 记形状 / expand 复原).
      return { ...state, [action.cwd]: { ...shape, folded: !shape.folded } }
    }
    case 'show-more': {
      const shape = foldShapeOf(state, action.cwd)
      if (shape.folded) return state
      // The step never dips below the initial page, even when the group is
      // smaller than it at dispatch time — the read-side clamp renders the
      // truth, the stored shape stays well-formed.
      const visible = Math.max(SHOW_FIRST, Math.min(shape.visible + SHOW_MORE_STEP, action.total))
      if (visible === shape.visible) return state
      return { ...state, [action.cwd]: { ...shape, visible } }
    }
    case 'show-less': {
      const shape = foldShapeOf(state, action.cwd)
      if (shape.folded || shape.visible === SHOW_FIRST) return state
      return { ...state, [action.cwd]: { ...shape, visible: SHOW_FIRST } }
    }
    case 'collapse-all':
    case 'expand-all': {
      // One pass over the listed groups; each shape flips ONLY `folded`.
      // Reading from `next` (not `state`) keeps duplicate cwds and repeated
      // dispatches idempotent, and unchanged groups keep the original map
      // entries — the no-op case returns the SAME reference.
      const folded = action.type === 'collapse-all'
      let changed = false
      const next: Record<string, GroupFoldShape> = { ...state }
      for (const cwd of action.cwds) {
        const shape = foldShapeOf(next, cwd)
        if (shape.folded === folded) continue
        next[cwd] = { ...shape, folded }
        changed = true
      }
      return changed ? next : state
    }
  }
}
