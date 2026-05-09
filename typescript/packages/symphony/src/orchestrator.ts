import type { Issue } from "@symphony/core";
import type { Tracker } from "./tracker.js";

export interface RunIssueResult {
  status: "normal" | "failed" | "cancelled";
  error?: string;
}

export interface OrchestratorInput {
  tracker: Tracker;
  runIssue: (issue: Issue, attempt: number | null) => Promise<RunIssueResult>;
  activeStates: string[];
  terminalStates: string[];
  maxConcurrentAgents: number;
  maxConcurrentAgentsByState: Map<string, number>;
}

export function createOrchestrator(input: OrchestratorInput) {
  const running = new Map<string, Issue>();
  const claimed = new Set<string>();
  const retrying = new Map<string, { issue: Issue; attempt: number; error: string | null }>();

  async function tick(): Promise<void> {
    await reconcile();
    const candidates = await input.tracker.fetchCandidateIssues(input.activeStates);
    for (const issue of sortIssues(candidates)) {
      if (!isEligible(issue)) continue;
      dispatch(issue, null);
      if (running.size >= input.maxConcurrentAgents) break;
    }
  }

  async function reconcile(): Promise<void> {
    if (running.size === 0) return;
    const states = await input.tracker.fetchIssueStatesByIds([...running.keys()]);
    for (const [id, issue] of states) {
      if (!issue) continue;
      if (input.terminalStates.includes(issue.state) || !input.activeStates.includes(issue.state)) {
        running.delete(id);
        claimed.delete(id);
      } else {
        running.set(id, issue);
      }
    }
  }

  function dispatch(issue: Issue, attempt: number | null): void {
    claimed.add(issue.id);
    running.set(issue.id, issue);
    void input.runIssue(issue, attempt).then((result) => {
      running.delete(issue.id);
      if (result.status === "normal") {
        retrying.set(issue.id, { issue, attempt: 1, error: null });
      } else {
        retrying.set(issue.id, { issue, attempt: (attempt ?? 0) + 1, error: result.error ?? result.status });
      }
    });
  }

  function isEligible(issue: Issue): boolean {
    if (!issue.id || !issue.identifier || !issue.title || !issue.state) return false;
    if (!input.activeStates.includes(issue.state)) return false;
    if (input.terminalStates.includes(issue.state)) return false;
    if (running.has(issue.id) || claimed.has(issue.id)) return false;
    if (running.size >= input.maxConcurrentAgents) return false;
    if (issue.state === "Todo" && issue.blockedBy.some((blocker) => blocker.state && !input.terminalStates.includes(blocker.state))) return false;
    return true;
  }

  function snapshot() {
    return {
      counts: { running: running.size, retrying: retrying.size },
      running: [...running.values()],
      retrying: [...retrying.values()],
    };
  }

  return { tick, snapshot };
}

function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const priorityA = a.priority ?? Number.MAX_SAFE_INTEGER;
    const priorityB = b.priority ?? Number.MAX_SAFE_INTEGER;
    if (priorityA !== priorityB) return priorityA - priorityB;
    const createdA = a.createdAt ?? "";
    const createdB = b.createdAt ?? "";
    if (createdA !== createdB) return createdA.localeCompare(createdB);
    return a.identifier.localeCompare(b.identifier);
  });
}
