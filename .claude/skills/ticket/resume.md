# /ticket: resume a run with an open PR

Step 1 sends a run here when the ticket has an open PR. Step numbers refer to `SKILL.md`. Read `comments.md` first: it says which comments count and how to recognize a harness review.

| Actual state | Start from |
|---|---|
| PR open, CI failed on the latest commit | 5 failure handling |
| PR open, no harness review on the latest commit | 5 → 6 |
| PR open, harness review on the latest commit is `changes_requested` | 7 (rework) |
| PR open, harness review on the latest commit is `approve`, no `awaiting-merge`, no human comment after that review | **Interrupted run**: the last run stopped before step 8 → 8 |
| PR open, harness review on the latest commit is `approve`, no `awaiting-merge`, human comment after that review | **Human rejection**: treat those human comments as "Must fix" → 7 |

How to find human comments after a review: read PR comments and review bodies (`gh pr view <n> --json comments,reviews`) and inline review comments (`gh api repos/yzzliu1993/systemlab/pulls/<n>/comments`). Keep those newer than the harness review, comparing `createdAt`, `submittedAt` and `created_at` respectively. The harness and the human share the `yzzliu1993` account, so the author does not tell them apart: a comment by that account that starts with `<!-- harness:` is written by the harness and does not count as a human comment, and neither does a review with an empty body.

If the PR is open, get onto its branch before you continue, whichever row applies. A resumed run can start on any branch, and `implementer` and `reviewer` both work from the current one. `<branch>` is the PR's `headRefName`.

1. If `git status --porcelain` is not empty, report it and stop. Do not switch branches, stash or discard anything.
2. If `git branch --list <branch>` prints the branch, run `git log --oneline --cherry-pick --right-only origin/<branch>...<branch>`. It compares patches, not hashes, because a rebase in step 8 gives commits already on the remote new hashes. Each line it prints is a commit with no matching patch on the remote. If it prints anything, name those commits and stop. Do not push them or change the branch, because they may be unfinished work from an interrupted run. If the command fails, report the error and stop.
3. Run `git switch -C <branch> origin/<branch>`. This aligns the branch with the remote, and creates it if there is no local branch. If this fails, report the error and stop.
