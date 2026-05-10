import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrchestrator } from "../src/orchestrator.js";
import type { Tracker } from "../src/tracker.js";

describe("orchestrator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("retries a failed issue and allows the claimed issue to run again", async () => {
    vi.useFakeTimers();
    const issue = {
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
    };
    const tracker: Tracker = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => new Map()),
      fetchIssuesByStates: vi.fn(async () => []),
    };
    const runIssue = vi
      .fn()
      .mockResolvedValueOnce({ status: "failed" as const, error: "boom" })
      .mockResolvedValueOnce({ status: "normal" as const });
    const orchestrator = createOrchestrator({
      tracker,
      runIssue,
      activeStates: ["Todo"],
      terminalStates: ["Done"],
      maxConcurrentAgents: 1,
      maxConcurrentAgentsByState: new Map(),
      maxRetryBackoffMs: 10000,
    });

    await orchestrator.tick();
    await Promise.resolve();
    expect(orchestrator.snapshot().counts.retrying).toBe(1);

    await vi.advanceTimersByTimeAsync(10000);

    expect(runIssue).toHaveBeenCalledTimes(2);
  });

  it("cleans up terminal running issues during reconciliation", async () => {
    const activeIssue = {
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
    };
    const terminalIssue = { ...activeIssue, state: "Done" };
    const tracker: Tracker = {
      fetchCandidateIssues: vi.fn()
        .mockResolvedValueOnce([activeIssue])
        .mockResolvedValue([]),
      fetchIssueStatesByIds: vi.fn(async () => new Map([["1", terminalIssue]])),
      fetchIssuesByStates: vi.fn(async () => []),
    };
    const cleanupIssue = vi.fn(async () => {});
    const orchestrator = createOrchestrator({
      tracker,
      runIssue: vi.fn(() => new Promise<never>(() => {})),
      cleanupIssue,
      activeStates: ["Todo"],
      terminalStates: ["Done"],
      maxConcurrentAgents: 1,
      maxConcurrentAgentsByState: new Map(),
    });

    await orchestrator.tick();
    await orchestrator.tick();

    expect(cleanupIssue).toHaveBeenCalledWith(activeIssue);
    expect(orchestrator.snapshot().counts.running).toBe(0);
  });

  it("reports claimed and retrying progress", async () => {
    vi.useFakeTimers();
    const issue = {
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
    };
    const statuses: string[] = [];
    const tracker: Tracker = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => new Map()),
      fetchIssuesByStates: vi.fn(async () => []),
    };
    const orchestrator = createOrchestrator({
      tracker,
      runIssue: vi.fn(async () => ({ status: "failed" as const, error: "boom" })),
      onProgress: (event) => statuses.push(event.status),
      activeStates: ["Todo"],
      terminalStates: ["Done"],
      maxConcurrentAgents: 1,
      maxConcurrentAgentsByState: new Map(),
      maxRetryBackoffMs: 10000,
    });

    await orchestrator.tick();
    await Promise.resolve();

    expect(statuses).toEqual(["claimed", "retrying"]);
  });

  it("does not report retrying after normal completion", async () => {
    const issue = {
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
    };
    const statuses: string[] = [];
    const tracker: Tracker = {
      fetchCandidateIssues: vi.fn(async () => [issue]),
      fetchIssueStatesByIds: vi.fn(async () => new Map()),
      fetchIssuesByStates: vi.fn(async () => []),
    };
    const orchestrator = createOrchestrator({
      tracker,
      runIssue: vi.fn(async () => ({ status: "normal" as const })),
      onProgress: (event) => statuses.push(event.status),
      activeStates: ["Todo"],
      terminalStates: ["Done"],
      maxConcurrentAgents: 1,
      maxConcurrentAgentsByState: new Map(),
    });

    await orchestrator.tick();
    await Promise.resolve();

    expect(statuses).toEqual(["claimed"]);
    expect(orchestrator.snapshot().counts.retrying).toBe(0);
  });
});
