# TypeScript Symphony and Local Linear Design

Date: 2026-05-09

## Decision

Build a TypeScript implementation of Symphony that targets the required conformance checklist in
`SPEC.md` section 18.1, plus a Next.js local Linear-compatible tracker that lets the first version
run without a real Linear account.

The first version will be a monorepo under `typescript/` with two applications and shared packages:

```text
typescript/
  apps/
    symphony-cli/
    linear-local/
  packages/
    core/
    symphony/
    linear-schema/
```

`apps/symphony-cli` is the long-running scheduler/runner daemon. `apps/linear-local` is a Next.js
development tracker that exposes a Linear-like GraphQL endpoint and a small issue-management UI.
The two processes communicate over GraphQL, which keeps the local tracker close to the real Linear
integration boundary.

## Goals

- Implement the required `SPEC.md` 18.1 behaviors in TypeScript.
- Preserve the repository-owned `WORKFLOW.md` contract: YAML front matter plus prompt body.
- Keep the Symphony daemon independent from Next.js process lifecycle.
- Provide a local Linear-compatible tracker so a developer can run the orchestration loop without
  external Linear credentials.
- Make the first version verifiable with automated unit and smoke tests.

## Non-Goals

- Full Linear API compatibility.
- Multi-tenant hosted tracker behavior.
- A rich production dashboard for either Symphony or the local tracker.
- Replacing the existing `elixir/` implementation in the first change.
- Durable orchestrator state across process restarts beyond tracker/filesystem recovery required by
  the spec.

## Architecture

### `apps/symphony-cli`

Responsibilities:

- Parse CLI arguments:
  - `symphony [--port <port>] [path-to-WORKFLOW.md]`
  - default workflow path is `./WORKFLOW.md`
- Load, validate, and watch `WORKFLOW.md`.
- Apply config defaults and `$VAR` indirection according to `SPEC.md`.
- Poll the configured tracker endpoint.
- Dispatch eligible issues with global and per-state concurrency limits.
- Create and validate per-issue workspaces.
- Run workspace hooks with timeout behavior.
- Start the configured Codex app-server command via `bash -lc` inside the issue workspace.
- Process app-server JSON-line messages and dynamic tool calls.
- Implement retry, continuation retry, reconciliation, stall detection, and terminal workspace
  cleanup.
- Emit structured logs with issue/session context.

The CLI is a Node.js process, not a Next.js server. This avoids coupling a long-running scheduler to
Next.js development reloads or deployment lifecycle.

### `apps/linear-local`

Responsibilities:

- Serve a Next.js UI for local issue management.
- Expose `POST /graphql` as the local Linear-compatible GraphQL endpoint.
- Store projects, workflow states, issues, relations, and comments locally.
- Enforce a simple development bearer token so Symphony can exercise the same auth path it uses for
  real Linear.

Next.js route handlers will use the default Node.js runtime. The GraphQL route will live under
`app/graphql/route.ts`, separate from any UI route to avoid route/page conflicts.

### `packages/core`

Shared domain and utility code:

- Normalized `Issue` model.
- Workflow definition types.
- Effective config types.
- Error categories.
- Structured logging field types.
- Shared timestamp and identifier helpers.

### `packages/symphony`

Reusable daemon internals:

- `workflow-loader`
- `config`
- `prompt-renderer`
- `linear-client`
- `tracker`
- `workspace-manager`
- `hook-runner`
- `codex-app-server`
- `dynamic-tools`
- `agent-runner`
- `orchestrator`
- optional status API helpers

### `packages/linear-schema`

Local tracker internals:

- GraphQL schema.
- Resolvers.
- SQLite persistence adapter.
- Seed/fixture helpers.
- Compatibility tests for the Symphony-required GraphQL operations.

## Local Linear-Compatible Tracker

The local tracker implements only the Linear subset needed by Symphony and the default workflow.

### Storage

Use SQLite for the first version. It keeps local setup simple while avoiding fragile concurrent
file rewrites for issues, comments, labels, and relations.

Minimum tables:

- `projects`
- `workflow_states`
- `issues`
- `issue_labels`
- `issue_relations`
- `comments`
- `attachments`

### GraphQL Endpoint

Endpoint:

```text
POST http://localhost:3001/graphql
```

The `tracker.endpoint` value in `WORKFLOW.md` points to this endpoint during local development.

The service accepts:

```http
Authorization: Bearer <local-dev-token>
```

The token is configured through `.env.local` for `linear-local` and through `tracker.api_key` or
`LINEAR_API_KEY` for `symphony-cli`.

### Required Queries

The local schema must support the query shapes used by the TypeScript Linear client:

- Candidate issue polling filtered by `project.slugId` and state names.
- Issue lookup by GraphQL issue IDs for active-run reconciliation.
- Terminal-state issue lookup for startup workspace cleanup.

The local schema should keep names and nesting close to Linear where practical, but compatibility is
defined by the TypeScript client's tested operations rather than full Linear schema coverage.

### Required Mutations

The first version should support enough mutations for `linear_graphql`-driven agent workflows:

- update issue title, description, state, priority, labels, or branch metadata
- create comment
- update comment
- create relation
- create or update a PR/URL attachment

This gives agents a local workpad/comment path and lets them move issues through the configured
workflow without real Linear.

## Workflow Configuration

Example local workflow tracker configuration:

```yaml
tracker:
  kind: linear
  endpoint: http://localhost:3001/graphql
  api_key: local-dev-token
  project_slug: symphony-local
  active_states:
    - Todo
    - In Progress
    - Rework
    - Merging
  terminal_states:
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
    - Done
```

`tracker.kind` remains `linear` because the local tracker is a Linear-compatible implementation for
the Symphony integration contract. `tracker.api_key` remains required so dispatch preflight behavior
matches the spec and real Linear mode.

## Orchestration Behavior

The TypeScript orchestrator owns all scheduler state mutations. It should implement the state model
from `SPEC.md`:

- `Unclaimed`
- `Claimed`
- `Running`
- `RetryQueued`
- `Released`

Tick order:

1. Reconcile running issues.
2. Re-validate dispatch config.
3. Fetch candidate issues.
4. Sort by priority, creation time, and identifier.
5. Dispatch eligible issues while concurrency slots remain.
6. Notify observability/status consumers.

Retry behavior:

- Normal worker exit schedules a continuation retry after `1000 ms`.
- Abnormal worker exit uses exponential backoff capped by
  `agent.max_retry_backoff_ms`.
- Retry firing re-fetches active candidates and releases the claim if the issue is no longer
  eligible.

Reconciliation behavior:

- Terminal tracker state stops the worker and cleans the workspace.
- Non-active, non-terminal tracker state stops the worker without cleanup.
- State refresh failure logs and keeps workers running.

## Workspace Safety

Workspace paths must be deterministic and safe:

- root is normalized to an absolute path
- issue identifiers are sanitized to `[A-Za-z0-9._-]`
- computed workspace path must remain inside the workspace root
- Codex app-server cwd must equal the per-issue workspace path

Hook behavior:

- `after_create` runs only for new workspace directories and fails workspace creation on error.
- `before_run` runs before each attempt and fails that attempt on error.
- `after_run` runs after each attempt and logs failures without failing cleanup.
- `before_remove` runs before deletion and logs failures without blocking deletion.
- all hooks use `hooks.timeout_ms`, defaulting to `60000`.

## Codex App-Server Integration

The TypeScript client launches:

```text
bash -lc <codex.command>
```

with cwd set to the issue workspace.

The client must:

- speak the targeted Codex app-server JSON-line protocol over stdio
- initialize a session/thread using the installed protocol shape
- start turns with the workspace cwd
- collect `thread_id`, `turn_id`, token totals, rate-limit payloads, and event summaries
- fail user-input-required turns according to a documented first-version policy
- return failure responses for unsupported dynamic tools

The first version implements `linear_graphql` as the only dynamic tool.

## `linear_graphql` Tool

The tool accepts either:

```json
{
  "query": "single GraphQL query or mutation document",
  "variables": {}
}
```

or a raw GraphQL query string.

Validation:

- `query` must be a non-empty string.
- `variables`, when present, must be a JSON object.
- exactly one GraphQL operation is allowed.

Execution:

- POST to the configured `tracker.endpoint`.
- Use the configured `tracker.api_key` as bearer auth.
- Return structured tool output.
- Mark top-level GraphQL `errors` as `success=false` while preserving the response body.
- Mark invalid input, missing auth, or transport failure as `success=false` with a compact error
  payload.

## Observability

Required first-version observability:

- structured logs to stderr
- stable `key=value` messages
- `issue_id` and `issue_identifier` on issue-related logs
- `session_id` on coding-agent lifecycle logs
- startup, validation, dispatch, retry, hook, tracker, and app-server failures visible without a
  debugger

Optional first-version status API:

- `GET /api/v1/state`
- `GET /api/v1/:issue_identifier`
- `POST /api/v1/refresh`

The status API is useful but should remain independent from orchestrator correctness.

## Error Handling

Startup should fail when:

- workflow path is missing
- workflow front matter cannot parse to an object
- dispatch-required config is invalid
- `tracker.kind` is unsupported
- `tracker.api_key` or `tracker.project_slug` is missing
- `codex.command` is empty

Runtime should continue when possible:

- invalid workflow reload keeps the last known good config
- candidate fetch failure skips dispatch for that tick
- state refresh failure keeps workers running
- terminal cleanup fetch failure logs and continues startup
- non-critical hook failures are logged according to the hook contract

## Test Plan

Core tests:

- workflow path selection and default path behavior
- YAML front matter parsing and prompt-body trimming
- config defaults, `$VAR` resolution, and path normalization
- strict prompt rendering with unknown variable/filter failures

Workspace tests:

- deterministic sanitized path generation
- containment checks
- hook ordering, timeout, and failure semantics
- terminal cleanup behavior

Tracker tests:

- local GraphQL candidate polling query
- state refresh by IDs
- terminal issue fetch
- normalization of labels, blockers, priority, and timestamps
- GraphQL error and transport error mapping

Orchestrator tests:

- dispatch eligibility
- blocker rule for `Todo`
- concurrency limits
- retry backoff and cap
- continuation retry
- reconciliation stop/cleanup behavior
- invalid reload keeps last known good config

Codex/app-server tests:

- launch command uses workspace cwd
- fake app-server session startup and turn stream
- token/rate-limit event aggregation
- unsupported tool failure
- `linear_graphql` success, GraphQL error, invalid input, auth failure, and transport failure

Smoke test:

1. Start `linear-local` with seed project `symphony-local`.
2. Create a `Todo` issue.
3. Start `symphony-cli` against a local workflow file.
4. Use a fake app-server that calls `linear_graphql` to create a comment and move the issue state.
5. Verify workspace creation, prompt rendering, comment write, state transition, retry/reconcile
   behavior, and structured logs.

## Initial Usability Standard

The first TypeScript version is usable when a developer can:

1. Install dependencies under `typescript/`.
2. Start `linear-local` on `localhost:3001`.
3. Create or seed a local issue in `Todo`.
4. Start `symphony-cli` with a workflow pointing at `linear-local`.
5. Observe Symphony create a workspace and run a fake or real Codex app-server turn.
6. Observe the agent update the local issue through `linear_graphql`.
7. Observe terminal issue cleanup through reconciliation.
8. Debug failures from structured logs and, if shipped, the minimal status API.

## Open Implementation Choices

- Whether the first status API lives inside `symphony-cli` via Fastify/Hono or is deferred until
  after core conformance tests pass.
- Whether the first local tracker UI uses Server Actions for UI mutations or calls internal service
  functions directly from Server Components.
- Whether real Codex app-server smoke tests are gated behind an environment variable while fake
  app-server tests run by default.

These choices do not block the architecture. They can be resolved in the implementation plan.
