# AGENTS.md

This file gives coding agents the repository context needed to work on Symphony. It applies to the
whole repository unless a deeper `AGENTS.md` overrides it. For files under `elixir/`, also follow
`elixir/AGENTS.md`; that file is more specific and takes precedence there.

## Project Overview

Symphony is an engineering preview for orchestrating autonomous coding-agent runs from tracker
issues. The language-agnostic contract lives in `SPEC.md`.

The repository currently has two implementations/work areas:

- `elixir/`: the current Elixir/OTP implementation. It polls Linear, creates per-issue workspaces,
  runs Codex in app-server mode, exposes optional Phoenix observability surfaces, and is the path
  covered by GitHub CI today.
- `typescript/`: a TypeScript pnpm workspace for local development. It contains a Node.js Symphony
  daemon and a Next.js Linear-compatible local tracker for running the orchestration loop without a
  real Linear account.

Useful supporting paths:

- `.codex/skills/`: repository-local skills for Symphony workflows (`commit`, `push`, `pull`,
  `land`, `linear`, `debug`).
- `.github/pull_request_template.md`: required PR body format.
- `.github/workflows/`: CI currently runs Elixir `make all` and PR body validation.
- `docs/superpowers/`: design and implementation plan notes from prior threads, especially for the
  TypeScript local tracker work.

## Working Rules

- Start by checking `git status --short` so you do not overwrite existing user changes.
- Prefer `rg` / `rg --files` for repository searches.
- If `rtk` exists (`command -v rtk`), prefer wrapping external commands with it, especially `git`,
  `make`, `mix`, `pnpm`, test, build, and language-toolchain commands.
- Keep changes narrowly scoped. Do not reformat, refactor, or repair unrelated code while solving a
  specific task.
- Do not commit, push, delete branches, reset, or overwrite user work unless explicitly asked.
- When behavior or configuration changes, update nearby docs in the same change where practical:
  `SPEC.md`, implementation README files, workflow examples, or relevant docs under `docs/`.

## Setup Commands

Elixir setup from the repository root:

```bash
cd elixir
mise trust
mise install
mise exec -- mix setup
```

Equivalent helper:

```bash
make -C elixir setup
```

TypeScript setup:

```bash
cd typescript
pnpm install
```

The TypeScript workspace uses `pnpm@10.10.0` and `pnpm-workspace.yaml` with `apps/*` and
`packages/*`.

## Development Workflow

Run the Elixir implementation:

```bash
cd elixir
mise exec -- mix build
mise exec -- ./bin/symphony ./WORKFLOW.md
```

Use a custom workflow file:

```bash
cd elixir
mise exec -- ./bin/symphony /path/to/WORKFLOW.md
```

Enable the optional Elixir dashboard/API with `--port`:

```bash
cd elixir
mise exec -- ./bin/symphony --port 4000 ./WORKFLOW.md
```

Run the TypeScript local Linear-compatible tracker:

```bash
cd typescript
pnpm dev:linear
```

Local tracker endpoints:

- `http://localhost:3001/`: Kanban UI
- `http://localhost:3001/graphql`: Linear-compatible GraphQL endpoint
- `http://localhost:3001/api/issues`: local issue creation endpoint

The local development bearer token is `local-dev-token`.

Run TypeScript Symphony against the local tracker:

```bash
cd typescript
pnpm --filter @symphony/symphony-cli dev -- --port 4010 ./WORKFLOW.local.md
```

Status API for that local run:

```text
http://localhost:4010/api/v1/state
```

## Validation

For Elixir changes, run targeted tests while iterating, then the full gate before handoff:

```bash
make -C elixir test
make -C elixir all
```

`make -C elixir all` runs setup, escript build, format check, strict Credo/spec lint, coverage, and
Dialyzer. This is the main CI gate.

Useful Elixir targeted commands:

```bash
cd elixir
mix test test/symphony_elixir/workspace_and_config_test.exs
mix specs.check
mix pr_body.check --file /path/to/pr_body.md
```

Run the live end-to-end test only when the task explicitly needs real integration proof. It creates
disposable Linear resources and launches a real Codex app-server session:

```bash
cd elixir
export LINEAR_API_KEY=...
make e2e
```

For TypeScript changes:

```bash
cd typescript
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Run a subset of Vitest tests by path:

```bash
cd typescript
pnpm test -- packages/symphony/test/config.test.ts
```

Run checks for one TypeScript package:

```bash
cd typescript
pnpm --filter @symphony/symphony typecheck
pnpm --filter @symphony/linear-local build
```

For docs-only changes, at minimum check formatting and the exact paths/commands you touched:

```bash
git diff --check
```

## Code Style

Keep implementation behavior aligned with `SPEC.md`, especially the Section 18.1 conformance
checklist when changing orchestration behavior.

Elixir:

- Follow `elixir/AGENTS.md` for required local rules.
- Public `def` functions in `elixir/lib/` need adjacent `@spec` declarations unless covered by the
  documented callback exception.
- Route runtime config through `SymphonyElixir.Workflow`, `SymphonyElixir.Config`, and
  `SymphonyElixir.Config.Schema` instead of ad-hoc environment reads.
- Preserve workspace safety invariants: workspace paths stay under the configured root, and Codex
  runs inside the per-issue workspace, never the source repo.
- Follow `elixir/docs/logging.md` for log fields. Issue/session lifecycle logs should include
  `issue_id`, `issue_identifier`, and `session_id` when applicable.

TypeScript:

- Use strict TypeScript with NodeNext ESM. Keep explicit `.js` extensions in relative imports where
  the existing code uses them.
- `packages/core` owns shared domain shapes and small utilities only.
- `packages/symphony` owns daemon internals: workflow loading, config, tracker client, workspace
  manager, hooks, Codex app-server client, dynamic tools, agent runner, and orchestrator.
- `packages/linear-schema` owns the local Linear-compatible GraphQL schema, resolvers, and store.
- `apps/symphony-cli` should stay thin CLI/status-server wiring.
- `apps/linear-local` should stay Next.js UI and route-handler wiring.

Frontend/UI work in `apps/linear-local` should match the existing utilitarian Kanban UI. Avoid
marketing-page patterns and keep controls dense, clear, and predictable.

## Workflow Contract

`WORKFLOW.md` files use YAML front matter for runtime config plus a Markdown prompt body. Important
config areas include:

- `tracker`: Linear or Linear-compatible endpoint, project slug, active states, terminal states, API
  key resolution.
- `polling`: poll interval.
- `workspace`: workspace root.
- `hooks`: `after_create`, `before_run`, `after_run`, `before_remove`, and timeout.
- `agent`: concurrency, turns, retry behavior.
- `codex`: app-server command and sandbox/approval settings.

Do not silently relax prompt rendering or config validation. Unknown prompt variables/filters and
invalid workflow config should remain explicit failures according to the implementation contract.

## Security And Side Effects

- Do not commit secrets, `.env` files, Linear tokens, Codex auth files, logs, local workspaces, build
  artifacts, or generated dependency directories.
- Treat `LINEAR_API_KEY`, Codex auth, GitHub auth, and SSH worker credentials as sensitive.
- The TypeScript local tracker token `local-dev-token` is for local development only.
- `make e2e` has external side effects in Linear and runs a real Codex session; do not run it as a
  routine check.
- Workspace deletion and terminal-state cleanup are sensitive paths. Preserve `before_remove`
  behavior and path-safety checks.

## Pull Requests

PR bodies must follow `.github/pull_request_template.md` exactly. Validate locally when editing a PR
body:

```bash
cd elixir
mix pr_body.check --file /path/to/pr_body.md
```

The default required PR check is:

```bash
make -C elixir all
```

For TypeScript changes, add the relevant local TypeScript checks to the PR test plan because the
current GitHub workflows do not run the TypeScript pnpm workspace.

When working inside a Symphony-managed ticket workflow, use the repository skills when relevant:

- `pull`: merge latest `origin/main` into the current branch.
- `commit`: create a scoped commit that matches the actual staged diff.
- `push`: push/update the branch and create or refresh the PR.
- `land`: handle the approved `Merging` state; do not bypass it with a direct merge command.
- `linear`: use Symphony's injected `linear_graphql` tool for tracker updates.
- `debug`: trace stuck or retrying Symphony runs through `log/symphony.log*`.

## Debugging Notes

For stuck Elixir runs, start with `elixir/log/symphony.log*` and correlate by:

- `issue_identifier`
- `issue_id`
- `session_id`

Useful searches:

```bash
rg -n "issue_identifier=<KEY>" elixir/log/symphony.log*
rg -n "session_id=<thread>-<turn>" elixir/log/symphony.log*
rg -n "Issue stalled|scheduling retry|turn_timeout|turn_failed|Codex session failed" elixir/log/symphony.log*
```

For TypeScript local development, keep the local tracker process and the Symphony CLI process
separate. The daemon should not depend on the Next.js dev server lifecycle except through the
GraphQL endpoint configured in `WORKFLOW.local.md`.
