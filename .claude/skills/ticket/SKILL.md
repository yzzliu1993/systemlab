---
name: ticket
description: Process one Linear ticket, from reading it to merge. Read the ticket → create a branch → implementer implements → verify locally → push and open a PR → In Review → wait for CI → reviewer reviews → auto-merge if all conditions hold, otherwise wait for a human to merge. Rerunning after an interruption resumes from the actual state.
argument-hint: <ticket id, for example YOU-20>
disable-model-invocation: true
---

# /ticket $ARGUMENTS

You are the orchestrator. You advance the flow and **verify** results. Code goes to the `implementer` subagent, except on a `harness` ticket (step 3), and review goes to the `reviewer` subagent. A subagent saying "done" does not count: confirm it yourself (verify passes, CI is green) before advancing state. See `specs/HARNESS_SPEC.md` for the full spec.

Ticket id: `$ARGUMENTS` (called `<ID>` below; `<id>` is the lowercase form, for example `you-20`). Linear team: `Youzhuliu`. Repo: `yzzliu1993/systemlab`.

## Before step 0: check that this skill is current

This skill loads from the working copy, so local `main` may hold an old version. Check first, and change nothing else until this passes:

```bash
git fetch origin --prune
git diff --quiet HEAD...origin/main -- .claude/skills/ticket/SKILL.md
```

The three dots show only what `main` changed since this branch left it, so a branch's own edits to the skill do not count.

- Exit code 0 → the skill is current. Continue with step 0.
- Exit code 1 → the skill differs:
  1. If `git status --porcelain` is not empty, report that the skill is out of date and the working directory is not clean, then stop. Do not stash or discard anything.
  2. Note the current branch, or the commit if `HEAD` is detached, then run `git switch main && git pull --ff-only`. If this fails, report the error and stop.
  3. Read `.claude/skills/ticket/SKILL.md` with the Read tool and follow that version from here on, not the text you loaded. If you were not on `main`, switch back to what you noted.
- Any other result, such as a failed fetch → report the error and stop.

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
| PR open, harness review on the latest commit is `approve`, no `awaiting-merge`, no human comment after that review | **Interrupted run**: the last run stopped before step 8 → 8 |
| PR open, harness review on the latest commit is `approve`, no `awaiting-merge`, human comment after that review | **Human rejection**: treat those human comments as "Must fix" → 7 |

How to recognize a harness review: a PR comment that starts with `<!-- harness:review round=<N> sha=<commit> verdict=<approve|changes_requested> -->` (`gh pr view <n> --json comments`). The round count is the number of existing harness reviews.

How to find human comments after a review: read PR comments and review bodies (`gh pr view <n> --json comments,reviews`) and inline review comments (`gh api repos/yzzliu1993/systemlab/pulls/<n>/comments`). Keep those newer than the harness review, comparing `createdAt`, `submittedAt` and `created_at` respectively. All comments come from the same account, so the author proves nothing: a comment that starts with `<!-- harness:` is written by the harness and does not count, and neither does a review with an empty body.

If the PR is open, get onto its branch before you continue, whichever row applies. A resumed run can start on any branch, and `implementer` and `reviewer` both work from the current one. `<branch>` is the PR's `headRefName`.

1. If `git status --porcelain` is not empty, report it and stop. Do not switch branches, stash or discard anything.
2. If `git branch --list <branch>` prints the branch, run `git log --oneline --cherry-pick --right-only origin/<branch>...<branch>`. It compares patches, not hashes, because a rebase in step 8 gives commits already on the remote new hashes. Each line it prints is a commit with no matching patch on the remote. If it prints anything, name those commits and stop. Do not push them or change the branch, because they may be unfinished work from an interrupted run. If the command fails, report the error and stop.
3. Run `git switch -C <branch> origin/<branch>`. This aligns the branch with the remote, and creates it if there is no local branch. If this fails, report the error and stop.

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

**`harness` label:** do not call `implementer`, because it may not edit protected paths (listed in step 8). Make the changes yourself, from the ticket, the "Must fix" list or the CI failure log, and commit them with the convention in `CLAUDE.md`. Wherever this skill gives `implementer` a task, including a redo in step 4 or a merge in step 7, do that task yourself. Write the `summary`, `tests` and `assumptions` for the PR body yourself. If the spec is too unclear to continue, jump to "Hand off to a human", as `implementer` would return `blocked`. Otherwise continue with 4.

For any other ticket, call the `implementer` subagent with the Agent tool. Include:
- The ticket id, branch name and full ticket body.
- For rework: the "Must fix" list or the CI failure log (key excerpts).

Read the json at the end of its reply:
- `blocked` → jump to "Hand off to a human", using `blocked_reason` as the reason.
- `done` → continue. Keep `summary`, `assumptions`, `tests` and `proposals`.

## 4. Verify, push and open the PR

1. Run `npm run verify` yourself (do not trust the subagent's report). On failure, give the error output to the implementer to redo; this counts as one failure.
2. Confirm there are new commits (`git log origin/main..HEAD --oneline` is not empty) and `git status --porcelain` is clean.
   Then reread the ticket, because a pause during the run can leave the body or comments changed. Get the body with `mcp__linear__get_issue` and the comments with `mcp__linear__list_comments`. If either read fails, report the error and stop without pushing.
   - Ignore comments that start with `<!-- harness:`. Compare the body with the one from step 0, and check every other comment against the commits. Step 0 does not read comments, so there is no earlier list to compare with, but a comment the commits already satisfy changes nothing.
   - Nothing changes the work → continue with item 3.
   - The work must change and the commits can stay as a base → go back to 3 to update the work, using the new body and comments as the task. This does not count as a failure.
   - The body or a comment conflicts with the commits, for example a commit does what the ticket no longer asks → do not push. Jump to "Hand off to a human" and report the difference.
3. **`harness` label:** run `git diff --no-renames --name-only origin/main...HEAD`. If any file is outside the protected paths in step 8, do not push. Jump to "Hand off to a human" and name those files.
4. `git push -u origin <branch>` (`--force` is **forbidden**).
5. If there is no PR yet, create one:
   ```bash
   gh pr create --base main --head <branch> --title "[<ID>] <ticket title>" --body-file <temp file>
   ```
   The body contains: the Linear ticket link, the acceptance criteria checklist, the implementer's `summary`, the test scenario mapping (`tests`), and `## Assumptions` (`assumptions`, or "None"), ending with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Keep the temp file in the scratchpad or system temp directory, not in the repo.
6. `mcp__linear__save_issue` with `state: "In Review"` (Linear's PR automation does this too; set it again to be sure).

## 5. Wait for CI

```bash
gh pr view <n> --json headRefName,headRefOid
gh run list --branch <headRefName> --commit <headRefOid> --json databaseId,status,conclusion
gh run watch <databaseId> --exit-status
```

Use the PR's head commit, not local `HEAD`, because step 8's rebase leaves `HEAD` elsewhere. If this run just pushed, repeat the first command for up to a minute until `headRefOid` equals `git rev-parse HEAD`, because GitHub can return the previous head for a few seconds after a push. If it still differs, report it and stop. Keep this `headRefOid` for step 6.

Right after a push the run may not exist yet; wait 15 seconds and check again. Use a Bash timeout of 600000 for `gh run watch`.

- Green → 6.
- Failed → `gh run view <id> --log-failed`. If the error looks like CI flakiness (network, runner problems), run `gh run rerun <id>` once. Otherwise set the ticket back to `In Progress` and give the log to the implementer (back to 3); this counts as one failure.

## 6. Review

Call the `reviewer` subagent with the Agent tool. Include: the ticket id, full ticket body, PR number and round count, and from round 2 onward the previous review's "Must fix".

Read the json block at the end of the reply before posting anything. Never infer the verdict from the text, even when "Must fix" is empty.

- Block missing, or `verdict` is not `approve` or `changes_requested` → ask the same `reviewer` once for the json block with `SendMessage`, and add a `format` row to the friction comment.
- Still missing → jump to "Hand off to a human", with the missing verdict as the reason. Do not post the review.

Post the reviewer's markdown to the PR without its `## Verdict` section (`gh pr comment <n> --body-file <temp file>`), starting with:

```
<!-- harness:review round=<N> sha=<headRefOid from step 5> verdict=<verdict> -->
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
   - `isDraft` is `false` (`gh pr view <n> --json isDraft`). A draft can report `CLEAN`, so that check does not cover it. If `isDraft` cannot be read, this condition is not met, and the comment in 4 gives the error.
   - No changed file is a protected path. Get changed files from `gh pr diff <n> --name-only`, and the old path of any renamed file from `gh api repos/yzzliu1993/systemlab/pulls/<n>/files --paginate --jq '.[].previous_filename // empty'`.

   Protected paths: anything under `.claude/`, `.github/` or `specs/`, plus `CLAUDE.md`, `package.json`, `package-lock.json`, `tsconfig*`, `vite.config.ts`, `vitest.config.ts`, `.oxlintrc.json` and `.dependency-cruiser.cjs`.
3. All conditions hold → `gh pr merge <n> --subject "<type>(<ID>): <description> (#<n>)" --squash`. `<type>` is the type in the PR's branch name, and `<description>` is a short plain English phrase with no quotes, backticks or `$`. Keep `--squash` last so the command matches the allow rule in `.claude/settings.json`. Never use `--admin`. On success, update the progress comment and go to 9. On failure, go to 4 with the error as the reason.
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
- Start the new ticket body with `<!-- harness:created-by-agent source=<ID> -->` and add the `agent-proposed` or `spec-needed` label. If its scope is protected paths only, add `harness` too.
- Exception: an out-of-scope bug goes to Todo with `bug` instead of `agent-proposed` only when all of these hold. Otherwise it keeps `agent-proposed`.
  - The body has every Definition of Ready section (spec §2.3).
  - The body states actual behavior, expected behavior and steps to reproduce.
  - Its scope has no protected path (step 8).
  - The body of `<ID>` does not have the `harness:created-by-agent` marker.
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

## Friction comment

At the end of **every** run, including a run that stops at step 8 or hands off to a human, record what went wrong in this run. Do it then, not at close-out: close-out may happen in a later session that does not know what happened.

Maintain **one** comment on the ticket that starts with `<!-- harness:friction -->`. Create it on the first problem and add rows after that. Never rewrite or remove existing rows. If nothing went wrong, leave no comment.

```markdown
<!-- harness:friction -->
**Harness friction**
| Type | What happened | Workaround |
|---|---|---|
| failure / format / permission / workaround / human | … | … |
```

- `failure`: a step failed for a reason the "Failures" row does not explain.
- `format`: a subagent's reply broke its required format.
- `permission`: a permission prompt or denial interrupted the flow.
- `workaround`: you did something the skill does not describe to get past a problem.
- `human`: a human had to step in, other than the normal merge of a protected path PR.

Record facts, not guesses. Rejected reviews and failures already in the progress comment do not need a row. `/retro` reads this comment.

## Forbidden

- `gh pr merge` anywhere except step 8, `gh pr merge --admin`, `git push --force`, pushing directly to `main`, `git reset --hard`.
- Writing or modifying product code yourself (that goes to the implementer). On a `harness` ticket you change protected paths only.
- Changing ticket state outside the spec.
