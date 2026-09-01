/**
 * Terminal font resolution (ticket 18 feedback): starship prompts use Nerd
 * Font glyphs (powerline arrows, icon glyphs) that the plain mono stack
 * lacks — they render as tofu. The renderer probes which Nerd Font is
 * installed and puts it first in the xterm / feed font stack. The candidate
 * list and the pick/stack rules live here as pure logic; the renderer only
 * supplies the availability probe (canvas glyph-width measurement).
 */

/** Plain monospace stack (light-theme token parity with app.css). */
export const DEFAULT_TERMINAL_FONT_STACK =
  "'SF Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Mono', 'Courier New', monospace"

/**
 * Nerd Fonts commonly installed for starship/powerline prompts, in probe
 * order. Meslo leads (the starship docs' recommendation); the Symbols-only
 * fallbacks sit last — they carry the glyphs even when the text font is
 * unpatched, and CSS fallback picks glyphs from them per-character.
 */
export const NERD_FONT_CANDIDATES: readonly string[] = [
  'MesloLGS NF',
  'JetBrainsMono Nerd Font',
  'SFMono Nerd Font',
  'CaskaydiaCove Nerd Font',
  'Hack Nerd Font',
  'FiraCode Nerd Font',
  'VictorMono Nerd Font',
  'Symbols Nerd Font Mono',
  'Symbols Nerd Font'
]

/** First installed candidate, or null when none matches the probe. */
export function pickNerdFont(isAvailable: (font: string) => boolean): string | null {
  for (const font of NERD_FONT_CANDIDATES) {
    if (isAvailable(font)) return font
  }
  return null
}

/** Stack with the nerd font first (so its PUA glyphs win), else the default. */
export function terminalFontStack(nerdFont: string | null): string {
  return nerdFont === null ? DEFAULT_TERMINAL_FONT_STACK : `'${nerdFont}', ${DEFAULT_TERMINAL_FONT_STACK}`
}
