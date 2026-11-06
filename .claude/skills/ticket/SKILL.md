---
name: ticket
description: Process one Linear ticket, from reading it to merge. Read the ticket → create a branch → implementer implements → verify locally → push and open a PR → In Review → wait for CI → reviewer reviews → auto-merge if all conditions hold, otherwise wait for a human to merge. Rerunning after an interruption resumes from the actual state.
argument-hint: <ticket id, for example YOU-20>
disable-model-invocation: true
---

# /ticket $ARGUMENTS
You are the orchestrator. You advance the flow and **verify** results. Code goes to the `implementer` subagent, except on a `harness` ticket (step 3), and review goes to the `reviewer` subagent. A subagent saying "done" does not count: confirm it yourself (verify passes, CI is green) before advancing state. See `specs/HARNESS_SPEC.md` for the full spec.

Ticket id: `$ARGUMENTS` (called `<ID>` below; `<id>` is the lowercase form, for example `you-20`). Linear team: `Youzhuliu`. Repo: `yzzliu1993/systemlab`.

## Supporting files
These files sit beside this one and load only when read. `comments.md` has which comments count, the review, progress and friction formats, and follow-up ticket rules: read it before the first comment or review check of a run. `resume.md` has the rest of step 1 for a ticket with an open PR. `merge.md` has steps 8 and 9. Read each with `git show origin/main:./.claude/skills/ticket/<file>` from the repo root, never from the working copy, because a resumed run sits on the PR branch and that copy can be older. If the command fails, report the error and stop.

## Before step 0: check that this skill is current
This skill loads from the working copy, so local `main` may hold an old version. Check first, and change nothing else until this passes:
```bash
git fetch origin --prune
git diff --quiet HEAD...origin/main -- .claude/skills/ticket/
```
The three dots show only what `main` changed since this branch left it, so a branch's own edits to the skill do not count.
- Exit code 0 → the skill is current. Continue with step 0.
- Exit code 1 → the skill differs:
  1. If `git status --porcelain` is not empty, report that the skill is out of date and the working directory is not clean, then stop. Do not stash or discard anything. Exception: on a permission file ticket (step 3), read the ticket, and if the only dirty file is that ticket's permission file, continue with item 2. The edit stays in the working directory.
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
| PR open | Read `resume.md` and follow it |

## 2. Prepare the branch
1. The working directory must be clean (`git status --porcelain` is empty). If not, stop and tell the user. Do not stash or discard anything. Exception: on a permission file ticket (step 3), the ticket's permission file may be dirty, and `git switch -c` in item 2 carries the edit to the new branch. Any other dirty file still stops the run.
2. New branch: `<type>/<id>/<slug>`. `type` comes from the labels: Bug→`fix`, Feature→`feat`, Improvement→`refactor`, otherwise `feat`. `slug` is an English phrase from the ticket title (lowercase, hyphenated, at most 5 words).
   ```bash
   git switch -c <branch> origin/main
   ```
   Existing branch: `git switch <branch> && git pull --ff-only`.

   If either command fails, for example because a carried edit conflicts with newer `origin/main` changes, report the error and stop.
3. If the ticket is in Todo: `mcp__linear__save_issue` with `state: "In Progress"` and `assignee: "me"`.
4. Update the progress comment (see "Progress comment" in `comments.md`).

## 3. Implement
**Permission file ticket:** a `harness` ticket whose scope is only a permission file, which is `.claude/settings.json` or `.claude/settings.local.json`. This rule comes before the `harness` rule below. Never edit a permission file: a human proposes and makes the edit, so an agent cannot change its own permissions. If a ticket needs a permission file and other files, jump to "Hand off to a human" and ask for it to be split.

- The working directory holds the edit → `git add` that file, commit it unchanged with the convention in `CLAUDE.md`, and continue with 4.
- No edit yet → run `git switch main` and `git branch -d <branch>`, because the branch has no commits and the rerun creates it again. Then jump to "Hand off to a human", naming the edit the ticket asks for. The human makes the edit in the working directory, removes `needs-human` and reruns `/ticket <ID>`.
- A "Must fix" or CI failure that needs the file changed → jump to "Hand off to a human". The human commits and pushes the edit on the PR branch, then reruns, because step 1 stops on a dirty working directory or an unpushed commit.

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

Post the reviewer's markdown to the PR without its `## Verdict` section (`gh pr comment <n> --body-file <temp file>`), starting with the header in `comments.md`. Use the `headRefOid` from step 5.
- `approve` → 8.
- `changes_requested` → 7.

## 7. Rework
1. Set the ticket back to `In Progress`.
2. If the PR is behind main or has conflicts, tell the implementer to `git merge origin/main` first.
3. Give the "Must fix" list to the implementer → back to 3 (step 4 then pushes to the same PR).

## 8. Merge or wait for a human
Read `merge.md` and follow its step 8. No other step may merge.

Protected paths: anything under `.claude/`, `.github/` or `specs/`, plus `CLAUDE.md`, `package.json`, `package-lock.json`, `tsconfig*`, `vite.config.ts`, `vitest.config.ts`, `.oxlintrc.json` and `.dependency-cruiser.cjs`.

## 9. Close out (PR merged)
Read `merge.md` and follow its step 9.

## Circuit breaker and handing off to a human
- **3** cumulative deterministic failures on one ticket (verify failure, CI failure, implementer returning a bad format; includes counts from earlier runs in the progress comment's "Failures" row, and resets to zero when a human removes `needs-human`), or **3** cumulative rounds of harness review `changes_requested` → hand off to a human.
- Hand off to a human: `addLabels: ["needs-human"]`, `assignee: "me"`, and a Linear comment summarizing the cause of each failure and the suggested next step. Leave the state unchanged. `git switch main`.
- After a human handles it and removes `needs-human`, rerunning `/ticket <ID>` resumes from the actual state.

## Comments and follow-up tickets
Maintain one `<!-- harness:progress -->` comment on the ticket, updated at steps 2, 4, 6 and 8 and when handing off to a human. At the end of **every** run, including a run that stops at step 8 or hands off to a human, record what went wrong in one `<!-- harness:friction -->` comment. `comments.md` has both formats and rules. It also has the rules for follow-up tickets: read them before opening one for a `proposals` item or an assumption that needs human confirmation.

## Forbidden
- `gh pr merge` anywhere except step 8, `gh pr merge --admin`, `git push --force`, pushing directly to `main`, `git reset --hard`.
- Writing or modifying product code yourself (that goes to the implementer). On a `harness` ticket you change protected paths only.
- Changing ticket state outside the spec.
