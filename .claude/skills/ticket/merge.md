# /ticket: merge and close out

Steps 8 and 9 of `SKILL.md`. Other step numbers refer to that file. Read `comments.md` first.

## 8. Merge or wait for a human

1. Check `gh pr view <n> --json mergeStateStatus`:
   - `BEHIND` → `gh pr update-branch <n> --rebase`, then `git fetch origin` and `git switch --detach origin/main` (the local branch has diverged from the remote, so do not pull), and wait for the new head to pass CI (the commands in step 5, getting the sha from `gh pr view <n> --json headRefOid`).
   - `DIRTY` (conflicts) → step 7, telling the implementer to resolve them with `git merge origin/main`.
2. Check the auto-merge conditions. **All** of these must hold, using fresh values from GitHub, not memory:
   - CI is green on the PR head commit (`gh pr view <n> --json headRefOid,statusCheckRollup`).
   - The latest harness review by `yzzliu1993` (see "Which comments count" in `comments.md`) has `verdict=approve` and its `sha` equals `headRefOid`. A rebase in item 1 changes the head commit, so the review no longer matches and the PR goes to a human.
   - `mergeStateStatus` is `CLEAN`. Any other value, including `UNKNOWN`, does not qualify.
   - `isDraft` is `false` (`gh pr view <n> --json isDraft`). A draft can report `CLEAN`, so that check does not cover it. If `isDraft` cannot be read, this condition is not met, and the comment in 4 gives the error.
   - No changed file is a protected path (the list is in step 8 of `SKILL.md`). Get changed files from `gh pr diff <n> --name-only`, and the old path of any renamed file from `gh api repos/yzzliu1993/systemlab/pulls/<n>/files --paginate --jq '.[].previous_filename // empty'`.
3. All conditions hold → `gh pr merge <n> --subject "<type>(<ID>): <description> (#<n>)" --squash`. `<type>` is the type in the PR's branch name, and `<description>` is a short plain English phrase with no quotes, backticks or `$`. Keep `--squash` last so the command matches the allow rule in `.claude/settings.json`. Never use `--admin`. On success, update the progress comment and go to step 9 below. On failure, go to item 4 with the error as the reason.
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
