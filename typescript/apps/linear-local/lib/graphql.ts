const ENDPOINT = "http://localhost:3001/graphql";
const TOKEN = "local-dev-token";

async function request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) {
    throw new Error(body.errors[0]?.message ?? "GraphQL error");
  }
  return body.data as T;
}

export interface KanbanIssue {
  id: string;
  identifier: string;
  title: string;
  state: string;
  priority: number | null;
  description: string | null;
  branchName: string | null;
  url: string | null;
  labels: { name: string }[];
  updatedAt: string | null;
  createdAt: string | null;
}

export async function fetchIssues(stateNames: string[]): Promise<KanbanIssue[]> {
  const data = await request<{
    issues: { nodes: Array<Omit<KanbanIssue, "state"> & { state: { name: string } }> };
  }>(
    `query Issues($stateNames: [String!]!, $projectSlug: String!) {
      issues(filter: { state: { name: { in: $stateNames } }, project: { slugId: { eq: $projectSlug } } }, first: 100) {
        nodes {
          id identifier title state { name } priority description branchName url
          labels { nodes { name } }
          updatedAt createdAt
        }
      }
    }`,
    { stateNames, projectSlug: "symphony-local" },
  );
  return data.issues.nodes.map((n) => ({ ...n, state: n.state.name }));
}

export async function updateIssueState(id: string, stateName: string): Promise<void> {
  await request(
    `mutation UpdateIssue($id: ID!, $stateName: String!) {
      issueUpdate(id: $id, input: { stateName: $stateName }) { success }
    }`,
    { id, stateName },
  );
}

export async function createIssue(title: string, state: string): Promise<KanbanIssue | null> {
  const storeRes = await fetch("http://localhost:3001/api/issues", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, state }),
  });
  if (!storeRes.ok) return null;
  const issue = await storeRes.json();

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    state: issue.state,
    priority: issue.priority,
    description: issue.description,
    branchName: issue.branchName,
    url: issue.url,
    labels: (issue.labels ?? []).map((l: string) => ({ name: l })),
    updatedAt: issue.updatedAt,
    createdAt: issue.createdAt,
  };
}
