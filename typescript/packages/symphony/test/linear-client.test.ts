import { describe, expect, it, vi } from "vitest";
import { LinearClient } from "../src/linear-client.js";

describe("LinearClient", () => {
  it("fetches candidates through the configured endpoint", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      data: { issues: { nodes: [{ id: "1", identifier: "LOC-1", title: "Work", description: null, priority: "high", state: { name: "Todo" }, project: { slugId: "symphony-local" }, labels: { nodes: [] }, relations: { nodes: [{ type: "blocked_by", issue: { id: "1" }, relatedIssue: { id: "2", identifier: "LOC-2", state: { name: "In Progress" } } }] }, createdAt: null, updatedAt: null }], pageInfo: { hasNextPage: false, endCursor: null } } },
    })));
    const client = new LinearClient({ endpoint: "http://local/graphql", apiKey: "token", projectSlug: "symphony-local", fetch });

    const issues = await client.fetchCandidateIssues(["Todo"]);

    expect(issues[0]?.identifier).toBe("LOC-1");
    expect(issues[0]?.priority).toBe("high");
    expect(issues[0]?.blockedBy).toEqual([
      { id: "2", identifier: "LOC-2", state: "In Progress" },
    ]);
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

  it("fetches all active issues when projectSlug is omitted", async () => {
    const fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.query).toContain("issues(filter: { state: { name: { in: $stateNames } } }");
      expect(body.query).not.toContain("project: { slugId: { eq: $projectSlug } }");
      expect(body.variables).toEqual({ stateNames: ["Todo"], first: 50, after: null });

      return new Response(JSON.stringify({
        data: {
          issues: {
            nodes: [
              {
                id: "1",
                identifier: "LOC-1",
                title: "Repo A",
                state: { name: "Todo" },
                project: { slugId: "repo-a", name: "Repo A", workspace: { kind: "local", localPath: "/repo-a", remoteUrl: null, baseBranch: "main" } },
                labels: { nodes: [] },
                relations: { nodes: [] },
              },
              {
                id: "2",
                identifier: "LOC-2",
                title: "Repo B",
                state: { name: "Todo" },
                project: { slugId: "repo-b", name: "Repo B", workspace: { kind: "remote", localPath: null, remoteUrl: "git@example.com/repo-b.git", baseBranch: "develop" } },
                labels: { nodes: [] },
                relations: { nodes: [] },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }));
    });
    const client = new LinearClient({ endpoint: "http://local/graphql", apiKey: "token", fetch });

    const issues = await client.fetchCandidateIssues(["Todo"]);

    expect(issues.map((issue) => issue.project?.slugId)).toEqual(["repo-a", "repo-b"]);
    expect(issues[1]?.project?.workspace).toEqual({
      kind: "remote",
      localPath: null,
      remoteUrl: "git@example.com/repo-b.git",
      baseBranch: "develop",
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
