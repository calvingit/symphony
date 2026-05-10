import { mkdir, rm, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { runHook } from "./hook-runner.js";

export interface Workspace {
  path: string;
  workspaceKey: string;
  createdNow: boolean;
}

export function sanitizeWorkspaceKey(identifier: string): string {
  return identifier.replace(/[^A-Za-z0-9._-]/g, "_");
}

export async function createWorkspaceForIssue(root: string, identifier: string): Promise<Workspace> {
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

export async function cleanupWorkspaceForIssue(input: {
  root: string;
  identifier: string;
  beforeRemove: string | null;
  timeoutMs: number;
}): Promise<void> {
  const workspaceRoot = resolve(input.root);
  const workspacePath = resolve(workspaceRoot, sanitizeWorkspaceKey(input.identifier));
  assertInsideRoot(workspaceRoot, workspacePath);

  try {
    const existing = await stat(workspacePath);
    if (!existing.isDirectory()) return;
  } catch (error: any) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  await runHook({
    script: input.beforeRemove,
    cwd: workspacePath,
    timeoutMs: input.timeoutMs,
    env: {
      SYMPHONY_WORKSPACE_PATH: workspacePath,
      SYMPHONY_WORKSPACE_KEY: sanitizeWorkspaceKey(input.identifier),
      SYMPHONY_ISSUE_IDENTIFIER: input.identifier,
    },
  });
  await rm(workspacePath, { recursive: true, force: true });
}

export function assertInsideRoot(root: string, path: string): void {
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(path);
  if (normalizedPath !== normalizedRoot && !normalizedPath.startsWith(normalizedRoot + sep)) {
    throw new Error(`workspace_outside_root: ${normalizedPath}`);
  }
}
