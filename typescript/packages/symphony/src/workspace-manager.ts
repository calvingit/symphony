import { mkdir, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

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

export function assertInsideRoot(root: string, path: string): void {
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(path);
  if (normalizedPath !== normalizedRoot && !normalizedPath.startsWith(normalizedRoot + sep)) {
    throw new Error(`workspace_outside_root: ${normalizedPath}`);
  }
}
