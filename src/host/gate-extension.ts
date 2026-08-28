/**
 * The approval gate as a Pi inline extension (ticket 05): intercepts every
 * `tool_call` BEFORE execution and consults the gate tier.
 *
 *  - allow        → run untouched
 *  - ask          → park a waiter + emit `approval_required`; the renderer's
 *                   approve/deny-with-reason pill resolves it. A remembered
 *                   approve rule attaches to the current Access Mode tier.
 *  - deny         → block. User denials carry the user's reason and hint
 *                   `terminate` so the run stops after this batch; Read-Only
 *                   tier denials explain the tier and let the model adapt.
 *
 * Registered through DefaultResourceLoaderOptions.extensionFactories, so it
 * rides the same extension pipeline as user extensions — no Pi modification.
 */

import type { InlineExtension, ToolCallEvent, ToolCallEventResult } from '@earendil-works/pi-coding-agent'
import type { HostToParent, ImageAttachment } from '../shared/contract'
import type { ApprovalGate } from './approval-gate'

type HostEvent = Exclude<HostToParent, { type: 'host_exit' }>

/** Structural mirror of the SDK's ImageContent (not re-exported at the root). */
interface ImageContentLike {
  type: 'image'
  data: string
  mimeType: string
}

export function createApprovalGateExtension(gate: ApprovalGate, send: (event: HostEvent) => void): InlineExtension {
  return {
    name: 'picode-approval-gate',
    hidden: true,
    factory: (pi) => {
      pi.on('tool_call', async (event: ToolCallEvent): Promise<ToolCallEventResult> => {
        const toolName = event.toolName
        const args = (event as { input?: unknown }).input
        const decision = gate.decide(toolName)
        if (decision === 'allow') return {}
        if (decision === 'deny') {
          return { block: true, reason: gate.denialReason(toolName) }
        }
        const answer = await gate.request(
          {
            toolCallId: event.toolCallId,
            toolName,
            args: isRecord(args) ? args : {}
          },
          send
        )
        if (answer.approved) {
          if (answer.remember) gate.remember(toolName)
          return {}
        }
        return {
          block: true,
          reason: answer.reason.trim() !== '' ? answer.reason : `Denied ${toolName} by the user.`,
          terminate: true
        }
      })
    }
  }
}

export function toImageContents(images?: readonly ImageAttachment[]): ImageContentLike[] | undefined {
  if (!images || images.length === 0) return undefined
  return images.map((image) => ({ type: 'image' as const, data: image.data, mimeType: image.mimeType }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
