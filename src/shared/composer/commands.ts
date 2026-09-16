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
