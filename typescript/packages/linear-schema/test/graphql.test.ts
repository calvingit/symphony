import { describe, expect, it } from "vitest";
import { createLinearGraphqlServer } from "../src/server.js";
import { createInMemoryStore } from "../src/store.js";

describe("local Linear GraphQL", () => {
  it("supports project CRUD with workspace configuration", async () => {
    const store = createInMemoryStore();
    const server = createLinearGraphqlServer({ store, token: "local-dev-token" });

    const create = await server.fetch("http://local/graphql", {
      method: "POST",
      headers: { authorization: "Bearer local-dev-token", "content-type": "application/json" },
      body: JSON.stringify({
        query: `mutation CreateProject($input: ProjectCreateInput!) {
          projectCreate(input: $input) {
            success
            project { slugId name workspace { kind localPath remoteUrl baseBranch } }
          }
        }`,
        variables: {
          input: {
            slugId: "repo-a",
            name: "Repo A",
            workspace: {
              kind: "remote",
              localPath: null,
              remoteUrl: "https://example.com/repo-a.git",
              baseBranch: "main",
            },
          },
        },
      }),
    });
    const createBody = await create.json();
    expect(createBody.data.projectCreate.project.workspace.remoteUrl).toBe(
      "https://example.com/repo-a.git",
    );

    const list = await server.fetch("http://local/graphql", {
      method: "POST",
      headers: { authorization: "Bearer local-dev-token", "content-type": "application/json" },
      body: JSON.stringify({
        query: `query Projects { projects { slugId name workspace { kind baseBranch } } }`,
      }),
    });
    const listBody = await list.json();
    expect(listBody.data.projects).toEqual([
      {
        slugId: "repo-a",
        name: "Repo A",
        workspace: { kind: "remote", baseBranch: "main" },
      },
    ]);
  });

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

  it("returns blocker relations for both blocked-by and blocks views", async () => {
    const store = createInMemoryStore();
    await store.seedDefaultProject("symphony-local");
    const blocked = await store.createIssue({
      identifier: "LOC-1",
      title: "Blocked work",
      state: "Todo",
      projectSlug: "symphony-local",
    });
    const blocker = await store.createIssue({
      identifier: "LOC-2",
      title: "Unblock first",
      state: "In Progress",
      projectSlug: "symphony-local",
    });
    const server = createLinearGraphqlServer({ store, token: "local-dev-token" });

    const mutation = await server.fetch("http://local/graphql", {
      method: "POST",
      headers: { authorization: "Bearer local-dev-token", "content-type": "application/json" },
      body: JSON.stringify({
        query: `mutation CreateRelation($issueId: ID!, $relatedIssueId: ID!, $type: String!) {
          issueRelationCreate(issueId: $issueId, relatedIssueId: $relatedIssueId, type: $type) {
            success
            relation {
              type
              issue { identifier }
              relatedIssue { identifier }
            }
          }
        }`,
        variables: {
          issueId: blocked.id,
          relatedIssueId: blocker.id,
          type: "blocked_by",
        },
      }),
    });
    const mutationBody = await mutation.json();
    expect(mutationBody.data.issueRelationCreate).toEqual({
      success: true,
      relation: {
        type: "blocked_by",
        issue: { identifier: "LOC-1" },
        relatedIssue: { identifier: "LOC-2" },
      },
    });

    const blockedResponse = await server.fetch("http://local/graphql", {
      method: "POST",
      headers: { authorization: "Bearer local-dev-token", "content-type": "application/json" },
      body: JSON.stringify({
        query: `query BlockedIssue($id: ID!) {
          issue(id: $id) {
            relations {
              nodes {
                type
                issue { identifier }
                relatedIssue { identifier }
              }
            }
          }
        }`,
        variables: { id: blocked.id },
      }),
    });
    const blockedBody = await blockedResponse.json();
    expect(blockedBody.data.issue.relations.nodes).toEqual([
      {
        type: "blocked_by",
        issue: { identifier: "LOC-1" },
        relatedIssue: { identifier: "LOC-2" },
      },
    ]);

    const blockerResponse = await server.fetch("http://local/graphql", {
      method: "POST",
      headers: { authorization: "Bearer local-dev-token", "content-type": "application/json" },
      body: JSON.stringify({
        query: `query BlockerIssue($id: ID!) {
          issue(id: $id) {
            relations {
              nodes {
                type
                issue { identifier }
                relatedIssue { identifier }
              }
            }
          }
        }`,
        variables: { id: blocker.id },
      }),
    });
    const blockerBody = await blockerResponse.json();
    expect(blockerBody.data.issue.relations.nodes).toEqual([
      {
        type: "blocked_by",
        issue: { identifier: "LOC-1" },
        relatedIssue: { identifier: "LOC-2" },
      },
    ]);
  });

  it("creates issues with description inside the selected project", async () => {
    const store = createInMemoryStore();
    await store.createProject({
      slugId: "repo-b",
      name: "Repo B",
      workspace: {
        kind: "local",
        localPath: "/tmp/repo-b",
        remoteUrl: null,
        baseBranch: "develop",
      },
    });
    const server = createLinearGraphqlServer({ store, token: "local-dev-token" });

    const response = await server.fetch("http://local/graphql", {
      method: "POST",
      headers: { authorization: "Bearer local-dev-token", "content-type": "application/json" },
      body: JSON.stringify({
        query: `mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              title
              description
              priority
              branchName
              labels { nodes { name } }
              project { slugId workspace { kind localPath baseBranch } }
            }
          }
        }`,
        variables: {
          input: {
            title: "Implement workspace selector",
            description: "Need CRUD for project workspaces",
            priority: "high",
            stateName: "Todo",
            projectSlug: "repo-b",
            branchName: "feature/workspace-selector",
            labels: ["UI", " Workflow "],
          },
        },
      }),
    });

    const body = await response.json();
    expect(body.data.issueCreate.issue).toEqual({
      title: "Implement workspace selector",
      description: "Need CRUD for project workspaces",
      priority: "high",
      branchName: "feature/workspace-selector",
      labels: {
        nodes: [{ name: "ui" }, { name: "workflow" }],
      },
      project: {
        slugId: "repo-b",
        workspace: {
          kind: "local",
          localPath: "/tmp/repo-b",
          baseBranch: "develop",
        },
      },
    });
  });
});
