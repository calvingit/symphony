export interface BlockerRef {
  id: string | null;
  identifier: string | null;
  state: string | null;
}

export interface ProjectWorkspaceRef {
  kind: "local" | "remote";
  localPath: string | null;
  remoteUrl: string | null;
  baseBranch: string | null;
}

export interface ProjectRef {
  slugId: string;
  name: string;
  workspace: ProjectWorkspaceRef;
}

export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  state: string;
  branchName: string | null;
  url: string | null;
  labels: string[];
  blockedBy: BlockerRef[];
  project?: ProjectRef | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export function normalizeLabels(labels: readonly string[]): string[] {
  return labels.map((label) => label.trim().toLowerCase()).filter(Boolean);
}
