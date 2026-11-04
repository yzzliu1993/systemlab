---
name: retro
description: Find repeated harness problems in recently finished tickets and open improvement tickets. Reads friction and progress comments, reports simple metrics, and logs the run on YOU-32. Does not change code, permissions or settings.
disable-model-invocation: true
---

# /retro

Turn evidence from real runs into improvement tickets. See `specs/HARNESS_SPEC.md` §3.6 and §11 for the spec. Linear team: `Youzhuliu`.

You only read tickets, open tickets and log the run. Fixing what you find happens later, in its own ticket.

## 1. Find the last run

Read the comments on YOU-32 with `mcp__linear__list_comments`. The last run is the newest comment that starts with `<!-- harness:retro at=<ISO time> -->`. If there is none, this is the first run and there is no start time.

## 2. Pick the tickets

`mcp__linear__list_issues` with team `Youzhuliu`, state `Done`, `completedAt` set to the last run's time (omit it on the first run) and `limit: 20`. Keep the 20 most recently completed, and say so in the report if more exist.

If there are no tickets, skip to step 6 and log a run that read nothing.

## 3. Read the evidence

Read each ticket's comments with `mcp__linear__list_comments`, three tickets at a time. From each ticket take:

- The rows of the `<!-- harness:friction -->` comment.
- `Review rounds` and `Failures` from the `<!-- harness:progress -->` comment.

## 4. Measure and find problems

1. Work out the average per ticket: failures, review rounds, and human interventions (friction rows of type `human`). Compare them with the previous run's log.
2. Group friction rows and failures that describe the same problem.
3. Keep a problem only if it has evidence: the same problem on at least two tickets, or one clear failure. Name the ticket ids. Drop the rest.

## 5. Act on each problem

| Problem is about | Action |
|---|---|
| Permissions, protected paths, or merge conditions (including branch protection) | **Report it to the user. Do not open a ticket.** Only a human proposes these changes. |
| An external GitHub or Linear setting | Open a ticket with the setting, current value, proposed value, reason and rollback. Get the current value from §11. |
| Anything in the repo | Open a ticket with the evidence and the proposed change. |

Open tickets per `specs/HARNESS_SPEC.md` §8, with these limits:

- Search with `mcp__linear__list_issues` (`query`) first. If a similar ticket exists, add the new evidence as a comment on it.
- Start the body with `<!-- harness:created-by-agent source=YOU-32 -->` and add the `agent-proposed` label.
- Open at most 3 per run, strongest evidence first. List the others in the report.

## 6. Log the run

Add a comment on YOU-32:

```markdown
<!-- harness:retro at=<current ISO time> -->
**Retro run**
| Item | Value |
|---|---|
| Tickets read | YOU-n, YOU-n (or none) |
| Failures per ticket | <average, change since last run> |
| Review rounds per ticket | <average, change since last run> |
| Human interventions per ticket | <average, change since last run> |
| Tickets opened | YOU-n, YOU-n (or none) |
| Reported only | <problems left for a human, or none> |
```

Finish with a short report to the user: the metrics, the tickets opened, and anything only a human can decide.

## Forbidden

- Changing code, `.claude/`, `specs/`, or any GitHub or Linear setting.
- Opening a branch or PR, or moving a ticket's state.
- Removing `agent-proposed` from a ticket.
- Opening a ticket about permissions, protected paths or merge conditions.
