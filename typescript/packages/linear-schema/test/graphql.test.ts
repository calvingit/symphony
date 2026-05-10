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

  it("paginates issues with cursor offsets", async () => {
    const store = createInMemoryStore();
    await store.seedDefaultProject("symphony-local");
    await store.createIssue({ identifier: "LOC-1", title: "First", state: "Todo", projectSlug: "symphony-local" });
    await store.createIssue({ identifier: "LOC-2", title: "Second", state: "Todo", projectSlug: "symphony-local" });
    const server = createLinearGraphqlServer({ store, token: "local-dev-token" });

    const first = await server.fetch("http://local/graphql", {
      method: "POST",
      headers: { authorization: "Bearer local-dev-token", "content-type": "application/json" },
      body: JSON.stringify({
        query: `query FirstPage {
          issues(first: 1) { nodes { identifier } pageInfo { hasNextPage endCursor } }
        }`,
      }),
    });
    const firstBody = await first.json();

    const second = await server.fetch("http://local/graphql", {
      method: "POST",
      headers: { authorization: "Bearer local-dev-token", "content-type": "application/json" },
      body: JSON.stringify({
        query: `query SecondPage($after: String) {
          issues(first: 1, after: $after) { nodes { identifier } pageInfo { hasNextPage endCursor } }
        }`,
        variables: { after: firstBody.data.issues.pageInfo.endCursor },
      }),
    });
    const secondBody = await second.json();

    expect(firstBody.data.issues.nodes.map((issue: { identifier: string }) => issue.identifier)).toEqual(["LOC-1"]);
    expect(firstBody.data.issues.pageInfo).toEqual({ hasNextPage: true, endCursor: "1" });
    expect(secondBody.data.issues.nodes.map((issue: { identifier: string }) => issue.identifier)).toEqual(["LOC-2"]);
    expect(secondBody.data.issues.pageInfo).toEqual({ hasNextPage: false, endCursor: null });
  });

  it("returns comments created for an issue", async () => {
    const store = createInMemoryStore();
    await store.seedDefaultProject("symphony-local");
    const issue = await store.createIssue({ identifier: "LOC-1", title: "Run local Symphony", state: "Todo", projectSlug: "symphony-local" });
    const server = createLinearGraphqlServer({ store, token: "local-dev-token" });

    await server.fetch("http://local/graphql", {
      method: "POST",
      headers: { authorization: "Bearer local-dev-token", "content-type": "application/json" },
      body: JSON.stringify({
        query: `mutation CreateComment($issueId: ID!, $body: String!) {
          commentCreate(issueId: $issueId, body: $body) { success }
        }`,
        variables: { issueId: issue.id, body: "workpad" },
      }),
    });

    const response = await server.fetch("http://local/graphql", {
      method: "POST",
      headers: { authorization: "Bearer local-dev-token", "content-type": "application/json" },
      body: JSON.stringify({
        query: `query Issue($id: ID!) {
          issue(id: $id) { comments { nodes { body } } }
        }`,
        variables: { id: issue.id },
      }),
    });

    const body = await response.json();
    expect(body.data.issue.comments.nodes).toEqual([{ body: "workpad" }]);
  });
});
