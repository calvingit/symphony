import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLinearGraphqlServer, createInMemoryStore } from "@symphony/linear-schema";
import { LinearClient } from "../src/linear-client.js";

describe("local tracker smoke path", () => {
  it("lets the Linear client poll active issues across multiple projects", async () => {
    const rootA = await mkdtemp(join(tmpdir(), "symphony-smoke-a-"));
    const rootB = await mkdtemp(join(tmpdir(), "symphony-smoke-b-"));
    expect(rootA).toContain("symphony-smoke-a-");
    expect(rootB).toContain("symphony-smoke-b-");

    const store = createInMemoryStore();
    await store.createProject({
      slugId: "repo-a",
      name: "Repo A",
      workspace: {
        kind: "local",
        localPath: rootA,
        remoteUrl: null,
        baseBranch: "main",
      },
    });
    await store.createProject({
      slugId: "repo-b",
      name: "Repo B",
      workspace: {
        kind: "local",
        localPath: rootB,
        remoteUrl: null,
        baseBranch: "develop",
      },
    });
    await store.createIssue({ identifier: "LOC-1", title: "Smoke issue A", state: "Todo", projectSlug: "repo-a" });
    await store.createIssue({ identifier: "LOC-2", title: "Smoke issue B", state: "Todo", projectSlug: "repo-b" });
    const server = createLinearGraphqlServer({ store, token: "local-dev-token" });
    const client = new LinearClient({
      endpoint: "http://local/graphql",
      apiKey: "local-dev-token",
      fetch: server.fetch as typeof fetch,
    });

    const issues = await client.fetchCandidateIssues(["Todo"]);

    expect(issues.map((issue) => issue.identifier)).toEqual(["LOC-1", "LOC-2"]);
    expect(issues[0]?.project).toEqual({
      slugId: "repo-a",
      name: "Repo A",
      workspace: {
        kind: "local",
        localPath: rootA,
        remoteUrl: null,
        baseBranch: "main",
      },
    });
    expect(issues[1]?.project).toEqual({
      slugId: "repo-b",
      name: "Repo B",
      workspace: {
        kind: "local",
        localPath: rootB,
        remoteUrl: null,
        baseBranch: "develop",
      },
    });
  });
});
