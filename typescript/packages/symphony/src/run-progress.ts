export type RunProgressStatus =
  | "claimed"
  | "preparing_workspace"
  | "running_hooks"
  | "running_codex"
  | "tool_call"
  | "completed"
  | "failed"
  | "retrying";

export interface RunProgressIssue {
  id: string;
  identifier: string;
  title: string;
}

export interface RunProgressEventInput {
  issue: RunProgressIssue;
  attempt: number | null;
  status: RunProgressStatus;
  message?: string;
  error?: string;
  threadId?: string | null;
  turnId?: string | null;
  toolName?: string | null;
}

export interface RunProgressEvent {
  id: number;
  issueId: string;
  identifier: string;
  title: string;
  attempt: number | null;
  status: RunProgressStatus;
  message: string | null;
  error: string | null;
  threadId: string | null;
  turnId: string | null;
  toolName: string | null;
  createdAt: string;
}

export interface RunProgress {
  issueId: string;
  identifier: string;
  title: string;
  attempt: number | null;
  status: RunProgressStatus;
  message: string | null;
  error: string | null;
  threadId: string | null;
  turnId: string | null;
  toolName: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface RunProgressSnapshot {
  runs: RunProgress[];
  events: RunProgressEvent[];
}

export function createRunProgressTracker(input: { clock?: () => string } = {}) {
  const clock = input.clock ?? (() => new Date().toISOString());
  const runs = new Map<string, RunProgress>();
  const events: RunProgressEvent[] = [];
  let nextEventId = 1;

  function record(eventInput: RunProgressEventInput): RunProgressEvent {
    const now = clock();
    const previous = runs.get(eventInput.issue.id);
    const event: RunProgressEvent = {
      id: nextEventId++,
      issueId: eventInput.issue.id,
      identifier: eventInput.issue.identifier,
      title: eventInput.issue.title,
      attempt: eventInput.attempt,
      status: eventInput.status,
      message: eventInput.message ?? null,
      error: eventInput.error ?? null,
      threadId: eventInput.threadId ?? previous?.threadId ?? null,
      turnId: eventInput.turnId ?? previous?.turnId ?? null,
      toolName: eventInput.toolName ?? null,
      createdAt: now,
    };
    events.push(event);
    runs.set(event.issueId, {
      issueId: event.issueId,
      identifier: event.identifier,
      title: event.title,
      attempt: event.attempt,
      status: event.status,
      message: event.message,
      error: event.error,
      threadId: event.threadId,
      turnId: event.turnId,
      toolName: event.toolName,
      startedAt: previous?.startedAt ?? now,
      updatedAt: now,
      finishedAt: isTerminal(event.status) ? now : null,
    });
    return event;
  }

  function snapshot(): RunProgressSnapshot {
    return {
      runs: [...runs.values()],
      events: [...events],
    };
  }

  return { record, snapshot };
}

function isTerminal(status: RunProgressStatus): boolean {
  return status === "completed" || status === "failed";
}
