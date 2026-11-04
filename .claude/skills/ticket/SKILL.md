---
name: ticket
description: Process one Linear ticket, from reading it to merge. Read the ticket → create a branch → implementer implements → verify locally → push and open a PR → In Review → wait for CI → reviewer reviews → auto-merge if all conditions hold, otherwise wait for a human to merge. Rerunning after an interruption resumes from the actual state.
argument-hint: <ticket id, for example YOU-20>
disable-model-invocation: true
---

# /ticket $ARGUMENTS

You are the orchestrator. You advance the flow and **verify** results. Code goes to the `implementer` subagent and review goes to the `reviewer` subagent. A subagent saying "done" does not count: confirm it yourself (verify passes, CI is green) before advancing state. See `specs/HARNESS_SPEC.md` for the full spec.

Ticket id: `$ARGUMENTS` (called `<ID>` below; `<id>` is the lowercase form, for example `you-20`). Linear team: `Youzhuliu`. Repo: `yzzliu1993/systemlab`.

## 0. Read and check the ticket

1. Get the ticket with `mcp__linear__get_issue` (`includeRelations: true`).
2. If the ticket has `awaiting-merge` and its state is Done or In Review, find its PR (see step 1). If the PR is merged, go straight to 9. Linear may already have set the ticket to Done, so this check comes before the stop cases.
3. **Stop** in the cases below, explain why, and change nothing:
   - It has a `needs-human`, `spec-needed`, `agent-proposed` or `draft` label.
   - Its state is Backlog (suggest `/decompose` instead), Done or Canceled.
   - A blocked-by ticket is not Done.
   - Its state is In Review with `awaiting-merge` (already waiting for a human to merge).
4. When the state is Todo, check the Definition of Ready: the body must have `## Goal`, `## Scope`, `## Acceptance criteria` and `## Test scenarios` (with at least one `T<number>` table row). If any is missing: add the `needs-human` label, assign to `me`, comment with the missing sections, then stop.

## 1. Decide where to resume

Decide from the actual state, not from memory:

```bash
git fetch origin --prune
git ls-remote --heads origin "*/<id>/*"
gh pr list --state all --search "<ID> in:title" --json number,title,state,headRefName,url,headRefOid --jq '[.[] | select(.title | startswith("[<ID>]"))]'
```

Find PRs by title, because the `head:` search qualifier matches only a full branch name. The title search is fuzzy, so keep the `startswith` filter. The ticket's PR is the open one, otherwise the merged one. Ignore PRs closed without merging.

| Actual state | Start from |
|---|---|
| PR merged | 9 (close out) |
| No open or merged PR, no remote branch | 2 (new branch) |
| No open or merged PR, remote branch exists | 2 (switch to the existing branch) → 3 |
| PR open, CI failed on the latest commit | 5 failure handling |
| PR open, no harness review on the latest commit | 5 → 6 |
| PR open, harness review on the latest commit is `changes_requested` | 7 (rework) |
| PR open, harness review on the latest commit is `approve`, but no `awaiting-merge` | **Human rejection**: read the PR comments and review comments a human left after that review (`gh pr view <n> --comments`, `gh api repos/yzzliu1993/systemlab/pulls/<n>/comments`), treat them as "Must fix" → 7 |

How to recognize a harness review: a PR comment that starts with `<!-- harness:review round=<N> sha=<commit> verdict=<approve|changes_requested> -->` (`gh pr view <n> --json comments`). The round count is the number of existing harness reviews.

## 2. Prepare the branch

1. The working directory must be clean (`git status --porcelain` is empty). If not, stop and tell the user. Do not stash or discard anything.
2. New branch: `<type>/<id>/<slug>`. `type` comes from the labels: Bug→`fix`, Feature→`feat`, Improvement→`refactor`, otherwise `feat`. `slug` is an English phrase from the ticket title (lowercase, hyphenated, at most 5 words).
   ```bash
   git switch -c <branch> origin/main
   ```
   Existing branch: `git switch <branch> && git pull --ff-only`.
3. If the ticket is in Todo: `mcp__linear__save_issue` with `state: "In Progress"` and `assignee: "me"`.
4. Update the progress comment (see "Progress comment").

## 3. Implement

Call the `implementer` subagent with the Agent tool. Include:
- The ticket id, branch name and full ticket body.
- For rework: the "Must fix" list or the CI failure log (key excerpts).

Read the json at the end of its reply:
- `blocked` → jump to "Hand off to a human", using `blocked_reason` as the reason.
- `done` → continue. Keep `summary`, `assumptions`, `tests` and `proposals`.

## 4. Verify, push and open the PR

1. Run `npm run verify` yourself (do not trust the subagent's report). On failure, give the error output to the implementer to redo; this counts as one failure.
2. Confirm there are new commits (`git log origin/main..HEAD --oneline` is not empty) and `git status --porcelain` is clean.
3. `git push -u origin <branch>` (`--force` is **forbidden**).
4. If there is no PR yet, create one:
   ```bash
   gh pr create --base main --head <branch> --title "[<ID>] <ticket title>" --body-file <temp file>
   ```
   The body contains: the Linear ticket link, the acceptance criteria checklist, the implementer's `summary`, the test scenario mapping (`tests`), and `## Assumptions` (`assumptions`, or "None"), ending with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Keep the temp file in the scratchpad or system temp directory, not in the repo.
5. `mcp__linear__save_issue` with `state: "In Review"` (Linear's PR automation does this too; set it again to be sure).

## 5. Wait for CI

```bash
gh run list --branch <branch> --commit $(git rev-parse HEAD) --json databaseId,status,conclusion
gh run watch <databaseId> --exit-status
```

Right after a push the run may not exist yet; wait 15 seconds and check again. Use a Bash timeout of 600000 for `gh run watch`.

- Green → 6.
- Failed → `gh run view <id> --log-failed`. If the error looks like CI flakiness (network, runner problems), run `gh run rerun <id>` once. Otherwise set the ticket back to `In Progress` and give the log to the implementer (back to 3); this counts as one failure.

## 6. Review

Call the `reviewer` subagent with the Agent tool. Include: the ticket id, full ticket body, PR number and round count, and from round 2 onward the previous review's "Must fix".

Post the reviewer's markdown to the PR (`gh pr comment <n> --body-file <temp file>`), starting with:

```
<!-- harness:review round=<N> sha=<git rev-parse HEAD> verdict=<verdict> -->
## 🤖 Harness Review (round <N>)
```

- `approve` → 8.
- `changes_requested` → 7.

## 7. Rework

1. Set the ticket back to `In Progress`.
2. If the PR is behind main or has conflicts, tell the implementer to `git merge origin/main` first.
3. Give the "Must fix" list to the implementer → back to 3 (step 4 then pushes to the same PR).

## 8. Merge or wait for a human

1. Check `gh pr view <n> --json mergeStateStatus`:
   - `BEHIND` → `gh pr update-branch <n> --rebase`, then `git fetch origin` and `git switch --detach origin/main` (the local branch has diverged from the remote, so do not pull), and wait for the new head to pass CI (the commands in 5, getting the sha from `gh pr view <n> --json headRefOid`).
   - `DIRTY` (conflicts) → 7, telling the implementer to resolve them with `git merge origin/main`.
2. Check the auto-merge conditions. **All** of these must hold, using fresh values from GitHub, not memory:
   - CI is green on the PR head commit (`gh pr view <n> --json headRefOid,statusCheckRollup`).
   - The latest harness review has `verdict=approve` and its `sha` equals `headRefOid`. A rebase in step 1 changes the head commit, so the review no longer matches and the PR goes to a human.
   - `mergeStateStatus` is `CLEAN`. Any other value, including `UNKNOWN`, does not qualify.
   - No changed file is a protected path. Get changed files from `gh pr diff <n> --name-only`, and the old path of any renamed file from `gh api repos/yzzliu1993/systemlab/pulls/<n>/files --paginate --jq '.[].previous_filename // empty'`.

   Protected paths: anything under `.claude/`, `.github/` or `specs/`, plus `CLAUDE.md`, `package.json`, `package-lock.json`, `tsconfig*`, `vite.config.ts`, `vitest.config.ts`, `.oxlintrc.json` and `.dependency-cruiser.cjs`.
3. All conditions hold → `gh pr merge <n> --squash`. Never use `--admin`. On success, update the progress comment and go to 9. On failure, go to 4 with the error as the reason.
4. Otherwise wait for a human:
   1. `mcp__linear__save_issue`: `state: "In Review"`, `addLabels: ["awaiting-merge"]`, `assignee: "me"`.
   2. Linear comment: "✅ Review passed and CI is green. Not auto-merged: <reason, naming each unmet condition or protected path>. Waiting for you to merge: <PR link>. If you disagree, comment on the PR, remove `awaiting-merge`, then run `/ticket <ID>`."
   3. `git switch main && git pull --ff-only`.

## 9. Close out (PR merged)

- Remove `awaiting-merge` (`removeLabels`). If the state is not Done, set it to Done.
- Rewrite the progress comment as a final summary (review rounds, failure count).
- `git switch main && git pull --ff-only`.
- Delete the local branch, using the PR's `headRefName` as `<branch>`. Skip this if there is no local branch. `git branch -d` always refuses after a squash merge, so compare commits instead:
  - `git rev-parse <branch>` equals the PR's `headRefOid` → `git branch -D <branch>`. Everything on the branch is in the PR.
  - Otherwise keep the branch and report it. It may hold commits that are not in the PR.

## Circuit breaker and handing off to a human

- **3** cumulative deterministic failures on one ticket (verify failure, CI failure, implementer returning a bad format; includes counts from earlier runs in the progress comment's "Failures" row, and resets to zero when a human removes `needs-human`), or **3** cumulative rounds of harness review `changes_requested` → hand off to a human.
- Hand off to a human: `addLabels: ["needs-human"]`, `assignee: "me"`, and a Linear comment summarizing the cause of each failure and the suggested next step. Leave the state unchanged. `git switch main`.
- After a human handles it and removes `needs-human`, rerunning `/ticket <ID>` resumes from the actual state.

## Follow-up tickets

For the implementer's and reviewer's `proposals`, and any `assumptions` that need human confirmation, open tickets per `specs/HARNESS_SPEC.md` §8:
- First search for similar tickets with `mcp__linear__list_issues` (`query`). If one exists, add a comment instead.
- Start the new ticket body with `<!-- harness:created-by-agent source=<ID> -->` and add the `agent-proposed` or `spec-needed` label.
- Open at most 3 per run.

## Progress comment

Maintain **one** comment on the ticket that starts with `<!-- harness:progress -->` (find its id with `mcp__linear__list_comments` and update it through the `id` of `mcp__linear__save_comment`; create one only if none exists). Update it at steps 2, 4, 6 and 8, and when handing off to a human:

```markdown
<!-- harness:progress -->
**Harness progress**
| Item | Value |
|---|---|
| Stage | implement / ci / review / awaiting_merge / done / needs_human |
| Branch | `<branch>` |
| PR | #<n> |
| Review rounds | <N> |
| Failures | 1. … |
| Next step | … |
```

## Forbidden

- `gh pr merge` anywhere except step 8, `gh pr merge --admin`, `git push --force`, pushing directly to `main`, `git reset --hard`.
- Writing or modifying product code yourself (that goes to the implementer).
- Changing ticket state outside the spec.
