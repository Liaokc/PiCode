/**
 * The `/` command menu (screenshot 06): Pi prompt templates, Pi skills, and
 * PiCode-executable built-in commands, with fuzzy filtering and a defined
 * execution semantics per row — plus the command card (ticket 72): the
 * composer's structured 卡+文本 value, where a picked skill or prompt
 * template renders as a card (icon + name + ×) with the arguments text
 * following it, and the send reconstitutes the exact invocation form
 * (`/skill:name args` / `/name args`) the raw-text composer used to send.
 */

import type { SlashCommandItem } from '../contract'
import { fuzzyRank } from './fuzzy'

export const COMMAND_MENU_LIMIT = 12

/** Ticket 72: a hand-typed `/skill:x` token queries with the explicit
 * namespace prefix the composer itself inserts (`/skill:name `) — strip it
 * so the menu can find the very row that produced the inserted form
 * (pi16-slash-no-match-persist: the own invocation used to match nothing).
 * A prefix rule only: anything else passes through untouched. */
export function stripSkillQuery(query: string): string {
  return query.startsWith('skill:') ? query.slice('skill:'.length) : query
}

/** Filtered rows for the menu given the text after the leading `/`. */
export function filterCommands(commands: readonly SlashCommandItem[], query: string): SlashCommandItem[] {
  return fuzzyRank(commands, stripSkillQuery(query), (c) => `${c.name} ${c.description}`, COMMAND_MENU_LIMIT)
}

/**
 * The command card occupying the composer's single card slot (ticket 72):
 * one leading command per message is Pi's own semantics, so a picked skill
 * or prompt template renders as ONE structured card and the args text
 * follows it. Re-picking replaces the card; × removes it.
 */
export interface ComposerCommandCard {
  source: 'skill' | 'prompt'
  name: string
}

/** The wire form a card reconstitutes on send — `/skill:name` for skills,
 * the bare `/name` for prompt templates (byte-identical to the raw-text
 * insert this card replaces). */
export function cardInvocation(card: ComposerCommandCard): string {
  return card.source === 'skill' ? `/skill:${card.name}` : `/${card.name}`
}

/** The send text: card invocation + the args the operator typed after it.
 * Null card = no leading command, the args pass through untouched. The
 * composer trims the composed text exactly like it always did, so the
 * message reaching the SDK is byte-identical to the raw-text era. */
export function composeCommandText(card: ComposerCommandCard | null, args: string): string {
  return card === null ? args : `${cardInvocation(card)} ${args}`
}

/** Ticket 118: the composer text a menu pick leaves behind. The trigger
 * token is the `/` plus the query — which, by the trigger surface's own
 * definition (menu-surface.ts), ends at the caret — plus the separator
 * whitespace run right after it (the first whitespace when one follows
 * the caret, the string's end when the caret already sits there). A pick
 * strips exactly that and nothing more: text typed BEFORE the operator
 * went back to the start of the line survives whole as the card's args
 * (the old pick cleared the entire composer — only the images, an
 * independent state this seam never sees, survived). The caret lands at
 * the remaining text's head — its original place between the consumed
 * token and the kept text. Out-of-domain carets clamp: the strip never
 * eats text it cannot prove is part of the token. */
export interface CommandPickText {
  /** The args that follow the staged card. */
  value: string
  /** Where the caret lands: the head of the remaining text. */
  caret: number
}

/** Strip the trigger token from the composer value at pick time. Pure. */
export function stripTriggerToken(text: string, caret: number): CommandPickText {
  const end = Math.min(Math.max(caret, 0), text.length)
  return { value: text.slice(end).replace(/^\s+/, ''), caret: 0 }
}

/** What executing a picked menu row does. */
export type CommandPick =
  /** Stage the row as the composer's command card (ticket 72): the card
   * renders structurally, args follow, send recombines the invocation. */
  | { kind: 'card'; card: ComposerCommandCard }
  /** Run a PiCode-mapped built-in immediately. */
  | { kind: 'builtin'; name: string }

/**
 * Prompt templates and skills both stage cards (the same treatment — the
 * only difference is the invocation form the card reconstitutes); built-ins
 * are handled by PiCode itself, exactly as before.
 */
export function pickCommand(item: SlashCommandItem): CommandPick {
  switch (item.source) {
    case 'prompt':
      return { kind: 'card', card: { source: 'prompt', name: item.name } }
    case 'skill':
      return { kind: 'card', card: { source: 'skill', name: item.name } }
    case 'builtin':
      return { kind: 'builtin', name: item.name }
  }
}
