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
