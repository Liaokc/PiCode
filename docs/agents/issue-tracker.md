# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Linear mirror (mandatory)

This section is part of the cross-session development contract (`docs/agents/development-contract.md` §2). Every ticket event is mirrored to Linear (team `LiaoKC`, project `PiCode`) via the `mcp` tool (`mcp_save_issue` / `mcp_list_issues`):

- **Intake** (ticket filed + committed): create the Linear issue (`Todo`, label `iter:<version>`) — description = sync header (branch/shas) + full ticket text.
- **Execution start** (implement worker dispatched): state → `In Progress`.
- **Review / fix rounds**: append the review record to the description.
- **Work-content changes** (scope rewrite, acceptance change, renumbering, retirement, a later ruling that supersedes the ticket): update the Linear description with the change record; if the ticket number changes, the mirror moves to the new number with a note.
- **Merge** (merge sha landed): state → `Done`, description gains the merge + verification record.
- **Release** (tag / publish / install): record the release shas in the description.

A ticket is not "closed" locally until its Linear mirror reflects the same state. The mirror is the operator's cross-batch view — never let it lag behind the local run-log.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
