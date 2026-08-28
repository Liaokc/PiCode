/**
 * Access Mode presets (CONTEXT.md): the composer chips are tiers of the
 * PiCode approval gate — a preset policy selector, NOT Pi project trust.
 * Shared by the host (gate decisions) and the renderer (chip menus), so the
 * semantics live in exactly one place.
 */

import type { AccessMode } from '../contract'

export const ACCESS_MODES: readonly AccessMode[] = ['full-access', 'standard', 'read-only']

export const DEFAULT_ACCESS_MODE: AccessMode = 'standard'

export function accessModeLabel(mode: AccessMode): string {
  switch (mode) {
    case 'full-access':
      return 'Full Access'
    case 'standard':
      return 'Standard'
    case 'read-only':
      return 'Read Only'
  }
}

export function accessModeHint(mode: AccessMode): string {
  switch (mode) {
    case 'full-access':
      return 'Run every tool without asking'
    case 'standard':
      return 'Ask before mutating tools'
    case 'read-only':
      return 'Inspect only — deny all mutations'
  }
}

/** Inspection tools the gate never asks about, in any tier. */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set(['read', 'ls', 'grep', 'find'])

export type GateDecision = 'allow' | 'ask' | 'deny'

/**
 * Remembered rules keyed by preset: an approval remembered under one tier
 * stays attached to that tier ("remember 规则随预设持久化") and re-activates
 * when the session switches back to it. Tier always wins over rules.
 */
export type RulesByMode = Record<AccessMode, readonly string[]>

export function emptyRules(): RulesByMode {
  return { 'full-access': [], standard: [], 'read-only': [] }
}

export function rememberRule(rules: RulesByMode, mode: AccessMode, toolName: string): RulesByMode {
  const current = rules[mode]
  if (current.includes(toolName)) return rules
  return { ...rules, [mode]: [...current, toolName] }
}

export function rulesForMode(rules: RulesByMode, mode: AccessMode): readonly string[] {
  return rules[mode]
}

/** The gate decision for one tool call under one tier. Pure. */
export function decideGate(mode: AccessMode, toolName: string, rememberedForMode: readonly string[]): GateDecision {
  if (READ_ONLY_TOOLS.has(toolName)) return 'allow'
  if (mode === 'full-access') return 'allow'
  if (mode === 'standard' && rememberedForMode.includes(toolName)) return 'allow'
  if (mode === 'read-only') return 'deny'
  return 'ask'
}
