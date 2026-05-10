import { describe, expect, it } from "vitest";
import type { KanbanIssue, RunProgress } from "../lib/graphql.js";
import { buildOverviewModel } from "../lib/overview.js";

describe("buildOverviewModel", () => {
  it("aggregates issue states and active issue count", () => {
    const model = buildOverviewModel({
      issues: [
        createIssue({ id: "1", identifier: "LOC-1", state: "Todo" }),
        createIssue({ id: "2", identifier: "LOC-2", state: "In Progress" }),
        createIssue({ id: "3", identifier: "LOC-3", state: "Done" }),
      ],
      runs: {},
    });

    expect(model.totalIssueCount).toBe(3);
    expect(model.activeIssueCount).toBe(2);
    expect(model.stateCounts.find((item) => item.state === "Todo")?.count).toBe(1);
    expect(model.stateCounts.find((item) => item.state === "Done")?.count).toBe(1);
  });

  it("surfaces attention issues and unhealthy runs", () => {
    const issues = [
      createIssue({ id: "1", identifier: "LOC-1", state: "Rework", updatedAt: "2026-05-10T10:00:00.000Z" }),
      createIssue({ id: "2", identifier: "LOC-2", state: "Todo", updatedAt: "2026-05-10T09:00:00.000Z" }),
    ];
    const runs: Record<string, RunProgress> = {
      "2": createRun({ issueId: "2", identifier: "LOC-2", status: "failed", updatedAt: "2026-05-10T11:00:00.000Z" }),
    };

    const model = buildOverviewModel({ issues, runs });

    expect(model.attentionCount).toBe(2);
    expect(model.retryingOrFailedRunCount).toBe(1);
    expect(model.highlightedRuns).toHaveLength(1);
    expect(model.highlightedRuns[0]?.issue.identifier).toBe("LOC-2");
    expect(model.attentionItems.map((item) => item.issue.identifier)).toEqual(["LOC-2", "LOC-1"]);
  });
});

function createIssue(
  overrides: Partial<KanbanIssue> & Pick<KanbanIssue, "id" | "identifier" | "state">,
): KanbanIssue {
  return {
    id: overrides.id,
    identifier: overrides.identifier,
    title: overrides.title ?? overrides.identifier,
    state: overrides.state,
    priority: overrides.priority ?? null,
    description: overrides.description ?? null,
    branchName: overrides.branchName ?? null,
    url: overrides.url ?? null,
    labels: overrides.labels ?? [],
    updatedAt: overrides.updatedAt ?? "2026-05-10T08:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-05-10T07:00:00.000Z",
  };
}

function createRun(
  overrides: Partial<RunProgress> &
    Pick<RunProgress, "issueId" | "identifier" | "status" | "updatedAt">,
): RunProgress {
  return {
    issueId: overrides.issueId,
    identifier: overrides.identifier,
    title: overrides.title ?? overrides.identifier,
    attempt: overrides.attempt ?? 0,
    status: overrides.status,
    message: overrides.message ?? null,
    error: overrides.error ?? null,
    threadId: overrides.threadId ?? null,
    turnId: overrides.turnId ?? null,
    toolName: overrides.toolName ?? null,
    startedAt: overrides.startedAt ?? "2026-05-10T06:00:00.000Z",
    updatedAt: overrides.updatedAt,
    finishedAt: overrides.finishedAt ?? null,
  };
}
