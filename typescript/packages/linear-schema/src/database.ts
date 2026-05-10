import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { IssuePriority } from '@symphony/core';
import type {
  CreateIssueInput,
  CreateProjectInput,
  LocalIssue,
  LocalIssueRelation,
  LocalLinearStore,
  LocalProject,
  LocalProjectWorkspace,
} from "./store.js";

export function createSqliteStore(path: string): LocalLinearStore {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    create table if not exists projects (
      slug_id text primary key,
      name text not null,
      workspace_kind text not null,
      local_path text,
      remote_url text,
      base_branch text
    );
    create table if not exists issues (
      id text primary key,
      identifier text not null unique,
      title text not null,
      description text,
      priority text,
      state text not null,
      project_slug text not null,
      branch_name text,
      url text,
      labels_json text not null,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists comments (
      id text primary key,
      issue_id text not null,
      body text not null,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists issue_relations (
      id text primary key,
      issue_id text not null,
      related_issue_id text not null,
      type text not null,
      created_at text not null,
      unique(issue_id, related_issue_id, type)
    );
  `);

  return {
    async seedDefaultProject(slugId) {
      db.prepare(`
        insert or ignore into projects (slug_id, name, workspace_kind, local_path, remote_url, base_branch)
        values (?, ?, 'local', null, null, 'main')
      `).run(slugId, slugId);
    },
    async listProjects() {
      const rows = db
        .prepare("select * from projects order by slug_id asc")
        .all() as SqliteProjectRow[];
      return rows.map(rowToProject);
    },
    async getProjectBySlug(slugId) {
      const row = db.prepare("select * from projects where slug_id = ?").get(slugId) as
        | SqliteProjectRow
        | undefined;
      return row ? rowToProject(row) : null;
    },
    async createProject(input: CreateProjectInput) {
      const project = toProjectRow(input);
      db.prepare(`
        insert into projects (slug_id, name, workspace_kind, local_path, remote_url, base_branch)
        values (@slugId, @name, @workspaceKind, @localPath, @remoteUrl, @baseBranch)
      `).run(project);
      return {
        id: `project-${project.slugId}`,
        slugId: project.slugId,
        name: project.name,
        workspace: {
          kind: project.workspaceKind,
          localPath: project.localPath,
          remoteUrl: project.remoteUrl,
          baseBranch: project.baseBranch,
        },
      };
    },
    async updateProject(slugId, input) {
      const existing = db.prepare("select * from projects where slug_id = ?").get(slugId) as
        | SqliteProjectRow
        | undefined;
      if (!existing) return null;
      const current = rowToProject(existing);
      const next: LocalProject = {
        ...current,
        name: input.name ?? current.name,
        workspace: input.workspace ? { ...input.workspace } : current.workspace,
      };
      db.prepare(`
        update projects
        set name = @name,
            workspace_kind = @workspaceKind,
            local_path = @localPath,
            remote_url = @remoteUrl,
            base_branch = @baseBranch
        where slug_id = @slugId
      `).run(toProjectRow(next));
      return next;
    },
    async deleteProject(slugId) {
      const issueIds = db
        .prepare("select id from issues where project_slug = ?")
        .all(slugId) as Array<{ id: string }>;
      if (issueIds.length > 0) {
        db.prepare(
          `delete from comments where issue_id in (${issueIds.map(() => "?").join(",")})`,
        ).run(...issueIds.map((row) => row.id));
        db.prepare(
          `delete from issue_relations where issue_id in (${issueIds.map(() => "?").join(",")}) or related_issue_id in (${issueIds.map(() => "?").join(",")})`,
        ).run(...issueIds.map((row) => row.id), ...issueIds.map((row) => row.id));
      }
      db.prepare("delete from issues where project_slug = ?").run(slugId);
      const result = db.prepare("delete from projects where slug_id = ?").run(slugId);
      return result.changes > 0;
    },
    async createIssue(input: CreateIssueInput) {
      const project = db.prepare("select slug_id from projects where slug_id = ?").get(
        input.projectSlug,
      ) as { slug_id: string } | undefined;
      if (!project) {
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
      db.prepare(`
        insert into issues (id, identifier, title, description, priority, state, project_slug, branch_name, url, labels_json, created_at, updated_at)
        values (@id, @identifier, @title, @description, @priority, @state, @projectSlug, @branchName, @url, @labelsJson, @createdAt, @updatedAt)
      `).run({ ...issue, labelsJson: JSON.stringify(issue.labels) });
      return issue;
    },
    async listIssues(input) {
      const rows = db.prepare("select * from issues order by created_at asc").all() as SqliteIssueRow[];
      const filtered = rows.map(rowToIssue).filter((issue) => {
        const projectMatches = input.projectSlug ? issue.projectSlug === input.projectSlug : true;
        const stateMatches = input.stateNames ? input.stateNames.includes(issue.state) : true;
        return projectMatches && stateMatches;
      });
      const start = parseCursor(input.after);
      const nodes = filtered.slice(start, start + input.first);
      const nextOffset = start + nodes.length;
      const hasNextPage = nextOffset < filtered.length;
      return { nodes, endCursor: hasNextPage ? String(nextOffset) : null, hasNextPage };
    },
    async getIssuesByIds(ids) {
      if (ids.length === 0) return [];
      const rows = db.prepare(`select * from issues where id in (${ids.map(() => "?").join(",")})`).all(...ids) as SqliteIssueRow[];
      return rows.map(rowToIssue);
    },
    async updateIssue(id, input) {
      const existing = db.prepare("select * from issues where id = ?").get(id) as SqliteIssueRow | undefined;
      if (!existing) return null;
      const issue = { ...rowToIssue(existing), ...input, updatedAt: new Date().toISOString() };
      db.prepare(`
        update issues set title = @title, description = @description, priority = @priority, state = @state,
        branch_name = @branchName, url = @url, labels_json = @labelsJson, updated_at = @updatedAt where id = @id
      `).run({ ...issue, labelsJson: JSON.stringify(issue.labels) });
      return issue;
    },
    async createComment(issueId, body) {
      const issue = db.prepare("select id from issues where id = ?").get(issueId) as
        | { id: string }
        | undefined;
      if (!issue) return null;
      const now = new Date().toISOString();
      const comment = { id: randomUUID(), issueId, body, createdAt: now, updatedAt: now };
      db.prepare("insert into comments (id, issue_id, body, created_at, updated_at) values (?, ?, ?, ?, ?)")
        .run(comment.id, comment.issueId, comment.body, comment.createdAt, comment.updatedAt);
      return comment;
    },
    async updateComment(id, body) {
      const row = db.prepare("select * from comments where id = ?").get(id) as SqliteCommentRow | undefined;
      if (!row) return null;
      const updatedAt = new Date().toISOString();
      db.prepare("update comments set body = ?, updated_at = ? where id = ?").run(body, updatedAt, id);
      return { id, issueId: row.issue_id, body, createdAt: row.created_at, updatedAt };
    },
    async listCommentsByIssueId(issueId) {
      const rows = db.prepare("select * from comments where issue_id = ? order by created_at asc").all(issueId) as SqliteCommentRow[];
      return rows.map((row) => ({
        id: row.id,
        issueId: row.issue_id,
        body: row.body,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    },
    async createIssueRelation(input) {
      const issue = db.prepare("select id from issues where id = ?").get(input.issueId) as
        | { id: string }
        | undefined;
      const relatedIssue = db.prepare("select id from issues where id = ?").get(input.relatedIssueId) as
        | { id: string }
        | undefined;
      if (!issue || !relatedIssue) {
        return null;
      }
      const existing = db.prepare(
        "select * from issue_relations where issue_id = ? and related_issue_id = ? and type = ?",
      ).get(input.issueId, input.relatedIssueId, input.type) as SqliteIssueRelationRow | undefined;
      if (existing) {
        return rowToIssueRelation(existing);
      }
      const relation: LocalIssueRelation = {
        id: randomUUID(),
        issueId: input.issueId,
        relatedIssueId: input.relatedIssueId,
        type: input.type,
        createdAt: new Date().toISOString(),
      };
      db.prepare(
        "insert into issue_relations (id, issue_id, related_issue_id, type, created_at) values (?, ?, ?, ?, ?)",
      ).run(
        relation.id,
        relation.issueId,
        relation.relatedIssueId,
        relation.type,
        relation.createdAt,
      );
      return relation;
    },
    async listRelationsByIssueId(issueId) {
      const rows = db.prepare(
        "select * from issue_relations where issue_id = ? or related_issue_id = ? order by created_at asc",
      ).all(issueId, issueId) as SqliteIssueRelationRow[];
      return rows.map(rowToIssueRelation);
    },
  };
}

interface SqliteIssueRow {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: IssuePriority | null;
  state: string;
  project_slug: string;
  branch_name: string | null;
  url: string | null;
  labels_json: string;
  created_at: string;
  updated_at: string;
}

interface SqliteProjectRow {
  slug_id: string;
  name: string;
  workspace_kind: "local" | "remote";
  local_path: string | null;
  remote_url: string | null;
  base_branch: string | null;
}

interface SqliteCommentRow {
  id: string;
  issue_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface SqliteIssueRelationRow {
  id: string;
  issue_id: string;
  related_issue_id: string;
  type: string;
  created_at: string;
}

function rowToIssue(row: SqliteIssueRow): LocalIssue {
  return {
    id: row.id,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    priority: row.priority,
    state: row.state,
    projectSlug: row.project_slug,
    branchName: row.branch_name,
    url: row.url,
    labels: JSON.parse(row.labels_json) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToProject(row: SqliteProjectRow): LocalProject {
  return {
    id: `project-${row.slug_id}`,
    slugId: row.slug_id,
    name: row.name,
    workspace: {
      kind: row.workspace_kind,
      localPath: row.local_path,
      remoteUrl: row.remote_url,
      baseBranch: row.base_branch,
    },
  };
}

function rowToIssueRelation(row: SqliteIssueRelationRow): LocalIssueRelation {
  return {
    id: row.id,
    issueId: row.issue_id,
    relatedIssueId: row.related_issue_id,
    type: row.type,
    createdAt: row.created_at,
  };
}

function toProjectRow(
  input: CreateProjectInput | LocalProject,
): {
  slugId: string;
  name: string;
  workspaceKind: LocalProjectWorkspace["kind"];
  localPath: string | null;
  remoteUrl: string | null;
  baseBranch: string | null;
} {
  return {
    slugId: input.slugId,
    name: input.name,
    workspaceKind: input.workspace.kind,
    localPath: input.workspace.localPath,
    remoteUrl: input.workspace.remoteUrl,
    baseBranch: input.workspace.baseBranch,
  };
}

function parseCursor(after: string | null | undefined): number {
  if (!after) return 0;
  const parsed = Number.parseInt(after, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
