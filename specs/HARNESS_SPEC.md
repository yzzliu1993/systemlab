# HARNESS_SPEC v4: Linear × GitHub × Claude Code development flow

> v4 splits the work into **independent agents that claim their own work from Linear**. Any number of Claude Code sessions can run at once. A session dispatches agents, and each agent claims one ticket or PR, works in its own git worktree, and updates Linear itself. The agent definitions live in `.claude/agents/` and the session commands in `.claude/skills/`.
>
> Transition: this spec is the target. Until the agent definitions (YOU-111, YOU-112) and the session commands (YOU-113) are merged, `.claude/agents/` and `.claude/skills/` still follow v3, and `/ticket`, `/next` and `/decompose` keep working as before.

---

## 0. Goals and non-goals

**Goals**
- Claude Code moves Linear tickets from Backlog to merged. Humans step in only at defined gates (merging protected-path PRs, deciding on `agent-proposed`, answering questions, handling `needs-human`).
- Several tickets are developed in parallel by several agents, in one session or in several, without two agents taking the same work.
- Linear always shows who is working on what: a ticket moves to In Progress with an assignee the moment an agent claims it.
- After an interruption (closed session, exhausted quota, reboot), another agent resumes from the **actual state** (git branch, PR, CI, Linear).
- When the spec is unclear, take the most conservative approach and open a ticket to ask a human instead of guessing.

**Non-goals**
- An unattended background daemon. Agents are dispatched by a session and end after their ticket or PR; to keep work moving, a session dispatches again (`/loop` works while the session is open).
- Deployment / release.

---

## 1. Roles

| Component | What it is | Responsible for | Not responsible for |
|---|---|---|---|
| **Session** | A Claude Code session you open. Any number can run at once. | Taking your instructions; dispatching agents with `/plan`, `/work`, `/review` and `/status` (§3.1); checking each agent's report against GitHub and Linear; reporting to you; running `/retro`; making the changes on `harness` tickets (§3.7) | Writing product code; merging |
| **ticket-writer** | `.claude/agents/ticket-writer.md` (replaces `decomposer`) | Turning a request or a Backlog parent into tickets that meet the Definition of Ready (§2.3), searching for duplicates first, and creating them in Linear | Editing files, running commands, implementing |
| **implementer** | `.claude/agents/implementer.md` | Claiming one ready ticket (§3.3), working in its own worktree from the latest `origin/main`, implementing and testing, running `npm run verify`, pushing, opening the PR, moving the ticket to In Review; rework on `needs-rework` | Reviewing, merging, protected paths |
| **reviewer** | `.claude/agents/reviewer.md` | Claiming one PR that needs a review (§3.4), reviewing it, posting the harness review, then merging (§5.1), handing it to you (`awaiting-merge`), or returning it (`needs-rework`); rebasing a `BEHIND` PR; closing out the ticket after a merge | Changing the PR's code; reviewing a PR it implemented; merging protected paths |
| **researcher** | `.claude/agents/researcher.md` | Read-only outside research, returning conclusions with source URLs | Changing files, Linear, pushing, merging |
| **CI** | GitHub Actions `verify` job | `npm ci && npm run verify` | — |
| **Human** | You | Opening or approving tickets, deciding on `agent-proposed`, answering `spec-needed`, handling `needs-human`, **merging protected-path PRs**, editing permission files | — |

> Core rules:
> - **Every agent verifies its own work against the real state**: the implementer runs `npm run verify` itself before pushing; the reviewer waits for green CI on the PR head and reads the diff itself. A session never trusts a report it can check: it confirms the ticket state, the PR and CI before telling you something is done.
> - **Independence**: the reviewer of a PR is never the agent that implemented it. Agents have separate contexts, so the reviewer cannot see the implementer's reasoning.
> - **One claim, one agent**: an agent works only on what it has claimed (§3.2), and changes Linear only for that ticket (and, for ticket-writer, the tickets it creates or comments on).

---

## 2. Linear setup

### 2.1 States
`Backlog → Todo → In Progress → In Review → Done` (plus `Canceled`)

### 2.2 Labels
| Label | Meaning | Added by |
|---|---|---|
| `draft` | Still being written; do not split or implement | Human |
| `decomposed` | Already split into sub-tickets; do not split again | ticket-writer |
| `needs-rework` | A review or CI failure sent the PR back; an implementer picks it up next | reviewer (or implementer on its own CI failure) |
| `awaiting-merge` | Review passed and CI is green, but the PR changes a protected path or could not be merged; waiting for a human | reviewer |
| `needs-human` | Stuck and needs a human; agents skip this ticket | Any agent |
| `spec-needed` | Question ticket for an unclear spec | Any agent |
| `agent-proposed` | An idea or out-of-scope bug raised by an agent | Any agent |
| `bug` | An agent-opened bug that meets the §8 conditions, so it enters the flow without `agent-proposed` | Any agent |
| `harness` | Changes protected paths only (§5.1); handled per §3.7 | Human, session or ticket-writer |
| `main-ci-failure` | Reports a failed CI run on `main`; used to find earlier reports | reviewer or session |

### 2.3 Ticket format (Definition of Ready)
A Todo ticket must contain the sections below. If any is missing, an implementer does not claim it; it adds `needs-human` and a comment naming the missing sections:

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
request / Backlog parent ──/plan──▶ ticket-writer ──▶ tickets in Todo (agent ideas: Backlog + agent-proposed)

Todo ──/work──▶ implementer claims ──▶ In Progress ──▶ verify ──▶ push ──▶ open PR ──▶ In Review
                      ▲                                                                   │
                      │  needs-rework (changes requested / CI failure)                    │
                      └─────────────────────────────────────────── reviewer claims ◀──/review
                                                                         │ approve
                                       no protected path, CLEAN ─────────┼──▶ reviewer merges ──▶ Done
                                       BEHIND ──▶ rebase, same patch? ───┤     (re-review the new head first)
                                       protected path ───────────────────┴──▶ awaiting-merge ──human merges──▶ Done
```

### 3.1 Session commands
| Command | Purpose |
|---|---|
| `/plan <request or YOU-n>` | Dispatch one ticket-writer; report the tickets it created |
| `/work [n] [YOU-n]` | Dispatch n implementers (default 1) in the background, each in its own worktree; with a ticket id, one implementer for that ticket |
| `/review [n] [PR number]` | Dispatch n reviewers the same way; with a PR number, one reviewer for that PR |
| `/status` | List claims (role, agent, age), stale claims, tickets In Progress and In Review, PRs waiting for a reviewer, PRs with `awaiting-merge`, and the latest CI result on `main` |
| `/retro` | Find repeated problems in recently finished tickets and open improvement tickets (§3.8) |
| `/loop 10m /work` (or `/review`) | Dispatch on a timer while the session is open |

A session reports each agent's result when it ends: the ticket, the PR, the outcome, and anything that needs you.

### 3.2 Claim protocol
A claim tells every other agent and you that a ticket (or its PR) is taken.

1. **Check**: read the ticket's comments. If it has a live claim for the same role by another agent, pick something else.
2. **Claim**: set the state (implementer: In Progress) and assign the ticket to `me`, then write one comment:
   `<!-- harness:claim role=<implementer|reviewer> by=<agent id> at=<ISO time> -->` followed by a one-line human note. `<agent id>` is the session name plus a short random suffix, so two agents never share it.
3. **Confirm**: read the comments again. Among live claims for the same role, the one Linear created first (comment `createdAt`) wins. If that is not this agent's, it marks its own claim released and picks something else.
4. **Release**: when it finishes, hands off or stops on purpose, the agent edits its claim comment to add `released=<ISO time> outcome=<pr-opened|merged|awaiting-merge|needs-rework|needs-human|withdrawn>`.
5. **Stale**: a claim with no `released` and no update to the ticket's `<!-- harness:progress -->` comment for **2 hours** is stale. Another agent may take over: it releases the stale claim with `outcome=stale-takeover by=<new agent id>` and claims it as above, then resumes from the actual state (§6).

A live claim is one with no `released`. Agents never delete comments.

### 3.3 What an implementer picks
If the session names a ticket, the implementer takes that one (still claiming it). Otherwise, in this order:

1. Tickets with `needs-rework` whose PR is open and whose implementer claim is released or stale.
2. Tickets In Progress with a stale implementer claim.
3. Todo tickets that meet §2.3, whose blocked-by tickets are all Done; priority Urgent → Low, None last; within a priority, oldest first.

Always skip `needs-human`, `spec-needed`, `agent-proposed`, `draft` and `harness`. Skip everything while `.harness/PAUSE` exists.

### 3.4 What a reviewer picks
If the session names a PR, the reviewer takes that one. Otherwise: tickets In Review with an open PR whose latest harness review (§6) is not for the current head commit, with no live reviewer claim, oldest first. A reviewer never takes a PR whose implementer claim carries its own agent id. `awaiting-merge` PRs are skipped (they wait for you).

### 3.5 State changes
| From | To | Who | When |
|---|---|---|---|
| Backlog | Todo | Human, or ticket-writer for tickets you asked for | The ticket meets §2.3 |
| Todo | In Progress | implementer | On claim |
| In Progress | In Review | implementer | After pushing and opening the PR (Linear's PR automation also does this) |
| In Review | In Progress + `needs-rework` | reviewer | Changes requested, or the rebase changed the patch |
| In Progress + `needs-rework` | In Review | implementer | After pushing the fix; it removes `needs-rework` |
| In Review | Done | reviewer | After merging (Linear's PR automation also does this); it removes `awaiting-merge` if present |
| In Review | In Review + `awaiting-merge` | reviewer | Approved, but a protected path changed or `gh pr merge` failed |
| any | + `needs-human` | Any agent | §7 circuit breaker, or anything the agent definition says to stop on |

Every agent keeps one `<!-- harness:progress -->` comment on the ticket up to date and adds friction rows (§3.8). The formats stay as in v3.

### 3.6 Notifications
When you need to act (`awaiting-merge`, `needs-human`, `spec-needed`), the agent **assigns the ticket to you** and leaves a comment saying what is needed.

### 3.7 Harness tickets
A ticket with the `harness` label changes protected paths (§5.1) only. Implementers do not take them. A session makes the changes when you ask for it, in its own worktree, then opens the PR; a reviewer reviews it and hands it to you with `awaiting-merge`.

- Guard: before pushing, the session checks the diff. A file outside the protected paths stops it, so a session never writes product code.
- A change that needs both protected paths and other files is split into two tickets.
- Permission files: `.claude/settings.json` and `.claude/settings.local.json` control the harness's own permissions, so no agent and no session edits them. A human makes the edit. A ticket that needs a permission change lists the exact change in its PR body for the human.

### 3.8 Friction and `/retro`
Agents raise `proposals` only for what they notice inside one ticket. Friction records the rest, and `/retro` looks for patterns across tickets.

- **Recording**: at the end of every run, the agent adds rows to one append-only `<!-- harness:friction -->` comment on the ticket. A run with no problems leaves no comment.
- **Reading**: `/retro` reads Done tickets completed since its last run, at most 20, reading comments three tickets at a time, oldest first.
- **Measuring**: `/retro` reports failures, review rounds, claim conflicts, stale takeovers and human interventions per ticket, and compares them with the last run.
- **Opening tickets**: a ticket needs evidence: the same problem on at least two tickets, or one clear failure, with ticket ids. The limits in §8 apply.
- **Run log**: each run adds a `<!-- harness:retro at=<ISO time> -->` comment on YOU-32. The next run gets its start time from the newest one.

Guardrails:
- Changes to permissions, protected paths or merge conditions come only from a human. `/retro` reports these and opens no ticket.
- One open harness PR at a time, so an effect can be traced to its change.
- A human always merges harness changes.

---

## 4. Agents

| Agent | Tools | model | maxTurns |
|---|---|---|---|
| ticket-writer | Read, Glob, Grep, Linear (read, create and update issues, comments, labels) | sonnet | 40 |
| implementer | Read, Edit, Write, Glob, Grep, Bash, Linear (its claimed ticket) | sonnet | 150 |
| reviewer | Read, Glob, Grep, Bash (git, `gh`, no file edits), Linear (its claimed ticket) | sonnet | 80 |
| researcher | Read, Glob, Grep, WebSearch, WebFetch | sonnet | 40 |

- A session dispatches implementers and reviewers with worktree isolation, so each works in its own worktree. The main checkout is left to you. A worktree is removed when its agent ends.
- Each agent ends with a json block (format in its definition file) that the session reads to report the result. `researcher` ends with markdown sections instead.
- The reviewer decides its verdict and writes it in the harness review header itself; a review with no verdict is not posted. A session never infers a verdict.
- Forbidden for every agent and session (also in `CLAUDE.md`; enforced by `permissions.deny` in `.claude/settings.json`): `gh pr merge --admin`, `git push --force` (any form), pushing to `main`, `git reset --hard`, deleting Linear comments, editing `.claude/settings.json` or `.claude/settings.local.json`.
- Implementers and the ticket-writer never merge. A reviewer merges only under §5.1. `.claude/settings.json` allows only the `--squash` form.
- Implementers never edit protected paths (§5.1). When the ticket needs one, the implementer stops with `needs-human` and explains why.

---

## 5. Git / GitHub

- The default branch is `main`. Branch: `<type>/<you-n>/<slug>`. Commit: `<type>(YOU-n): <description>`. PR title: `[YOU-n] <ticket title>`.
- Every branch starts from the latest `origin/main`. An implementer fetches and rebases onto `origin/main` and reruns `npm run verify` before its first push, so a new PR is not already behind.
- CI: `npm run verify` runs on push (the `verify` job is a required branch protection check and must be up to date with main).
- The PR opens after the first push (the ticket moves to In Review with it). Later CI results and reviews all stay on the same PR.
- Reviews are posted as PR comments (one GitHub account cannot approve its own PR).

### 5.1 Merging

A reviewer runs `gh pr merge <n> --subject "<type>(<ID>): <description> (#<n>)" --match-head-commit <sha> --squash` only when all of these hold, using fresh values from GitHub:

- CI is green on the PR head commit `<sha>`.
- Its own harness review for `<sha>` (§6) has `verdict=approve`, and it is the latest harness review on the PR.
- `mergeStateStatus` is `CLEAN`.
- The PR is not a draft. A draft can report `CLEAN`, so `isDraft` is checked separately.
- No changed file is a protected path, including the old path of a renamed file.
- The reviewer did not implement this PR.

Protected paths: `.claude/`, `.github/`, `specs/`, `CLAUDE.md`, `package.json`, `package-lock.json`, `tsconfig*`, `vite.config.ts`, `vitest.config.ts`, `.oxlintrc.json`, `.dependency-cruiser.cjs`. These decide how the harness and its checks behave, so no agent merges a change to them.

- **`BEHIND`**: the reviewer runs `gh pr update-branch <n> --rebase`, waits for CI on the new head, and compares the patch with `git range-diff`. If the patch is unchanged, it reviews the new head (a new harness review for the new `sha`) and merges if §5.1 holds. If the patch changed or there are conflicts, it returns the ticket with `needs-rework`.
- **`DIRTY`** (conflicts): `needs-rework`; the implementer resolves with `git merge origin/main`.
- If a condition fails for a protected path, or `gh pr merge` returns an error, the ticket gets `awaiting-merge` and a comment with the reason.
- After a merge, the reviewer checks CI on `main` for the merge commit. A failure opens or updates a `main-ci-failure` ticket per §8.
- Squash commit titles: a reviewer merge sets `<type>(YOU-n): <description> (#<n>)` with `--subject`. A human merge keeps the title GitHub suggests. Both forms are accepted on `main`.

---

## 6. Resuming after interruption

There is no separate state file. A resuming agent decides from the actual state:

| Source | Used for |
|---|---|
| `<!-- harness:claim … -->` comments on Linear | Who holds the ticket, whether the claim is released or stale (§3.2) |
| Remote branch / PR | Whether the code and PR exist (PRs are found by the `[YOU-n]` title prefix, because the remote branch is deleted after merge) |
| `gh run` | CI result of the PR head commit |
| `<!-- harness:review round=N sha=… verdict=… -->` comments by `yzzliu1993` on the PR | Review round count, whether the head was reviewed, the verdict |
| Linear labels | `needs-rework`, `awaiting-merge`, `needs-human` |
| `<!-- harness:progress -->` comment on Linear | Human-readable progress and failure history (the basis for the circuit breaker count) |

- PR comment authors: the repo is public, so only comments by `yzzliu1993` count, both as harness reviews and as human comments. A comment by any other account changes nothing, even if it starts with `<!-- harness:`, and the agent reports it.
- An implementer pushes as soon as `npm run verify` passes, so finished work is on the remote, not only in a worktree that may be removed. Work that was never pushed is lost with its worktree; the next agent starts from the remote branch or from `origin/main`.
- A resuming implementer checks out the PR's remote branch in a new worktree. A local commit with no matching patch on the remote is not pushed blindly; the agent compares patches with `git log --cherry-pick --right-only` and stops with `needs-human` if it cannot tell.
- Ticket changed during a run: before every push, the implementer reads the body and comments again, ignoring comments that start with `<!-- harness:`. If they change the work, it updates the work first; if they conflict with the commits, it pushes nothing and stops with `needs-human`.
- Exhausted quota: the agent stops and its claim goes stale after 2 hours, or you release it. Any later agent resumes from the actual state.

---

## 7. Circuit breaker

- **3** cumulative deterministic failures on one ticket (verify failure, CI failure, an agent returning an error), or **3** rounds of `changes_requested` → add `needs-human`, assign to you, comment with the failure history, release the claim with `outcome=needs-human`, and leave the state unchanged.
- After you handle it and remove `needs-human`, the failure count resets to zero.

---

## 8. Rules for opening new tickets

| Situation | Opened in | Label | What happens to the original ticket |
|---|---|---|---|
| A ticket you asked for (`/plan`) | Todo | — (`harness` if protected paths only) | — |
| Unclear spec (default) | Backlog | `spec-needed` | Finish with the most conservative approach; list the assumption and ticket id in the PR "Assumptions" section |
| Unclear spec with no conservative approach | Todo | `spec-needed` | The implementer stops: the original ticket gets `needs-human` and is blocked by the new ticket |
| Out-of-scope enhancement / refactor | Backlog | `agent-proposed` | Does not affect merging |
| Out-of-scope bug that meets the conditions below | Todo | `bug` | Does not affect merging |
| Any other out-of-scope bug | Todo | `agent-proposed` | Does not affect merging |
| Failed CI run on `main` (§5.1) | Todo, Urgent | `agent-proposed`, `main-ci-failure` | No original ticket; assigned to you |

An agent-opened bug gets `bug` instead of `agent-proposed` only when all of these hold:
- It has every Definition of Ready section (§2.3).
- It states actual behavior, expected behavior and steps to reproduce.
- Its scope has no protected path (§5.1).
- Its source ticket does not have the `harness:created-by-agent` marker, so agent-opened bugs cannot chain.

"Most conservative approach": do only what the ticket states; do not change existing public interfaces; do not add packages or change config files and data formats; among several readings, pick the smallest change. Only when none of these can be met is there "no conservative approach".

Volume limits and identification:
- Before creating, search for similar tickets with `list_issues`. If one exists, add a comment instead. Open at most 3 per run, except tickets you asked for with `/plan`.
- Tickets opened on an agent's own initiative start with `<!-- harness:created-by-agent source=YOU-n -->` and carry `agent-proposed` or `spec-needed`, except a bug that gets `bug` under the conditions above. `/retro` and `main-ci-failure` tickets always carry `agent-proposed`.
- Tickets you asked for start with a line saying so and when, and need no `agent-proposed`.
- A ticket for a failed CI run on `main` has no source ticket. It takes `YOU-n` from the failing commit subject, or uses `source=main` if there is none. Its body has only the failure details, so a human adds the Definition of Ready sections (§2.3) before removing `agent-proposed`.
- A new ticket whose scope is protected paths only also gets `harness`.
- `agent-proposed` / `spec-needed` tickets are not picked by agents. They enter the flow after you remove the label.

---

## 9. Project structure

```
.claude/
  agents/
    ticket-writer.md
    implementer.md
    reviewer.md
    researcher.md
  skills/
    plan/SKILL.md        # /plan
    work/SKILL.md        # /work
    review/SKILL.md      # /review
    status/SKILL.md      # /status
    retro/SKILL.md       # /retro
  worktrees/             # agent worktrees (created and removed by Claude Code)
.github/workflows/ci.yml
CLAUDE.md                # Project conventions (agents read it too)
.harness/PAUSE           # Local pause switch (gitignored); agents claim nothing while it exists
```

---

## 10. Runtime environment

| Item | Decision |
|---|---|
| Where it runs | Local Windows 11, Claude Code opened in the repo directory; any number of sessions |
| Working directory | Each agent works in its own worktree; the main checkout is left to you |
| Trigger | Manual `/plan`, `/work`, `/review`; `/loop` when needed |
| Claude billing | Pro subscription; agents use sonnet, sessions use the model you choose |
| Merge | A reviewer merges per §5.1; protected paths are merged by you |

### 10.1 One-time setup
1. Linear labels (§2.2, including `needs-rework`), PR automations (§3.5), GitHub integration linked to the repo.
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
| GitHub repo | Auto-merge feature | Off (the reviewer merges by itself) |
| Linear team | Pull request automations | PR opened → In Review, PR merged → Done |

### 11.1 Changing a setting

1. A ticket states the setting, current value, proposed value, reason and rollback. `/retro` or a human opens it.
2. The human approves by removing `agent-proposed`.
3. A session checks that the live value matches the ticket, then applies the change. If it cannot apply the setting, it gives the human the exact steps.
4. The session tests the change and records the result on the ticket.
5. The session updates the table above in a PR, and a human merges it.

Branch protection is a merge condition, so only a human proposes or changes it. A session then records the new value in this table.
