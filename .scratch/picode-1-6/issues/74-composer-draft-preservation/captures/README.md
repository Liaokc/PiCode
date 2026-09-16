# Ticket 74 acceptance captures — composer draft preservation

Produced by `scripts/smoke/draft-captures.mjs` (CDP-driven, ticket-29
capture precedent): boots the BUILT app against a throwaway session store +
throwaway userData, seeds two resume targets as read-only copies of the
operator's newest real session file (rewritten ids, throwaway cwd), and
drives the REAL code path — typing parks through the owner-tagged bridge,
every switch runs the App's park-before-switch handlers, remounts restore
from the slots. Zero model calls; every shot is gated by the same DOM
assertions the electron smoke uses (composer value, attachment count), so
the pictures show the working feature, not staged DOM.

| shot | state | acceptance item |
| --- | --- | --- |
| `1-newtask-draft-typed.png` | New Task, draft typed | 打字未发 |
| `2-newtask-draft-restored-after-switch.png` | New Task again, after switching away to session A and back — same draft restored from the single slot | 切走切回草稿在（New Task 单槽） |
| `3-session-a-draft-text-plus-image.png` | Session A: text draft + pasted-image thumbnail | 文本 + 图片都在 |
| `4-session-b-draft-independent.png` | Session B: only ITS draft — no A text, no A thumbnail | 会话 A/B 互不串 |
| `5-session-a-draft-restored.png` | A again: text + thumbnail restored from ITS slot | 切回恢复对应槽 |

Behavioral (non-visual) acceptance — send-clears-slot on both paths and
memory-level loss across the restart proxy — is asserted by the electron
smoke stage (`draft_preserve_send_clear_ok`,
`draft_preserve_newtask_send_clear_ok`, `draft_preserve_restart_empty_ok`;
run log: 185 ok steps, zero failures, 2026-09-16).
