export interface BlockerRef {
  id: string | null;
  identifier: string | null;
  state: string | null;
}

export const ISSUE_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;

export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const ISSUE_PRIORITY_WEIGHTS: Record<IssuePriority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

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
  priority: IssuePriority | null;
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

export function isIssuePriority(value: unknown): value is IssuePriority {
  return typeof value === "string" && ISSUE_PRIORITIES.includes(value as IssuePriority);
}

export function normalizeIssuePriority(value: unknown): IssuePriority | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isIssuePriority(normalized) ? normalized : null;
}

export function issuePriorityLabel(priority: IssuePriority | null): string {
  return priority ? ISSUE_PRIORITY_LABELS[priority] : ISSUE_PRIORITY_LABELS.none;
}

export function issuePriorityWeight(priority: IssuePriority | null): number {
  return priority ? ISSUE_PRIORITY_WEIGHTS[priority] : ISSUE_PRIORITY_WEIGHTS.none;
}
