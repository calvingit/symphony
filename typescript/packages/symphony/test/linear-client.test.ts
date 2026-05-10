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

  it("fetches every candidate page", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { issues: { nodes: [{ id: "1", identifier: "LOC-1", title: "One", state: { name: "Todo" }, labels: { nodes: [] } }], pageInfo: { hasNextPage: true, endCursor: "1" } } },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { issues: { nodes: [{ id: "2", identifier: "LOC-2", title: "Two", state: { name: "Todo" }, labels: { nodes: [] } }], pageInfo: { hasNextPage: false, endCursor: null } } },
      })));
    const client = new LinearClient({ endpoint: "http://local/graphql", apiKey: "token", projectSlug: "symphony-local", fetch });

    const issues = await client.fetchCandidateIssues(["Todo"]);

    expect(issues.map((issue) => issue.identifier)).toEqual(["LOC-1", "LOC-2"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
