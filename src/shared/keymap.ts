/**
 * Global keymap (ticket 27): the shell's chord table, resolved by PHYSICAL
 * key (`event.code`) instead of the derived character (`event.key`). On
 * macOS, Option rewrites the derived character (⌥B types "∫", ⌥J types
 * "∆"), so character-based judgment cannot see the ⌥⌘B / ⌥⌘J chords at
 * all; the physical code is stable across modifier states. Table-driven
 * pure function (Seam-1) — the App shell consumes the resolved action,
 * the chord table is tested directly.
 *
 * The 27 remap: ⌘B toggles the left sidebar (was the Bridge — ZCode muscle
 * memory), ⌥⌘B toggles the right side panel, ⌘J keeps the terminal dock,
 * ⌥⌘J toggles the Bridge dock. ⌘N / ⌘K keep their pre-27 bindings.
 * Ticket 57 adds ⌘E: toggle the focused composer's expanded input (both
 * surfaces share the component; the App shell routes the action).
 * Ticket 63 adds ⌘,: toggle the settings window (titlebar gear + Esc close
 * alongside).
 */

/** Actions the global chords dispatch; names mirror the reducer actions
 * the App shell forwards to (shellUiReducer / dockReducer). */
export type KeybindingAction =
  | { type: 'new-task' }
  | { type: 'task-search' }
  | { type: 'toggle-sidebar' }
  | { type: 'toggle-side-panel' }
  | { type: 'toggle-terminal-panel' }
  | { type: 'toggle-bridge-panel' }
  | { type: 'toggle-composer-expand' }
  | { type: 'toggle-settings' }

/** Minimal shape of a KeyboardEvent the resolver reads. `key` exists on
 * real events but is deliberately NOT read — character judgment is exactly
 * what ticket 27 removes (macOS Option combined characters). */
export interface KeyEventSpec {
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  readonly key?: string
}

/** One table row: a chord matches only with EXACTLY this modifier state —
 * metaKey is required for every chord and ctrl/shift are rejected before
 * the lookup, so the table only varies code × alt. */
interface Chord {
  code: string
  alt: boolean
  action: KeybindingAction
}

export const KEYBINDINGS: readonly Chord[] = [
  { code: 'KeyN', alt: false, action: { type: 'new-task' } },
  { code: 'KeyK', alt: false, action: { type: 'task-search' } },
  { code: 'KeyJ', alt: false, action: { type: 'toggle-terminal-panel' } },
  { code: 'KeyJ', alt: true, action: { type: 'toggle-bridge-panel' } },
  { code: 'KeyB', alt: false, action: { type: 'toggle-sidebar' } },
  { code: 'KeyB', alt: true, action: { type: 'toggle-side-panel' } },
  { code: 'KeyE', alt: false, action: { type: 'toggle-composer-expand' } },
  // Ticket 63: ⌘, opens/closes the settings window (ZCode muscle memory).
  { code: 'Comma', alt: false, action: { type: 'toggle-settings' } }
]

/** Resolve a keydown to its global action, or null when it is not one of
 * ours (plain typing, unbound chords, ctrl/shift joins). */
export function resolveKeybinding(event: KeyEventSpec): KeybindingAction | null {
  if (!event.metaKey || event.ctrlKey || event.shiftKey) return null
  return KEYBINDINGS.find((chord) => chord.code === event.code && chord.alt === event.altKey)?.action ?? null
}
