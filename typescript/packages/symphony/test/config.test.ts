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
