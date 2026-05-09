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
