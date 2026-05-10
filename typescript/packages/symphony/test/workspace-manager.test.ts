import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { Issue } from "@symphony/core";
import { cleanupWorkspaceForIssue, createWorkspaceForIssue, sanitizeWorkspaceKey } from "../src/workspace-manager.js";

const execFileAsync = promisify(execFile);

describe("workspace manager", () => {
  it("sanitizes issue identifiers", () => {
    expect(sanitizeWorkspaceKey("MT/../1 @x")).toBe("MT_.._1__x");
  });

  it("creates workspaces under the configured root", async () => {
    const root = await mkdtemp(join(tmpdir(), "symphony-workspaces-"));
    const workspace = await createWorkspaceForIssue(root, "LOC-1");

    expect(workspace.path.startsWith(root)).toBe(true);
    await expect(stat(workspace.path)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
  });

  it("creates issue worktrees under the local project repository", async () => {
    const root = await mkdtemp(join(tmpdir(), "symphony-fallback-workspaces-"));
    const repoPath = await createGitRepo(await mkdtemp(join(tmpdir(), "symphony-local-repo-")));
    const issueData = issue("LOC-2", {
      slugId: "local-demo",
      name: "Local Demo",
      workspace: {
        kind: "local",
        localPath: repoPath,
        remoteUrl: null,
        baseBranch: "main",
      },
    });
    issueData.branchName = "main";
    const workspace = await createWorkspaceForIssue({
      root,
      issue: issueData,
    });

    expect(workspace.path).toBe(join(repoPath, ".worktrees", "LOC-2"));
    expect(workspace.path.startsWith(join(repoPath, ".worktrees"))).toBe(true);
    await expect(git(workspace.path, ["rev-parse", "--show-toplevel"])).resolves.toBe(
      resolve(workspace.path),
    );
    await expect(git(workspace.path, ["branch", "--show-current"])).resolves.toBe("symphony/LOC-2");
  });

  it("pulls remote projects into a temp cache before creating issue worktrees", async () => {
    const root = await mkdtemp(join(tmpdir(), "symphony-fallback-workspaces-"));
    const sourceRepoPath = await createGitRepo(await mkdtemp(join(tmpdir(), "symphony-source-repo-")));
    const remoteRepoPath = join(await mkdtemp(join(tmpdir(), "symphony-remote-repo-")), "remote.git");
    await execFileAsync("git", ["clone", "--bare", sourceRepoPath, remoteRepoPath]);
    const remoteCacheRoot = await mkdtemp(join(tmpdir(), "symphony-remote-cache-"));

    const workspace = await createWorkspaceForIssue({
      root,
      remoteCacheRoot,
      issue: issue("LOC-3", {
        slugId: "remote-demo",
        name: "Remote Demo",
        workspace: {
          kind: "remote",
          localPath: null,
          remoteUrl: remoteRepoPath,
          baseBranch: "main",
        },
      }),
    });

    expect(workspace.path.startsWith(await realpath(remoteCacheRoot))).toBe(true);
    expect(workspace.path.endsWith(join(".worktrees", "LOC-3"))).toBe(true);
    await expect(git(workspace.path, ["rev-parse", "--show-toplevel"])).resolves.toBe(
      resolve(workspace.path),
    );
    await expect(git(workspace.path, ["branch", "--show-current"])).resolves.toBe("symphony/LOC-3");
  });

  it("creates orphan issue worktrees for empty repositories", async () => {
    const root = await mkdtemp(join(tmpdir(), "symphony-fallback-workspaces-"));
    const repoPath = await createEmptyGitRepo(await mkdtemp(join(tmpdir(), "symphony-empty-repo-")));
    const issueData = issue("LOC-4", {
      slugId: "empty-demo",
      name: "Empty Demo",
      workspace: {
        kind: "local",
        localPath: repoPath,
        remoteUrl: null,
        baseBranch: "main",
      },
    });
    issueData.branchName = "main";

    const workspace = await createWorkspaceForIssue({
      root,
      issue: issueData,
    });

    expect(workspace.path).toBe(join(repoPath, ".worktrees", "LOC-4"));
    await expect(git(workspace.path, ["branch", "--show-current"])).resolves.toBe("symphony/LOC-4");
    await expect(git(workspace.path, ["status", "--short", "--branch"])).resolves.toContain(
      "No commits yet on symphony/LOC-4",
    );
  });

  it("runs before_remove before deleting terminal workspaces", async () => {
    const root = await mkdtemp(join(tmpdir(), "symphony-workspaces-"));
    const workspace = await createWorkspaceForIssue(root, "LOC-1");

    await cleanupWorkspaceForIssue({
      root,
      identifier: "LOC-1",
      beforeRemove: "printf removed > ../removed.txt",
      timeoutMs: 1000,
    });

    await expect(readFile(join(root, "removed.txt"), "utf8")).resolves.toBe("removed");
    await expect(stat(workspace.path)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

function issue(identifier: string, project?: Issue["project"]): Issue {
  return {
    id: `issue-${identifier}`,
    identifier,
    title: `Issue ${identifier}`,
    description: "Test issue",
    priority: null,
    state: "Todo",
    branchName: null,
    url: null,
    labels: [],
    blockedBy: [],
    project,
    createdAt: null,
    updatedAt: null,
  };
}

async function createGitRepo(repoPath: string): Promise<string> {
  await execFileAsync("git", ["init", "-b", "main", repoPath]);
  await git(repoPath, ["config", "user.email", "test@example.com"]);
  await git(repoPath, ["config", "user.name", "Test User"]);
  await writeFile(join(repoPath, "README.md"), "# Demo\n", "utf8");
  await git(repoPath, ["add", "README.md"]);
  await git(repoPath, ["commit", "-m", "init"]);
  return git(repoPath, ["rev-parse", "--show-toplevel"]);
}

async function createEmptyGitRepo(repoPath: string): Promise<string> {
  await execFileAsync("git", ["init", "-b", "main", repoPath]);
  return realpath(repoPath);
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", ["-C", cwd, ...args]);
  return resolveGitOutput(args, String(result.stdout).trim());
}

function resolveGitOutput(args: string[], output: string): string {
  return args.includes("--show-toplevel") ? resolve(output) : output;
}
