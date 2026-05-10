import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { CreateIssueInput, LocalIssue, LocalLinearStore } from "./store.js";

export function createSqliteStore(path: string): LocalLinearStore {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    create table if not exists projects (
      slug_id text primary key,
      name text not null
    );
    create table if not exists issues (
      id text primary key,
      identifier text not null unique,
      title text not null,
      description text,
      priority integer,
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
  `);

  return {
    async seedDefaultProject(slugId) {
      db.prepare("insert or ignore into projects (slug_id, name) values (?, ?)").run(slugId, slugId);
    },
    async createIssue(input: CreateIssueInput) {
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
      const nodes = filtered.slice(0, input.first);
      return { nodes, endCursor: null, hasNextPage: filtered.length > nodes.length };
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
  };
}

interface SqliteIssueRow {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  project_slug: string;
  branch_name: string | null;
  url: string | null;
  labels_json: string;
  created_at: string;
  updated_at: string;
}

interface SqliteCommentRow {
  id: string;
  issue_id: string;
  body: string;
  created_at: string;
  updated_at: string;
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
