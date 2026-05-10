import { normalizeIssuePriority, normalizeLabels, type Issue } from "@symphony/core";

export class LinearClient {
  constructor(
    private readonly input: {
      endpoint: string;
      apiKey: string;
      projectSlug: string;
      fetch: typeof fetch;
    },
  ) {}

  async fetchCandidateIssues(activeStates: string[]): Promise<Issue[]> {
    const issues: Issue[] = [];
    let after: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const body = await this.graphql({
        query: `query SymphonyLinearPoll($projectSlug: String!, $stateNames: [String!]!, $first: Int!, $after: String) {
        issues(filter: { project: { slugId: { eq: $projectSlug } }, state: { name: { in: $stateNames } } }, first: $first, after: $after) {
          nodes {
            id identifier title description priority branchName url createdAt updatedAt
            state { name }
            project { slugId name workspace { kind localPath remoteUrl baseBranch } }
            labels { nodes { name } }
            relations { nodes { type relatedIssue { id identifier state { name } } } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
        variables: { projectSlug: this.input.projectSlug, stateNames: activeStates, first: 50, after },
      });

      const nodes = body.data?.issues?.nodes;
      if (Array.isArray(nodes)) {
        issues.push(...nodes.map(normalizeIssue));
      }
      hasNextPage = Boolean(body.data?.issues?.pageInfo?.hasNextPage);
      after = body.data?.issues?.pageInfo?.endCursor ?? null;
      if (hasNextPage && !after) {
        throw new Error("linear_missing_end_cursor");
      }
    }

    return issues;
  }

  async fetchIssuesByStates(stateNames: string): Promise<Issue[]>;
  async fetchIssuesByStates(stateNames: string[]): Promise<Issue[]>;
  async fetchIssuesByStates(stateNames: string | string[]): Promise<Issue[]> {
    return this.fetchCandidateIssues(Array.isArray(stateNames) ? stateNames : [stateNames]);
  }

  async updateIssueState(id: string, stateName: string): Promise<void> {
    await this.graphql({
      query: `mutation UpdateIssueState($id: ID!, $stateName: String!) {
        issueUpdate(id: $id, input: { stateName: $stateName }) { success }
      }`,
      variables: { id, stateName },
    });
  }

  async fetchIssuesByIds(ids: string[]): Promise<Map<string, Issue | null>> {
    if (ids.length === 0) return new Map();
    const body = await this.graphql({
      query: `query Nodes($ids: [ID!]!) {
        nodes(ids: $ids) {
          id identifier title description priority branchName url createdAt updatedAt
          state { name }
          project { slugId name workspace { kind localPath remoteUrl baseBranch } }
          labels { nodes { name } }
          relations { nodes { type relatedIssue { id identifier state { name } } } }
        }
      }`,
      variables: { ids },
    });
    const nodes: Array<{ id: string; identifier: string; title: string; state: { name: string } }> =
      body.data?.nodes ?? [];
    const map = new Map<string, Issue | null>();
    for (const node of nodes) {
      map.set(node.id, normalizeIssue(node));
    }
    for (const id of ids) {
      if (!map.has(id)) map.set(id, null);
    }
    return map;
  }

  private async graphql(input: { query: string; variables: Record<string, unknown> }): Promise<any> {
    const response = await this.input.fetch(this.input.endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${this.input.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(`linear_api_status: ${response.status}`);
    }
    const body = await response.json();
    if (Array.isArray(body.errors)) {
      throw new Error("linear_graphql_errors");
    }
    return body;
  }
}

function normalizeIssue(node: any): Issue {
  return {
    id: String(node.id),
    identifier: String(node.identifier),
    title: String(node.title),
    description: typeof node.description === "string" ? node.description : null,
    priority: normalizeIssuePriority(node.priority),
    state: String(node.state?.name),
    branchName: typeof node.branchName === "string" ? node.branchName : null,
    url: typeof node.url === "string" ? node.url : null,
    labels: Array.isArray(node.labels?.nodes)
      ? normalizeLabels(node.labels.nodes.map((label: any) => String(label.name)))
      : [],
    blockedBy: [],
    project:
      node.project && typeof node.project.slugId === "string"
        ? {
            slugId: node.project.slugId,
            name: typeof node.project.name === "string" ? node.project.name : node.project.slugId,
            workspace: {
              kind: node.project.workspace?.kind === "remote" ? "remote" : "local",
              localPath:
                typeof node.project.workspace?.localPath === "string" ? node.project.workspace.localPath : null,
              remoteUrl:
                typeof node.project.workspace?.remoteUrl === "string" ? node.project.workspace.remoteUrl : null,
              baseBranch:
                typeof node.project.workspace?.baseBranch === "string" ? node.project.workspace.baseBranch : null,
            },
          }
        : null,
    createdAt: typeof node.createdAt === "string" ? node.createdAt : null,
    updatedAt: typeof node.updatedAt === "string" ? node.updatedAt : null,
  };
}
