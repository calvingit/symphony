import type { KanbanIssue, RunProgress } from "./graphql";

export const OVERVIEW_STATE_ORDER = [
  "Backlog",
  "Todo",
  "In Progress",
  "Rework",
  "Human Review",
  "Merging",
  "Done",
  "Canceled",
  "Duplicate",
  "Closed",
] as const;

const TERMINAL_STATES = new Set(["Done", "Canceled", "Duplicate", "Closed"]);
const ATTENTION_STATES = new Set(["Rework", "Human Review", "Merging"]);
const RUNNING_STATUSES = new Set([
  "claimed",
  "preparing_workspace",
  "running_hooks",
  "running_codex",
  "tool_call",
]);
const RUN_ATTENTION_STATUSES = new Set(["failed", "retrying"]);

export interface OverviewRunItem {
  issue: KanbanIssue;
  run: RunProgress;
}

export interface OverviewAttentionItem {
  issue: KanbanIssue;
  run: RunProgress | null;
  reasons: string[];
  updatedAt: string | null;
}

export interface OverviewModel {
  activeIssueCount: number;
  attentionCount: number;
  attentionItems: OverviewAttentionItem[];
  hasIssues: boolean;
  highlightedRuns: OverviewRunItem[];
  lastRunUpdatedAt: string | null;
  recentIssues: KanbanIssue[];
  retryingOrFailedRunCount: number;
  runningRunCount: number;
  stateCounts: Array<{ state: string; count: number }>;
  totalIssueCount: number;
}

export function buildOverviewModel(input: {
  issues: KanbanIssue[];
  runs: Record<string, RunProgress | undefined>;
}): OverviewModel {
  const issues = [...input.issues];
  const issueIds = new Set(issues.map((issue) => issue.id));
  const projectRuns = Object.values(input.runs)
    .filter((run): run is RunProgress => run !== undefined)
    .filter((run) => issueIds.has(run.issueId))
    .sort(compareDatesDesc((run) => run.updatedAt));

  const stateCounts = OVERVIEW_STATE_ORDER.map((state) => ({
    state,
    count: issues.filter((issue) => issue.state === state).length,
  }));

  const runningRunCount = projectRuns.filter((run) => RUNNING_STATUSES.has(run.status)).length;
  const retryingOrFailedRunCount = projectRuns.filter((run) =>
    RUN_ATTENTION_STATUSES.has(run.status),
  ).length;

  const attentionItems = issues
    .map((issue) => {
      const run = input.runs[issue.id] ?? null;
      const reasons: string[] = [];
      if (ATTENTION_STATES.has(issue.state)) {
        reasons.push(issue.state);
      }
      if (run && RUN_ATTENTION_STATUSES.has(run.status)) {
        reasons.push(formatRunStatus(run.status));
      }
      if (reasons.length === 0) {
        return null;
      }
      return {
        issue,
        run,
        reasons,
        updatedAt: run?.updatedAt ?? issue.updatedAt ?? issue.createdAt ?? null,
      };
    })
    .filter((item): item is OverviewAttentionItem => item !== null)
    .sort(compareDatesDesc((item) => item.updatedAt))
    .slice(0, 8);

  const highlightedRuns = projectRuns
    .filter((run) => RUNNING_STATUSES.has(run.status) || RUN_ATTENTION_STATUSES.has(run.status))
    .map((run) => {
      const issue = issues.find((item) => item.id === run.issueId);
      return issue ? { issue, run } : null;
    })
    .filter((item): item is OverviewRunItem => item !== null)
    .sort((left, right) => compareRunPriority(left.run.status, right.run.status) || compareDatesDescValue(left.run.updatedAt, right.run.updatedAt))
    .slice(0, 8);

  const recentIssues = [...issues]
    .sort(compareDatesDesc((issue) => issue.updatedAt ?? issue.createdAt ?? null))
    .slice(0, 8);

  return {
    activeIssueCount: issues.filter((issue) => !TERMINAL_STATES.has(issue.state)).length,
    attentionCount: attentionItems.length,
    attentionItems,
    hasIssues: issues.length > 0,
    highlightedRuns,
    lastRunUpdatedAt: projectRuns[0]?.updatedAt ?? null,
    recentIssues,
    retryingOrFailedRunCount,
    runningRunCount,
    stateCounts,
    totalIssueCount: issues.length,
  };
}

export function formatRunStatus(status: string): string {
  switch (status) {
    case "claimed":
      return "Claimed";
    case "preparing_workspace":
      return "Preparing workspace";
    case "running_hooks":
      return "Running hooks";
    case "running_codex":
      return "Running Codex";
    case "tool_call":
      return "Tool call";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "retrying":
      return "Retrying";
    default:
      return status;
  }
}

function compareRunPriority(left: string, right: string): number {
  return runPriority(right) - runPriority(left);
}

function runPriority(status: string): number {
  if (status === "failed") return 4;
  if (status === "retrying") return 3;
  if (RUNNING_STATUSES.has(status)) return 2;
  return 1;
}

function compareDatesDesc<T>(getValue: (value: T) => string | null | undefined) {
  return (left: T, right: T) =>
    compareDatesDescValue(getValue(left) ?? null, getValue(right) ?? null);
}

function compareDatesDescValue(left: string | null, right: string | null): number {
  return toTimestamp(right) - toTimestamp(left);
}

function toTimestamp(value: string | null): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}
