const ENDPOINT = "/graphql";

async function request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
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
    { stateNames, projectSlug },
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

export async function createIssue(input: {
  title: string;
  description: string;
  stateName: string;
  projectSlug: string;
}): Promise<KanbanIssue | null> {
  const data = await request<{
    issueCreate: {
      success: boolean;
      issue: (Omit<KanbanIssue, "state"> & { state: { name: string } }) | null;
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
  return { ...issue, state: issue.state.name };
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

export async function fetchRunProgress(): Promise<RunProgress[]> {
  const response = await fetch("/api/runs", { cache: "no-store" });
  if (!response.ok) return [];
  const body = await response.json();
  return Array.isArray(body.runs) ? body.runs : [];
}
