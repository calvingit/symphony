# Symphony TypeScript

TypeScript reference implementation of the Symphony spec plus a local Next.js Linear-compatible
tracker with a Kanban board UI for development.

## Install

```bash
pnpm install
```

## Local Linear-compatible tracker

```bash
pnpm dev:linear
```

| Endpoint | Method | Description |
|----------|--------|-------------|
| `http://localhost:3001/` | GET | Kanban board UI |
| `http://localhost:3001/graphql` | POST | Linear-compatible GraphQL API |
| `http://localhost:3001/api/issues` | POST | Issue creation (JSON: `{title, state}`) |

Default bearer token: `local-dev-token`

The local tracker currently uses an in-memory store in the Next.js process. Issues and comments are
intended for local development only and are reset when the dev server restarts.

### Kanban board

The web UI at `http://localhost:3001/` provides a drag-and-drop Kanban board matching Linear's
design:

- **Columns** — Backlog, Todo, In Progress, Human Review (default visible), plus Done, Cancelled,
  Canceled, Duplicate, Closed (hidden by default)
- **Task cards** — identifier (monospace), title (2-line clamp), state color dot, priority indicator,
  "Updated" date
- **Drag & drop** — `PointerSensor` with 5 px activation distance, visual overlay on drag
- **Create task** — "+" button or "New task" at column bottom, modal dialog with form submit
- **Column management** — right sidebar "Hidden columns" toggle to show/hide workflow states

Tech stack: React 19, Next.js 15 App Router, Tailwind CSS v4, `@dnd-kit/core` +
`@dnd-kit/sortable`, Zustand, Lucide React, GraphQL Yoga v5.

### GraphQL API

Linear-compatible schema with `issues` query and `issueUpdate` mutation. Issue creation goes through
the REST endpoint since the schema does not yet define `issueCreate`.

## Run Symphony against local tracker

```bash
pnpm --filter @symphony/symphony-cli dev -- --port 4010 ./WORKFLOW.local.md
```

Status API:

```text
http://localhost:4010/api/v1/state
```

## Architecture

```
packages/
  core/            — shared types and utilities
  symphony/        — core engine (orchestrator, agent-runner, workspace-manager, hook-runner,
                     config, prompt-renderer, linear-client, tracker)
  linear-schema/   — GraphQL schema, resolvers, in-memory store
apps/
  linear-local/    — Next.js local tracker (GraphQL + Kanban UI)
  symphony-cli/    — Hono-based CLI/status server
```

## Validate

```bash
pnpm test
pnpm typecheck
```
