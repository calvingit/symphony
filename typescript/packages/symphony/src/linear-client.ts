import type { Issue } from "@symphony/core";

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
    const body = await this.graphql({
      query: `query SymphonyLinearPoll($projectSlug: String!, $stateNames: [String!]!, $first: Int!) {
        issues(filter: { project: { slugId: { eq: $projectSlug } }, state: { name: { in: $stateNames } } }, first: $first) {
          nodes { id identifier title description priority branchName url createdAt updatedAt state { name } labels { nodes { name } } relations { nodes { type relatedIssue { id identifier state { name } } } } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      variables: { projectSlug: this.input.projectSlug, stateNames: activeStates, first: 50 },
    });

    const nodes = body.data?.issues?.nodes;
    return Array.isArray(nodes) ? nodes.map(normalizeIssue) : [];
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
        nodes(ids: $ids) { id identifier title state { name } }
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
    priority: Number.isInteger(node.priority) ? node.priority : null,
    state: String(node.state?.name),
    branchName: typeof node.branchName === "string" ? node.branchName : null,
    url: typeof node.url === "string" ? node.url : null,
    labels: Array.isArray(node.labels?.nodes) ? node.labels.nodes.map((label: any) => String(label.name).toLowerCase()) : [],
    blockedBy: [],
    createdAt: typeof node.createdAt === "string" ? node.createdAt : null,
    updatedAt: typeof node.updatedAt === "string" ? node.updatedAt : null,
  };
}
