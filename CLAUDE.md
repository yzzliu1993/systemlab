# systemlab

A React 19 + TypeScript + Vite single-page app. Claude Code drives development from Linear tickets: sessions dispatch independent agents (`/plan`, `/work`, `/review`, `/status`) that each claim their own ticket or PR, and `/retro` turns problems from real runs into improvement tickets. See `specs/HARNESS_SPEC.md` for the spec.

The product teaches system design to engineers with no background in it, one chapter per topic, with terms, tools, browser simulations and real-world cases. See [PRODUCT.md](PRODUCT.md) for the direction.

## Commands

| Command | Purpose |
|---|---|
| `npm run verify` | **Required before committing**: lint → typecheck → architecture check → tests, same as CI |
| `npm run test` | Run all tests once |
| `npx vitest run <path>` | Run only the given test file |
| `npm run dev` | Local dev server |

## Architecture layers

```
src/
  app/             App assembly: routes, global providers
  components/      UI components shared across features
  features/        UI and logic per feature (article-reader, game-arena, roadmap-view)
  domain/          Pure TypeScript domain logic (roadmap, game), no React dependency
  stores/          zustand state
  infrastructure/  storage (IndexedDB / idb), workers (Web Worker / comlink)
  content/         Static content
  test/            Shared test setup
```

Dependency rules (enforced by `npm run arch:check`; a violation fails CI):
- `domain/` **must not** import `components/`, `features/` or `stores/`, and must not import `react`.
- `infrastructure/` **must not** import `components/` or `features/`.

Put new logic in `domain/` as pure functions first. The UI layer only calls it and presents the result.

## Code conventions

- Imports use the `@/` alias for `src/` (for example `import { buildDag } from '@/domain/roadmap/dag'`).
- `verbatimModuleSyntax` is on: use `import type` when only a type is needed.
- `erasableSyntaxOnly` is on: **do not use** `enum`, `namespace` or constructor parameter properties (`constructor(private x)`). Use a union type or an `as const` object instead of an enum.
- `strict`, `noUnusedLocals` and `noUnusedParameters` are on. Prefix unused parameters with `_`.
- Use `zod` for runtime data validation, `immer` for immutable updates, and `clsx` + `tailwind-merge` for className composition.
- Styling uses Tailwind CSS v4.

## Testing conventions

- Test files live next to the source: `foo.ts` → `foo.test.ts`, and for components `Foo.tsx` → `Foo.test.tsx`.
- The test environment is happy-dom. `describe` / `it` / `expect` are globals.
- `domain/` tests must not render React components.
- Component tests use `@testing-library/react` + `@testing-library/user-event`. Query by user-visible text or role, not by class or other implementation details beyond test ids.
- Mock network requests with `msw`. Never call real external services.
- Every test scenario on the ticket (T1, T2...) needs a matching test, and the test name starts with the scenario number:
  ```ts
  it('T2: empty array returns empty result', () => { ... });
  ```

## Language

Write all new repo content, test names, commit messages, PR titles and bodies, and Linear tickets and comments in English. Existing Chinese in git history, Linear and PRs stays as it is. This rule does not set the language of chat replies.

## Git conventions

- The default branch is `main`. Direct pushes are forbidden; everything goes through a PR.
- Branch: `<type>/<lowercase team key>-<number>/<slug>`, for example `feat/you-12/roadmap-dag-layout`.
  `type` ∈ `feat | fix | infr | refactor | docs | test`.
- Commit: `<type>(<ticket id>): <description>`, for example `feat(YOU-12): add roadmap DAG layout`.
- PR title: `[YOU-12] <ticket title>`. The merge method is squash merge.
- Squash commit title: auto-merge sets `<type>(<ticket id>): <description> (#<n>)`. A human merge keeps the title GitHub suggests, which is the PR title when the PR has two or more commits. Both forms are accepted on `main`, so do not edit the title by hand.

## Harness flow rules

For the full flow see `specs/HARNESS_SPEC.md`, `.claude/skills/` and `.claude/agents/`.

- **Roles** (spec §1): a **session** takes your instructions and dispatches agents; it never writes product code and never merges. **ticket-writer** creates tickets in Linear. **implementer** claims a ready ticket, implements it in its own worktree, pushes and opens the PR. **reviewer** claims a PR, reviews it, and merges it or hands it back. Agents change Linear only for the ticket they claimed (ticket-writer also for the tickets it creates).
- **Claims** (spec §3.2): before working, an agent writes a `<!-- harness:claim role=… by=… at=… -->` comment, moves the ticket (implementer: In Progress) and assigns it; the earliest live claim wins, and the other agent withdraws. Release the claim when done. A claim with no progress for 2 hours is stale and may be taken over.
- **Worktrees**: every agent works in its own worktree from the latest `origin/main`. The main checkout is left to the user.
- **Independence**: the reviewer of a PR is never the agent that implemented it.
- **`harness` tickets**: a ticket with the `harness` label changes protected paths only. Implementers do not take them; a session makes the changes when the user asks, a reviewer reviews, and a human merges. If the diff has a file outside the protected paths, the session stops before pushing and hands off to a human.
- **Always forbidden**: merging outside the rule below, `gh pr merge --admin`, `git push --force` (any form), pushing directly to `main`, `git reset --hard`, deleting Linear comments, and editing `.claude/settings.json` or `.claude/settings.local.json` (a human edits permission files).
- **Merging** (spec §5.1): only a reviewer merges, with `gh pr merge <n> --subject "<type>(<ID>): <description> (#<n>)" --match-head-commit <sha> --squash`, and only when CI is green on the PR head commit, its own latest harness review is `approve` for that commit, `mergeStateStatus` is `CLEAN`, the PR is not a draft, it did not implement the PR, and no changed file is a protected path. A PR that changes a protected path gets `awaiting-merge`, and a human merges it. Protected paths: `.claude/`, `.github/`, `specs/`, `CLAUDE.md`, `package.json`, `package-lock.json`, `tsconfig*`, `vite.config.ts`, `vitest.config.ts`, `.oxlintrc.json`, `.dependency-cruiser.cjs`.
- **Forbidden for implementers and ticket-writer**: merging, and modifying `.github/workflows/`, `.claude/`, `CLAUDE.md`, `specs/`, dependencies in `package.json`, or config files (`tsconfig*`, `vite.config.ts`, `vitest.config.ts`, `.oxlintrc.json`, `.dependency-cruiser.cjs`). When one of these is needed, stop with `needs-human` and explain why.
- **Transition**: until the agent definitions and the `/plan`, `/work`, `/review`, `/status` commands are merged (YOU-111 to YOU-113), `.claude/agents/` and `.claude/skills/` still follow the previous flow (`/ticket`, `/next`, `/decompose`), and those rules apply to them.
- Do only what the ticket explicitly states. When the spec is unclear, take the most conservative approach (spec §8) and list it in the "Assumptions" section of the PR body.
- New tickets opened by an agent start with `<!-- harness:created-by-agent source=<source ticket id> -->` and carry the `agent-proposed` or `spec-needed` label. The exception is an out-of-scope bug that meets the spec §8 conditions: it carries `bug` instead and enters the flow without a human.
- `npm run verify` must pass before pushing.
