/**
 * The `/` command menu (screenshot 06): Pi prompt templates, Pi skills, and
 * PiCode-executable built-in commands, with fuzzy filtering and a defined
 * execution semantics per row.
 */

import type { SlashCommandItem } from '../contract'
import { fuzzyRank } from './fuzzy'

export const COMMAND_MENU_LIMIT = 12

/** Filtered rows for the menu given the text after the leading `/`. */
export function filterCommands(commands: readonly SlashCommandItem[], query: string): SlashCommandItem[] {
  return fuzzyRank(commands, query, (c) => `${c.name} ${c.description}`, COMMAND_MENU_LIMIT)
}

/** What executing a picked menu row does. */
export type CommandPick =
  /** Put the invocation into the composer (the user can append arguments). */
  | { kind: 'insert'; text: string }
  /** Run a PiCode-mapped built-in immediately. */
  | { kind: 'builtin'; name: string }

/**
 * Prompt templates run through the SDK's `/name` expansion; skills run
 * through the SDK's explicit `/skill:name` form; built-ins are handled by
 * PiCode itself.
 */
export function pickCommand(item: SlashCommandItem): CommandPick {
  switch (item.source) {
    case 'prompt':
      return { kind: 'insert', text: `/${item.name} ` }
    case 'skill':
      return { kind: 'insert', text: `/skill:${item.name} ` }
    case 'builtin':
      return { kind: 'builtin', name: item.name }
  }
}
