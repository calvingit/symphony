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

    expect(config.tracker.kind).toBe("linear");
    expect(config.tracker.endpoint).toBe("https://api.linear.app/graphql");
    expect(config.tracker.apiKey).toBe("token-1");
    expect(config.tracker.activeStates).toEqual(["Todo", "In Progress"]);
    expect(config.tracker.terminalStates).toEqual(["Closed", "Cancelled", "Canceled", "Duplicate", "Done"]);
    expect(config.polling.intervalMs).toBe(30000);
    expect(config.hooks).toEqual({
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 60000,
    });
    expect(config.workspace.root).toBe("/tmp/symphony_workspaces");
    expect(config.agent.maxConcurrentAgents).toBe(10);
    expect(config.agent.maxTurns).toBe(20);
    expect(config.agent.maxRetryBackoffMs).toBe(300000);
    expect(config.codex.command).toBe("codex app-server");
    expect(config.codex.turnTimeoutMs).toBe(3600000);
    expect(config.codex.readTimeoutMs).toBe(5000);
    expect(config.codex.stallTimeoutMs).toBe(300000);
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

  it("preserves explicit literal tracker auth", () => {
    const config = resolveConfig(
      { tracker: { kind: "linear", api_key: "local-dev-token", project_slug: "symphony-local" } },
      {
        workflowDirectory: "/repo",
        env: { LINEAR_API_KEY: "canonical-token" },
        homeDirectory: "/Users/tester",
        tempDirectory: "/tmp",
      },
    );

    expect(config.tracker.apiKey).toBe("local-dev-token");
  });

  it("resolves arbitrary env-backed tracker auth variables", () => {
    const config = resolveConfig(
      { tracker: { kind: "linear", api_key: "$CUSTOM_LINEAR_TOKEN", project_slug: "symphony-local" } },
      {
        workflowDirectory: "/repo",
        env: { CUSTOM_LINEAR_TOKEN: "custom-token" },
        homeDirectory: "/Users/tester",
        tempDirectory: "/tmp",
      },
    );

    expect(config.tracker.apiKey).toBe("custom-token");
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

  it("expands workspace roots under the home directory", () => {
    const config = resolveConfig(
      { workspace: { root: "~/symphony-workspaces" } },
      {
        workflowDirectory: "/repo/config",
        env: {},
        homeDirectory: "/Users/tester",
        tempDirectory: "/tmp",
      },
    );

    expect(config.workspace.root).toBe("/Users/tester/symphony-workspaces");
  });

  it("resolves agent concurrency and retry backoff limits", () => {
    const config = resolveConfig(
      { agent: { max_concurrent_agents: "4", max_retry_backoff_ms: "120000" } },
      {
        workflowDirectory: "/repo",
        env: {},
        homeDirectory: "/Users/tester",
        tempDirectory: "/tmp",
      },
    );

    expect(config.agent.maxConcurrentAgents).toBe(4);
    expect(config.agent.maxRetryBackoffMs).toBe(120000);
  });

  it("resolves Codex command and timeout fields", () => {
    const config = resolveConfig(
      {
        codex: {
          command: "codex exec",
          turn_timeout_ms: "1000",
          read_timeout_ms: "2000",
          stall_timeout_ms: "3000",
        },
      },
      {
        workflowDirectory: "/repo",
        env: {},
        homeDirectory: "/Users/tester",
        tempDirectory: "/tmp",
      },
    );

    expect(config.codex.command).toBe("codex exec");
    expect(config.codex.turnTimeoutMs).toBe(1000);
    expect(config.codex.readTimeoutMs).toBe(2000);
    expect(config.codex.stallTimeoutMs).toBe(3000);
  });

  it("treats empty env var as missing api_key", () => {
    const config = resolveConfig(
      { tracker: { kind: "linear", api_key: "$LINEAR_API_KEY", project_slug: "symphony-local" } },
      {
        workflowDirectory: "/repo",
        env: { LINEAR_API_KEY: "" },
        homeDirectory: "/Users/tester",
        tempDirectory: "/tmp",
      },
    );

    expect(config.tracker.apiKey).toBeUndefined();
  });

  it("treats empty canonical LINEAR_API_KEY as missing", () => {
    const config = resolveConfig(
      { tracker: { kind: "linear", project_slug: "symphony-local" } },
      {
        workflowDirectory: "/repo",
        env: { LINEAR_API_KEY: "" },
        homeDirectory: "/Users/tester",
        tempDirectory: "/tmp",
      },
    );

    expect(config.tracker.apiKey).toBeUndefined();
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
