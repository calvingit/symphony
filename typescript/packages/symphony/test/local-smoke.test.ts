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
    await store.createProject({
      slugId: "symphony-local",
      name: "Symphony Local",
      workspace: {
        kind: "local",
        localPath: root,
        remoteUrl: null,
        baseBranch: "main",
      },
    });
    await store.createIssue({ identifier: "LOC-1", title: "Smoke issue", state: "Todo", projectSlug: "symphony-local" });
    const server = createLinearGraphqlServer({ store, token: "local-dev-token" });
    const client = new LinearClient({
      endpoint: "http://local/graphql",
      apiKey: "local-dev-token",
      projectSlug: "symphony-local",
      fetch: server.fetch as typeof fetch,
    });

    const issues = await client.fetchCandidateIssues(["Todo"]);

    expect(issues.map((issue) => issue.identifier)).toEqual(["LOC-1"]);
    expect(issues[0]?.project).toEqual({
      slugId: "symphony-local",
      name: "Symphony Local",
      workspace: {
        kind: "local",
        localPath: root,
        remoteUrl: null,
        baseBranch: "main",
      },
    });
  });
});
