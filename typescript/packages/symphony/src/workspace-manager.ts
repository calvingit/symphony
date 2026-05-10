import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, realpath, rm, stat } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import type { Issue, ProjectWorkspaceRef } from "@symphony/core";
import { runHook } from "./hook-runner.js";

export interface Workspace {
  path: string;
  workspaceKey: string;
  createdNow: boolean;
}

interface WorkspaceLocation {
  path: string;
  workspaceKey: string;
  kind: "directory" | "git-worktree";
  sourceRepoPath: string | null;
}

export interface CreateWorkspaceInput {
  root: string;
  issue: Issue;
  remoteCacheRoot?: string;
}

const execFileAsync = promisify(execFile);
const DEFAULT_REMOTE_CACHE_ROOT = "/private/tmp/symphony-remote-workspaces";

export function sanitizeWorkspaceKey(identifier: string): string {
  return identifier.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function createWorkspaceForIssue(root: string, identifier: string): Promise<Workspace>;
export async function createWorkspaceForIssue(input: CreateWorkspaceInput): Promise<Workspace>;
export async function createWorkspaceForIssue(
  inputOrRoot: CreateWorkspaceInput | string,
  identifier?: string,
): Promise<Workspace> {
  if (typeof inputOrRoot === "string") {
    if (!identifier) throw new Error("workspace_issue_identifier_required");
    return createDirectoryWorkspace(inputOrRoot, identifier);
  }

  const location = await prepareWorkspaceLocation(inputOrRoot);
  if (location.kind === "directory") {
    return createDirectoryWorkspace(inputOrRoot.root, inputOrRoot.issue.identifier);
  }

  const workspaceRoot = resolve(location.sourceRepoPath!, ".worktrees");
  assertInsideRoot(workspaceRoot, location.path);

  let createdNow = false;
  try {
    const existing = await stat(location.path);
    if (!existing.isDirectory()) {
      throw new Error(`workspace_not_directory: ${location.path}`);
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(workspaceRoot, { recursive: true });
    await addWorktree({
      repoPath: location.sourceRepoPath!,
      workspacePath: location.path,
      branchName: branchNameForIssue(
        inputOrRoot.issue,
        inputOrRoot.issue.project?.workspace.baseBranch ?? "main",
      ),
      baseBranch: inputOrRoot.issue.project?.workspace.baseBranch ?? "main",
    });
    createdNow = true;
  }

  await assertGitRoot(location.path);
  return { path: location.path, workspaceKey: location.workspaceKey, createdNow };
}

export async function cleanupWorkspaceForIssue(input: {
  root: string;
  identifier?: string;
  issue?: Issue;
  beforeRemove: string | null;
  timeoutMs: number;
  remoteCacheRoot?: string;
}): Promise<void> {
  const issue = input.issue ?? issueFromIdentifier(input.identifier);
  const location = await locateWorkspace({
    root: input.root,
    issue,
    remoteCacheRoot: input.remoteCacheRoot,
    prepareRemote: false,
  });

  try {
    const existing = await stat(location.path);
    if (!existing.isDirectory()) return;
  } catch (error: any) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  await runHook({
    script: input.beforeRemove,
    cwd: location.path,
    timeoutMs: input.timeoutMs,
    env: {
      SYMPHONY_WORKSPACE_PATH: location.path,
      SYMPHONY_WORKSPACE_KEY: location.workspaceKey,
      SYMPHONY_ISSUE_IDENTIFIER: issue.identifier,
    },
  });
  if (location.kind === "git-worktree" && location.sourceRepoPath) {
    await runGit(location.sourceRepoPath, ["worktree", "remove", "--force", location.path]);
  } else {
    await rm(location.path, { recursive: true, force: true });
  }
}

export function assertInsideRoot(root: string, path: string): void {
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(path);
  if (normalizedPath !== normalizedRoot && !normalizedPath.startsWith(normalizedRoot + sep)) {
    throw new Error(`workspace_outside_root: ${normalizedPath}`);
  }
}

async function createDirectoryWorkspace(root: string, identifier: string): Promise<Workspace> {
  const workspaceRoot = resolve(root);
  const workspaceKey = sanitizeWorkspaceKey(identifier);
  const workspacePath = resolve(workspaceRoot, workspaceKey);

  assertInsideRoot(workspaceRoot, workspacePath);

  let createdNow = false;
  try {
    const existing = await stat(workspacePath);
    if (!existing.isDirectory()) {
      throw new Error(`workspace_not_directory: ${workspacePath}`);
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(workspacePath, { recursive: true });
    createdNow = true;
  }

  return { path: workspacePath, workspaceKey, createdNow };
}

async function prepareWorkspaceLocation(input: CreateWorkspaceInput): Promise<WorkspaceLocation> {
  return locateWorkspace({ ...input, prepareRemote: true });
}

async function locateWorkspace(input: CreateWorkspaceInput & { prepareRemote: boolean }): Promise<WorkspaceLocation> {
  const workspace = input.issue.project?.workspace;
  if (!workspace) {
    const directory = await directoryLocation(input.root, input.issue.identifier);
    return { ...directory, kind: "directory", sourceRepoPath: null };
  }

  const sourceRepoPath = workspace.kind === "remote"
    ? await remoteSourceRepoPath(workspace, {
        projectSlug: input.issue.project?.slugId ?? "project",
        remoteCacheRoot: input.remoteCacheRoot,
        prepare: input.prepareRemote,
      })
    : await localSourceRepoPath(workspace);

  const workspaceKey = sanitizeWorkspaceKey(input.issue.identifier);
  const workspaceRoot = resolve(sourceRepoPath, ".worktrees");
  const workspacePath = resolve(workspaceRoot, workspaceKey);
  assertInsideRoot(workspaceRoot, workspacePath);

  return {
    path: workspacePath,
    workspaceKey,
    kind: "git-worktree",
    sourceRepoPath,
  };
}

async function directoryLocation(root: string, identifier: string): Promise<WorkspaceLocation> {
  const workspaceRoot = resolve(root);
  const workspaceKey = sanitizeWorkspaceKey(identifier);
  const workspacePath = resolve(workspaceRoot, workspaceKey);
  assertInsideRoot(workspaceRoot, workspacePath);
  return { path: workspacePath, workspaceKey, kind: "directory", sourceRepoPath: null };
}

async function localSourceRepoPath(workspace: ProjectWorkspaceRef): Promise<string> {
  if (!workspace.localPath) {
    throw new Error("project_workspace_local_path_required");
  }
  const repoPath = await realpath(resolve(workspace.localPath));
  const gitRoot = await assertGitRoot(repoPath);
  if (gitRoot !== repoPath) {
    throw new Error(`workspace_git_root_mismatch: ${gitRoot}`);
  }
  return repoPath;
}

async function remoteSourceRepoPath(
  workspace: ProjectWorkspaceRef,
  input: { projectSlug: string; remoteCacheRoot?: string; prepare: boolean },
): Promise<string> {
  if (!workspace.remoteUrl) {
    throw new Error("project_workspace_remote_url_required");
  }

  const configuredCacheRoot = resolve(input.remoteCacheRoot ?? DEFAULT_REMOTE_CACHE_ROOT);
  let cacheRoot = configuredCacheRoot;
  if (input.prepare) {
    await mkdir(configuredCacheRoot, { recursive: true });
    cacheRoot = await realpath(configuredCacheRoot);
  } else if (await pathExists(configuredCacheRoot)) {
    cacheRoot = await realpath(configuredCacheRoot);
  }
  const repoPath = resolve(cacheRoot, remoteCacheDirectoryName(input.projectSlug, workspace.remoteUrl));
  assertInsideRoot(cacheRoot, repoPath);

  if (!input.prepare) return repoPath;

  const exists = await pathExists(resolve(repoPath, ".git"));
  if (!exists) {
    await runGit(null, ["clone", workspace.remoteUrl, repoPath]);
  } else {
    await assertGitRoot(repoPath);
  }

  const baseBranch = workspace.baseBranch ?? "main";
  await runGit(repoPath, ["fetch", "origin", baseBranch]);
  await runGit(repoPath, ["checkout", "-B", baseBranch, `origin/${baseBranch}`]);
  await runGit(repoPath, ["pull", "--ff-only", "origin", baseBranch]);
  return repoPath;
}

async function addWorktree(input: {
  repoPath: string;
  workspacePath: string;
  branchName: string;
  baseBranch: string;
}): Promise<void> {
  await runGit(input.repoPath, ["check-ref-format", "--branch", input.branchName]);
  if (await gitRefExists(input.repoPath, input.branchName)) {
    await runGit(input.repoPath, ["worktree", "add", input.workspacePath, input.branchName]);
  } else {
    const baseRef = await resolveBaseRef(input.repoPath, input.baseBranch);
    if (baseRef) {
      await runGit(input.repoPath, ["worktree", "add", "-b", input.branchName, input.workspacePath, baseRef]);
    } else {
      await runGit(input.repoPath, ["worktree", "add", "--orphan", "-b", input.branchName, input.workspacePath]);
    }
  }
}

async function resolveBaseRef(repoPath: string, baseBranch: string): Promise<string | null> {
  if (await gitRefExists(repoPath, baseBranch)) return baseBranch;
  const originRef = `origin/${baseBranch}`;
  if (await gitRefExists(repoPath, originRef)) return originRef;
  if (await gitRefExists(repoPath, "HEAD")) return "HEAD";
  return null;
}

async function gitRefExists(repoPath: string, ref: string): Promise<boolean> {
  try {
    await runGit(repoPath, ["rev-parse", "--verify", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

async function assertGitRoot(path: string): Promise<string> {
  const result = await runGit(path, ["rev-parse", "--show-toplevel"]);
  return realpath(resolve(result.stdout.trim()));
}

async function runGit(
  cwd: string | null,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync("git", cwd ? ["-C", cwd, ...args] : args, {
      maxBuffer: 1024 * 1024,
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error: any) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
    const detail = stderr || stdout || String(error);
    throw new Error(`git_failed: git ${cwd ? `-C ${cwd} ` : ""}${args.join(" ")}: ${detail}`);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error: any) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function branchNameForIssue(issue: Issue, baseBranch: string): string {
  const issueBranch = issue.branchName?.trim();
  if (issueBranch && issueBranch !== baseBranch) return issueBranch;
  return `symphony/${sanitizeWorkspaceKey(issue.identifier)}`;
}

function remoteCacheDirectoryName(projectSlug: string, remoteUrl: string): string {
  const hash = createHash("sha256").update(remoteUrl).digest("hex").slice(0, 12);
  const urlName = basename(remoteUrl.replace(/\.git$/, "")) || "repo";
  return `${sanitizeWorkspaceKey(projectSlug)}-${sanitizeWorkspaceKey(urlName)}-${hash}`;
}

function issueFromIdentifier(identifier: string | undefined): Issue {
  if (!identifier) throw new Error("workspace_issue_identifier_required");
  return {
    id: identifier,
    identifier,
    title: identifier,
    description: null,
    priority: null,
    state: "",
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    project: null,
    createdAt: null,
    updatedAt: null,
  };
}
