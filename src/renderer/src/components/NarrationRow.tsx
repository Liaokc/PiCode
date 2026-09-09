import type { JSX } from 'react'

/**
 * Interim narration row (CONTEXT.md: 过程叙述, ticket 53): an assistant text
 * block that came before the turn's final answer — the model's work
 * narration between tool calls. Folded with the container; visible as a
 * basic work row while it is open (spec: typography polish out of scope).
 */
export default function NarrationRow({ text }: { text: string }): JSX.Element | null {
  if (text.trim() === '') return null
  return <div className="turn-narration-row">{text}</div>
}
