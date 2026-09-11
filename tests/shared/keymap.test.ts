import { describe, expect, it } from 'vitest'
import { KEYBINDINGS, resolveKeybinding, type KeybindingAction, type KeyEventSpec } from '../../src/shared/keymap'

/** Build a keydown: physical code + modifier state (the fields the resolver
 * reads); `key` can be added to prove the derived character is ignored. */
function keydown(
  code: string,
  mods: Partial<Pick<KeyEventSpec, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'key'>> = {}
): KeyEventSpec {
  return { code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods }
}

describe('resolveKeybinding — ticket 27 remap (physical event.code)', () => {
  it('⌘B toggles the left sidebar (was the bridge — ZCode muscle memory)', () => {
    const action: KeybindingAction | null = resolveKeybinding(keydown('KeyB', { metaKey: true }))
    expect(action).toEqual({ type: 'toggle-sidebar' })
  })

  it('⌥⌘B toggles the right side panel', () => {
    expect(resolveKeybinding(keydown('KeyB', { metaKey: true, altKey: true }))).toEqual({ type: 'toggle-side-panel' })
  })

  it('⌥⌘B resolves by physical key even though Option rewrites the character', () => {
    // The real macOS event for ⌥⌘B carries key: '∫' — judgment reads only
    // code + modifiers, so the chord still lands (the ticket's core fix).
    expect(resolveKeybinding(keydown('KeyB', { metaKey: true, altKey: true, key: '∫' }))).toEqual({
      type: 'toggle-side-panel'
    })
  })

  it('⌘J keeps toggling the terminal dock (unchanged)', () => {
    expect(resolveKeybinding(keydown('KeyJ', { metaKey: true }))).toEqual({ type: 'toggle-terminal-panel' })
  })

  it('⌥⌘J toggles the Bridge dock (⌥J also rewrites the character to ∆)', () => {
    expect(resolveKeybinding(keydown('KeyJ', { metaKey: true, altKey: true, key: '∆' }))).toEqual({
      type: 'toggle-bridge-panel'
    })
  })

  it('⌘N new task and ⌘K task search keep their bindings', () => {
    expect(resolveKeybinding(keydown('KeyN', { metaKey: true }))).toEqual({ type: 'new-task' })
    expect(resolveKeybinding(keydown('KeyK', { metaKey: true }))).toEqual({ type: 'task-search' })
  })
})

describe('resolveKeybinding — ticket 57: ⌘E toggles the composer expand', () => {
  it('⌘E resolves to toggle-composer-expand (physical KeyE, meta-only)', () => {
    expect(resolveKeybinding(keydown('KeyE', { metaKey: true }))).toEqual({ type: 'toggle-composer-expand' })
  })

  it('⌥⌘E is rejected — the table binds no alt row for KeyE', () => {
    expect(resolveKeybinding(keydown('KeyE', { metaKey: true, altKey: true }))).toBeNull()
  })

  it('ctrl and shift joins are rejected (meta-only discipline)', () => {
    expect(resolveKeybinding(keydown('KeyE', { metaKey: true, ctrlKey: true }))).toBeNull()
    expect(resolveKeybinding(keydown('KeyE', { metaKey: true, shiftKey: true }))).toBeNull()
  })

  it('plain typing (KeyE, no meta) stays null so the composer keeps the key', () => {
    expect(resolveKeybinding(keydown('KeyE'))).toBeNull()
  })
})

describe('resolveKeybinding — non-chords stay null', () => {
  it('rejects plain typing (no meta) so ⌘-less keys never toggle chrome', () => {
    expect(resolveKeybinding(keydown('KeyB'))).toBeNull()
    expect(resolveKeybinding(keydown('KeyJ'))).toBeNull()
  })

  it('rejects ctrl and shift joins — only the bound chords are ours', () => {
    expect(resolveKeybinding(keydown('KeyB', { metaKey: true, ctrlKey: true }))).toBeNull()
    expect(resolveKeybinding(keydown('KeyB', { metaKey: true, shiftKey: true }))).toBeNull()
    expect(resolveKeybinding(keydown('KeyJ', { metaKey: true, shiftKey: true }))).toBeNull()
  })

  it('rejects alt joins the table does not bind (⌥⌘N, ⌥⌘K) — exact-modifier chords', () => {
    expect(resolveKeybinding(keydown('KeyN', { metaKey: true, altKey: true }))).toBeNull()
    expect(resolveKeybinding(keydown('KeyK', { metaKey: true, altKey: true }))).toBeNull()
  })

  it('rejects alt-only presses and unbound physical keys', () => {
    expect(resolveKeybinding(keydown('KeyB', { altKey: true }))).toBeNull()
    expect(resolveKeybinding(keydown('KeyG', { metaKey: true }))).toBeNull()
    expect(resolveKeybinding(keydown('KeyG', { metaKey: true, altKey: true }))).toBeNull()
  })
})

describe('KEYBINDINGS — table integrity', () => {
  it('binds each (code × alt) signature at most once', () => {
    const seen = new Set<string>()
    for (const chord of KEYBINDINGS) {
      const signature = `${chord.code}|${chord.alt}`
      expect(seen.has(signature), `duplicate chord ${signature}`).toBe(false)
      seen.add(signature)
    }
  })

  it('covers exactly the seven shell chords (E N K J ⌥J B ⌥B)', () => {
    expect(KEYBINDINGS.map((chord) => `${chord.code}${chord.alt ? '+alt' : ''}`).sort()).toEqual([
      'KeyB',
      'KeyB+alt',
      'KeyE',
      'KeyJ',
      'KeyJ+alt',
      'KeyK',
      'KeyN'
    ])
  })
})
