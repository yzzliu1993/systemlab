# HARNESS_SPEC v3: Linear × GitHub × Claude Code development flow

> v3 moves to a **Claude Code native architecture**: the Claude Code main session is the orchestrator. It reads tickets and changes state through the Linear MCP,
> and uses subagents in `.claude/agents/` to implement, review and decompose. The flow steps live in `.claude/skills/`.
> The v2 TypeScript orchestrator (`harness/`, `claude -p`) was removed in YOU-19.

---

## 0. Goals and non-goals

**Goals**
- Claude Code moves Linear tickets from Backlog to merged. Humans step in only at defined gates (merging PRs that do not qualify for auto-merge, answering questions).
- After an interruption (closed session, exhausted quota, reboot), rerunning the same command resumes from the **actual state** (git branch, PR, CI, Linear).
- When the spec is unclear, take the most conservative approach and open a ticket to ask a human instead of guessing.

**Non-goals**
- Developing multiple tickets in parallel.
- An unattended background daemon (use Claude Code's `/loop` when needed; the session must stay open).
- Deployment / release.

---

## 1. Roles

| Component | What it is | Responsible for | Not responsible for |
|---|---|---|---|
| **Main session** (orchestrator) | The Claude Code session you open, running `/ticket`, `/next`, `/decompose` and `/retro` | Reading tickets, changing Linear state and labels, creating branches, **verifying** subagent results, pushing, opening PRs, waiting for CI, posting reviews, opening follow-up tickets, auto-merging per §5.1 | Writing product code (`harness` tickets change protected paths only, §3.7), merging outside §5.1 |
| **implementer** | `.claude/agents/implementer.md` | Implementing and writing tests on the branch, running `npm run verify`, committing | Pushing, PRs, Linear |
| **reviewer** | `.claude/agents/reviewer.md` | Read-only review of whether the diff meets the acceptance criteria and test scenarios | Modifying anything |
| **decomposer** | `.claude/agents/decomposer.md` | Read-only repo exploration and proposing sub-tickets | Creating tickets (the main session does that) |
| **CI** | GitHub Actions `verify` job | `npm ci && npm run verify` | — |
| **Human** | You | Opening tickets, deciding on `agent-proposed`, answering `spec-needed`, handling `needs-human`, **pressing merge on PRs that do not qualify for auto-merge** | — |

> Core rule: **subagents produce results, and the main session verifies them before advancing state**. An implementer saying it is done does not count: the main session runs verify itself and waits for green CI.
> Subagents have separate contexts, so heavy file reading during implementation and review does not fill the main session. The reviewer cannot see the implementer's reasoning, which keeps the review independent.

---

## 2. Linear setup

### 2.1 States
`Backlog → Todo → In Progress → In Review → Done` (plus `Canceled`)

### 2.2 Labels
| Label | Meaning | Added by |
|---|---|---|
| `draft` | Still being written; do not decompose | Human |
| `decomposed` | Already decomposed; do not decompose again | Main session |
| `awaiting-merge` | Review passed and CI is green, but the PR did not qualify for auto-merge; waiting for a human to merge | Main session |
| `needs-human` | Stuck and needs a human; the flow skips this ticket | Main session |
| `spec-needed` | Question ticket for an unclear spec | Main session |
| `agent-proposed` | An idea or out-of-scope bug raised by an agent | Main session |
| `bug` | An agent-opened bug that meets the §8 conditions, so it enters the flow without `agent-proposed` | Main session |
| `harness` | Changes protected paths only (§5.1); runs through `/ticket` per §3.7 | Human or main session |
| `main-ci-failure` | Reports a failed CI run on `main`; `/next` uses it to find earlier reports | Main session |

(The v2 `agent:working` label is no longer used and can be deleted in Linear.)

### 2.3 Ticket format (Definition of Ready)
A Todo ticket must contain the sections below. If any is missing, the main session does not implement it and adds `needs-human`:

```markdown
## Goal
## Scope / Out of scope
## Acceptance criteria
- [ ] ... (each one must be verifiable by a test)
## Test scenarios
| # | Scenario | Given | When | Then | Type |
|---|---|---|---|---|---|
| T1 | Happy path | ... | ... | ... | unit / component |
| T2 | Boundary | ... | ... | ... | unit |
| T3 | Error handling | ... | ... | ... | unit |
## Dependencies (blocked by)
```

- Each acceptance criterion maps to at least one test scenario. Scenarios cover at least one happy path, one boundary and one error handling case.
- Each scenario needs a test whose name starts with the scenario number (`it('T2: empty array returns empty result', ...)`). The reviewer matches on this.

---

## 3. Flow

```
Backlog ──/decompose──▶ decomposer proposes ──▶ main session creates sub-tickets in Todo (parent gets decomposed)

Todo ──/ticket──▶ In Progress ──implementer──▶ verify ──▶ push ──▶ open PR ──▶ In Review
                     ▲                                                             │
                     │                                                wait for CI ─┤
                     │   CI failure / reviewer rejection / human rejection         │
                     └──────────────────────────────────────────────── reviewer ◀──┘
                                                                           │ approve
                                                                           ▼
                                                                  §5.1 conditions hold ──auto-merge──▶ Done
                                                                  otherwise ──▶ awaiting-merge ──human merges──▶ Done
```

`.claude/skills/ticket/SKILL.md` is the source of truth for step details.

### 3.1 Commands
| Command | Purpose |
|---|---|
| `/ticket YOU-n` | Take one ticket to auto-merge, or to awaiting-merge when a human must merge; rerunning resumes from the actual state, and closes out the ticket once its PR is merged |
| `/next` | Close out merged tickets, then pick one ticket per §3.3 |
| `/decompose YOU-n` | Decompose one Backlog ticket |
| `/retro` | Find repeated problems in recently finished tickets and open improvement tickets (§3.6) |
| `/loop 10m /next` | Run `/next` on a timer (works while the session is open) |

### 3.2 State changes
- Linear's GitHub integration: PR opened → In Review, PR merged → Done (Team Settings → Workflow → Pull request automations).
- The main session performs other transitions through the Linear MCP (`save_issue`): Todo → In Progress, setting In Review again after opening the PR, returning rejected work to In Progress, labels and comments.

### 3.3 `/next` selection order
Before selecting, `/next` updates local `main` with `git pull --ff-only`, and finishes if that fails. A paused run skips the update.

1. Close out: tickets with `awaiting-merge` that are already Done / Canceled get the label removed, and the local branch of a merged PR is deleted if its head equals the PR head. Otherwise the branch is kept and reported.
2. Check CI on `main`: see below. A paused run skips this.
3. Interrupted tickets: In Progress with a `<!-- harness:progress -->` comment.
4. Human rejections or runs interrupted after review: In Review, no `awaiting-merge`, with a progress comment. `/ticket` step 1 tells the two apart by whether a human commented after the latest `approve` review.
5. Todo: all blocked-by tickets are Done; priority Urgent → Low, None last; within a priority, oldest first.
6. Backlog: no `decomposed`, last updated more than 30 minutes ago, not opened by an agent.

Always skip `needs-human`, `spec-needed`, `agent-proposed` and `draft`.

The CI check selects the newest run of the `CI` workflow on `main` whose conclusion is not `cancelled`. A run has failed if its conclusion is `failure`, `timed_out` or `startup_failure`. The check stops there if the run has not finished or has any other conclusion. For a failed run, the first match below applies:

1. A `main-ci-failure` ticket in any state, including Done and Canceled, names the failing commit: do nothing.
2. The log looks like CI flakiness and `attempt` is 1: rerun once and open no ticket. The next `/next` reads the result.
3. A `main-ci-failure` ticket is open: add a comment with the commit, run URL and log excerpt.
4. Otherwise open a ticket per §8.

A failure does not pause work: selection continues as usual, and the final report names what the check did. A `gh` or Linear error is reported, opens no ticket and does not stop `/next`. If only the log cannot be read or is empty, the check continues and says so in the ticket or comment.

### 3.4 Notifications
When you need to act (`awaiting-merge`, `needs-human`), the main session **assigns the ticket to you** and leaves a comment.

### 3.5 Pausing and stepping in
- Pause `/next`: create `.harness/PAUSE` (only close-out runs). Delete it to resume.
- Disagree with a review: comment on the PR and remove `awaiting-merge`, then run `/ticket YOU-n` (or wait for `/next`). Rework starts with your comments.
- You may push to an agent's branch manually. Resuming uses the remote as the source of truth.

### 3.6 Friction and `/retro`

Agents raise `proposals` only for what they notice inside one ticket. Friction records the rest, and `/retro` looks for patterns across tickets.

- **Recording**: at the end of every `/ticket` run, the main session adds rows to one append-only `<!-- harness:friction -->` comment on the ticket. A run with no problems leaves no comment. It records at the end of each run, not at close-out, because close-out may happen in a later session. The `/ticket` skill defines the row types.
- **Reading**: `/retro` reads Done tickets completed since its last run, at most 20, reading comments three tickets at a time. It takes the oldest first, so a later run picks up any it leaves.
- **Measuring**: `/retro` reports failures, review rounds and human interventions per ticket, and compares them with the last run.
- **Opening tickets**: a ticket needs evidence: the same problem on at least two tickets, or one clear failure, with ticket ids. The limits in §8 apply.
- **Run log**: each run adds a `<!-- harness:retro at=<ISO time> -->` comment on YOU-32. The next run gets its start time from the newest one.

Guardrails:

- Changes to permissions, protected paths or merge conditions come only from a human. `/retro` reports these and opens no ticket.
- One open harness PR at a time, so an effect can be traced to its change.
- A human always merges harness changes.

### 3.7 Harness tickets
A ticket with the `harness` label changes protected paths (§5.1) only. `implementer` may not edit those, so `/ticket` runs it with one difference: the main session makes the changes, including rework. `reviewer` still reviews it.

- Guard: before pushing, the main session checks the diff. A file outside the protected paths stops the run and hands off to a human, so the main session never writes product code.
- Merging: the PR changes a protected path, so a human merges it.
- A change that needs both protected paths and other files is split into two tickets.

---

## 4. Subagents

| Subagent | Tools | model | maxTurns |
|---|---|---|---|
| implementer | Read, Edit, Write, Glob, Grep, Bash | sonnet | 150 |
| reviewer | Read, Glob, Grep, Bash (read-only git commands only) | sonnet | 60 |
| decomposer | Read, Glob, Grep | sonnet | 40 |

- Each subagent's last message ends with a json block (format in its definition file). The main session uses it to decide the next step.
- If `reviewer` leaves out the block, the main session asks once and never infers the verdict. A second miss hands off to a human.
- Only the main session operates Linear. Subagents do not call Linear tools.
- Forbidden actions (written in `CLAUDE.md` and the subagent definitions; also recommended as `permissions.deny` in `.claude/settings.json`): `gh pr merge --admin`, `git push --force`, pushing to `main`, `git reset --hard`.
- Merging is forbidden outside §5.1. Subagents never merge. `.claude/settings.json` allows only the `--squash` form.

---

## 5. Git / GitHub

- The default branch is `main`. Branch: `<type>/<you-n>/<slug>`. Commit: `<type>(YOU-n): <description>`. PR title: `[YOU-n] <ticket title>`.
- CI: `npm run verify` runs on push (the `verify` job is a required branch protection check and must be up to date with main).
- The PR opens after the first push (the ticket moves to In Review with it). Later CI results and reviews all stay on the same PR.
- If the PR falls behind main before merging: `gh pr update-branch --rebase`, then wait for CI on the new head. Conflicts are resolved by the implementer with `git merge origin/main`.
- **The human gate is a person pressing squash merge on PRs that do not qualify for auto-merge** (one GitHub account cannot approve its own PR, so reviews are posted as PR comments).
- Squash commit titles: auto-merge sets `<type>(YOU-n): <description> (#<n>)` with `--subject`. A human merge keeps the title GitHub suggests: the commit message for a PR with one commit, otherwise the PR title, `[YOU-n] ...`. Both forms are accepted on `main`, so a human does not edit the title.

### 5.1 Auto-merge

`/ticket` step 8 runs `gh pr merge <n> --subject "<type>(<ID>): <description> (#<n>)" --squash` only when all of these hold:

- CI is green on the PR head commit.
- The latest harness review by `yzzliu1993` (§6) has `verdict=approve` and its `sha` equals the PR head commit.
- `mergeStateStatus` is `CLEAN`.
- The PR is not a draft. A draft can report `CLEAN`, so `isDraft` is checked separately.
- No changed file is a protected path, including the old path of a renamed file.

Protected paths: `.claude/`, `.github/`, `specs/`, `CLAUDE.md`, `package.json`, `package-lock.json`, `tsconfig*`, `vite.config.ts`, `vitest.config.ts`, `.oxlintrc.json`, `.dependency-cruiser.cjs`. These decide how the harness and its checks behave, so an agent must not change them and merge the result by itself.

If a condition fails, or `gh pr merge` returns an error, the ticket gets `awaiting-merge` and a comment with the reason. A rebase changes the head commit, so the existing review stops matching and the PR goes to a human. A PR that auto-merges leaves no window for human rejection.

---

## 6. Resuming after interruption

There is no separate state file. Resuming decides from the actual state (`/ticket` step 1):

| Source | Used for |
|---|---|
| Remote branch / PR | Whether the code and PR exist (PRs are found by the `[YOU-n]` title prefix, because the remote branch is deleted after merge) |
| `gh run` | CI result of the latest commit |
| `<!-- harness:review round=N sha=… verdict=… -->` comments by `yzzliu1993` on the PR | Review round count, whether the latest commit was reviewed, the verdict |
| Linear labels | `awaiting-merge`, `needs-human` |
| `<!-- harness:progress -->` comment on Linear | Human-readable progress and failure history (the basis for the circuit breaker count) |

- PR comment authors: the repo is public, so only comments by `yzzliu1993` count, both as harness reviews and as human comments. A PR comment, review body or inline comment by any other account changes nothing in the run, even if it starts with `<!-- harness:`, and the run reports it to the user.
- Local branch: a resumed run can start on any branch. When the PR is open, step 1 gets onto the PR branch before anything else runs, and stops if the working directory is not clean or the switch fails. CI lookups and the review `sha` use the PR's head commit, not local `HEAD`.
- Local branch differs from the remote: step 1 compares patches with `git log --cherry-pick --right-only`, because a rebase changes commit hashes. If the local branch has a commit with no matching patch on the remote, the run names it and stops, and does not push it. Otherwise `git switch -C <branch> origin/<branch>` aligns the branch, or creates it. A rebase that resolved a conflict changes the patch, so that commit counts as unpushed and the run stops.
- Ticket changed during a run: `/ticket` reads the ticket in step 0, and a pause can leave it out of date. Before every push, step 4 reads the body and comments again, ignoring comments that start with `<!-- harness:`. If the body changed or a comment changes the work, the run updates the work before it pushes. If they conflict with the commits, nothing is pushed, and the run reports the difference and hands off to a human.
- Stale skill: `/ticket` compares its skill file with `origin/main` before anything else. If they differ, it updates `main` and follows the new version, or stops if it cannot update.
- Local record: Claude Code conversation history (`claude --resume` returns to an earlier session).
- Exhausted quota: the session stops. Once quota returns, rerun the same command to resume.
- The implementer commits but does not push, so committed progress stays on the local branch after an interruption. Uncommitted changes stay in the working directory and must be dealt with before rerunning (the working directory must be clean).

---

## 7. Circuit breaker

- **3** cumulative deterministic failures on one ticket (verify failure, CI failure, subagent returning an error), or **3** rounds of review rejection → add `needs-human`, assign to you, comment with the failure history, and leave the state unchanged.
- After you handle it and remove `needs-human`, rerunning resets the failure count to zero.

---

## 8. Rules for opening new tickets

| Situation | Opened in | Label | What happens to the original ticket |
|---|---|---|---|
| Unclear spec (default) | Backlog | `spec-needed` | Finish with the most conservative approach; list the assumption and ticket id in the PR "Assumptions" section |
| Unclear spec with no conservative approach | Todo | `spec-needed` | implementer returns `blocked` → original ticket gets `needs-human` and is blocked by the new ticket |
| Out-of-scope enhancement / refactor | Backlog | `agent-proposed` | Does not affect merging |
| Out-of-scope bug that meets the conditions below | Todo | `bug` | Does not affect merging |
| Any other out-of-scope bug | Todo | `agent-proposed` | Does not affect merging |
| Failed CI run on `main` (§3.3) | Todo, Urgent | `agent-proposed`, `main-ci-failure` | No original ticket; assigned to you |

A bug opened by `/ticket` gets `bug` instead of `agent-proposed` only when all of these hold:
- It has every Definition of Ready section (§2.3).
- It states actual behavior, expected behavior and steps to reproduce.
- Its scope has no protected path (§5.1).
- Its source ticket does not have the `harness:created-by-agent` marker, so agent-opened bugs cannot chain.

"Most conservative approach": do only what the ticket states; do not change existing public interfaces; do not add packages or change config files and data formats; among several readings, pick the smallest change. Only when none of these can be met is there "no conservative approach".

Volume limits and identification:
- Before creating, search for similar tickets with `list_issues`. If one exists, add a comment instead. Open at most 3 per run.
- Tickets opened by an agent start with `<!-- harness:created-by-agent source=YOU-n -->` and carry `agent-proposed` or `spec-needed`, except a bug that gets `bug` under the conditions above. `/retro` and `main-ci-failure` tickets always carry `agent-proposed`.
- A ticket for a failed CI run on `main` has no source ticket. It takes `YOU-n` from the failing commit subject, or uses `source=main` if there is none. Its body has only the failure details, so a human adds the Definition of Ready sections (§2.3) before removing `agent-proposed`.
- A new ticket whose scope is protected paths only also gets `harness`.
- `agent-proposed` / `spec-needed` tickets are not processed automatically. They enter the flow after you remove the label.

---

## 9. Project structure

```
.claude/
  agents/
    implementer.md
    reviewer.md
    decomposer.md
  skills/
    ticket/SKILL.md      # /ticket
    next/SKILL.md        # /next
    decompose/SKILL.md   # /decompose
    retro/SKILL.md       # /retro
.github/workflows/ci.yml
CLAUDE.md                # Project conventions (subagents read it too)
.harness/PAUSE           # Local pause switch (gitignored)
```

---

## 10. Runtime environment

| Item | Decision |
|---|---|
| Where it runs | Local Windows 11, Claude Code opened in the repo directory |
| Working directory | The main session switches branches directly in the repo directory; the working directory must be clean before running |
| Trigger | Manual `/ticket` and `/next`; `/loop` when needed |
| Claude billing | Pro subscription; subagents use sonnet, the main session uses the model you choose |
| Merge | Automatic when §5.1 holds, otherwise manual |

### 10.1 One-time setup
1. Linear labels (§2.2), PR automations (§3.2), GitHub integration linked to the repo.
2. Claude Code connected to the Linear MCP (check with `/mcp`).
3. `gh auth login`.
4. Recommended: turn off GitHub issue sync in Linear; turn on "auto-close parent when all sub-issues are done".

---

## 11. External settings

These settings live in GitHub and Linear, not in the repo, so a change to them leaves no diff by itself. This table is the record.

| Where | Setting | Value |
|---|---|---|
| GitHub branch protection (`main`) | Required check | `verify`, must be up to date with main |
| GitHub branch protection (`main`) | Enforce for admins | On |
| GitHub repo | Merge methods | Squash only |
| GitHub repo | Delete branch on merge | On |
| GitHub repo | Squash commit title | `COMMIT_OR_PR_TITLE` |
| GitHub repo | Auto-merge feature | Off (`/ticket` merges by itself) |
| Linear team | Pull request automations | PR opened → In Review, PR merged → Done |

### 11.1 Changing a setting

1. A ticket states the setting, current value, proposed value, reason and rollback. `/retro` or a human opens it.
2. The human approves by removing `agent-proposed`.
3. The main session checks that the live value matches the ticket, then applies the change. If it cannot apply the setting, it gives the human the exact steps.
4. The main session tests the change and records the result on the ticket.
5. The main session updates the table above in a PR, and a human merges it.

Branch protection is a merge condition, so only a human proposes or changes it. The main session then records the new value in this table.
