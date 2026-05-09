import { randomUUID } from "node:crypto";

export interface LocalIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
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
  state: string;
  projectSlug: string;
}

export interface LocalLinearStore {
  seedDefaultProject(slugId: string): Promise<void>;
  createIssue(input: CreateIssueInput): Promise<LocalIssue>;
  listIssues(input: { projectSlug?: string; stateNames?: string[]; first: number; after?: string | null }): Promise<{ nodes: LocalIssue[]; endCursor: string | null; hasNextPage: boolean }>;
  getIssuesByIds(ids: string[]): Promise<LocalIssue[]>;
  updateIssue(id: string, input: Partial<Pick<LocalIssue, "title" | "description" | "priority" | "state" | "branchName" | "url" | "labels">>): Promise<LocalIssue | null>;
  createComment(issueId: string, body: string): Promise<{ id: string; issueId: string; body: string; createdAt: string; updatedAt: string } | null>;
  updateComment(id: string, body: string): Promise<{ id: string; issueId: string; body: string; createdAt: string; updatedAt: string } | null>;
}

export function createInMemoryStore(): LocalLinearStore {
  const projects = new Set<string>();
  const issues = new Map<string, LocalIssue>();
  const comments = new Map<string, { id: string; issueId: string; body: string; createdAt: string; updatedAt: string }>();

  return {
    async seedDefaultProject(slugId) {
      projects.add(slugId);
    },
    async createIssue(input) {
      projects.add(input.projectSlug);
      const now = new Date().toISOString();
      const issue: LocalIssue = {
        id: randomUUID(),
        identifier: input.identifier,
        title: input.title,
        description: null,
        priority: null,
        state: input.state,
        projectSlug: input.projectSlug,
        branchName: null,
        url: `http://localhost:3001/issues/${input.identifier}`,
        labels: [],
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
      const nodes = all.slice(0, input.first);
      return { nodes, endCursor: null, hasNextPage: all.length > nodes.length };
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
  };
}
