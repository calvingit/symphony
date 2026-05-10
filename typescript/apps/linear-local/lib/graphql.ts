import type { IssuePriority } from "@symphony/core";

const ENDPOINT = "/graphql";

async function request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let body: { data?: T; errors?: Array<{ message?: string }> };
  try {
    body = text ? (JSON.parse(text) as { data?: T; errors?: Array<{ message?: string }> }) : {};
  } catch {
    throw new Error(`GraphQL returned invalid JSON (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(body.errors?.[0]?.message ?? `GraphQL request failed (${res.status})`);
  }
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
  priority: IssuePriority | null;
  description: string | null;
  branchName: string | null;
  url: string | null;
  labels: { name: string }[];
  updatedAt: string | null;
  createdAt: string | null;
}

type GraphqlIssue = Omit<KanbanIssue, "state" | "labels"> & {
  state: { name: string };
  labels: { nodes: KanbanIssue["labels"] };
};

export interface ProjectWorkspace {
  kind: "local" | "remote";
  localPath: string | null;
  remoteUrl: string | null;
  baseBranch: string | null;
}

export interface ProjectRecord {
  id: string;
  slugId: string;
  name: string;
  workspace: ProjectWorkspace;
}

export interface IssueComment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface IssueRelationIssueRef {
  id: string;
  identifier: string;
  title: string;
  state: string;
}

export interface IssueRelation {
  id: string;
  type: string;
  issue: IssueRelationIssueRef;
  relatedIssue: IssueRelationIssueRef;
}

export interface IssueDetails extends KanbanIssue {
  project: ProjectRecord | null;
  comments: IssueComment[];
  relations: IssueRelation[];
}

export interface RunProgress {
  issueId: string;
  identifier: string;
  title: string;
  attempt: number | null;
  status: string;
  message: string | null;
  error: string | null;
  threadId: string | null;
  turnId: string | null;
  toolName: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface RunProgressEvent {
  id: number;
  issueId: string;
  identifier: string;
  title: string;
  attempt: number | null;
  status: string;
  message: string | null;
  error: string | null;
  threadId: string | null;
  turnId: string | null;
  toolName: string | null;
  eventName: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

interface GraphqlIssueRelationIssueRef {
  id: string;
  identifier: string;
  title: string;
  state: { name: string };
}

interface GraphqlIssueRelation {
  id: string;
  type: string;
  issue: GraphqlIssueRelationIssueRef;
  relatedIssue: GraphqlIssueRelationIssueRef;
}

type GraphqlIssueDetails = GraphqlIssue & {
  project: ProjectRecord | null;
  comments: { nodes: IssueComment[] };
  relations: { nodes: GraphqlIssueRelation[] };
};

export async function fetchProjects(): Promise<ProjectRecord[]> {
  const data = await request<{ projects: ProjectRecord[] }>(`
    query Projects {
      projects {
        id
        slugId
        name
        workspace { kind localPath remoteUrl baseBranch }
      }
    }
  `);
  return data.projects;
}

export async function fetchIssues(projectSlug: string, stateNames: string[]): Promise<KanbanIssue[]> {
  const data = await request<{
    issues: { nodes: GraphqlIssue[] };
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
    { stateNames, projectSlug },
  );
  return data.issues.nodes.map(normalizeIssue);
}

export async function updateIssueState(id: string, stateName: string): Promise<void> {
  await request(
    `mutation UpdateIssue($id: ID!, $stateName: String!) {
      issueUpdate(id: $id, input: { stateName: $stateName }) { success }
    }`,
    { id, stateName },
  );
}

export async function createIssue(input: {
  title: string;
  description: string;
  stateName: string;
  projectSlug: string;
  priority: IssuePriority | null;
  branchName: string | null;
  labels: string[];
}): Promise<KanbanIssue | null> {
  const data = await request<{
    issueCreate: {
      success: boolean;
      issue: GraphqlIssue | null;
    };
  }>(
    `mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id identifier title state { name } priority description branchName url
          labels { nodes { name } }
          updatedAt createdAt
        }
      }
    }`,
    { input },
  );
  const issue = data.issueCreate.issue;
  if (!issue) return null;
  return normalizeIssue(issue);
}

export async function fetchIssueDetails(id: string): Promise<IssueDetails | null> {
  const data = await request<{ issue: GraphqlIssueDetails | null }>(
    `query IssueDetails($id: ID!) {
      issue(id: $id) {
        id identifier title state { name } priority description branchName url
        labels { nodes { name } }
        project {
          id
          slugId
          name
          workspace { kind localPath remoteUrl baseBranch }
        }
        comments { nodes { id body createdAt updatedAt } }
        relations {
          nodes {
            id
            type
            issue { id identifier title state { name } }
            relatedIssue { id identifier title state { name } }
          }
        }
        updatedAt createdAt
      }
    }`,
    { id },
  );
  return data.issue ? normalizeIssueDetails(data.issue) : null;
}

function normalizeIssue(issue: GraphqlIssue): KanbanIssue {
  return {
    ...issue,
    state: issue.state.name,
    labels: Array.isArray(issue.labels?.nodes) ? issue.labels.nodes : [],
  };
}

function normalizeIssueDetails(issue: GraphqlIssueDetails): IssueDetails {
  return {
    ...normalizeIssue(issue),
    project: issue.project ?? null,
    comments: Array.isArray(issue.comments?.nodes) ? issue.comments.nodes : [],
    relations: Array.isArray(issue.relations?.nodes)
      ? issue.relations.nodes.map((relation) => ({
          id: relation.id,
          type: relation.type,
          issue: normalizeIssueRelationRef(relation.issue),
          relatedIssue: normalizeIssueRelationRef(relation.relatedIssue),
        }))
      : [],
  };
}

function normalizeIssueRelationRef(issue: GraphqlIssueRelationIssueRef): IssueRelationIssueRef {
  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    state: issue.state.name,
  };
}

export async function createProject(input: {
  slugId: string;
  name: string;
  workspace: ProjectWorkspace;
}): Promise<ProjectRecord | null> {
  const data = await request<{ projectCreate: { success: boolean; project: ProjectRecord | null } }>(
    `mutation CreateProject($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        success
        project {
          id
          slugId
          name
          workspace { kind localPath remoteUrl baseBranch }
        }
      }
    }`,
    { input },
  );
  return data.projectCreate.project;
}

export async function updateProject(
  slugId: string,
  input: { name?: string; workspace?: ProjectWorkspace },
): Promise<ProjectRecord | null> {
  const data = await request<{ projectUpdate: { success: boolean; project: ProjectRecord | null } }>(
    `mutation UpdateProject($slugId: String!, $input: ProjectUpdateInput!) {
      projectUpdate(slugId: $slugId, input: $input) {
        success
        project {
          id
          slugId
          name
          workspace { kind localPath remoteUrl baseBranch }
        }
      }
    }`,
    { slugId, input },
  );
  return data.projectUpdate.project;
}

export async function deleteProject(slugId: string): Promise<boolean> {
  const data = await request<{ projectDelete: { success: boolean } }>(
    `mutation DeleteProject($slugId: String!) {
      projectDelete(slugId: $slugId) { success }
    }`,
    { slugId },
  );
  return Boolean(data.projectDelete.success);
}

export async function fetchRunProgress(): Promise<{
  runs: RunProgress[];
  events: RunProgressEvent[];
}> {
  const response = await fetch("/api/runs", { cache: "no-store" });
  if (!response.ok) return { runs: [], events: [] };
  const body = await response.json();
  return {
    runs: Array.isArray(body.runs) ? body.runs : [],
    events: Array.isArray(body.events) ? body.events : [],
  };
}
