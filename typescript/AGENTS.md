# AGETNS.md

This file gives coding agents the repository context needed to work on the TypeScript reference
implementation of Symphony. For repository-wide rules, also see the root `AGETNS.md`.

## Project Overview

TypeScript reference implementation of the Symphony orchestration loop plus a local Next.js
Linear-compatible tracker with a Kanban board UI. The language-agnostic contract is in the root
`SPEC.md`. Use `tsx` for dev execution, `pnpm` as the package manager (locked to `pnpm@10.10.0`),
and `vitest` for tests.

## Package Layout

```
packages/
  core/            — shared domain types (Issue, Result, errors); keep small, no heavy deps
  symphony/        — daemon internals: config, workflow-loader, tracker, workspace-manager,
                     hook-runner, codex-app-server client, dynamic tools, agent-runner,
                     orchestrator, linear-client, prompt-renderer, run-progress
  linear-schema/   — local GraphQL schema, resolvers, in-memory store (Kysely + better-sqlite3)
apps/
  linear-local/    — Next.js 15 App Router: Kanban UI (React 19, Tailwind v4, dnd-kit, Zustand)
                     + GraphQL Yoga API endpoint + REST issue creation endpoint
  symphony-cli/    — thin Hono CLI: Commander args → config → status server
```

## Setup

```bash
cd typescript
pnpm install
```

## Development

Start the local Linear-compatible tracker (GraphQL + Kanban UI):

```bash
pnpm dev:linear                    # http://localhost:3001
```

Start Symphony CLI against the local tracker:

```bash
pnpm --filter @symphony/symphony-cli dev -- --port 4010 ./WORKFLOW.local.md
```

Status API for a running Symphony instance:

```text
GET http://localhost:4010/api/v1/state
```

Local tracker bearer token: `local-dev-token`

## Validation

Run all tests:

```bash
pnpm test
```

Run a subset by path:

```bash
pnpm test -- packages/symphony/test/config.test.ts
```

Type-check all packages:

```bash
pnpm typecheck
```

Build all packages:

```bash
pnpm build
```

Run checks for a single package:

```bash
pnpm --filter @symphony/symphony typecheck
pnpm --filter @symphony/linear-local build
```

## Code Conventions

### TypeScript

- `tsconfig.base.json` sets `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`,
  `strict: true`. All packages extend it.
- Relative ESM imports use explicit `.js` extensions (e.g., `"./config.js"`, not `"./config"`).
- Public modules re-export from `src/index.ts`; `exports` map in `package.json` points to `./dist/`
  for built output and `./src/` for types during development.
- `packages/core` owns shared shapes only (`Issue`, `Result`, `SymphonyError`). Put new shared types
  there; avoid circular dependencies between sibling packages.

### Tests

- Vitest with `environment: "node"`, test files under `packages/*/test/**/*.test.ts` and
  `apps/*/test/**/*.test.ts`.
- Test file naming: `test/<feature>.test.ts` mirroring `src/<feature>.ts`.
- Use `describe`/`it` blocks with plain assertions (`expect(...).toBe(...)`), no test runners
  outside vitest.

### Frontend (linear-local)

- Keep the Kanban UI utilitarian: dense, clear, predictable controls. Avoid marketing-page patterns.
- Components live in `components/`; shared store logic in `lib/` (Zustand).
- Route handlers in `app/graphql/route.ts` and `app/api/`; follow Next.js 15 App Router conventions.
- Tailwind CSS v4 with `@tailwindcss/postcss`.

### Symphony Daemon (packages/symphony)

- Config flows through `resolveConfig()` in `config.ts` — do not read env vars or files ad-hoc.
- Workspace paths stay under the configured root; Codex runs inside the per-issue workspace, never
  the source repo.
- Log with `pino`; include `issue_id`, `issue_identifier`, `session_id` where applicable.

## External Dependencies

| Package | Key Deps |
|---------|----------|
| `core` | (none beyond TypeScript) |
| `symphony` | `zod`, `yaml`, `liquidjs`, `pino`, `chokidar` |
| `linear-schema` | `graphql`, `graphql-yoga`, `kysely`, `better-sqlite3` |
| `symphony-cli` | `commander`, `hono`, `@hono/node-server` |
| `linear-local` | `next`, `react`, `react-dom`, `@dnd-kit/*`, `zustand`, `lucide-react`, `tailwindcss` |

## Security

- `local-dev-token` is for local development only.
- Do not commit `.env` files, Linear tokens, Codex auth files, logs, workspace directories, or
  build artifacts (see `.gitignore`: `node_modules/`, `dist/`, `.next/`, `tmp/`).
- Workspace deletion and terminal-state cleanup are sensitive paths; preserve `beforeRemove` hook
  behavior and path-safety checks from the upstream `SPEC.md`.
