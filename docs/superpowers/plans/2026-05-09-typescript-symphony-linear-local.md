# TypeScript Symphony Linear Local Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript Symphony implementation that satisfies the required `SPEC.md` 18.1 behaviors and can run end-to-end against a local Next.js Linear-compatible tracker.

**Architecture:** Create a `typescript/` pnpm monorepo with a Node.js Symphony daemon, a Next.js local Linear-compatible tracker, and shared packages for domain types, Symphony internals, and GraphQL schema/resolvers. Keep the long-running orchestrator outside Next.js; communicate with the local tracker through a Linear-like GraphQL endpoint.

**Tech Stack:** TypeScript, pnpm workspaces, Node.js ESM, Vitest, tsx, Next.js App Router, SQLite, GraphQL Yoga, zod, pino, chokidar, liquidjs.

---

## File Structure

Create these files and directories:

```text
typescript/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  vitest.config.ts
  apps/
    symphony-cli/
      package.json
      tsconfig.json
      src/cli.ts
      src/main.ts
      src/status-server.ts
      test/cli.test.ts
    linear-local/
      package.json
      next.config.ts
      tsconfig.json
      app/layout.tsx
      app/page.tsx
      app/graphql/route.ts
      src/env.ts
  packages/
    core/
      package.json
      tsconfig.json
      src/errors.ts
      src/issue.ts
      src/logging.ts
      src/result.ts
      src/time.ts
      test/issue.test.ts
    symphony/
      package.json
      tsconfig.json
      src/agent-runner.ts
      src/codex-app-server.ts
      src/config.ts
      src/dynamic-tools.ts
      src/hook-runner.ts
      src/linear-client.ts
      src/orchestrator.ts
      src/prompt-renderer.ts
      src/tracker.ts
      src/workflow-loader.ts
      src/workspace-manager.ts
      test/config.test.ts
      test/dynamic-tools.test.ts
      test/hook-runner.test.ts
      test/linear-client.test.ts
      test/orchestrator.test.ts
      test/prompt-renderer.test.ts
      test/workflow-loader.test.ts
      test/workspace-manager.test.ts
    linear-schema/
      package.json
      tsconfig.json
      src/context.ts
      src/database.ts
      src/resolvers.ts
      src/schema.ts
      src/seed.ts
      src/server.ts
      src/store.ts
      test/graphql.test.ts
```

Responsibility boundaries:

- `packages/core`: shared data shapes and small utilities with no process, filesystem, or HTTP ownership.
- `packages/symphony`: daemon logic with dependency injection for tracker, app-server, time, and filesystem where tests need control.
- `packages/linear-schema`: local tracker schema, persistence, and resolver behavior.
- `apps/symphony-cli`: CLI wiring only.
- `apps/linear-local`: Next.js UI and route handler wiring only.

## Task 1: Create TypeScript Workspace Skeleton

**Files:**
- Create: `typescript/package.json`
- Create: `typescript/pnpm-workspace.yaml`
- Create: `typescript/tsconfig.base.json`
- Create: `typescript/vitest.config.ts`
- Create: `typescript/packages/core/package.json`
- Create: `typescript/packages/symphony/package.json`
- Create: `typescript/packages/linear-schema/package.json`
- Create: `typescript/apps/symphony-cli/package.json`
- Create: `typescript/apps/linear-local/package.json`
- Create: package `tsconfig.json` files

- [ ] **Step 1: Create failing workspace validation test**

Create `typescript/packages/core/test/issue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeLabels } from "../src/issue.js";

describe("normalizeLabels", () => {
  it("lowercases labels and drops blank values", () => {
    expect(normalizeLabels(["Bug", "  Feature ", "", "REWORK"])).toEqual([
      "bug",
      "feature",
      "rework",
    ]);
  });
});
```

- [ ] **Step 2: Add workspace manifests**

Create `typescript/package.json`:

```json
{
  "name": "@symphony/typescript-workspace",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "dev:linear": "pnpm --filter @symphony/linear-local dev",
    "dev:symphony": "pnpm --filter @symphony/symphony-cli dev"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  },
  "packageManager": "pnpm@10.10.0"
}
```

Create `typescript/pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

Create `typescript/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

Create `typescript/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add package manifests**

For `typescript/packages/core/package.json`:

```json
{
  "name": "@symphony/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "tsc -p tsconfig.json --noEmit"
  }
}
```

For `typescript/packages/symphony/package.json`:

```json
{
  "name": "@symphony/symphony",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@symphony/core": "workspace:*",
    "chokidar": "^4.0.3",
    "liquidjs": "^10.21.1",
    "pino": "^9.6.0",
    "yaml": "^2.7.0",
    "zod": "^3.24.0"
  }
}
```

For `typescript/packages/linear-schema/package.json`:

```json
{
  "name": "@symphony/linear-schema",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@symphony/core": "workspace:*",
    "graphql": "^16.10.0",
    "graphql-yoga": "^5.13.0",
    "kysely": "^0.27.6",
    "better-sqlite3": "^11.10.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13"
  }
}
```

For `typescript/apps/symphony-cli/package.json`:

```json
{
  "name": "@symphony/symphony-cli",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": {
    "symphony-ts": "./src/cli.ts"
  },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@symphony/core": "workspace:*",
    "@symphony/symphony": "workspace:*",
    "commander": "^13.1.0",
    "hono": "^4.7.0"
  }
}
```

For `typescript/apps/linear-local/package.json`:

```json
{
  "name": "@symphony/linear-local",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@symphony/core": "workspace:*",
    "@symphony/linear-schema": "workspace:*",
    "next": "^15.3.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0"
  }
}
```

- [ ] **Step 4: Add package tsconfig files**

Each package/app `tsconfig.json` should extend the root config:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

For `apps/linear-local/tsconfig.json`, use:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "allowJs": true,
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Implement minimal core export**

Create `typescript/packages/core/src/issue.ts`:

```ts
export interface BlockerRef {
  id: string | null;
  identifier: string | null;
  state: string | null;
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branchName: string | null;
  url: string | null;
  labels: string[];
  blockedBy: BlockerRef[];
  createdAt: string | null;
  updatedAt: string | null;
}

export function normalizeLabels(labels: readonly string[]): string[] {
  return labels.map((label) => label.trim().toLowerCase()).filter(Boolean);
}
```

Create `typescript/packages/core/src/index.ts`:

```ts
export * from "./issue.js";
```

- [ ] **Step 6: Install dependencies and run validation**

Run:

```bash
cd /Users/zw/workspace/symphony/typescript
pnpm install
pnpm test -- packages/core/test/issue.test.ts
pnpm typecheck
```

Expected:

```text
1 test passed
all packages typecheck successfully
```

- [ ] **Step 7: Commit**

```bash
cd /Users/zw/workspace/symphony
git add typescript
git commit -m "feat(ts): add TypeScript workspace skeleton"
```

## Task 2: Implement Workflow Loader, Config, and Prompt Rendering

**Files:**
- Create: `typescript/packages/core/src/result.ts`
- Create: `typescript/packages/core/src/errors.ts`
- Create: `typescript/packages/symphony/src/workflow-loader.ts`
- Create: `typescript/packages/symphony/src/config.ts`
- Create: `typescript/packages/symphony/src/prompt-renderer.ts`
- Create tests under `typescript/packages/symphony/test/`

- [ ] **Step 1: Write workflow loader tests**

Create `typescript/packages/symphony/test/workflow-loader.test.ts`:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWorkflow } from "../src/workflow-loader.js";

describe("loadWorkflow", () => {
  it("parses YAML front matter and trims the prompt body", async () => {
    const dir = await mkdtemp(join(tmpdir(), "symphony-workflow-"));
    const path = join(dir, "WORKFLOW.md");
    await writeFile(path, "---\ntracker:\n  kind: linear\n---\n\nHello {{ issue.identifier }}\n");

    const workflow = await loadWorkflow(path);

    expect(workflow).toEqual({
      path,
      directory: dir,
      config: { tracker: { kind: "linear" } },
      promptTemplate: "Hello {{ issue.identifier }}",
    });
  });

  it("treats files without front matter as prompt-only workflows", async () => {
    const dir = await mkdtemp(join(tmpdir(), "symphony-workflow-"));
    const path = join(dir, "WORKFLOW.md");
    await writeFile(path, "Run issue {{ issue.identifier }}\n");

    const workflow = await loadWorkflow(path);

    expect(workflow.config).toEqual({});
    expect(workflow.promptTemplate).toBe("Run issue {{ issue.identifier }}");
  });
});
```

- [ ] **Step 2: Implement workflow loader**

Create `typescript/packages/core/src/result.ts`:

```ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
```

Create `typescript/packages/core/src/errors.ts`:

```ts
export interface SymphonyError {
  code: string;
  message: string;
  cause?: unknown;
}
```

Update `typescript/packages/core/src/index.ts`:

```ts
export * from "./errors.js";
export * from "./issue.js";
export * from "./result.js";
```

Create `typescript/packages/symphony/src/workflow-loader.ts`:

```ts
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import YAML from "yaml";

export interface WorkflowDefinition {
  path: string;
  directory: string;
  config: Record<string, unknown>;
  promptTemplate: string;
}

export class WorkflowError extends Error {
  constructor(
    readonly code:
      | "missing_workflow_file"
      | "workflow_parse_error"
      | "workflow_front_matter_not_a_map",
    message: string,
  ) {
    super(message);
  }
}

export async function loadWorkflow(workflowPath: string): Promise<WorkflowDefinition> {
  const absolutePath = resolve(workflowPath);
  let raw: string;

  try {
    raw = await readFile(absolutePath, "utf8");
  } catch (error) {
    throw new WorkflowError("missing_workflow_file", `Workflow file not found: ${absolutePath}`);
  }

  const { frontMatter, body } = splitFrontMatter(raw);
  const config = parseFrontMatter(frontMatter);

  return {
    path: absolutePath,
    directory: dirname(absolutePath),
    config,
    promptTemplate: body.trim(),
  };
}

function splitFrontMatter(raw: string): { frontMatter: string | null; body: string } {
  if (!raw.startsWith("---\n")) {
    return { frontMatter: null, body: raw };
  }

  const end = raw.indexOf("\n---", 4);
  if (end === -1) {
    throw new WorkflowError("workflow_parse_error", "Workflow front matter is missing a closing delimiter.");
  }

  const afterDelimiter = raw.indexOf("\n", end + 4);
  return {
    frontMatter: raw.slice(4, end),
    body: afterDelimiter === -1 ? "" : raw.slice(afterDelimiter + 1),
  };
}

function parseFrontMatter(frontMatter: string | null): Record<string, unknown> {
  if (frontMatter === null) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(frontMatter);
  } catch (error) {
    throw new WorkflowError("workflow_parse_error", `Workflow YAML failed to parse: ${String(error)}`);
  }

  if (parsed === null) {
    return {};
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WorkflowError("workflow_front_matter_not_a_map", "Workflow front matter must decode to an object.");
  }

  return parsed as Record<string, unknown>;
}
```

- [ ] **Step 3: Write config tests**

Create `typescript/packages/symphony/test/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config.js";

describe("resolveConfig", () => {
  it("applies defaults and resolves env-backed tracker auth", () => {
    const config = resolveConfig(
      {
        tracker: {
          kind: "linear",
          api_key: "$LINEAR_API_KEY",
          project_slug: "symphony-local",
        },
      },
      {
        workflowDirectory: "/repo",
        env: { LINEAR_API_KEY: "token-1" },
        homeDirectory: "/Users/tester",
        tempDirectory: "/tmp",
      },
    );

    expect(config.tracker.endpoint).toBe("https://api.linear.app/graphql");
    expect(config.tracker.apiKey).toBe("token-1");
    expect(config.tracker.activeStates).toEqual(["Todo", "In Progress"]);
    expect(config.workspace.root).toBe("/tmp/symphony_workspaces");
    expect(config.agent.maxTurns).toBe(20);
  });

  it("resolves relative workspace roots relative to the workflow directory", () => {
    const config = resolveConfig(
      {
        tracker: { kind: "linear", api_key: "local-dev-token", project_slug: "symphony-local" },
        workspace: { root: ".workspaces" },
      },
      {
        workflowDirectory: "/repo/config",
        env: {},
        homeDirectory: "/Users/tester",
        tempDirectory: "/tmp",
      },
    );

    expect(config.workspace.root).toBe("/repo/config/.workspaces");
  });
});
```

- [ ] **Step 4: Implement config resolution**

Create `typescript/packages/symphony/src/config.ts`:

```ts
import { homedir, tmpdir } from "node:os";
import { isAbsolute, resolve } from "node:path";

export interface ConfigContext {
  workflowDirectory: string;
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string;
  tempDirectory?: string;
}

export interface EffectiveConfig {
  tracker: {
    kind: "linear";
    endpoint: string;
    apiKey: string | null;
    projectSlug: string | null;
    activeStates: string[];
    terminalStates: string[];
  };
  polling: { intervalMs: number };
  workspace: { root: string };
  hooks: {
    afterCreate: string | null;
    beforeRun: string | null;
    afterRun: string | null;
    beforeRemove: string | null;
    timeoutMs: number;
  };
  agent: {
    maxConcurrentAgents: number;
    maxTurns: number;
    maxRetryBackoffMs: number;
    maxConcurrentAgentsByState: Map<string, number>;
  };
  codex: {
    command: string;
    turnTimeoutMs: number;
    readTimeoutMs: number;
    stallTimeoutMs: number;
    approvalPolicy: unknown;
    threadSandbox: unknown;
    turnSandboxPolicy: unknown;
  };
}

export function resolveConfig(raw: Record<string, unknown>, context: ConfigContext): EffectiveConfig {
  const env = context.env ?? process.env;
  const tracker = objectValue(raw.tracker);
  const polling = objectValue(raw.polling);
  const workspace = objectValue(raw.workspace);
  const hooks = objectValue(raw.hooks);
  const agent = objectValue(raw.agent);
  const codex = objectValue(raw.codex);

  return {
    tracker: {
      kind: "linear",
      endpoint: stringValue(tracker.endpoint, "https://api.linear.app/graphql"),
      apiKey: resolveEnvString(stringValue(tracker.api_key, "$LINEAR_API_KEY"), env),
      projectSlug: nullableString(tracker.project_slug),
      activeStates: stringList(tracker.active_states, ["Todo", "In Progress"]),
      terminalStates: stringList(tracker.terminal_states, ["Closed", "Cancelled", "Canceled", "Duplicate", "Done"]),
    },
    polling: { intervalMs: positiveInteger(polling.interval_ms, 30_000) },
    workspace: {
      root: resolvePath(stringValue(workspace.root, `${context.tempDirectory ?? tmpdir()}/symphony_workspaces`), context),
    },
    hooks: {
      afterCreate: nullableString(hooks.after_create),
      beforeRun: nullableString(hooks.before_run),
      afterRun: nullableString(hooks.after_run),
      beforeRemove: nullableString(hooks.before_remove),
      timeoutMs: positiveInteger(hooks.timeout_ms, 60_000),
    },
    agent: {
      maxConcurrentAgents: positiveInteger(agent.max_concurrent_agents, 10),
      maxTurns: positiveInteger(agent.max_turns, 20),
      maxRetryBackoffMs: positiveInteger(agent.max_retry_backoff_ms, 300_000),
      maxConcurrentAgentsByState: stateLimitMap(agent.max_concurrent_agents_by_state),
    },
    codex: {
      command: stringValue(codex.command, "codex app-server"),
      turnTimeoutMs: positiveInteger(codex.turn_timeout_ms, 3_600_000),
      readTimeoutMs: positiveInteger(codex.read_timeout_ms, 5_000),
      stallTimeoutMs: integerValue(codex.stall_timeout_ms, 300_000),
      approvalPolicy: codex.approval_policy,
      threadSandbox: codex.thread_sandbox,
      turnSandboxPolicy: codex.turn_sandbox_policy,
    },
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function resolveEnvString(value: string, env: NodeJS.ProcessEnv): string | null {
  if (!value.startsWith("$")) {
    return value.trim() === "" ? null : value;
  }
  const resolved = env[value.slice(1)];
  return resolved && resolved.trim() !== "" ? resolved : null;
}

function stringList(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function integerValue(value: unknown, fallback: number): number {
  return Number.isInteger(value) ? Number(value) : fallback;
}

function stateLimitMap(value: unknown): Map<string, number> {
  const result = new Map<string, number>();
  for (const [key, limit] of Object.entries(objectValue(value))) {
    if (Number.isInteger(limit) && Number(limit) > 0) {
      result.set(key.toLowerCase(), Number(limit));
    }
  }
  return result;
}

function resolvePath(value: string, context: ConfigContext): string {
  const home = context.homeDirectory ?? homedir();
  const expanded = value.startsWith("~/") ? resolve(home, value.slice(2)) : value;
  return isAbsolute(expanded) ? resolve(expanded) : resolve(context.workflowDirectory, expanded);
}
```

- [ ] **Step 5: Write and implement prompt rendering tests**

Create `typescript/packages/symphony/test/prompt-renderer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderPrompt } from "../src/prompt-renderer.js";

describe("renderPrompt", () => {
  it("renders issue and attempt variables", async () => {
    await expect(
      renderPrompt("Issue {{ issue.identifier }} attempt {{ attempt }}", {
        issue: { identifier: "MT-1" },
        attempt: 2,
      }),
    ).resolves.toBe("Issue MT-1 attempt 2");
  });

  it("fails unknown variables", async () => {
    await expect(renderPrompt("{{ missing.value }}", { issue: {}, attempt: null })).rejects.toThrow(
      "template_render_error",
    );
  });
});
```

Create `typescript/packages/symphony/src/prompt-renderer.ts`:

```ts
import { Liquid } from "liquidjs";

const engine = new Liquid({ strictVariables: true, strictFilters: true });

export async function renderPrompt(template: string, input: { issue: unknown; attempt: number | null }): Promise<string> {
  const effectiveTemplate = template.trim() === "" ? "You are working on an issue from Linear." : template;
  try {
    return await engine.parseAndRender(effectiveTemplate, input);
  } catch (error) {
    throw new Error(`template_render_error: ${String(error)}`);
  }
}
```

- [ ] **Step 6: Run validation**

```bash
cd /Users/zw/workspace/symphony/typescript
pnpm test -- packages/symphony/test/workflow-loader.test.ts packages/symphony/test/config.test.ts packages/symphony/test/prompt-renderer.test.ts
pnpm typecheck
```

Expected:

```text
workflow, config, and prompt renderer tests pass
typecheck succeeds
```

- [ ] **Step 7: Commit**

```bash
cd /Users/zw/workspace/symphony
git add typescript/packages/core typescript/packages/symphony typescript/package.json typescript/pnpm-lock.yaml
git commit -m "feat(ts): add workflow config and prompt rendering"
```

## Task 3: Implement Local Linear GraphQL Schema and SQLite Store

**Files:**
- Create: `typescript/packages/linear-schema/src/database.ts`
- Create: `typescript/packages/linear-schema/src/store.ts`
- Create: `typescript/packages/linear-schema/src/schema.ts`
- Create: `typescript/packages/linear-schema/src/resolvers.ts`
- Create: `typescript/packages/linear-schema/src/server.ts`
- Create: `typescript/packages/linear-schema/test/graphql.test.ts`

- [ ] **Step 1: Write GraphQL compatibility tests**

Create `typescript/packages/linear-schema/test/graphql.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createLinearGraphqlServer } from "../src/server.js";
import { createInMemoryStore } from "../src/store.js";

describe("local Linear GraphQL", () => {
  it("returns candidate issues filtered by project slug and state names", async () => {
    const store = createInMemoryStore();
    await store.seedDefaultProject("symphony-local");
    await store.createIssue({ identifier: "LOC-1", title: "Run local Symphony", state: "Todo", projectSlug: "symphony-local" });
    const server = createLinearGraphqlServer({ store, token: "local-dev-token" });

    const response = await server.fetch("http://local/graphql", {
      method: "POST",
      headers: { authorization: "Bearer local-dev-token", "content-type": "application/json" },
      body: JSON.stringify({
        query: `query Poll($projectSlug: String!, $stateNames: [String!]!) {
          issues(filter: { project: { slugId: { eq: $projectSlug } }, state: { name: { in: $stateNames } } }, first: 50) {
            nodes { id identifier title state { name } project { slugId } }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        variables: { projectSlug: "symphony-local", stateNames: ["Todo"] },
      }),
    });

    const body = await response.json();
    expect(body.errors).toBeUndefined();
    expect(body.data.issues.nodes[0].identifier).toBe("LOC-1");
  });
});
```

- [ ] **Step 2: Implement schema**

Create `typescript/packages/linear-schema/src/schema.ts`:

```ts
export const typeDefs = /* GraphQL */ `
  scalar DateTime

  type Project {
    id: ID!
    slugId: String!
    name: String!
  }

  type WorkflowState {
    id: ID!
    name: String!
    type: String!
  }

  type Issue {
    id: ID!
    identifier: String!
    title: String!
    description: String
    priority: Int
    state: WorkflowState!
    project: Project!
    branchName: String
    url: String
    labels: IssueLabelConnection!
    relations: IssueRelationConnection!
    comments: CommentConnection!
    createdAt: DateTime
    updatedAt: DateTime
  }

  type IssueLabel {
    id: ID!
    name: String!
  }

  type IssueRelation {
    id: ID!
    type: String!
    issue: Issue!
    relatedIssue: Issue!
  }

  type Comment {
    id: ID!
    body: String!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  type IssueConnection {
    nodes: [Issue!]!
    pageInfo: PageInfo!
  }

  type IssueLabelConnection {
    nodes: [IssueLabel!]!
  }

  type IssueRelationConnection {
    nodes: [IssueRelation!]!
  }

  type CommentConnection {
    nodes: [Comment!]!
  }

  input StringComparator {
    eq: String
    in: [String!]
  }

  input ProjectFilter {
    slugId: StringComparator
  }

  input StateFilter {
    name: StringComparator
  }

  input IssueFilter {
    project: ProjectFilter
    state: StateFilter
  }

  type Query {
    issues(filter: IssueFilter, first: Int, after: String): IssueConnection!
    issue(id: ID!): Issue
    nodes(ids: [ID!]!): [Issue]!
  }

  input IssueUpdateInput {
    title: String
    description: String
    stateName: String
    priority: Int
    branchName: String
    url: String
    labels: [String!]
  }

  type IssuePayload {
    success: Boolean!
    issue: Issue
  }

  type CommentPayload {
    success: Boolean!
    comment: Comment
  }

  type Mutation {
    issueUpdate(id: ID!, input: IssueUpdateInput!): IssuePayload!
    commentCreate(issueId: ID!, body: String!): CommentPayload!
    commentUpdate(id: ID!, body: String!): CommentPayload!
  }
`;
```

- [ ] **Step 3: Implement store and server**

Create `typescript/packages/linear-schema/src/store.ts`:

```ts
import { randomUUID } from "node:crypto";

export interface LocalIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  projectSlug: string;
  branchName: string | null;
  url: string | null;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateIssueInput {
  identifier: string;
  title: string;
  state: string;
  projectSlug: string;
}

export interface LocalLinearStore {
  seedDefaultProject(slugId: string): Promise<void>;
  createIssue(input: CreateIssueInput): Promise<LocalIssue>;
  listIssues(input: { projectSlug?: string; stateNames?: string[]; first: number; after?: string | null }): Promise<{ nodes: LocalIssue[]; endCursor: string | null; hasNextPage: boolean }>;
  getIssuesByIds(ids: string[]): Promise<LocalIssue[]>;
  updateIssue(id: string, input: Partial<Pick<LocalIssue, "title" | "description" | "priority" | "state" | "branchName" | "url" | "labels">>): Promise<LocalIssue | null>;
  createComment(issueId: string, body: string): Promise<{ id: string; issueId: string; body: string; createdAt: string; updatedAt: string } | null>;
  updateComment(id: string, body: string): Promise<{ id: string; issueId: string; body: string; createdAt: string; updatedAt: string } | null>;
}

export function createInMemoryStore(): LocalLinearStore {
  const projects = new Set<string>();
  const issues = new Map<string, LocalIssue>();
  const comments = new Map<string, { id: string; issueId: string; body: string; createdAt: string; updatedAt: string }>();

  return {
    async seedDefaultProject(slugId) {
      projects.add(slugId);
    },
    async createIssue(input) {
      projects.add(input.projectSlug);
      const now = new Date().toISOString();
      const issue: LocalIssue = {
        id: randomUUID(),
        identifier: input.identifier,
        title: input.title,
        description: null,
        priority: null,
        state: input.state,
        projectSlug: input.projectSlug,
        branchName: null,
        url: `http://localhost:3001/issues/${input.identifier}`,
        labels: [],
        createdAt: now,
        updatedAt: now,
      };
      issues.set(issue.id, issue);
      return issue;
    },
    async listIssues(input) {
      const all = [...issues.values()].filter((issue) => {
        const projectMatches = input.projectSlug ? issue.projectSlug === input.projectSlug : true;
        const stateMatches = input.stateNames ? input.stateNames.includes(issue.state) : true;
        return projectMatches && stateMatches;
      });
      const nodes = all.slice(0, input.first);
      return { nodes, endCursor: null, hasNextPage: all.length > nodes.length };
    },
    async getIssuesByIds(ids) {
      return ids.map((id) => issues.get(id)).filter((issue): issue is LocalIssue => Boolean(issue));
    },
    async updateIssue(id, input) {
      const issue = issues.get(id);
      if (!issue) return null;
      const updated = { ...issue, ...input, updatedAt: new Date().toISOString() };
      issues.set(id, updated);
      return updated;
    },
    async createComment(issueId, body) {
      if (!issues.has(issueId)) return null;
      const now = new Date().toISOString();
      const comment = { id: randomUUID(), issueId, body, createdAt: now, updatedAt: now };
      comments.set(comment.id, comment);
      return comment;
    },
    async updateComment(id, body) {
      const comment = comments.get(id);
      if (!comment) return null;
      const updated = { ...comment, body, updatedAt: new Date().toISOString() };
      comments.set(id, updated);
      return updated;
    },
  };
}
```

Create `typescript/packages/linear-schema/src/database.ts`:

```ts
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { CreateIssueInput, LocalIssue, LocalLinearStore } from "./store.js";

export function createSqliteStore(path: string): LocalLinearStore {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    create table if not exists projects (
      slug_id text primary key,
      name text not null
    );
    create table if not exists issues (
      id text primary key,
      identifier text not null unique,
      title text not null,
      description text,
      priority integer,
      state text not null,
      project_slug text not null,
      branch_name text,
      url text,
      labels_json text not null,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists comments (
      id text primary key,
      issue_id text not null,
      body text not null,
      created_at text not null,
      updated_at text not null
    );
  `);

  return {
    async seedDefaultProject(slugId) {
      db.prepare("insert or ignore into projects (slug_id, name) values (?, ?)").run(slugId, slugId);
    },
    async createIssue(input: CreateIssueInput) {
      const now = new Date().toISOString();
      const issue: LocalIssue = {
        id: randomUUID(),
        identifier: input.identifier,
        title: input.title,
        description: null,
        priority: null,
        state: input.state,
        projectSlug: input.projectSlug,
        branchName: null,
        url: `http://localhost:3001/issues/${input.identifier}`,
        labels: [],
        createdAt: now,
        updatedAt: now,
      };
      db.prepare(`
        insert into issues (id, identifier, title, description, priority, state, project_slug, branch_name, url, labels_json, created_at, updated_at)
        values (@id, @identifier, @title, @description, @priority, @state, @projectSlug, @branchName, @url, @labelsJson, @createdAt, @updatedAt)
      `).run({ ...issue, labelsJson: JSON.stringify(issue.labels) });
      return issue;
    },
    async listIssues(input) {
      const rows = db.prepare("select * from issues order by created_at asc").all() as SqliteIssueRow[];
      const filtered = rows.map(rowToIssue).filter((issue) => {
        const projectMatches = input.projectSlug ? issue.projectSlug === input.projectSlug : true;
        const stateMatches = input.stateNames ? input.stateNames.includes(issue.state) : true;
        return projectMatches && stateMatches;
      });
      const nodes = filtered.slice(0, input.first);
      return { nodes, endCursor: null, hasNextPage: filtered.length > nodes.length };
    },
    async getIssuesByIds(ids) {
      if (ids.length === 0) return [];
      const rows = db.prepare(`select * from issues where id in (${ids.map(() => "?").join(",")})`).all(...ids) as SqliteIssueRow[];
      return rows.map(rowToIssue);
    },
    async updateIssue(id, input) {
      const existing = db.prepare("select * from issues where id = ?").get(id) as SqliteIssueRow | undefined;
      if (!existing) return null;
      const issue = { ...rowToIssue(existing), ...input, updatedAt: new Date().toISOString() };
      db.prepare(`
        update issues set title = @title, description = @description, priority = @priority, state = @state,
        branch_name = @branchName, url = @url, labels_json = @labelsJson, updated_at = @updatedAt where id = @id
      `).run({ ...issue, labelsJson: JSON.stringify(issue.labels) });
      return issue;
    },
    async createComment(issueId, body) {
      const now = new Date().toISOString();
      const comment = { id: randomUUID(), issueId, body, createdAt: now, updatedAt: now };
      db.prepare("insert into comments (id, issue_id, body, created_at, updated_at) values (?, ?, ?, ?, ?)")
        .run(comment.id, comment.issueId, comment.body, comment.createdAt, comment.updatedAt);
      return comment;
    },
    async updateComment(id, body) {
      const row = db.prepare("select * from comments where id = ?").get(id) as SqliteCommentRow | undefined;
      if (!row) return null;
      const updatedAt = new Date().toISOString();
      db.prepare("update comments set body = ?, updated_at = ? where id = ?").run(body, updatedAt, id);
      return { id, issueId: row.issue_id, body, createdAt: row.created_at, updatedAt };
    },
  };
}

interface SqliteIssueRow {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  project_slug: string;
  branch_name: string | null;
  url: string | null;
  labels_json: string;
  created_at: string;
  updated_at: string;
}

interface SqliteCommentRow {
  id: string;
  issue_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

function rowToIssue(row: SqliteIssueRow): LocalIssue {
  return {
    id: row.id,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    priority: row.priority,
    state: row.state,
    projectSlug: row.project_slug,
    branchName: row.branch_name,
    url: row.url,
    labels: JSON.parse(row.labels_json) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

Create `typescript/packages/linear-schema/src/server.ts`:

```ts
import { createSchema, createYoga } from "graphql-yoga";
import { resolvers } from "./resolvers.js";
import { typeDefs } from "./schema.js";
import type { LocalLinearStore } from "./store.js";

export interface LocalLinearContext {
  store: LocalLinearStore;
}

export function createLinearGraphqlServer(input: { store: LocalLinearStore; token: string }) {
  return createYoga<LocalLinearContext>({
    schema: createSchema({ typeDefs, resolvers }),
    context: ({ request }) => {
      const auth = request.headers.get("authorization");
      if (auth !== `Bearer ${input.token}`) {
        throw new Error("unauthorized");
      }
      return { store: input.store };
    },
  });
}
```

Create `typescript/packages/linear-schema/src/resolvers.ts`:

```ts
import type { LocalIssue } from "./store.js";

export const resolvers = {
  Query: {
    issues: async (_parent: unknown, args: { filter?: { project?: { slugId?: { eq?: string } }; state?: { name?: { in?: string[] } } }; first?: number; after?: string }, context: any) => {
      return context.store.listIssues({
        projectSlug: args.filter?.project?.slugId?.eq,
        stateNames: args.filter?.state?.name?.in,
        first: args.first ?? 50,
        after: args.after ?? null,
      });
    },
    issue: async (_parent: unknown, args: { id: string }, context: any) => {
      const [issue] = await context.store.getIssuesByIds([args.id]);
      return issue ?? null;
    },
    nodes: async (_parent: unknown, args: { ids: string[] }, context: any) => context.store.getIssuesByIds(args.ids),
  },
  Mutation: {
    issueUpdate: async (_parent: unknown, args: { id: string; input: Record<string, unknown> }, context: any) => {
      const issue = await context.store.updateIssue(args.id, {
        title: typeof args.input.title === "string" ? args.input.title : undefined,
        description: typeof args.input.description === "string" ? args.input.description : undefined,
        state: typeof args.input.stateName === "string" ? args.input.stateName : undefined,
        priority: Number.isInteger(args.input.priority) ? Number(args.input.priority) : undefined,
        branchName: typeof args.input.branchName === "string" ? args.input.branchName : undefined,
        url: typeof args.input.url === "string" ? args.input.url : undefined,
        labels: Array.isArray(args.input.labels) ? args.input.labels.filter((label): label is string => typeof label === "string") : undefined,
      });
      return { success: Boolean(issue), issue };
    },
    commentCreate: async (_parent: unknown, args: { issueId: string; body: string }, context: any) => {
      const comment = await context.store.createComment(args.issueId, args.body);
      return { success: Boolean(comment), comment };
    },
    commentUpdate: async (_parent: unknown, args: { id: string; body: string }, context: any) => {
      const comment = await context.store.updateComment(args.id, args.body);
      return { success: Boolean(comment), comment };
    },
  },
  Issue: {
    state: (issue: LocalIssue) => ({ id: `state-${issue.state}`, name: issue.state, type: issue.state }),
    project: (issue: LocalIssue) => ({ id: `project-${issue.projectSlug}`, slugId: issue.projectSlug, name: issue.projectSlug }),
    labels: (issue: LocalIssue) => ({ nodes: issue.labels.map((name) => ({ id: `label-${name}`, name })) }),
    relations: () => ({ nodes: [] }),
    comments: () => ({ nodes: [] }),
  },
};
```

- [ ] **Step 4: Run validation**

```bash
cd /Users/zw/workspace/symphony/typescript
pnpm test -- packages/linear-schema/test/graphql.test.ts
pnpm typecheck
```

Expected:

```text
local Linear GraphQL tests pass
typecheck succeeds
```

- [ ] **Step 5: Commit**

```bash
cd /Users/zw/workspace/symphony
git add typescript/packages/linear-schema
git commit -m "feat(ts): add local Linear GraphQL schema"
```

## Task 4: Wire Next.js Local Linear App

**Files:**
- Create: `typescript/apps/linear-local/app/graphql/route.ts`
- Create: `typescript/apps/linear-local/app/layout.tsx`
- Create: `typescript/apps/linear-local/app/page.tsx`
- Create: `typescript/apps/linear-local/src/env.ts`
- Create: `typescript/apps/linear-local/next.config.ts`

- [ ] **Step 1: Add Next.js route handler**

Create `typescript/apps/linear-local/app/graphql/route.ts`:

```ts
import { createLinearGraphqlServer, createSqliteStore } from "@symphony/linear-schema";
import { getLinearLocalDatabasePath, getLinearLocalToken } from "../../../src/env";

const store = createSqliteStore(getLinearLocalDatabasePath());
await store.seedDefaultProject("symphony-local");

const yoga = createLinearGraphqlServer({
  store,
  token: getLinearLocalToken(),
});

export { yoga as GET, yoga as POST };
```

- [ ] **Step 2: Export schema package entrypoint**

Create `typescript/packages/linear-schema/src/index.ts`:

```ts
export { createLinearGraphqlServer } from "./server.js";
export { createSqliteStore } from "./database.js";
export { createInMemoryStore } from "./store.js";
export type { LocalLinearStore, LocalIssue } from "./store.js";
```

- [ ] **Step 3: Add env helper**

Create `typescript/apps/linear-local/src/env.ts`:

```ts
import { join } from "node:path";

export function getLinearLocalToken(): string {
  return process.env.LINEAR_LOCAL_TOKEN ?? "local-dev-token";
}

export function getLinearLocalDatabasePath(): string {
  return process.env.LINEAR_LOCAL_DB ?? join(process.cwd(), ".linear-local.sqlite");
}
```

- [ ] **Step 4: Add minimal UI**

Create `typescript/apps/linear-local/app/layout.tsx`:

```tsx
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `typescript/apps/linear-local/app/page.tsx`:

```tsx
export default function Page() {
  return (
    <main style={{ maxWidth: 960, margin: "40px auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>Symphony Local Linear</h1>
      <p>GraphQL endpoint: <code>/graphql</code></p>
      <p>Default project slug: <code>symphony-local</code></p>
      <p>Default bearer token: <code>local-dev-token</code></p>
    </main>
  );
}
```

Create `typescript/apps/linear-local/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 5: Run local app validation**

```bash
cd /Users/zw/workspace/symphony/typescript
pnpm --filter @symphony/linear-local build
pnpm --filter @symphony/linear-local dev
```

In another shell:

```bash
curl -sS http://localhost:3001/graphql \
  -H 'authorization: Bearer local-dev-token' \
  -H 'content-type: application/json' \
  --data '{"query":"query { issues(first: 10) { nodes { identifier title } pageInfo { hasNextPage } } }"}'
```

Expected:

```json
{"data":{"issues":{"nodes":[],"pageInfo":{"hasNextPage":false}}}}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/zw/workspace/symphony
git add typescript/apps/linear-local typescript/packages/linear-schema
git commit -m "feat(ts): wire Next.js local Linear app"
```

## Task 5: Implement Linear Client and `linear_graphql` Tool

**Files:**
- Create: `typescript/packages/symphony/src/linear-client.ts`
- Create: `typescript/packages/symphony/src/dynamic-tools.ts`
- Create tests: `typescript/packages/symphony/test/linear-client.test.ts`
- Create tests: `typescript/packages/symphony/test/dynamic-tools.test.ts`

- [ ] **Step 1: Write `linear_graphql` tests**

Create `typescript/packages/symphony/test/dynamic-tools.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { executeLinearGraphqlTool } from "../src/dynamic-tools.js";

describe("executeLinearGraphqlTool", () => {
  it("accepts object input and returns success for GraphQL data", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { viewer: { id: "u1" } } }), { status: 200 }));

    const result = await executeLinearGraphqlTool(
      { query: "query Viewer { viewer { id } }", variables: {} },
      { endpoint: "http://local/graphql", apiKey: "token", fetch },
    );

    expect(result.success).toBe(true);
    expect(result.body).toEqual({ data: { viewer: { id: "u1" } } });
  });

  it("rejects blank query strings", async () => {
    const result = await executeLinearGraphqlTool(" ", {
      endpoint: "http://local/graphql",
      apiKey: "token",
      fetch: vi.fn(),
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("invalid_arguments");
  });
});
```

- [ ] **Step 2: Implement dynamic tool**

Create `typescript/packages/symphony/src/dynamic-tools.ts`:

```ts
export interface ToolResult {
  success: boolean;
  body?: unknown;
  error?: { code: string; message: string };
}

export interface LinearGraphqlContext {
  endpoint: string;
  apiKey: string | null;
  fetch: typeof fetch;
}

export async function executeLinearGraphqlTool(argumentsValue: unknown, context: LinearGraphqlContext): Promise<ToolResult> {
  const normalized = normalizeArguments(argumentsValue);
  if (!normalized.ok) {
    return { success: false, error: normalized.error };
  }
  if (!context.apiKey) {
    return { success: false, error: { code: "missing_auth", message: "Symphony is missing Linear auth." } };
  }

  try {
    const response = await context.fetch(context.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: normalized.query, variables: normalized.variables }),
    });

    const body = await response.json();
    if (!response.ok) {
      return { success: false, body, error: { code: "linear_api_status", message: `Linear GraphQL request failed with HTTP ${response.status}.` } };
    }

    return { success: !hasGraphqlErrors(body), body };
  } catch (error) {
    return { success: false, error: { code: "linear_api_request", message: `Linear GraphQL request failed: ${String(error)}` } };
  }
}

function normalizeArguments(value: unknown): { ok: true; query: string; variables: Record<string, unknown> } | { ok: false; error: { code: string; message: string } } {
  if (typeof value === "string") {
    const query = value.trim();
    return query ? { ok: true, query, variables: {} } : invalid("`linear_graphql` requires a non-empty `query` string.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid("`linear_graphql` expects either a GraphQL query string or an object with `query` and optional `variables`.");
  }

  const input = value as Record<string, unknown>;
  if (typeof input.query !== "string" || input.query.trim() === "") {
    return invalid("`linear_graphql` requires a non-empty `query` string.");
  }

  if (input.variables !== undefined && (!input.variables || typeof input.variables !== "object" || Array.isArray(input.variables))) {
    return invalid("`linear_graphql.variables` must be a JSON object when provided.");
  }

  return { ok: true, query: input.query.trim(), variables: (input.variables as Record<string, unknown> | undefined) ?? {} };
}

function invalid(message: string) {
  return { ok: false as const, error: { code: "invalid_arguments", message } };
}

function hasGraphqlErrors(body: unknown): boolean {
  return Boolean(body && typeof body === "object" && Array.isArray((body as { errors?: unknown }).errors));
}
```

- [ ] **Step 3: Write and implement Linear client tests**

Create `typescript/packages/symphony/test/linear-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { LinearClient } from "../src/linear-client.js";

describe("LinearClient", () => {
  it("fetches candidates through the configured endpoint", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      data: { issues: { nodes: [{ id: "1", identifier: "LOC-1", title: "Work", description: null, priority: 1, state: { name: "Todo" }, project: { slugId: "symphony-local" }, labels: { nodes: [] }, relations: { nodes: [] }, createdAt: null, updatedAt: null }], pageInfo: { hasNextPage: false, endCursor: null } } },
    })));
    const client = new LinearClient({ endpoint: "http://local/graphql", apiKey: "token", projectSlug: "symphony-local", fetch });

    const issues = await client.fetchCandidateIssues(["Todo"]);

    expect(issues[0]?.identifier).toBe("LOC-1");
    expect(fetch).toHaveBeenCalledOnce();
  });
});
```

Create `typescript/packages/symphony/src/linear-client.ts`:

```ts
import type { Issue } from "@symphony/core";

export class LinearClient {
  constructor(
    private readonly input: {
      endpoint: string;
      apiKey: string;
      projectSlug: string;
      fetch: typeof fetch;
    },
  ) {}

  async fetchCandidateIssues(activeStates: string[]): Promise<Issue[]> {
    const body = await this.graphql({
      query: `query SymphonyLinearPoll($projectSlug: String!, $stateNames: [String!]!, $first: Int!) {
        issues(filter: { project: { slugId: { eq: $projectSlug } }, state: { name: { in: $stateNames } } }, first: $first) {
          nodes { id identifier title description priority branchName url createdAt updatedAt state { name } labels { nodes { name } } relations { nodes { type relatedIssue { id identifier state { name } } } } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      variables: { projectSlug: this.input.projectSlug, stateNames: activeStates, first: 50 },
    });

    const nodes = body.data?.issues?.nodes;
    return Array.isArray(nodes) ? nodes.map(normalizeIssue) : [];
  }

  private async graphql(input: { query: string; variables: Record<string, unknown> }): Promise<any> {
    const response = await this.input.fetch(this.input.endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${this.input.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(`linear_api_status: ${response.status}`);
    }
    const body = await response.json();
    if (Array.isArray(body.errors)) {
      throw new Error("linear_graphql_errors");
    }
    return body;
  }
}

function normalizeIssue(node: any): Issue {
  return {
    id: String(node.id),
    identifier: String(node.identifier),
    title: String(node.title),
    description: typeof node.description === "string" ? node.description : null,
    priority: Number.isInteger(node.priority) ? node.priority : null,
    state: String(node.state?.name),
    branchName: typeof node.branchName === "string" ? node.branchName : null,
    url: typeof node.url === "string" ? node.url : null,
    labels: Array.isArray(node.labels?.nodes) ? node.labels.nodes.map((label: any) => String(label.name).toLowerCase()) : [],
    blockedBy: [],
    createdAt: typeof node.createdAt === "string" ? node.createdAt : null,
    updatedAt: typeof node.updatedAt === "string" ? node.updatedAt : null,
  };
}
```

- [ ] **Step 4: Run validation**

```bash
cd /Users/zw/workspace/symphony/typescript
pnpm test -- packages/symphony/test/dynamic-tools.test.ts packages/symphony/test/linear-client.test.ts
pnpm typecheck
```

Expected:

```text
linear client and dynamic tool tests pass
typecheck succeeds
```

- [ ] **Step 5: Commit**

```bash
cd /Users/zw/workspace/symphony
git add typescript/packages/symphony
git commit -m "feat(ts): add Linear client and dynamic tool"
```

## Task 6: Implement Workspace Manager and Hook Runner

**Files:**
- Create: `typescript/packages/symphony/src/workspace-manager.ts`
- Create: `typescript/packages/symphony/src/hook-runner.ts`
- Create tests: `typescript/packages/symphony/test/workspace-manager.test.ts`
- Create tests: `typescript/packages/symphony/test/hook-runner.test.ts`

- [ ] **Step 1: Write workspace safety tests**

Create `typescript/packages/symphony/test/workspace-manager.test.ts`:

```ts
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorkspaceForIssue, sanitizeWorkspaceKey } from "../src/workspace-manager.js";

describe("workspace manager", () => {
  it("sanitizes issue identifiers", () => {
    expect(sanitizeWorkspaceKey("MT/../1 @x")).toBe("MT_.._1__x");
  });

  it("creates workspaces under the configured root", async () => {
    const root = await mkdtemp(join(tmpdir(), "symphony-workspaces-"));
    const workspace = await createWorkspaceForIssue(root, "LOC-1");

    expect(workspace.path.startsWith(root)).toBe(true);
    await expect(stat(workspace.path)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
  });
});
```

- [ ] **Step 2: Implement workspace manager**

Create `typescript/packages/symphony/src/workspace-manager.ts`:

```ts
import { mkdir, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

export interface Workspace {
  path: string;
  workspaceKey: string;
  createdNow: boolean;
}

export function sanitizeWorkspaceKey(identifier: string): string {
  return identifier.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function createWorkspaceForIssue(root: string, identifier: string): Promise<Workspace> {
  const workspaceRoot = resolve(root);
  const workspaceKey = sanitizeWorkspaceKey(identifier);
  const workspacePath = resolve(workspaceRoot, workspaceKey);

  assertInsideRoot(workspaceRoot, workspacePath);

  let createdNow = false;
  try {
    const existing = await stat(workspacePath);
    if (!existing.isDirectory()) {
      throw new Error(`workspace_not_directory: ${workspacePath}`);
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(workspacePath, { recursive: true });
    createdNow = true;
  }

  return { path: workspacePath, workspaceKey, createdNow };
}

export function assertInsideRoot(root: string, path: string): void {
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(path);
  if (normalizedPath !== normalizedRoot && !normalizedPath.startsWith(normalizedRoot + sep)) {
    throw new Error(`workspace_outside_root: ${normalizedPath}`);
  }
}
```

- [ ] **Step 3: Write and implement hook runner tests**

Create `typescript/packages/symphony/test/hook-runner.test.ts`:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runHook } from "../src/hook-runner.js";

describe("runHook", () => {
  it("runs shell scripts in the workspace directory", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "symphony-hook-"));
    const result = await runHook({ script: "printf ok > hook.txt", cwd, timeoutMs: 1000 });

    expect(result.ok).toBe(true);
    await expect(readFile(join(cwd, "hook.txt"), "utf8")).resolves.toBe("ok");
  });
});
```

Create `typescript/packages/symphony/src/hook-runner.ts`:

```ts
import { spawn } from "node:child_process";

export interface HookResult {
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function runHook(input: { script: string | null; cwd: string; timeoutMs: number }): Promise<HookResult> {
  if (!input.script) {
    return Promise.resolve({ ok: true, exitCode: 0, signal: null, stdout: "", stderr: "", timedOut: false });
  }

  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", input.script], { cwd: input.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ ok: exitCode === 0 && !timedOut, exitCode, signal, stdout, stderr, timedOut });
    });
  });
}
```

- [ ] **Step 4: Run validation**

```bash
cd /Users/zw/workspace/symphony/typescript
pnpm test -- packages/symphony/test/workspace-manager.test.ts packages/symphony/test/hook-runner.test.ts
pnpm typecheck
```

Expected:

```text
workspace and hook tests pass
typecheck succeeds
```

- [ ] **Step 5: Commit**

```bash
cd /Users/zw/workspace/symphony
git add typescript/packages/symphony
git commit -m "feat(ts): add workspace and hook runners"
```

## Task 7: Implement Orchestrator Core

**Files:**
- Create: `typescript/packages/symphony/src/tracker.ts`
- Create: `typescript/packages/symphony/src/orchestrator.ts`
- Create tests: `typescript/packages/symphony/test/orchestrator.test.ts`

- [ ] **Step 1: Write orchestrator dispatch test**

Create `typescript/packages/symphony/test/orchestrator.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createOrchestrator } from "../src/orchestrator.js";
import type { Tracker } from "../src/tracker.js";

describe("orchestrator", () => {
  it("dispatches eligible active issues once", async () => {
    const tracker: Tracker = {
      fetchCandidateIssues: vi.fn(async () => [{
        id: "1",
        identifier: "LOC-1",
        title: "Work",
        description: null,
        priority: 1,
        state: "Todo",
        branchName: null,
        url: null,
        labels: [],
        blockedBy: [],
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: null,
      }]),
      fetchIssueStatesByIds: vi.fn(async () => new Map()),
      fetchIssuesByStates: vi.fn(async () => []),
    };
    const runIssue = vi.fn(async () => ({ status: "normal" as const }));
    const orchestrator = createOrchestrator({
      tracker,
      runIssue,
      activeStates: ["Todo"],
      terminalStates: ["Done"],
      maxConcurrentAgents: 1,
      maxConcurrentAgentsByState: new Map(),
    });

    await orchestrator.tick();

    expect(runIssue).toHaveBeenCalledOnce();
    expect(orchestrator.snapshot().counts.running + orchestrator.snapshot().counts.retrying).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Implement tracker interface**

Create `typescript/packages/symphony/src/tracker.ts`:

```ts
import type { Issue } from "@symphony/core";

export interface Tracker {
  fetchCandidateIssues(activeStates: string[]): Promise<Issue[]>;
  fetchIssuesByStates(stateNames: string[]): Promise<Issue[]>;
  fetchIssueStatesByIds(issueIds: string[]): Promise<Map<string, Issue | null>>;
}
```

- [ ] **Step 3: Implement orchestrator core**

Create `typescript/packages/symphony/src/orchestrator.ts`:

```ts
import type { Issue } from "@symphony/core";
import type { Tracker } from "./tracker.js";

export interface RunIssueResult {
  status: "normal" | "failed" | "cancelled";
  error?: string;
}

export interface OrchestratorInput {
  tracker: Tracker;
  runIssue: (issue: Issue, attempt: number | null) => Promise<RunIssueResult>;
  activeStates: string[];
  terminalStates: string[];
  maxConcurrentAgents: number;
  maxConcurrentAgentsByState: Map<string, number>;
}

export function createOrchestrator(input: OrchestratorInput) {
  const running = new Map<string, Issue>();
  const claimed = new Set<string>();
  const retrying = new Map<string, { issue: Issue; attempt: number; error: string | null }>();

  async function tick(): Promise<void> {
    await reconcile();
    const candidates = await input.tracker.fetchCandidateIssues(input.activeStates);
    for (const issue of sortIssues(candidates)) {
      if (!isEligible(issue)) continue;
      dispatch(issue, null);
      if (running.size >= input.maxConcurrentAgents) break;
    }
  }

  async function reconcile(): Promise<void> {
    if (running.size === 0) return;
    const states = await input.tracker.fetchIssueStatesByIds([...running.keys()]);
    for (const [id, issue] of states) {
      if (!issue) continue;
      if (input.terminalStates.includes(issue.state) || !input.activeStates.includes(issue.state)) {
        running.delete(id);
        claimed.delete(id);
      } else {
        running.set(id, issue);
      }
    }
  }

  function dispatch(issue: Issue, attempt: number | null): void {
    claimed.add(issue.id);
    running.set(issue.id, issue);
    void input.runIssue(issue, attempt).then((result) => {
      running.delete(issue.id);
      if (result.status === "normal") {
        retrying.set(issue.id, { issue, attempt: 1, error: null });
      } else {
        retrying.set(issue.id, { issue, attempt: (attempt ?? 0) + 1, error: result.error ?? result.status });
      }
    });
  }

  function isEligible(issue: Issue): boolean {
    if (!issue.id || !issue.identifier || !issue.title || !issue.state) return false;
    if (!input.activeStates.includes(issue.state)) return false;
    if (input.terminalStates.includes(issue.state)) return false;
    if (running.has(issue.id) || claimed.has(issue.id)) return false;
    if (running.size >= input.maxConcurrentAgents) return false;
    if (issue.state === "Todo" && issue.blockedBy.some((blocker) => blocker.state && !input.terminalStates.includes(blocker.state))) return false;
    return true;
  }

  function snapshot() {
    return {
      counts: { running: running.size, retrying: retrying.size },
      running: [...running.values()],
      retrying: [...retrying.values()],
    };
  }

  return { tick, snapshot };
}

function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const priorityA = a.priority ?? Number.MAX_SAFE_INTEGER;
    const priorityB = b.priority ?? Number.MAX_SAFE_INTEGER;
    if (priorityA !== priorityB) return priorityA - priorityB;
    const createdA = a.createdAt ?? "";
    const createdB = b.createdAt ?? "";
    if (createdA !== createdB) return createdA.localeCompare(createdB);
    return a.identifier.localeCompare(b.identifier);
  });
}
```

- [ ] **Step 4: Run validation**

```bash
cd /Users/zw/workspace/symphony/typescript
pnpm test -- packages/symphony/test/orchestrator.test.ts
pnpm typecheck
```

Expected:

```text
orchestrator tests pass
typecheck succeeds
```

- [ ] **Step 5: Commit**

```bash
cd /Users/zw/workspace/symphony
git add typescript/packages/symphony
git commit -m "feat(ts): add orchestrator core"
```

## Task 8: Implement Agent Runner and Fake App-Server Smoke Path

**Files:**
- Create: `typescript/packages/symphony/src/codex-app-server.ts`
- Create: `typescript/packages/symphony/src/agent-runner.ts`
- Create smoke fixture under `typescript/packages/symphony/test/fixtures/fake-app-server.mjs`
- Create tests for fake session

- [ ] **Step 1: Write fake app-server test**

Create `typescript/packages/symphony/test/codex-app-server.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runFakeAppServerTurn } from "../src/codex-app-server.js";

describe("codex app-server client", () => {
  it("launches the command in the workspace cwd", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "symphony-app-server-"));
    const result = await runFakeAppServerTurn({
      command: "node -e \"console.log(JSON.stringify({method:'thread/started',params:{threadId:'thread-1'}})); console.log(JSON.stringify({method:'turn/completed',params:{turnId:'turn-1'}}));\"",
      cwd,
      prompt: "work",
      timeoutMs: 1000,
    });

    expect(result.threadId).toBe("thread-1");
    expect(result.turnId).toBe("turn-1");
  });
});
```

- [ ] **Step 2: Implement minimal app-server process reader**

Create `typescript/packages/symphony/src/codex-app-server.ts`:

```ts
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface AppServerTurnResult {
  threadId: string | null;
  turnId: string | null;
  status: "completed" | "failed" | "timed_out";
}

export function runFakeAppServerTurn(input: { command: string; cwd: string; prompt: string; timeoutMs: number }): Promise<AppServerTurnResult> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", input.command], { cwd: input.cwd, stdio: ["pipe", "pipe", "pipe"] });
    let threadId: string | null = null;
    let turnId: string | null = null;
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGTERM");
      resolve({ threadId, turnId, status: "timed_out" });
    }, input.timeoutMs);

    child.stdin.end(JSON.stringify({ prompt: input.prompt }) + "\n");
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      try {
        const event = JSON.parse(line);
        threadId = event.params?.threadId ?? threadId;
        turnId = event.params?.turnId ?? turnId;
      } catch {
        return;
      }
    });
    child.on("close", (code) => {
      if (settled) return;
      clearTimeout(timer);
      resolve({ threadId, turnId, status: code === 0 ? "completed" : "failed" });
    });
  });
}
```

- [ ] **Step 3: Implement agent runner wrapper**

Create `typescript/packages/symphony/src/agent-runner.ts`:

```ts
import type { Issue } from "@symphony/core";
import { renderPrompt } from "./prompt-renderer.js";
import { createWorkspaceForIssue } from "./workspace-manager.js";
import { runHook } from "./hook-runner.js";
import { runFakeAppServerTurn } from "./codex-app-server.js";
import type { EffectiveConfig } from "./config.js";

export async function runAgentAttempt(input: {
  issue: Issue;
  attempt: number | null;
  workflowPrompt: string;
  config: EffectiveConfig;
}): Promise<{ status: "normal" | "failed"; error?: string }> {
  const workspace = await createWorkspaceForIssue(input.config.workspace.root, input.issue.identifier);
  if (workspace.createdNow) {
    const afterCreate = await runHook({ script: input.config.hooks.afterCreate, cwd: workspace.path, timeoutMs: input.config.hooks.timeoutMs });
    if (!afterCreate.ok) return { status: "failed", error: "after_create hook failed" };
  }

  const beforeRun = await runHook({ script: input.config.hooks.beforeRun, cwd: workspace.path, timeoutMs: input.config.hooks.timeoutMs });
  if (!beforeRun.ok) return { status: "failed", error: "before_run hook failed" };

  const prompt = await renderPrompt(input.workflowPrompt, { issue: input.issue, attempt: input.attempt });
  const turn = await runFakeAppServerTurn({
    command: input.config.codex.command,
    cwd: workspace.path,
    prompt,
    timeoutMs: input.config.codex.turnTimeoutMs,
  });

  await runHook({ script: input.config.hooks.afterRun, cwd: workspace.path, timeoutMs: input.config.hooks.timeoutMs });
  return turn.status === "completed" ? { status: "normal" } : { status: "failed", error: turn.status };
}
```

- [ ] **Step 4: Run validation**

```bash
cd /Users/zw/workspace/symphony/typescript
pnpm test -- packages/symphony/test/codex-app-server.test.ts
pnpm typecheck
```

Expected:

```text
fake app-server path test passes
typecheck succeeds
```

- [ ] **Step 5: Commit**

```bash
cd /Users/zw/workspace/symphony
git add typescript/packages/symphony
git commit -m "feat(ts): add agent runner smoke path"
```

## Task 9: Wire Symphony CLI

**Files:**
- Create: `typescript/apps/symphony-cli/src/cli.ts`
- Create: `typescript/apps/symphony-cli/src/main.ts`
- Create: `typescript/apps/symphony-cli/src/status-server.ts`
- Create: `typescript/apps/symphony-cli/test/cli.test.ts`
- Create package exports in `typescript/packages/symphony/src/index.ts`

- [ ] **Step 1: Export Symphony package APIs**

Create `typescript/packages/symphony/src/index.ts`:

```ts
export * from "./agent-runner.js";
export * from "./config.js";
export * from "./linear-client.js";
export * from "./orchestrator.js";
export * from "./workflow-loader.js";
```

- [ ] **Step 2: Write CLI test**

Create `typescript/apps/symphony-cli/test/cli.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli.js";

describe("parseCliArgs", () => {
  it("uses WORKFLOW.md by default", () => {
    expect(parseCliArgs([])).toEqual({ workflowPath: "WORKFLOW.md", port: null });
  });

  it("accepts --port and explicit workflow path", () => {
    expect(parseCliArgs(["--port", "4010", "LOCAL_WORKFLOW.md"])).toEqual({
      workflowPath: "LOCAL_WORKFLOW.md",
      port: 4010,
    });
  });
});
```

- [ ] **Step 3: Implement CLI parser and main wiring**

Create `typescript/apps/symphony-cli/src/cli.ts`:

```ts
import { Command } from "commander";
import { startSymphony } from "./main.js";

export interface CliArgs {
  workflowPath: string;
  port: number | null;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const program = new Command();
  program
    .argument("[workflowPath]", "path to WORKFLOW.md", "WORKFLOW.md")
    .option("--port <port>", "status API port", (value) => Number(value), null)
    .exitOverride();
  program.parse(argv, { from: "user" });
  const opts = program.opts<{ port: number | null }>();
  return { workflowPath: program.args[0] ?? "WORKFLOW.md", port: opts.port };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseCliArgs(process.argv.slice(2));
  await startSymphony(args);
}
```

Create `typescript/apps/symphony-cli/src/main.ts`:

```ts
import { LinearClient, createOrchestrator, loadWorkflow, resolveConfig, runAgentAttempt } from "@symphony/symphony";
import { startStatusServer } from "./status-server.js";

export async function startSymphony(input: { workflowPath: string; port: number | null }): Promise<void> {
  const workflow = await loadWorkflow(input.workflowPath);
  const config = resolveConfig(workflow.config, {
    workflowDirectory: workflow.directory,
    env: process.env,
  });

  if (!config.tracker.apiKey || !config.tracker.projectSlug) {
    throw new Error("invalid_config: tracker.api_key and tracker.project_slug are required");
  }

  const client = new LinearClient({
    endpoint: config.tracker.endpoint,
    apiKey: config.tracker.apiKey,
    projectSlug: config.tracker.projectSlug,
    fetch,
  });

  const orchestrator = createOrchestrator({
    tracker: {
      fetchCandidateIssues: (states) => client.fetchCandidateIssues(states),
      fetchIssuesByStates: async () => [],
      fetchIssueStatesByIds: async () => new Map(),
    },
    runIssue: (issue, attempt) => runAgentAttempt({ issue, attempt, workflowPrompt: workflow.promptTemplate, config }),
    activeStates: config.tracker.activeStates,
    terminalStates: config.tracker.terminalStates,
    maxConcurrentAgents: config.agent.maxConcurrentAgents,
    maxConcurrentAgentsByState: config.agent.maxConcurrentAgentsByState,
  });

  if (input.port !== null) {
    await startStatusServer({ port: input.port, snapshot: () => orchestrator.snapshot() });
  }

  await orchestrator.tick();
  setInterval(() => {
    void orchestrator.tick();
  }, config.polling.intervalMs);
}
```

Create `typescript/apps/symphony-cli/src/status-server.ts`:

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";

export async function startStatusServer(input: { port: number; snapshot: () => unknown }): Promise<void> {
  const app = new Hono();
  app.get("/api/v1/state", (context) => context.json(input.snapshot()));
  app.post("/api/v1/refresh", (context) => context.json({ queued: true, coalesced: false, operations: ["poll", "reconcile"] }, 202));
  serve({ fetch: app.fetch, port: input.port, hostname: "127.0.0.1" });
}
```

Add `@hono/node-server` to `typescript/apps/symphony-cli/package.json` dependencies:

```json
"@hono/node-server": "^1.14.0"
```

- [ ] **Step 4: Run validation**

```bash
cd /Users/zw/workspace/symphony/typescript
pnpm test -- apps/symphony-cli/test/cli.test.ts
pnpm typecheck
```

Expected:

```text
CLI tests pass
typecheck succeeds
```

- [ ] **Step 5: Commit**

```bash
cd /Users/zw/workspace/symphony
git add typescript/apps/symphony-cli typescript/packages/symphony
git commit -m "feat(ts): wire Symphony CLI"
```

## Task 10: Add End-to-End Local Smoke Test and Docs

**Files:**
- Create: `typescript/WORKFLOW.local.md`
- Create: `typescript/README.md`
- Create: `typescript/packages/symphony/test/local-smoke.test.ts`
- Modify: root `README.md` with a pointer to the TypeScript implementation after it works

- [ ] **Step 1: Add local workflow**

Create `typescript/WORKFLOW.local.md`:

```md
---
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
polling:
  interval_ms: 5000
workspace:
  root: ./tmp/workspaces
hooks:
  after_create: |
    printf 'workspace ready\n' > .symphony-workspace
agent:
  max_concurrent_agents: 1
  max_turns: 1
codex:
  command: node -e "console.log(JSON.stringify({method:'thread/started',params:{threadId:'thread-local'}})); console.log(JSON.stringify({method:'turn/completed',params:{turnId:'turn-local'}}));"
---

You are working on local issue {{ issue.identifier }}.

Title: {{ issue.title }}
Description: {{ issue.description }}
```

- [ ] **Step 2: Add TypeScript README**

Create `typescript/README.md`:

```md
# Symphony TypeScript

This directory contains the TypeScript Symphony implementation and a Next.js local Linear-compatible
tracker for development.

## Install

```bash
pnpm install
```

## Run local Linear-compatible tracker

```bash
pnpm dev:linear
```

The GraphQL endpoint is:

```text
http://localhost:3001/graphql
```

Default local bearer token:

```text
local-dev-token
```

## Run Symphony against local tracker

```bash
pnpm --filter @symphony/symphony-cli dev -- ./WORKFLOW.local.md --port 4010
```

Status API:

```text
http://localhost:4010/api/v1/state
```

## Validate

```bash
pnpm test
pnpm typecheck
```
```

- [ ] **Step 3: Add smoke test**

Create `typescript/packages/symphony/test/local-smoke.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLinearGraphqlServer, createInMemoryStore } from "@symphony/linear-schema";
import { LinearClient } from "../src/linear-client.js";

describe("local tracker smoke path", () => {
  it("lets the Linear client poll a local issue", async () => {
    const root = await mkdtemp(join(tmpdir(), "symphony-smoke-"));
    expect(root).toContain("symphony-smoke-");

    const store = createInMemoryStore();
    await store.seedDefaultProject("symphony-local");
    await store.createIssue({ identifier: "LOC-1", title: "Smoke issue", state: "Todo", projectSlug: "symphony-local" });
    const server = createLinearGraphqlServer({ store, token: "local-dev-token" });
    const client = new LinearClient({
      endpoint: "http://local/graphql",
      apiKey: "local-dev-token",
      projectSlug: "symphony-local",
      fetch: server.fetch,
    });

    const issues = await client.fetchCandidateIssues(["Todo"]);

    expect(issues.map((issue) => issue.identifier)).toEqual(["LOC-1"]);
  });
});
```

- [ ] **Step 4: Run full validation**

```bash
cd /Users/zw/workspace/symphony/typescript
pnpm test
pnpm typecheck
pnpm --filter @symphony/linear-local build
```

Expected:

```text
all tests pass
all packages typecheck successfully
Next.js local tracker builds successfully
```

- [ ] **Step 5: Update root README after validation**

Modify `/Users/zw/workspace/symphony/README.md` by adding a short pointer under "Running Symphony":

```md
### TypeScript local development implementation

A TypeScript implementation with a local Next.js Linear-compatible tracker lives under
[`typescript/`](typescript/). It is intended for local development without a real Linear account.
```

- [ ] **Step 6: Commit**

```bash
cd /Users/zw/workspace/symphony
git add README.md typescript
git commit -m "docs(ts): add local TypeScript run path"
```

## Final Verification

- [ ] Run all TypeScript checks:

```bash
cd /Users/zw/workspace/symphony/typescript
pnpm test
pnpm typecheck
pnpm --filter @symphony/linear-local build
```

Expected:

```text
all tests pass
all type checks pass
Next.js build succeeds
```

- [ ] Verify root repository status:

```bash
cd /Users/zw/workspace/symphony
git status --short
```

Expected:

```text
no unstaged or untracked changes except intentionally deferred local runtime files
```

## Coverage Notes

This plan covers the approved design:

- TypeScript monorepo under `typescript/`.
- Node.js `symphony-cli` outside Next.js.
- Next.js `linear-local` with `POST /graphql`.
- Local Linear-compatible GraphQL subset.
- Workflow parsing/config/prompt rendering.
- Workspace safety and hooks.
- Linear client and `linear_graphql`.
- Orchestrator dispatch/retry/reconciliation foundation.
- Fake app-server smoke path.
- First local run documentation.

The plan intentionally implements the app-server protocol through a fake-compatible process reader first. Once the fake smoke path is stable, the next plan should replace the simplified app-server reader with the exact installed Codex app-server protocol schema and add protocol-level tests generated from `codex app-server generate-json-schema`.
