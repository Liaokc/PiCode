/**
 * Ticket 68 — the trigger surface BOTH text menus share (Seam-1,
 * table-driven): the `/` command menu and the `@` file menu open only
 * while the caret sits inside the FIRST-LINE LEADING token — the text
 * starts with `/` or `@` and nothing before the caret holds a space or a
 * newline. A newline (Enter/Shift+Enter), a space, or the cursor leaving
 * the token each land here as a (text, caret) state that resolves null,
 * so one decision closes the menu on all three paths and re-opens it when
 * the cursor re-enters the token.
 *
 * The surface is deliberately match-agnostic: whether commands or files
 * actually match the query is the menus' concern (the composer renders no
 * menu at all when zero rows survive the filter — the "No matching
 * commands/files" box is gone and Enter falls back to the send path).
 * Key events never reach this function directly: they act through the
 * text and caret they produce (see tests/shared/menu-surface.test.ts).
 */

export type TextMenuKind = 'slash' | 'files'

export interface TextMenuSurface {
  kind: TextMenuKind
  /** The live token text between the trigger character and the caret. */
  query: string
}

/** The trigger-surface decision for one composer state. Pure. */
export function textMenuSurface(text: string, caret: number): TextMenuSurface | null {
  const trigger = text[0]
  if (trigger !== '/' && trigger !== '@') return null
  // The caret must sit inside the token: at position 0 it is before the
  // trigger character — outside the token by definition.
  if (caret < 1) return null
  // Any whitespace before the caret — a typed space/newline or a token
  // boundary crossed by the cursor — ends the command mode.
  if (/\s/.test(text.slice(0, caret))) return null
  return { kind: trigger === '/' ? 'slash' : 'files', query: text.slice(1, caret) }
}
