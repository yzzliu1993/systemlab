---
name: decompose
description: Hand a Backlog ticket to the decomposer subagent to split it into Todo sub-tickets that meet the Definition of Ready (or rewrite it as a single Todo ticket), and create the sub-tickets and dependencies in Linear.
argument-hint: <ticket id, for example YOU-16>
disable-model-invocation: true
---

# /decompose $ARGUMENTS

See `specs/HARNESS_SPEC.md` §2.3 and §4.1 for the spec. Linear team: `Youzhuliu`.

## 1. Check

`mcp__linear__get_issue` (`includeRelations: true`). Stop and explain why in these cases:
- The state is not Backlog.
- It has a `decomposed`, `needs-human`, `spec-needed`, `agent-proposed` or `draft` label.

## 2. Decompose

Call the `decomposer` subagent with the Agent tool, passing the ticket id, title and full body. Read the json at the end of its reply.

Check yourself that each ticket's `description` meets the Definition of Ready (has `## Goal`, `## Scope`, `## Acceptance criteria` and `## Test scenarios` with at least one `T<number>` row). If not, return the problem to the decomposer to fix once. If it still does not meet it, hand off to a human (see below).

## 3. Write to Linear

**`mode: "split"`**
1. First confirm no sub-tickets exist yet with `mcp__linear__list_issues` (`parentId: <parent ticket>`), to avoid duplicates when rerunning after an interruption. Reuse any with the same title.
2. Create sub-tickets in array order: `mcp__linear__save_issue` with `team: "Youzhuliu"`, `state: "Todo"`, `parentId: <parent ticket>`, and `blockedBy` with the `blocked_by` indexes replaced by the created ticket ids. Start the body with `<!-- harness:decomposed-from <parent ticket> -->`.
3. Parent ticket: `addLabels: ["decomposed"]`, state stays Backlog. Comment with the sub-ticket list, the decomposition reasoning and `questions`.

**`mode: "rewrite"`**
- Change the parent body to `tickets[0].description` (keep the original body at the bottom in an `## Original description` section), set the state to `Todo`, and `addLabels: ["decomposed"]`.

**`questions` not empty**: open a Backlog ticket for each question with the `<!-- harness:created-by-agent source=<parent ticket> -->` marker and the `spec-needed` label (at most 3; search first to avoid duplicates).

## Hand off to a human

`addLabels: ["needs-human"]`, `assignee: "me"`, and comment with the reason.
