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

Or start the full local stack with one command:

```bash
make dev
```

`make dev` defaults to the real `codex app-server` via `WORKFLOW.local.md`, so token, auth, and
quota failures surface normally in the status API.

The default local workflow creates one Git worktree per issue. For a local project workspace,
worktrees live under `<project-repo>/.worktrees/<ISSUE_IDENTIFIER>`. For a remote project workspace,
Symphony clones or updates the remote in `/private/tmp/symphony-remote-workspaces/` with
`git pull --ff-only`, then creates the issue worktree under that cached repository's `.worktrees/`
directory.

Hook scripts now receive `SYMPHONY_WORKSPACE_PATH`, `SYMPHONY_WORKSPACE_KEY`,
`SYMPHONY_ISSUE_ID`, `SYMPHONY_ISSUE_IDENTIFIER`, `SYMPHONY_ISSUE_TITLE`,
`SYMPHONY_ISSUE_DESCRIPTION`, `SYMPHONY_ISSUE_STATE`,
`SYMPHONY_ISSUE_BRANCH_NAME`, `SYMPHONY_ISSUE_URL`, `SYMPHONY_PROJECT_SLUG`,
`SYMPHONY_PROJECT_NAME`, `SYMPHONY_PROJECT_WORKSPACE_KIND`, `SYMPHONY_PROJECT_LOCAL_PATH`,
`SYMPHONY_PROJECT_REMOTE_URL`, `SYMPHONY_PROJECT_BASE_BRANCH`, and `SYMPHONY_ATTEMPT`. Repository
hydration is handled by Symphony before hooks run; hooks should only validate or prepare the
already-created worktree.

Useful Make targets:

```bash
make linear    # start only the local tracker
make symphony  # start only the Symphony CLI on port 4010
make status    # show background service status
make logs      # tail tmp/dev/*.log
make stop      # stop services started by the Makefile
```

Use the stub workflow only when you explicitly want a fake local Codex:

```bash
make dev WORKFLOW_FILE=./WORKFLOW.local.stub.md
```

| Endpoint | Method | Description |
|----------|--------|-------------|
| `http://localhost:3001/` | GET | Kanban board UI |
| `http://localhost:3001/graphql` | POST | Linear-compatible GraphQL API |
| `http://localhost:3001/api/issues` | POST | Compatibility issue creation (JSON: `{title, description, state, projectSlug}`) |

Default bearer token: `local-dev-token`

The local tracker persists projects, issues, and comments in SQLite at
`typescript/tmp/linear-local.db` by default. Override with `LINEAR_LOCAL_DB_PATH=/absolute/path.db`.
If SQLite cannot initialize in the current runtime, the tracker falls back to a JSON file at
`<LINEAR_LOCAL_DB_PATH>.json` instead of an in-memory store.

### Kanban board

The web UI at `http://localhost:3001/` provides a drag-and-drop Kanban board matching Linear's
design:

- **Columns** — Backlog, Todo, In Progress, Human Review (default visible), plus Done, Cancelled,
  Canceled, Duplicate, Closed (hidden by default)
- **Task cards** — identifier (monospace), title (2-line clamp), state color dot, priority indicator,
  "Updated" date
- **Drag & drop** — `PointerSensor` with 5 px activation distance, visual overlay on drag
- **Projects** — switch between projects in the navbar, manage project CRUD and workspace source
- **Create task** — "+" button or "New task" at column bottom, modal dialog with `title +
  description`
- **Column management** — right sidebar "Hidden columns" toggle to show/hide workflow states

Tech stack: React 19, Next.js 15 App Router, Tailwind CSS v4, `@dnd-kit/core` +
`@dnd-kit/sortable`, Zustand, Lucide React, GraphQL Yoga v5.

### GraphQL API

Linear-compatible schema with project CRUD, `issues` query, `issueCreate`, and `issueUpdate`.

Each project carries a workspace config:

- `local` — use a local Git repository and create issue worktrees under its `.worktrees/` directory
- `remote` — clone or pull a remote Git URL into `/private/tmp/`, then create issue worktrees there

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
  linear-schema/   — GraphQL schema, resolvers, and local tracker stores
apps/
  linear-local/    — Next.js local tracker (GraphQL + Kanban UI)
  symphony-cli/    — Hono-based CLI/status server
```

## Validate

```bash
pnpm test
pnpm typecheck
```
