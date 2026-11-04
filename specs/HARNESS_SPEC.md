# HARNESS_SPEC v3: Linear × GitHub × Claude Code development flow

> v3 moves to a **Claude Code native architecture**: the Claude Code main session is the orchestrator. It reads tickets and changes state through the Linear MCP,
> and uses subagents in `.claude/agents/` to implement, review and decompose. The flow steps live in `.claude/skills/`.
> The v2 TypeScript orchestrator (`harness/`, `claude -p`) was removed in YOU-19.

---

## 0. Goals and non-goals

**Goals**
- Claude Code moves Linear tickets from Backlog to In Review. Humans step in only at defined gates (pressing merge, answering questions).
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
| **Main session** (orchestrator) | The Claude Code session you open, running `/ticket`, `/next` and `/decompose` | Reading tickets, changing Linear state and labels, creating branches, **verifying** subagent results, pushing, opening PRs, waiting for CI, posting reviews, opening follow-up tickets | Writing product code, merging |
| **implementer** | `.claude/agents/implementer.md` | Implementing and writing tests on the branch, running `npm run verify`, committing | Pushing, PRs, Linear |
| **reviewer** | `.claude/agents/reviewer.md` | Read-only review of whether the diff meets the acceptance criteria and test scenarios | Modifying anything |
| **decomposer** | `.claude/agents/decomposer.md` | Read-only repo exploration and proposing sub-tickets | Creating tickets (the main session does that) |
| **CI** | GitHub Actions `verify` job | `npm ci && npm run verify` | — |
| **Human** | You | Opening tickets, deciding on `agent-proposed`, answering `spec-needed`, handling `needs-human`, **pressing merge** | — |

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
| `awaiting-merge` | Review passed and CI is green; waiting for a human to merge | Main session |
| `needs-human` | Stuck and needs a human; the flow skips this ticket | Main session |
| `spec-needed` | Question ticket for an unclear spec | Main session |
| `agent-proposed` | An idea or out-of-scope bug raised by an agent | Main session |

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
                                                                  awaiting-merge ──human merges──▶ Done
```

`.claude/skills/ticket/SKILL.md` is the source of truth for step details.

### 3.1 Commands
| Command | Purpose |
|---|---|
| `/ticket YOU-n` | Take one ticket to awaiting-merge; rerunning resumes from the actual state |
| `/next` | Close out merged tickets, then pick one ticket per §3.3 |
| `/decompose YOU-n` | Decompose one Backlog ticket |
| `/loop 10m /next` | Run `/next` on a timer (works while the session is open) |

### 3.2 State changes
- Linear's GitHub integration: PR opened → In Review, PR merged → Done (Team Settings → Workflow → Pull request automations).
- The main session performs other transitions through the Linear MCP (`save_issue`): Todo → In Progress, setting In Review again after opening the PR, returning rejected work to In Progress, labels and comments.

### 3.3 `/next` selection order
1. Close out: tickets with `awaiting-merge` that are already Done / Canceled get the label removed.
2. Interrupted tickets: In Progress with a `<!-- harness:progress -->` comment.
3. Human rejections: In Review, no `awaiting-merge`, with a progress comment.
4. Todo: all blocked-by tickets are Done; priority Urgent → Low, None last; within a priority, oldest first.
5. Backlog: no `decomposed`, last updated more than 30 minutes ago, not opened by an agent.

Always skip `needs-human`, `spec-needed`, `agent-proposed` and `draft`.

### 3.4 Notifications
When you need to act (`awaiting-merge`, `needs-human`), the main session **assigns the ticket to you** and leaves a comment.

### 3.5 Pausing and stepping in
- Pause `/next`: create `.harness/PAUSE` (only close-out runs). Delete it to resume.
- Disagree with a review: comment on the PR and remove `awaiting-merge`, then run `/ticket YOU-n` (or wait for `/next`). Rework starts with your comments.
- You may push to an agent's branch manually. Resuming uses the remote as the source of truth.

---

## 4. Subagents

| Subagent | Tools | model | maxTurns |
|---|---|---|---|
| implementer | Read, Edit, Write, Glob, Grep, Bash | sonnet | 150 |
| reviewer | Read, Glob, Grep, Bash (read-only git commands only) | sonnet | 60 |
| decomposer | Read, Glob, Grep | sonnet | 40 |

- Each subagent's last message ends with a json block (format in its definition file). The main session uses it to decide the next step.
- Only the main session operates Linear. Subagents do not call Linear tools.
- Forbidden actions (written in `CLAUDE.md` and the subagent definitions; also recommended as `permissions.deny` in `.claude/settings.json`): `gh pr merge`, `git push --force`, pushing to `main`, `git reset --hard`.

---

## 5. Git / GitHub

- The default branch is `main`. Branch: `<type>/<you-n>/<slug>`. Commit: `<type>(YOU-n): <description>`. PR title: `[YOU-n] <ticket title>`.
- CI: `npm run verify` runs on push (the `verify` job is a required branch protection check and must be up to date with main).
- The PR opens after the first push (the ticket moves to In Review with it). Later CI results and reviews all stay on the same PR.
- If the PR falls behind main before merging: `gh pr update-branch --rebase`, then wait for CI on the new head. Conflicts are resolved by the implementer with `git merge origin/main`.
- **The human gate is a person pressing squash merge** (one GitHub account cannot approve its own PR, so reviews are posted as PR comments).

---

## 6. Resuming after interruption

There is no separate state file. Resuming decides from the actual state (`/ticket` step 1):

| Source | Used for |
|---|---|
| Remote branch / PR | Whether the code and PR exist |
| `gh run` | CI result of the latest commit |
| `<!-- harness:review round=N sha=… verdict=… -->` comments on the PR | Review round count, whether the latest commit was reviewed, the verdict |
| Linear labels | `awaiting-merge`, `needs-human` |
| `<!-- harness:progress -->` comment on Linear | Human-readable progress and failure history (the basis for the circuit breaker count) |

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
| Out-of-scope bug | Todo | `agent-proposed` | Does not affect merging |

"Most conservative approach": do only what the ticket states; do not change existing public interfaces; do not add packages or change config files and data formats; among several readings, pick the smallest change. Only when none of these can be met is there "no conservative approach".

Volume limits and identification:
- Before creating, search for similar tickets with `list_issues`. If one exists, add a comment instead. Open at most 3 per run.
- Tickets opened by an agent start with `<!-- harness:created-by-agent source=YOU-n -->` and always carry `agent-proposed` or `spec-needed`.
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
| Merge | Manual |

### 10.1 One-time setup
1. Linear labels (§2.2), PR automations (§3.2), GitHub integration linked to the repo.
2. Claude Code connected to the Linear MCP (check with `/mcp`).
3. `gh auth login`.
4. Recommended: turn off GitHub issue sync in Linear; turn on "auto-close parent when all sub-issues are done".
