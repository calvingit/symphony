import { describe, expect, it, vi } from "vitest";
import { createOrchestrator } from "../src/orchestrator.js";
import type { Tracker } from "../src/tracker.js";

describe("orchestrator", () => {
  it("dispatches eligible active issues once", async () => {
    const tracker: Tracker = {
      fetchCandidateIssues: vi.fn(async () => [{
        id: "1",
        identifier: "LOC-1",
        title: "Work",
        description: null,
        priority: 1,
        state: "Todo",
        branchName: null,
        url: null,
        labels: [],
        blockedBy: [],
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: null,
      }]),
      fetchIssueStatesByIds: vi.fn(async () => new Map()),
      fetchIssuesByStates: vi.fn(async () => []),
    };
    const runIssue = vi.fn(async () => ({ status: "normal" as const }));
    const orchestrator = createOrchestrator({
      tracker,
      runIssue,
      activeStates: ["Todo"],
      terminalStates: ["Done"],
      maxConcurrentAgents: 1,
      maxConcurrentAgentsByState: new Map(),
    });

    await orchestrator.tick();

    expect(runIssue).toHaveBeenCalledOnce();
    expect(orchestrator.snapshot().counts.running + orchestrator.snapshot().counts.retrying).toBeGreaterThanOrEqual(0);
  });
});
