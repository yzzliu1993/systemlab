# Reviewer: acting on the verdict

Read by `.claude/agents/reviewer.md` (step 6) in v4 mode. Spec: `specs/HARNESS_SPEC.md` §3.5, §5.1, §8. `<sha>` is the head your harness review is for.

## changes_requested (or red CI)

- This makes **3** `changes_requested` rounds → stop with `needs-human` (`agent-common.md`).
- Otherwise: `mcp__linear__save_issue` with `state: "In Progress"` and `addLabels: ["needs-rework"]` (the assignee stays). Put the "Must fix" list, or the CI log excerpt, into the progress comment's "Next step". Release your claim with `outcome=needs-rework`. An implementer picks it up from there.

## approve: check the conditions

Use fresh values from GitHub, never memory:

- `gh pr view <n> --json headRefOid,statusCheckRollup,mergeStateStatus,isDraft,state`: `headRefOid` is `<sha>`, every check is `SUCCESS`, `state` is `OPEN`, `isDraft` is `false`. A draft can report `CLEAN`, so check `isDraft` on its own; if it cannot be read, the condition fails.
- Your harness review for `<sha>` with `by=<your agent id>` is the latest harness review on the PR.
- No changed file is a protected path (list in `reviewer.md`). Changed files: `gh pr diff <n> --name-only`. Old paths of renamed files: `gh api repos/yzzliu1993/systemlab/pulls/<n>/files --paginate --jq '.[].previous_filename // empty'`.
- No implementer claim on the ticket has `by=<your agent id>`.

## approve: act by case

- **A protected path changed** (whatever the merge state) → hand to the human. **Do not merge.**
- **`CLEAN`** and every condition holds → merge, keeping `--squash` last:
  `gh pr merge <n> --subject "<type>(<ID>): <description> (#<n>)" --match-head-commit <sha> --squash`
  `<type>` is the start of the PR's branch name; `<description>` is a short plain English phrase with no quotes, backticks or `$`. Success → "Close out". An error → hand to the human with the error.
- **`BEHIND`** (main moved):
  1. `git fetch origin`. Record `O=<sha>` and `B=$(git merge-base <sha> origin/main)`.
  2. `gh pr update-branch <n> --rebase`.
  3. Read `gh pr view <n> --json headRefOid` until it differs from `O`; that is `N`. Wait for CI on `N` (reviewer.md step 3).
  4. `git fetch origin`, `NB=$(git merge-base N origin/main)`, `git range-diff B..O NB..N`. The patch is unchanged when every commit pair is marked `=`.
  5. Unchanged and CI green → review `N` from reviewer.md step 4 (a new harness review for the new sha; the round count goes up) and act on that verdict. Green CI on `N` covers semantic clashes with new code on `main`, which the patch check cannot catch.
  6. Patch changed, update-branch conflict, or red CI → return with `needs-rework` (as in "changes_requested"), saying what changed.
- **`DIRTY`** (conflicts) → return with `needs-rework`; the implementer resolves with `git merge origin/main`.
- **Anything else** (`BLOCKED`, `UNKNOWN`, `UNSTABLE`, …) → read it again after 30 seconds, up to 3 times. Still not `CLEAN` → hand to the human with the state as the reason.

## Hand to the human (awaiting-merge)

`mcp__linear__save_issue` with `addLabels: ["awaiting-merge"]` and `assignee: "me"` (state stays In Review). Comment: "✅ Review passed and CI is green. Not merged by the reviewer: <reason, naming each protected path or unmet condition>. Waiting for you to merge: <PR link>." Update the progress comment (Stage `awaiting_merge`) and release your claim with `outcome=awaiting-merge`.

## Close out (after your merge)

1. `mcp__linear__save_issue` with `state: "Done"` and `removeLabels: ["awaiting-merge", "needs-rework"]`.
2. Rewrite the progress comment as a final summary (Stage `done`, review rounds, failure count). Release your claim with `outcome=merged`.
3. CI on `main` for the merge commit: `gh pr view <n> --json mergeCommit`, then `gh run list --branch main --commit <merge sha> --json databaseId,status,conclusion` and `gh run watch <id> --exit-status`. On failure, comment on the open `main-ci-failure` ticket if one exists, otherwise create one: team `Youzhuliu`, Todo, Urgent, labels `agent-proposed` and `main-ci-failure`, assignee `me`, body starting with `<!-- harness:created-by-agent source=<YOU-n from the commit subject, or main> -->` and holding only the run link and log excerpt.
4. Tidy hand-offs: In Review tickets with `awaiting-merge` whose PR is merged → `state: "Done"`, `removeLabels: ["awaiting-merge"]`.
