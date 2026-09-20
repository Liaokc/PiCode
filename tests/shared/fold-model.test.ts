import { describe, expect, it } from 'vitest'
import {
  SHOW_FIRST,
  SHOW_MORE_STEP,
  defaultFoldShape,
  foldShapeOf,
  groupFoldReducer,
  initialFoldState,
  showMoreControl,
  visibleRowCount,
  type GroupFoldAction,
  type GroupFoldState
} from '../../src/shared/sessions/fold-model.ts'

const cwd = '/work/api-server'
const other = '/work/web-app'

/** Action builders for the sequence tables (total = the group's session
 * count at dispatch time — the reducer clamps against it). */
const toggle = (): GroupFoldAction => ({ type: 'toggle-fold', cwd })
const more = (total = 12): GroupFoldAction => ({ type: 'show-more', cwd, total })
const less = (): GroupFoldAction => ({ type: 'show-less', cwd })
const toggleOther = (): GroupFoldAction => ({ type: 'toggle-fold', cwd: other })
const moreOther = (total: number): GroupFoldAction => ({ type: 'show-more', cwd: other, total })
/** The section row's aggregate pair (ticket 95): default list = BOTH table
 * groups, exactly what the sidebar passes for a two-group Projects list. */
const collapseAll = (cwds: readonly string[] = [cwd, other]): GroupFoldAction => ({ type: 'collapse-all', cwds })
const expandAll = (cwds: readonly string[] = [cwd, other]): GroupFoldAction => ({ type: 'expand-all', cwds })

function run(actions: GroupFoldAction[]): GroupFoldState {
  return actions.reduce((state, action) => groupFoldReducer(state, action), initialFoldState())
}

describe('fold-model constants and defaults (ticket 39)', () => {
  it('paginates in fives: the initial page and the Show more step', () => {
    expect(SHOW_FIRST).toBe(5)
    expect(SHOW_MORE_STEP).toBe(5)
  })

  it('starts every group unfolded at the initial page', () => {
    expect(initialFoldState()).toEqual({})
    expect(defaultFoldShape()).toEqual({ visible: SHOW_FIRST, folded: false })
    expect(foldShapeOf(initialFoldState(), cwd)).toEqual({ visible: SHOW_FIRST, folded: false })
  })

  it('reads groups missing from the map at the default shape', () => {
    const state = run([toggle()])
    expect(foldShapeOf(state, cwd).folded).toBe(true)
    expect(foldShapeOf(state, other)).toEqual(defaultFoldShape())
  })
})

describe('visibleRowCount — rows a group renders', () => {
  it.each([
    ['missing group at the initial page', initialFoldState(), 12, 5],
    ['missing group whose list fits one page', initialFoldState(), 3, 3],
    ['missing group with an empty list', initialFoldState(), 0, 0],
    ['folded groups render zero rows', run([more(), toggle()]), 12, 0],
    ['stepped groups render the remembered step', run([more(15)]), 15, 10],
    ['steps clamp to a list that shrank', run([more(), more(15)]), 7, 7],
    ['steps clamp to an empty list', run([more()]), 0, 0]
  ])('%s', (_name, state, total, expected) => {
    expect(visibleRowCount(state, cwd, total)).toBe(expected)
  })
})

describe('showMoreControl — the control under a group', () => {
  it.each([
    ['missing group with more rows pending shows more', initialFoldState(), 12, 'more'],
    ['missing group exactly at one page shows nothing', initialFoldState(), 5, null],
    ['missing group under one page shows nothing', initialFoldState(), 3, null],
    ['missing group with an empty list shows nothing', initialFoldState(), 0, null],
    ['folded groups hide the control', run([toggle()]), 12, null],
    ['part-stepped groups show more', run([more()]), 12, 'more'],
    ['fully shown groups show less', run([more(), more()]), 12, 'less'],
    ['groups remembered past a shrunken list show less', run([more(), more(15)]), 12, 'less']
  ])('%s', (_name, state, total, expected) => {
    expect(showMoreControl(state, cwd, total)).toBe(expected)
  })
})

describe('groupFoldReducer — pagination', () => {
  it('steps +5 per Show more click', () => {
    let state = initialFoldState()
    state = groupFoldReducer(state, more())
    expect(visibleRowCount(state, cwd, 12)).toBe(10)
    expect(showMoreControl(state, cwd, 12)).toBe('more')
    state = groupFoldReducer(state, more())
    expect(visibleRowCount(state, cwd, 12)).toBe(12)
    expect(showMoreControl(state, cwd, 12)).toBe('less')
  })

  it('clamps the step at the group size (8 rows fully shown in one click)', () => {
    const state = groupFoldReducer(initialFoldState(), more(8))
    expect(visibleRowCount(state, cwd, 8)).toBe(8)
    expect(showMoreControl(state, cwd, 8)).toBe('less')
  })

  it('is a no-op (same reference) when already fully shown', () => {
    const state = run([more(), more()])
    expect(groupFoldReducer(state, more())).toBe(state)
  })

  it('is a no-op (same reference) when the group is folded', () => {
    const state = run([more(), toggle()])
    expect(groupFoldReducer(state, more())).toBe(state)
  })

  it('resets to the initial five in ONE Show less click', () => {
    const state = run([more(), more(), less()])
    expect(visibleRowCount(state, cwd, 12)).toBe(SHOW_FIRST)
    expect(showMoreControl(state, cwd, 12)).toBe('more')
  })

  it('is a no-op (same reference) when Show less hits the initial page', () => {
    const initial = initialFoldState()
    expect(groupFoldReducer(initial, less())).toBe(initial)
    const stepped = run([more()])
    const atDefault = run([more(), less()])
    expect(atDefault).not.toBe(stepped)
    expect(groupFoldReducer(atDefault, less())).toBe(atDefault)
  })
})

describe('groupFoldReducer — fold/unfold keeps the shape', () => {
  it('folds an untouched group remembering the default shape', () => {
    const state = groupFoldReducer(initialFoldState(), toggle())
    expect(foldShapeOf(state, cwd)).toEqual({ visible: SHOW_FIRST, folded: true })
    expect(visibleRowCount(state, cwd, 12)).toBe(0)
    expect(showMoreControl(state, cwd, 12)).toBe(null)
  })

  it('toggling twice returns to the unfolded shape', () => {
    const state = run([toggle(), toggle()])
    expect(foldShapeOf(state, cwd)).toEqual(defaultFoldShape())
  })

  it('unfold restores the pre-fold Show more step (the acceptance core)', () => {
    const state = run([more(), toggle(), toggle()])
    expect(visibleRowCount(state, cwd, 12)).toBe(10)
    expect(showMoreControl(state, cwd, 12)).toBe('more')
  })

  it('the restored shape survives further fold/unfold cycles', () => {
    const state = run([more(), toggle(), toggle(), toggle(), toggle()])
    expect(visibleRowCount(state, cwd, 12)).toBe(10)
  })

  it('unfold after Show less restores the initial page', () => {
    const state = run([more(), more(), less(), toggle(), toggle()])
    expect(visibleRowCount(state, cwd, 12)).toBe(SHOW_FIRST)
    expect(showMoreControl(state, cwd, 12)).toBe('more')
  })

  it('unfold at full expansion keeps Show less', () => {
    const state = run([more(), more(), toggle(), toggle()])
    expect(visibleRowCount(state, cwd, 12)).toBe(12)
    expect(showMoreControl(state, cwd, 12)).toBe('less')
  })

  it('folding works for groups that fit one page too', () => {
    const state = run([toggle()])
    expect(visibleRowCount(state, cwd, 3)).toBe(0)
    expect(showMoreControl(state, cwd, 3)).toBe(null)
  })
})

describe('groupFoldReducer — groups are isolated by cwd', () => {
  it('folding one group leaves another untouched', () => {
    let state = initialFoldState()
    state = groupFoldReducer(state, toggle())
    state = groupFoldReducer(state, { type: 'show-more', cwd: other, total: 20 })
    expect(visibleRowCount(state, cwd, 12)).toBe(0)
    expect(visibleRowCount(state, other, 20)).toBe(10)
    expect(showMoreControl(state, other, 20)).toBe('more')
    // The same cwd key mutates only its own shape.
    state = groupFoldReducer(state, toggle())
    expect(foldShapeOf(state, cwd).folded).toBe(false)
    expect(foldShapeOf(state, other).folded).toBe(false)
  })
})

describe('groupFoldReducer — collapse all / expand all (ticket 95)', () => {
  it.each([
    [
      'one stepped group: the remembered 10-row step survives the pair',
      [more(), collapseAll(), expandAll()],
      10,
      'more'
    ],
    [
      'two steps: full expansion (Show less) survives the pair',
      [more(), more(), collapseAll(), expandAll()],
      12,
      'less'
    ],
    [
      'an untouched group returns to the default page after the pair',
      [collapseAll(), expandAll()],
      SHOW_FIRST,
      'more'
    ]
  ] as Array<[string, GroupFoldAction[], number, 'more' | 'less' | null]>)(
    '%s',
    (_name, actions, visible, control) => {
      const state = run(actions)
      expect(foldShapeOf(state, cwd).folded).toBe(false)
      expect(visibleRowCount(state, cwd, 12)).toBe(visible)
      expect(showMoreControl(state, cwd, 12)).toBe(control)
    }
  )

  it('collapse-all folds EVERY listed group, each keeping its pre-fold step', () => {
    const state = run([more(), moreOther(20), collapseAll()])
    // Zero rows everywhere…
    expect(visibleRowCount(state, cwd, 12)).toBe(0)
    expect(visibleRowCount(state, other, 20)).toBe(0)
    // …and the remembered steps intact under the fold (the unfold brings
    // them back — the acceptance core, plural).
    expect(foldShapeOf(state, cwd)).toEqual({ visible: 10, folded: true })
    expect(foldShapeOf(state, other)).toEqual({ visible: 10, folded: true })
  })

  it('expand-all unfolds EVERY listed group restoring the remembered shapes', () => {
    const state = run([more(), moreOther(20), collapseAll(), expandAll()])
    expect(visibleRowCount(state, cwd, 12)).toBe(10)
    expect(visibleRowCount(state, other, 20)).toBe(10)
    expect(showMoreControl(state, cwd, 12)).toBe('more')
    expect(showMoreControl(state, other, 20)).toBe('more')
  })

  it('expands only the LISTED groups — a hidden group keeps its exact shape', () => {
    const state = run([more(), toggleOther(), expandAll([cwd])])
    expect(foldShapeOf(state, cwd).folded).toBe(false)
    expect(foldShapeOf(state, other)).toEqual({ visible: SHOW_FIRST, folded: true })
  })

  it('mixes with a manual single-group fold: expand-all clears it (全部展开)', () => {
    const state = run([more(), toggleOther(), collapseAll(), expandAll()])
    expect(foldShapeOf(state, other).folded).toBe(false)
    expect(visibleRowCount(state, other, 20)).toBe(SHOW_FIRST)
    // The stepped group still restores its own memory alongside.
    expect(visibleRowCount(state, cwd, 12)).toBe(10)
  })

  it('mixes the other way: a manual toggle after collapse-all re-opens just that group', () => {
    const state = run([collapseAll(), toggle()])
    expect(foldShapeOf(state, cwd).folded).toBe(false)
    expect(foldShapeOf(state, other).folded).toBe(true)
  })

  it('is a no-op (same reference) on an empty Projects list', () => {
    const initial = initialFoldState()
    expect(groupFoldReducer(initial, collapseAll([]))).toBe(initial)
    expect(groupFoldReducer(initial, expandAll([]))).toBe(initial)
  })

  it('expand-all with nothing folded is the same reference (no junk keys)', () => {
    const initial = initialFoldState()
    expect(groupFoldReducer(initial, expandAll())).toBe(initial)
    const stepped = run([more()])
    // Unfolded groups are skipped too — the map only ever stores changes.
    expect(groupFoldReducer(stepped, expandAll())).toBe(stepped)
  })

  it('collapse-all twice is the same reference the second time', () => {
    const once = run([collapseAll()])
    expect(groupFoldReducer(once, collapseAll())).toBe(once)
  })

  it('duplicate cwds in the list stay safe', () => {
    const state = groupFoldReducer(initialFoldState(), collapseAll([cwd, cwd, other]))
    expect(foldShapeOf(state, cwd).folded).toBe(true)
    expect(foldShapeOf(state, other).folded).toBe(true)
  })

  it('expand-all over groups missing from the map materializes nothing', () => {
    const state = groupFoldReducer(initialFoldState(), expandAll())
    expect(state).toEqual({})
  })
})

describe('fold shape table — whole click sequences (spec R5)', () => {
  interface Row {
    name: string
    total: number
    actions: GroupFoldAction[]
    visible: number
    folded: boolean
    control: 'more' | 'less' | null
  }
  const rows: Row[] = [
    { name: 'initial: five rows + Show more', total: 12, actions: [], visible: 5, folded: false, control: 'more' },
    { name: 'one Show more: ten rows, still Show more', total: 12, actions: [more()], visible: 10, folded: false, control: 'more' },
    { name: 'two steps reach all twelve: Show less', total: 12, actions: [more(), more()], visible: 12, folded: false, control: 'less' },
    { name: 'Show less: one click back to the initial five', total: 12, actions: [more(), more(), less()], visible: 5, folded: false, control: 'more' },
    { name: 'fold: zero rows, control gone', total: 12, actions: [toggle()], visible: 0, folded: true, control: null },
    { name: 'unfold: the pre-fold step survives', total: 12, actions: [more(), toggle(), toggle()], visible: 10, folded: false, control: 'more' },
    { name: 'fold after Show less, unfold back to five', total: 12, actions: [more(), more(), less(), toggle(), toggle()], visible: 5, folded: false, control: 'more' },
    { name: 'a page-sized group shows no control', total: 4, actions: [], visible: 4, folded: false, control: null },
    { name: 'a page-sized group still folds', total: 4, actions: [toggle()], visible: 0, folded: true, control: null },
    { name: 'remembered steps clamp when the list shrinks', total: 15, actions: [more(15), more(15)], visible: 15, folded: false, control: 'less' },
    { name: 'collapse-all folds the group (aggregate pair, ticket 95)', total: 12, actions: [collapseAll([cwd])], visible: 0, folded: true, control: null },
    { name: 'the pair restores the pre-collapse step', total: 12, actions: [more(), collapseAll([cwd]), expandAll([cwd])], visible: 10, folded: false, control: 'more' }
  ]
  it.each(rows)('$name', ({ total, actions, visible, folded, control }) => {
    const state = run(actions)
    expect(visibleRowCount(state, cwd, total)).toBe(visible)
    expect(foldShapeOf(state, cwd).folded).toBe(folded)
    expect(showMoreControl(state, cwd, total)).toBe(control)
  })
})
