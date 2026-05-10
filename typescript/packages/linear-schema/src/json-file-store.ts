import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  CreateIssueInput,
  CreateProjectInput,
  LocalIssue,
  LocalIssueRelation,
  LocalLinearStore,
  LocalProject,
} from "./store.js";

interface JsonComment {
  id: string;
  issueId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface JsonFileState {
  projects: LocalProject[];
  issues: LocalIssue[];
  comments: JsonComment[];
  relations: LocalIssueRelation[];
}

export async function createJsonFileStore(path: string): Promise<LocalLinearStore> {
  const state = await loadState(path);

  async function persist(): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const tmpPath = `${path}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(tmpPath, path);
  }

  return {
    async seedDefaultProject(slugId) {
      if (state.projects.some((project) => project.slugId === slugId)) return;
      state.projects.push({
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
      await persist();
    },
    async listProjects() {
      return clone(state.projects).sort((a, b) => a.slugId.localeCompare(b.slugId));
    },
    async getProjectBySlug(slugId) {
      return clone(state.projects.find((project) => project.slugId === slugId) ?? null);
    },
    async createProject(input: CreateProjectInput) {
      const project: LocalProject = {
        id: `project-${input.slugId}`,
        slugId: input.slugId,
        name: input.name,
        workspace: { ...input.workspace },
      };
      const index = state.projects.findIndex((item) => item.slugId === input.slugId);
      if (index === -1) {
        state.projects.push(project);
      } else {
        state.projects[index] = project;
      }
      await persist();
      return clone(project);
    },
    async updateProject(slugId, input) {
      const index = state.projects.findIndex((project) => project.slugId === slugId);
      if (index === -1) return null;
      const current = state.projects[index]!;
      const updated: LocalProject = {
        ...current,
        name: input.name ?? current.name,
        workspace: input.workspace ? { ...input.workspace } : current.workspace,
      };
      state.projects[index] = updated;
      await persist();
      return clone(updated);
    },
    async deleteProject(slugId) {
      const projectIndex = state.projects.findIndex((project) => project.slugId === slugId);
      if (projectIndex === -1) return false;
      state.projects.splice(projectIndex, 1);
      const deletedIssueIds = state.issues
        .filter((issue) => issue.projectSlug === slugId)
        .map((issue) => issue.id);
      state.issues = state.issues.filter((issue) => issue.projectSlug !== slugId);
      state.comments = state.comments.filter((comment) => !deletedIssueIds.includes(comment.issueId));
      state.relations = state.relations.filter(
        (relation) =>
          !deletedIssueIds.includes(relation.issueId) &&
          !deletedIssueIds.includes(relation.relatedIssueId),
      );
      await persist();
      return true;
    },
    async createIssue(input: CreateIssueInput) {
      if (!state.projects.some((project) => project.slugId === input.projectSlug)) {
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
      state.issues.push(issue);
      await persist();
      return clone(issue);
    },
    async listIssues(input) {
      const all = state.issues.filter((issue) => {
        const projectMatches = input.projectSlug ? issue.projectSlug === input.projectSlug : true;
        const stateMatches = input.stateNames ? input.stateNames.includes(issue.state) : true;
        return projectMatches && stateMatches;
      });
      const start = parseCursor(input.after);
      const nodes = clone(all.slice(start, start + input.first));
      const nextOffset = start + nodes.length;
      return {
        nodes,
        endCursor: nextOffset < all.length ? String(nextOffset) : null,
        hasNextPage: nextOffset < all.length,
      };
    },
    async getIssuesByIds(ids) {
      return clone(
        ids
          .map((id) => state.issues.find((issue) => issue.id === id))
          .filter((issue): issue is LocalIssue => Boolean(issue)),
      );
    },
    async updateIssue(id, input) {
      const index = state.issues.findIndex((issue) => issue.id === id);
      if (index === -1) return null;
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) patch[key] = value;
      }
      const updated: LocalIssue = {
        ...state.issues[index]!,
        ...patch,
      };
      state.issues[index] = updated;
      await persist();
      return clone(updated);
    },
    async createComment(issueId, body) {
      if (!state.issues.some((issue) => issue.id === issueId)) return null;
      const now = new Date().toISOString();
      const comment = { id: randomUUID(), issueId, body, createdAt: now, updatedAt: now };
      state.comments.push(comment);
      await persist();
      return clone(comment);
    },
    async updateComment(id, body) {
      const index = state.comments.findIndex((comment) => comment.id === id);
      if (index === -1) return null;
      const updated = { ...state.comments[index]!, body, updatedAt: new Date().toISOString() };
      state.comments[index] = updated;
      await persist();
      return clone(updated);
    },
    async listCommentsByIssueId(issueId) {
      return clone(state.comments.filter((comment) => comment.issueId === issueId));
    },
    async createIssueRelation(input) {
      if (
        !state.issues.some((issue) => issue.id === input.issueId) ||
        !state.issues.some((issue) => issue.id === input.relatedIssueId)
      ) {
        return null;
      }
      const existing = state.relations.find(
        (relation) =>
          relation.issueId === input.issueId &&
          relation.relatedIssueId === input.relatedIssueId &&
          relation.type === input.type,
      );
      if (existing) return clone(existing);
      const relation: LocalIssueRelation = {
        id: randomUUID(),
        issueId: input.issueId,
        relatedIssueId: input.relatedIssueId,
        type: input.type,
        createdAt: new Date().toISOString(),
      };
      state.relations.push(relation);
      await persist();
      return clone(relation);
    },
    async listRelationsByIssueId(issueId) {
      return clone(
        state.relations.filter(
          (relation) => relation.issueId === issueId || relation.relatedIssueId === issueId,
        ),
      );
    },
  };
}

async function loadState(path: string): Promise<JsonFileState> {
  try {
    const raw = await readFile(path, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return { projects: [], issues: [], comments: [], relations: [] };
    }
    throw error;
  }
}

function normalizeState(value: unknown): JsonFileState {
  const input = typeof value === "object" && value !== null ? (value as Partial<JsonFileState>) : {};
  return {
    projects: Array.isArray(input.projects) ? clone(input.projects) : [],
    issues: Array.isArray(input.issues) ? clone(input.issues) : [],
    comments: Array.isArray(input.comments) ? clone(input.comments) : [],
    relations: Array.isArray(input.relations) ? clone(input.relations) : [],
  };
}

function parseCursor(after: string | null | undefined): number {
  if (!after) return 0;
  const parsed = Number.parseInt(after, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
