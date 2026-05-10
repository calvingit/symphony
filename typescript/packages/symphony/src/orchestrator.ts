import { issuePriorityWeight, type Issue } from "@symphony/core";
import type { RunProgressStatus } from "./run-progress.js";
import type { Tracker } from "./tracker.js";

export interface RunIssueResult {
  status: "normal" | "failed" | "cancelled";
  error?: string;
}

export interface OrchestratorInput {
  tracker: Tracker;
  runIssue: (issue: Issue, attempt: number | null) => Promise<RunIssueResult>;
  cleanupIssue?: (issue: Issue) => Promise<void>;
  onProgress?: (event: { issue: Issue; attempt: number | null; status: RunProgressStatus; error?: string }) => void;
  activeStates: string[];
  terminalStates: string[];
  maxConcurrentAgents: number;
  maxConcurrentAgentsByState: Map<string, number>;
  maxRetryBackoffMs?: number;
  continuationRetryDelayMs?: number;
}

export function createOrchestrator(input: OrchestratorInput) {
  const running = new Map<string, Issue>();
  const claimed = new Set<string>();
  const retrying = new Map<string, { issue: Issue; attempt: number; error: string | null; timer: ReturnType<typeof setTimeout> }>();

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
        const runningIssue = running.get(id) ?? issue;
        running.delete(id);
        claimed.delete(id);
        retrying.get(id)?.timer && clearTimeout(retrying.get(id)?.timer);
        retrying.delete(id);
        if (input.terminalStates.includes(issue.state)) {
          await input.cleanupIssue?.(runningIssue);
        }
      } else {
        running.set(id, issue);
      }
    }
  }

  function dispatch(issue: Issue, attempt: number | null): void {
    const existingRetry = retrying.get(issue.id);
    if (existingRetry) {
      clearTimeout(existingRetry.timer);
      retrying.delete(issue.id);
    }
    claimed.add(issue.id);
    running.set(issue.id, issue);
    input.onProgress?.({ issue, attempt, status: "claimed" });
    void input.runIssue(issue, attempt).then((result) => {
      running.delete(issue.id);
      if (result.status === "normal") {
        claimed.delete(issue.id);
      } else {
        const nextAttempt = (attempt ?? 0) + 1;
        scheduleRetry(issue, nextAttempt, result.error ?? result.status, retryDelay(nextAttempt, input.maxRetryBackoffMs));
      }
    }).catch((error: unknown) => {
      running.delete(issue.id);
      const nextAttempt = (attempt ?? 0) + 1;
      scheduleRetry(issue, nextAttempt, String(error), retryDelay(nextAttempt, input.maxRetryBackoffMs));
    });
  }

  function scheduleRetry(issue: Issue, attempt: number, error: string | null, delayMs: number): void {
    input.onProgress?.({ issue, attempt, status: "retrying", error: error ?? undefined });
    const timer = setTimeout(() => {
      void retryIssue(issue.id);
    }, delayMs);
    retrying.set(issue.id, { issue, attempt, error, timer });
  }

  async function retryIssue(issueId: string): Promise<void> {
    const retry = retrying.get(issueId);
    if (!retry) return;
    retrying.delete(issueId);

    const candidates = await input.tracker.fetchCandidateIssues(input.activeStates);
    const issue = candidates.find((candidate) => candidate.id === issueId);
    if (!issue || !isEligible(issue, issueId)) {
      claimed.delete(issueId);
      return;
    }
    dispatch(issue, retry.attempt);
  }

  function isEligible(issue: Issue, allowClaimedIssueId?: string): boolean {
    if (!issue.id || !issue.identifier || !issue.title || !issue.state) return false;
    if (!input.activeStates.includes(issue.state)) return false;
    if (input.terminalStates.includes(issue.state)) return false;
    if (running.has(issue.id)) return false;
    if (claimed.has(issue.id) && issue.id !== allowClaimedIssueId) return false;
    if (running.size >= input.maxConcurrentAgents) return false;
    const stateLimit = input.maxConcurrentAgentsByState.get(issue.state.toLowerCase());
    if (stateLimit !== undefined) {
      const runningInState = [...running.values()].filter((runningIssue) => runningIssue.state === issue.state).length;
      if (runningInState >= stateLimit) return false;
    }
    if (issue.state === "Todo" && issue.blockedBy.some((blocker) => blocker.state && !input.terminalStates.includes(blocker.state))) return false;
    return true;
  }

  function snapshot() {
    return {
      counts: { running: running.size, retrying: retrying.size },
      running: [...running.values()],
      retrying: [...retrying.values()].map(({ timer, ...retry }) => retry),
    };
  }

  return { tick, snapshot };
}

function retryDelay(attempt: number, maxRetryBackoffMs = 300000): number {
  return Math.min(10000 * 2 ** Math.max(attempt - 1, 0), maxRetryBackoffMs);
}

function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const priorityA = issuePriorityWeight(a.priority);
    const priorityB = issuePriorityWeight(b.priority);
    if (priorityA !== priorityB) return priorityB - priorityA;
    const createdA = a.createdAt ?? "";
    const createdB = b.createdAt ?? "";
    if (createdA !== createdB) return createdA.localeCompare(createdB);
    return a.identifier.localeCompare(b.identifier);
  });
}
