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
- Run `git switch main && git pull --ff-only`. If this fails, report the error and finish. Do not stash or discard anything.

The skills that step 4 reads now match `main`. This skill is already loaded, so a change to it takes effect on the next `/next` round.

## 1. Close out

For tickets from `mcp__linear__list_issues` (team `Youzhuliu`, `label: "awaiting-merge"`) whose state is Done or Canceled: remove `awaiting-merge`, rewrite the progress comment as a final summary, and clean up the local branch as below. Finish all of them before continuing.

Clean up the local branch only if the ticket has a merged PR. Find it as in `/ticket` step 1, and leave branches alone if there is none. Use the PR's `headRefName` as `<branch>`, and skip this if there is no local branch. `git branch -d` always refuses after a squash merge, so compare commits instead:

- `git rev-parse <branch>` equals the PR's `headRefOid` and `<branch>` is not the current branch → `git branch -D <branch>`. Everything on the branch is in the PR.
- Otherwise keep the branch and name it in the final report. It may hold commits that are not in the PR. A paused run skips the `main` update, so it can still be on `<branch>`.

## 2. Check CI on `main`

If any `gh` or Linear call in this step fails, except the log read in item 3, name the error in the final report, open no ticket and go to step 3.

1. Select a run:
   ```bash
   gh run list --branch main --workflow CI --limit 20 --json databaseId,attempt,status,conclusion,headSha,url
   ```
   The newest run comes first. Select the newest run whose `conclusion` is not `cancelled`. Go to step 3 if there is none, if its `status` is not `completed`, or if its `conclusion` is not `failure`, `timed_out` or `startup_failure`.
2. Get every `main-ci-failure` ticket, in any state: `mcp__linear__list_issues` (team `Youzhuliu`, `label: "main-ci-failure"`, `includeArchived: true`, following `cursor` while `hasNextPage` is true), with `mcp__linear__list_comments` for each. If any body or comment has the run's `headSha`, go to step 3. This comes first so that a failure a human has already handled or dismissed gets no rerun, comment or ticket.
3. Read the log with `gh run view <databaseId> --log-failed`. If this fails or returns nothing, note that the log could not be read and continue with item 4. If the log looks like CI flakiness (network or runner problems) and `attempt` is 1, run `gh run rerun <databaseId>` and go to step 3. The next `/next` round reads the result.
4. If a `main-ci-failure` ticket is open (its state is not Done or Canceled), add a comment to it with the `headSha`, the run `url` and a log excerpt of at most 50 lines.
5. Otherwise open a ticket with `mcp__linear__save_issue`: team `Youzhuliu`, title `CI failed on main at <first 7 characters of headSha>`, `state: "Todo"`, `priority: 1`, `labels: ["agent-proposed", "main-ci-failure"]`, `assignee: "me"`. The body starts with `<!-- harness:created-by-agent source=<source> -->`, then has the `headSha`, the run `url` and a log excerpt of at most 50 lines. It ends with: "Before removing `agent-proposed`, add the Goal, Scope, Acceptance criteria and Test scenarios sections, because `/ticket` stops without them."
   - `<source>` is the first `YOU-<number>` in the output of `git log -1 --format=%s <headSha>`. Use `main` if there is no match or the command fails. Do not use the run's `displayTitle`.
   - If the log could not be read, say so in place of the excerpt. This applies to the comment in item 4 too.

Do not pause or skip any work because of a failure. Continue with step 3.

## 3. Pick a ticket (in order, stop at the first match)

Skip tickets with a `needs-human`, `spec-needed`, `agent-proposed` or `draft` label.

1. **Interrupted tickets**: state In Progress, with a `<!-- harness:progress -->` comment on the ticket (an In Progress ticket without this comment is one a human is working on, so skip it).
2. **Human rejections or runs interrupted after review**: state In Review, no `awaiting-merge`, with a `<!-- harness:progress -->` comment. `/ticket` step 1 tells the two apart.
3. **Todo**: state Todo, and all blocked-by tickets are Done (`includeRelations: true` on `get_issue`). Sort by priority 1→4, with 0 (none) last; within a priority, by creation time, oldest first.
4. **Backlog decomposition**: state Backlog, no `decomposed` label, last updated more than 30 minutes ago (to avoid decomposing a ticket still being written), and the body does **not** have the `<!-- harness:created-by-agent` marker (agent-opened tickets are not decomposed automatically).

## 4. Run

- 1-3 → process the ticket per `.claude/skills/ticket/SKILL.md` (same as `/ticket <ticket id>`).
- 4 → process it per `.claude/skills/decompose/SKILL.md` (same as `/decompose <ticket id>`).
- No ticket to process → report "No tickets to process right now".

Finish with one or two sentences on which ticket was processed and the result. Also name any ticket step 2 opened or commented on, any rerun it started, and any error it reported.

## With /loop

`/loop 10m /next` runs every 10 minutes. `/loop /next` lets Claude choose the interval. Processing a ticket may take longer than the interval; the next round starts only after this one finishes.
