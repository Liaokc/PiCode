# 08: Expose Pi's native prompt injection / queueing (replace busy-drop)

**Type:** task

**Status:** ready-for-agent

**What to build:** preserve Pi Agent's native "inject vs queue" input capability.
When a turn is in flight, the user can either **inject** a new prompt
(`streamingBehavior: "steer"` — delivered mid-turn, after the current assistant
turn's tool calls, before the next LLM call; no interruption) or **queue** it
(`streamingBehavior: "followUp"` — run after the agent otherwise stops). The app
must also surface the pending queues in the UI and let the user remove queued
messages.

**Why:** the initial 08 flag (D2 in `closeout.md`) found that the MVP **dropped**
a prompt arriving while busy and left a phantom user entry stuck at "生成…".
Interview (`grill-with-docs`, 2026-08-25) established the real intent: don't
disable input or toast the drop — **keep Pi's stepping/queueing behaviour**, which
the SDK natively supports. Decision recorded in `docs/adr/0003`.

**Settled direction (from grilling, all adopted):**
- Q1 C: inject **and** queue **both** available, user picks at send time
  (composer toggle: 注入 / 排队).
- Q2 A: messages surface as ordinary user transcript entries (no extra badge).
- Q3: **only `prompt` gets inject/queue**; `session-command` / `set-model` /
  `set-thinking` stay refused while busy (SDK has no injection semantics for them).
- Q4 B: **full queue UI** — composer-adjacent panel, visible while streaming,
  showing pending steering + follow-up message text with per-item **remove**
  (via `session.clearQueue()`).
- Q5 A: send button enabled during streaming and sends per the user's chosen
  inject/queue — no more disabled-button-but-Enter-fires inconsistency.
- Q6 A: no extra transcript marker beyond position.
- Q7 A: queue panel lives over/under the composer (near the input).
- Q8 A: the host uses a single `prompt(text, { streamingBehavior })` surface
  (no separate steer/followUp commands in our contract).

**SDK facts (verified read-only, v0.84.2):**
- `session.prompt(text, { streamingBehavior: "steer" })` — queues a steering
  message; throws if streaming and no `streamingBehavior`; never silently drops.
- `session.prompt(text, { streamingBehavior: "followUp" })` — queues a follow-up.
- `session.steer(text)` / `session.followUp(text)` — direct equivalents.
- `queue_update` event: `{ type: "queue_update"; steering: string[]; followUp: string[] }`
  (the message text), emitted on enqueue, clear, and on consumption
  (`message_start` role=user matched to a queued text → reduced arrays).
- Getters: `getSteeringMessages()` / `getFollowUpMessages()` / `pendingMessageCount` /
  `isStreaming` / `isIdle`; `clearQueue()` returns the cleared arrays.
- Caveat: getters return the live internal arrays (mark read-only); consumption
  matching is string-equality, so unusual content can leave a stale entry (minor).

**What to change (read-only Pi; only public SDK APIs):**
1. `src/shared/contract.ts` — `ParentToHost.prompt` gains optional
   `streamingBehavior?: "steer" | "followUp"`; add `HostToParent.queue_update`
   relay (or forward raw event) and a `clear-queue` command if needed.
2. `src/child/host.ts` — `prompt` case: **drop the `busy` discard**; call
   `session.prompt(text, { streamingBehavior })` so the SDK queues/drains.
   Keep session-command / set-model / set-thinking refused while busy.
3. `src/shared/chatReduce.ts` — fold `queue_update` into
   `ChatState.queue: { steering: string[]; followUp: string[] }` (reset on
   session switch). Keep `user-submitted` pushing the entry (Q2/Q6).
4. `src/renderer/ChatPanel.tsx` — composer: streaming-time inject/queue select +
   enabled send; queue panel (visible while streaming) with per-item remove.
5. Tests: reducer folds queue_update → state; host-level via smoke if feasible.

**Also update** `closeout.md` D2 to point at this ticket's resolution and ADR-0003.

**Blocked by:** 02 (host contract), 03 (approval gate) — both resolved.

## Answer

Interview-settled 2026-08-25; see ADR-0003. Not yet implemented.
