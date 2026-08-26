# Expose Pi's native prompt injection / queueing instead of dropping busy prompts

PiCode should preserve Pi Agent's built-in "inject vs queue" input capability, not
lock it off. When a turn is in flight, a user can either **inject** a new prompt
(`streamingBehavior: "steer"`, delivered after the current assistant turn's tool
calls, before the next LLM call — no interruption) or **queue** it
(`streamingBehavior: "followUp"`, run after the agent otherwise stops). This
natively exists on the SDK (`session.prompt(text, { streamingBehavior })`, plus
`session.steer()/followUp()` and a `queue_update` event carrying pending
`steering`/`followUp` message text).

The prior MVP shipped a `busy` guard in `src/child/host.ts` that **dropped** any
prompt arriving while a turn was in flight (warn-log only), and the renderer
disabled the send button during `streaming`. That threw away Pi's capability and,
because Enter bypassed the button guard, left a phantom user entry that stuck the
UI at "生成中…" forever. We replace both with: renderer lets the user pick
inject/**queue at send time**; the host calls `session.prompt(text, { streamingBehavior })`
so the SDK queues rather than drops; the reducer folds `queue_update` into a
visible, actionable queue panel; and the user can clear the pending queues
(host calls `session.clearQueue()`).

> Deviation Q10-B (recorded here): clearing is a **single** action — the SDK's
> `session.clearQueue()` clears both steering and follow-up arrays and has **no
> per-item API**. The queue panel therefore offers one "清空队列" action rather
> than the per-message remove originally planned.

Scope: only text `prompt` gets inject/queue. `session-command` (new/resume/fork),
`set-model`, `set-thinking` remain refused while busy — the SDK has no injection
semantics for them, so forcing them would break the turn. Pi is consumed read-only
(only public SDK APIs; no install modification).

Status: accepted

Consequences: the transcript can carry steered messages injected mid-turn; the
composer's disabled-during-streaming send button becomes a working inject/queue
control; a small queue panel (composer-adjacent, visible while streaming) shows
pending steering and follow-up messages with a single clear action (see deviation
Q10-B above). Matching queued text to consumption uses string equality, which
under unusual content can leave a stale queue entry (known, minor).
