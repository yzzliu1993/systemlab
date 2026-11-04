# systemlab

A React 19 + TypeScript + Vite single-page app. Claude Code drives development from Linear tickets (`/ticket`, `/next`, `/decompose`). See `specs/HARNESS_SPEC.md` for the spec.

<!-- TODO(human): add one or two sentences on what this product is and who it is for. -->

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

## Harness flow rules

For the full flow see `specs/HARNESS_SPEC.md`, `.claude/skills/` and `.claude/agents/`.

- The **main session** (when running `/ticket`, `/next` or `/decompose`) owns Linear state, pushes and PRs. Product code goes to the `implementer` subagent, and review goes to `reviewer`.
- **Always forbidden**: merging PRs outside the auto-merge below, `gh pr merge --admin`, `git push --force`, pushing directly to `main`, `git reset --hard`.
- **Auto-merge**: only `/ticket` step 8 may merge, with `gh pr merge <n> --squash`, and only when CI is green on the PR head commit, the latest harness review is `approve` for that commit, `mergeStateStatus` is `CLEAN`, and no changed file is a protected path. Protected paths: `.claude/`, `.github/`, `specs/`, `CLAUDE.md`, `package.json`, `package-lock.json`, `tsconfig*`, `vite.config.ts`, `vitest.config.ts`, `.oxlintrc.json`, `.dependency-cruiser.cjs`. Otherwise a human merges.
- **Forbidden for subagents**: changing Linear, pushing, merging, and modifying `.github/workflows/`, `.claude/`, `CLAUDE.md`, `specs/`, dependencies in `package.json`, or config files (`tsconfig*`, `vite.config.ts`, `vitest.config.ts`, `.oxlintrc.json`, `.dependency-cruiser.cjs`). When one of these is needed, return `blocked` and explain why.
- Do only what the ticket explicitly states. When the spec is unclear, take the most conservative approach (spec §8) and list it in the "Assumptions" section of the PR body.
- New tickets opened by an agent start with `<!-- harness:created-by-agent source=<source ticket id> -->` and carry the `agent-proposed` or `spec-needed` label.
- `npm run verify` must pass before pushing.
