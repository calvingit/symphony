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
    expect(config.polling.intervalMs).toBe(30000);
    expect(config.hooks).toEqual({
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 60000,
    });
    expect(config.workspace.root).toBe("/tmp/symphony_workspaces");
    expect(config.agent.maxTurns).toBe(20);
  });

  it("resolves missing tracker auth from the canonical Linear environment variable", () => {
    const config = resolveConfig(
      { tracker: { kind: "linear", project_slug: "symphony-local" } },
      {
        workflowDirectory: "/repo",
        env: { LINEAR_API_KEY: "canonical-token" },
        homeDirectory: "/Users/tester",
        tempDirectory: "/tmp",
      },
    );

    expect(config.tracker.apiKey).toBe("canonical-token");
  });

  it("resolves top-level polling interval", () => {
    const config = resolveConfig(
      { polling: { interval_ms: "45000" } },
      {
        workflowDirectory: "/repo",
        env: {},
        homeDirectory: "/Users/tester",
        tempDirectory: "/tmp",
      },
    );

    expect(config.polling.intervalMs).toBe(45000);
  });

  it("resolves hook scripts to camelCase fields", () => {
    const config = resolveConfig(
      {
        hooks: {
          after_create: "scripts/after-create.sh",
          before_run: "scripts/before-run.sh",
          after_run: "scripts/after-run.sh",
          before_remove: "scripts/before-remove.sh",
          timeout_ms: "90000",
        },
      },
      {
        workflowDirectory: "/repo",
        env: {},
        homeDirectory: "/Users/tester",
        tempDirectory: "/tmp",
      },
    );

    expect(config.hooks).toEqual({
      afterCreate: "scripts/after-create.sh",
      beforeRun: "scripts/before-run.sh",
      afterRun: "scripts/after-run.sh",
      beforeRemove: "scripts/before-remove.sh",
      timeoutMs: 90000,
    });
  });

  it("preserves Codex pass-through fields", () => {
    const config = resolveConfig(
      {
        codex: {
          approval_policy: "never",
          thread_sandbox: "danger-full-access",
          turn_sandbox_policy: "workspace-write",
        },
      },
      {
        workflowDirectory: "/repo",
        env: {},
        homeDirectory: "/Users/tester",
        tempDirectory: "/tmp",
      },
    );

    expect(config.codex.approvalPolicy).toBe("never");
    expect(config.codex.threadSandbox).toBe("danger-full-access");
    expect(config.codex.turnSandboxPolicy).toBe("workspace-write");
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

  it("normalizes per-state concurrency limits and ignores non-positive values", () => {
    const config = resolveConfig(
      {
        agent: {
          max_concurrent_agents_by_state: {
            Todo: 3,
            "In Progress": "2",
            Done: 0,
            Closed: "not-a-number",
          },
        },
      },
      {
        workflowDirectory: "/repo",
        env: {},
        homeDirectory: "/Users/tester",
        tempDirectory: "/tmp",
      },
    );

    expect([...config.agent.maxConcurrentAgentsByState.entries()]).toEqual([
      ["todo", 3],
      ["in progress", 2],
    ]);
  });
});
