/**
 * Terminal theming (ticket 08, fonts since 18-feedback): an xterm palette
 * keyed to the app design tokens in app.css. Values are duplicated as
 * literals because xterm needs concrete colors at construction time; keep
 * both sides in sync when the tokens change (dark theme later overrides
 * here + the CSS block together).
 *
 * Font stack: resolved once by the app shell (Nerd Font probe for starship
 * glyphs, shared/terminal/font.ts) and passed in here.
 */
import type { ITheme, ITerminalOptions } from '@xterm/xterm'
import { DEFAULT_TERMINAL_FONT_STACK } from '../../../shared/terminal/font'

/** Light-theme xterm palette (surfaces/text match --bg-card / --text-primary). */
export const terminalTheme: ITheme = {
  background: '#ffffff',
  foreground: '#232320',
  cursor: '#232320',
  cursorAccent: '#ffffff',
  selectionBackground: '#dbe4f0',
  black: '#3b3b37',
  red: '#c44343',
  green: '#2e7d43',
  yellow: '#9a6a0a',
  blue: '#2f62c9',
  magenta: '#973999',
  cyan: '#1f7a8c',
  white: '#c8c8c3',
  brightBlack: '#8e8e88',
  brightRed: '#e05555',
  brightGreen: '#43995a',
  brightYellow: '#c08a1d',
  brightBlue: '#4a7ce8',
  brightMagenta: '#bb54bd',
  brightCyan: '#3998ad',
  brightWhite: '#f4f4f1'
}

/** Options shared by the user terminal; the font stack is probe-resolved. */
export function createTerminalOptions(fontFamily: string = DEFAULT_TERMINAL_FONT_STACK): ITerminalOptions {
  return {
    fontFamily,
    fontSize: 12,
    lineHeight: 1.3,
    letterSpacing: 0,
    cursorBlink: true,
    scrollback: 5000,
    convertEol: false,
    macOptionIsMeta: true,
    theme: terminalTheme
  }
}
