import { randomUUID } from "node:crypto";
import type { IssuePriority } from '@symphony/core';

export interface LocalProjectWorkspace {
  kind: "local" | "remote";
  localPath: string | null;
  remoteUrl: string | null;
  baseBranch: string | null;
}

export interface LocalProject {
  id: string;
  slugId: string;
  name: string;
  workspace: LocalProjectWorkspace;
}

export interface LocalIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: IssuePriority | null;
  state: string;
  projectSlug: string;
  branchName: string | null;
  url: string | null;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateIssueInput {
  identifier: string;
  title: string;
  description?: string | null;
  priority?: IssuePriority | null;
  state: string;
  projectSlug: string;
  branchName?: string | null;
  labels?: string[];
}

export interface CreateProjectInput {
  slugId: string;
  name: string;
  workspace: LocalProjectWorkspace;
}

export interface LocalLinearStore {
  seedDefaultProject(slugId: string): Promise<void>;
  listProjects(): Promise<LocalProject[]>;
  getProjectBySlug(slugId: string): Promise<LocalProject | null>;
  createProject(input: CreateProjectInput): Promise<LocalProject>;
  updateProject(
    slugId: string,
    input: Partial<{ name: string; workspace: LocalProjectWorkspace }>,
  ): Promise<LocalProject | null>;
  deleteProject(slugId: string): Promise<boolean>;
  createIssue(input: CreateIssueInput): Promise<LocalIssue>;
  listIssues(input: { projectSlug?: string; stateNames?: string[]; first: number; after?: string | null }): Promise<{ nodes: LocalIssue[]; endCursor: string | null; hasNextPage: boolean }>;
  getIssuesByIds(ids: string[]): Promise<LocalIssue[]>;
  updateIssue(id: string, input: Partial<Pick<LocalIssue, "title" | "description" | "priority" | "state" | "branchName" | "url" | "labels">>): Promise<LocalIssue | null>;
  createComment(issueId: string, body: string): Promise<{ id: string; issueId: string; body: string; createdAt: string; updatedAt: string } | null>;
  updateComment(id: string, body: string): Promise<{ id: string; issueId: string; body: string; createdAt: string; updatedAt: string } | null>;
  listCommentsByIssueId(issueId: string): Promise<Array<{ id: string; issueId: string; body: string; createdAt: string; updatedAt: string }>>;
}

export function createInMemoryStore(): LocalLinearStore {
  const projects = new Map<string, LocalProject>();
  const issues = new Map<string, LocalIssue>();
  const comments = new Map<string, { id: string; issueId: string; body: string; createdAt: string; updatedAt: string }>();

  return {
    async seedDefaultProject(slugId) {
      if (projects.has(slugId)) return;
      projects.set(slugId, {
        id: `project-${slugId}`,
        slugId,
        name: slugId,
        workspace: {
          kind: "local",
          localPath: null,
          remoteUrl: null,
          baseBranch: "main",
        },
      });
    },
    async listProjects() {
      return [...projects.values()].sort((a, b) => a.slugId.localeCompare(b.slugId));
    },
    async getProjectBySlug(slugId) {
      return projects.get(slugId) ?? null;
    },
    async createProject(input) {
      const project: LocalProject = {
        id: `project-${input.slugId}`,
        slugId: input.slugId,
        name: input.name,
        workspace: { ...input.workspace },
      };
      projects.set(project.slugId, project);
      return project;
    },
    async updateProject(slugId, input) {
      const existing = projects.get(slugId);
      if (!existing) return null;
      const updated: LocalProject = {
        ...existing,
        name: input.name ?? existing.name,
        workspace: input.workspace ? { ...input.workspace } : existing.workspace,
      };
      projects.set(slugId, updated);
      return updated;
    },
    async deleteProject(slugId) {
      if (!projects.delete(slugId)) return false;
      const deletedIssueIds = [...issues.values()]
        .filter((issue) => issue.projectSlug === slugId)
        .map((issue) => issue.id);
      for (const issueId of deletedIssueIds) {
        issues.delete(issueId);
      }
      for (const [commentId, comment] of comments.entries()) {
        if (deletedIssueIds.includes(comment.issueId)) {
          comments.delete(commentId);
        }
      }
      return true;
    },
    async createIssue(input) {
      if (!projects.has(input.projectSlug)) {
        throw new Error(`project_not_found: ${input.projectSlug}`);
      }
      const now = new Date().toISOString();
      const issue: LocalIssue = {
        id: randomUUID(),
        identifier: input.identifier,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? null,
        state: input.state,
        projectSlug: input.projectSlug,
        branchName: input.branchName ?? null,
        url: `http://localhost:3001/issues/${input.identifier}`,
        labels: input.labels ?? [],
        createdAt: now,
        updatedAt: now,
      };
      issues.set(issue.id, issue);
      return issue;
    },
    async listIssues(input) {
      const all = [...issues.values()].filter((issue) => {
        const projectMatches = input.projectSlug ? issue.projectSlug === input.projectSlug : true;
        const stateMatches = input.stateNames ? input.stateNames.includes(issue.state) : true;
        return projectMatches && stateMatches;
      });
      const start = parseCursor(input.after);
      const nodes = all.slice(start, start + input.first);
      const nextOffset = start + nodes.length;
      const hasNextPage = nextOffset < all.length;
      return { nodes, endCursor: hasNextPage ? String(nextOffset) : null, hasNextPage };
    },
    async getIssuesByIds(ids) {
      return ids.map((id) => issues.get(id)).filter((issue): issue is LocalIssue => Boolean(issue));
    },
    async updateIssue(id, input) {
      const issue = issues.get(id);
      if (!issue) return null;
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) (patch as any)[key] = value;
      }
      const updated = { ...issue, ...patch };
      issues.set(id, updated);
      return updated;
    },
    async createComment(issueId, body) {
      if (!issues.has(issueId)) return null;
      const now = new Date().toISOString();
      const comment = { id: randomUUID(), issueId, body, createdAt: now, updatedAt: now };
      comments.set(comment.id, comment);
      return comment;
    },
    async updateComment(id, body) {
      const comment = comments.get(id);
      if (!comment) return null;
      const updated = { ...comment, body, updatedAt: new Date().toISOString() };
      comments.set(id, updated);
      return updated;
    },
    async listCommentsByIssueId(issueId) {
      return [...comments.values()].filter((comment) => comment.issueId === issueId);
    },
  };
}

function parseCursor(after: string | null | undefined): number {
  if (!after) return 0;
  const parsed = Number.parseInt(after, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
