---
name: next
description: Pick the next ticket from Linear and process it to the end (close out merged tickets → resume interrupted tickets → Todo → Backlog decomposition). Can run on a timer with /loop.
disable-model-invocation: true
---

# /next

Process only **one** ticket at a time. See `specs/HARNESS_SPEC.md` §3 for the spec. Linear team: `Youzhuliu`.

## 0. Preflight

- If the repo root has a `.harness/PAUSE` file → do only the close-out in step 1, report "paused", then finish.
- If the working directory is not clean (`git status --porcelain` is not empty) → report it and finish. Do not touch the user's changes.

## 1. Close out

For tickets from `mcp__linear__list_issues` (team `Youzhuliu`, `label: "awaiting-merge"`) whose state is Done or Canceled: remove `awaiting-merge` and rewrite the progress comment as a final summary. Finish all of them before continuing.

## 2. Pick a ticket (in order, stop at the first match)

Skip tickets with a `needs-human`, `spec-needed`, `agent-proposed` or `draft` label.

1. **Interrupted tickets**: state In Progress, with a `<!-- harness:progress -->` comment on the ticket (an In Progress ticket without this comment is one a human is working on, so skip it).
2. **Human rejections or runs interrupted after review**: state In Review, no `awaiting-merge`, with a `<!-- harness:progress -->` comment. `/ticket` step 1 tells the two apart.
3. **Todo**: state Todo, and all blocked-by tickets are Done (`includeRelations: true` on `get_issue`). Sort by priority 1→4, with 0 (none) last; within a priority, by creation time, oldest first.
4. **Backlog decomposition**: state Backlog, no `decomposed` label, last updated more than 30 minutes ago (to avoid decomposing a ticket still being written), and the body does **not** have the `<!-- harness:created-by-agent` marker (agent-opened tickets are not decomposed automatically).

## 3. Run

- 1-3 → process the ticket per `.claude/skills/ticket/SKILL.md` (same as `/ticket <ticket id>`).
- 4 → process it per `.claude/skills/decompose/SKILL.md` (same as `/decompose <ticket id>`).
- No ticket to process → report "No tickets to process right now".

Finish with one or two sentences on which ticket was processed and the result.

## With /loop

`/loop 10m /next` runs every 10 minutes. `/loop /next` lets Claude choose the interval. Processing a ticket may take longer than the interval; the next round starts only after this one finishes.
