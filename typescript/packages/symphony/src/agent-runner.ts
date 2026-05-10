import type { Issue } from "@symphony/core";
import { renderPrompt } from "./prompt-renderer.js";
import { createWorkspaceForIssue } from "./workspace-manager.js";
import { runHook } from "./hook-runner.js";
import { runAppServerTurn, type AppServerEvent } from './codex-app-server.js';
import type { EffectiveConfig } from "./config.js";
import { executeLinearGraphqlTool } from "./dynamic-tools.js";
import type { RunProgressEventInput, RunProgressStatus } from "./run-progress.js";

export async function runAgentAttempt(input: {
  issue: Issue;
  attempt: number | null;
  workflowPrompt: string;
  config: EffectiveConfig;
  onProgress?: (event: RunProgressEventInput) => void;
}): Promise<{ status: 'normal' | 'failed'; error?: string }> {
  const emit = (status: RunProgressStatus, extra: Partial<RunProgressEventInput> = {}) => {
    input.onProgress?.({ issue: input.issue, attempt: input.attempt, status, ...extra });
  };

  emit('preparing_workspace');
  const workspace = await createWorkspaceForIssue({
    root: input.config.workspace.root,
    issue: input.issue,
  });
  const hookEnv = buildHookEnv({
    issue: input.issue,
    attempt: input.attempt,
    workspace,
  });
  if (workspace.createdNow) {
    emit('running_hooks', { message: 'after_create' });
    const afterCreate = await runHook({
      script: input.config.hooks.afterCreate,
      cwd: workspace.path,
      env: hookEnv,
      timeoutMs: input.config.hooks.timeoutMs,
    });
    if (!afterCreate.ok) {
      const error = formatHookFailure('after_create', afterCreate);
      emit('failed', { error });
      return { status: 'failed', error };
    }
  }

  emit('running_hooks', { message: 'before_run' });
  const beforeRun = await runHook({
    script: input.config.hooks.beforeRun,
    cwd: workspace.path,
    env: hookEnv,
    timeoutMs: input.config.hooks.timeoutMs,
  });
  if (!beforeRun.ok) {
    const error = formatHookFailure('before_run', beforeRun);
    emit('failed', { error });
    return { status: 'failed', error };
  }

  const prompt = await renderPrompt(input.workflowPrompt, {
    issue: input.issue,
    attempt: input.attempt,
  });
  emit('running_codex');
  const turn = await runAppServerTurn({
    command: input.config.codex.command,
    cwd: workspace.path,
    prompt,
    timeoutMs: input.config.codex.turnTimeoutMs,
    readTimeoutMs: input.config.codex.readTimeoutMs,
    approvalPolicy: input.config.codex.approvalPolicy,
    threadSandbox: input.config.codex.threadSandbox,
    turnSandboxPolicy: input.config.codex.turnSandboxPolicy,
    onEvent: (event) => forwardCodexEvent(event, emit),
    executeTool: async (call) => {
      if (call.name !== 'linear_graphql') {
        return {
          success: false,
          error: { code: 'unsupported_tool', message: `Unsupported tool: ${call.name}` },
        };
      }
      return executeLinearGraphqlTool(call.arguments, {
        endpoint: input.config.tracker.endpoint,
        apiKey: input.config.tracker.apiKey ?? null,
        fetch,
      });
    },
  });

  emit('running_hooks', { message: 'after_run', threadId: turn.threadId, turnId: turn.turnId });
  await runHook({
    script: input.config.hooks.afterRun,
    cwd: workspace.path,
    env: hookEnv,
    timeoutMs: input.config.hooks.timeoutMs,
  });
  if (turn.status === 'completed') {
    emit('completed', { threadId: turn.threadId, turnId: turn.turnId });
    return { status: 'normal' };
  }
  emit('failed', {
    threadId: turn.threadId,
    turnId: turn.turnId,
    error: turn.error ?? turn.status,
    eventName: turn.status === 'timed_out' ? 'codex.turn.timed_out' : 'codex.turn.failed',
  });
  return { status: 'failed', error: turn.error ?? turn.status };
}

function buildHookEnv(input: {
  issue: Issue;
  attempt: number | null;
  workspace: { path: string; workspaceKey: string; createdNow: boolean };
}): Record<string, string | undefined> {
  return {
    SYMPHONY_WORKSPACE_PATH: input.workspace.path,
    SYMPHONY_WORKSPACE_KEY: input.workspace.workspaceKey,
    SYMPHONY_WORKSPACE_CREATED_NOW: input.workspace.createdNow ? '1' : '0',
    SYMPHONY_ISSUE_ID: input.issue.id,
    SYMPHONY_ISSUE_IDENTIFIER: input.issue.identifier,
    SYMPHONY_ISSUE_TITLE: input.issue.title,
    SYMPHONY_ISSUE_DESCRIPTION: input.issue.description ?? undefined,
    SYMPHONY_ISSUE_STATE: input.issue.state,
    SYMPHONY_ISSUE_BRANCH_NAME: input.issue.branchName ?? undefined,
    SYMPHONY_ISSUE_URL: input.issue.url ?? undefined,
    SYMPHONY_ISSUE_PRIORITY:
      typeof input.issue.priority === 'string' ? input.issue.priority : undefined,
    SYMPHONY_PROJECT_SLUG: input.issue.project?.slugId ?? undefined,
    SYMPHONY_PROJECT_NAME: input.issue.project?.name ?? undefined,
    SYMPHONY_PROJECT_WORKSPACE_KIND: input.issue.project?.workspace.kind ?? undefined,
    SYMPHONY_PROJECT_LOCAL_PATH: input.issue.project?.workspace.localPath ?? undefined,
    SYMPHONY_PROJECT_REMOTE_URL: input.issue.project?.workspace.remoteUrl ?? undefined,
    SYMPHONY_PROJECT_BASE_BRANCH: input.issue.project?.workspace.baseBranch ?? undefined,
    SYMPHONY_ATTEMPT: input.attempt === null ? undefined : String(input.attempt),
  };
}

function forwardCodexEvent(
  event: AppServerEvent,
  emit: (status: RunProgressStatus, extra?: Partial<RunProgressEventInput>) => void,
): void {
  if (event.channel === 'stderr') {
    emit('running_codex', {
      eventName: 'codex.stderr',
      message: event.raw ? `Codex stderr: ${truncate(event.raw, 120)}` : 'Codex emitted stderr.',
      details: pruneUndefined({
        line: event.raw ? truncate(event.raw, 200) : undefined,
      }),
    });
    return;
  }

  if (event.channel === 'invalid_json') {
    emit('failed', {
      eventName: 'codex.invalid_json',
      message: 'Codex emitted invalid JSON.',
      error: 'Received invalid JSON from Codex app-server.',
      details: pruneUndefined({
        raw: event.raw ? truncate(event.raw, 200) : undefined,
      }),
    });
    return;
  }

  const method = event.method;
  if (!method) return;
  const params = event.params ?? {};
  const summary = summarizeCodexPayload(method, params);

  if (event.channel === 'request') {
    if (
      method === 'item/commandExecution/requestApproval' ||
      method === 'item/fileChange/requestApproval' ||
      method === 'item/tool/requestUserInput'
    ) {
      emit('failed', {
        threadId: summary.threadId ?? null,
        turnId: summary.turnId ?? null,
        toolName: summary.toolName ?? null,
        eventName: 'codex.approval.unsupported',
        message: approvalRequestMessage(method, summary.details),
        error: `Unsupported approval flow: ${method}`,
        details: summary.details,
      });
    }
    return;
  }

  switch (method) {
    case 'thread/started':
      emit('running_codex', {
        threadId: summary.threadId ?? null,
        turnId: summary.turnId ?? null,
        eventName: 'codex.thread.started',
        message: 'Thread started.',
        details: summary.details,
      });
      return;
    case 'thread/status/changed':
      emit('running_codex', {
        threadId: summary.threadId ?? null,
        turnId: summary.turnId ?? null,
        eventName: 'codex.thread.status.changed',
        message: threadStatusMessage(summary.details),
        details: summary.details,
      });
      return;
    case 'turn/started':
      emit('running_codex', {
        threadId: summary.threadId ?? null,
        turnId: summary.turnId ?? null,
        eventName: 'codex.turn.started',
        message: 'Turn started.',
        details: summary.details,
      });
      return;
    case 'turn/plan/updated':
      emit('running_codex', {
        threadId: summary.threadId ?? null,
        turnId: summary.turnId ?? null,
        eventName: 'codex.plan.updated',
        message: planUpdatedMessage(summary.details),
        details: summary.details,
      });
      return;
    case 'turn/diff/updated':
      emit('running_codex', {
        threadId: summary.threadId ?? null,
        turnId: summary.turnId ?? null,
        eventName: 'codex.diff.updated',
        message: diffUpdatedMessage(summary.details),
        details: summary.details,
      });
      return;
    case 'turn/completed': {
      const terminalEvent = completedTurnEventName(params);
      const terminalStatus = terminalEvent === 'codex.turn.completed' ? 'completed' : 'failed';
      emit(terminalStatus, {
        threadId: summary.threadId ?? null,
        turnId: summary.turnId ?? null,
        eventName: terminalEvent,
        message: turnCompletedMessage(terminalEvent, summary.error),
        error: terminalStatus === 'failed' ? (summary.error ?? undefined) : undefined,
        details: summary.details,
      });
      return;
    }
    case 'error':
      emit('failed', {
        threadId: summary.threadId ?? null,
        turnId: summary.turnId ?? null,
        eventName: 'codex.error',
        message: codexErrorMessage(summary.error, summary.details),
        error: summary.error ?? 'Codex app-server reported an error.',
        details: summary.details,
      });
      return;
    default: {
      const itemEvent = codexItemEvent(method, params);
      if (!itemEvent) return;
      emit(itemEvent.status, {
        threadId: summary.threadId ?? null,
        turnId: summary.turnId ?? null,
        toolName: itemEvent.toolName ?? summary.toolName ?? null,
        eventName: itemEvent.eventName,
        message: itemEvent.message,
        details: summary.details,
      });
    }
  }
}

function codexItemEvent(
  method: string,
  params: Record<string, unknown>,
): {
  status: RunProgressStatus;
  eventName: string;
  toolName?: string | null;
  message: string;
} | null {
  const item = asRecord(params.item);
  const itemType = readString(item?.type);
  if (!itemType) return null;
  const command = readString(item?.command);
  const toolName = readString(item?.tool) ?? readString(item?.server);
  const itemStatus = readString(item?.status);
  const exitCode = readNumber(item?.exitCode);
  const durationMs = readNumber(item?.durationMs);

  if (method === 'item/started') {
    switch (itemType) {
      case 'commandExecution':
        return {
          status: 'tool_call',
          eventName: 'codex.command.started',
          toolName: command,
          message: `Running command: ${command ?? 'unknown command'}`,
        };
      case 'fileChange':
        return {
          status: 'tool_call',
          eventName: 'codex.file_change.started',
          message: 'Preparing file changes.',
        };
      case 'mcpToolCall':
        return {
          status: 'tool_call',
          eventName: 'codex.tool_call.started',
          toolName,
          message: `Calling tool: ${toolName ?? 'unknown tool'}`,
        };
      case 'dynamicToolCall':
        return {
          status: 'tool_call',
          eventName: 'codex.dynamic_tool.started',
          toolName,
          message: `Calling dynamic tool: ${toolName ?? 'unknown tool'}`,
        };
      default:
        return null;
    }
  }

  if (method === 'item/completed') {
    switch (itemType) {
      case 'commandExecution':
        return {
          status: 'running_codex',
          eventName: 'codex.command.completed',
          toolName: command,
          message: commandCompletedMessage(itemStatus, exitCode, durationMs),
        };
      case 'fileChange':
        return {
          status: 'running_codex',
          eventName: 'codex.file_change.completed',
          message: fileChangeCompletedMessage(itemStatus),
        };
      case 'mcpToolCall':
        return {
          status: 'running_codex',
          eventName: 'codex.tool_call.completed',
          toolName,
          message: toolCallCompletedMessage(toolName, itemStatus),
        };
      case 'dynamicToolCall':
        return {
          status: 'running_codex',
          eventName: 'codex.dynamic_tool.completed',
          toolName,
          message: dynamicToolCompletedMessage(toolName, itemStatus),
        };
      default:
        return null;
    }
  }

  return null;
}

function summarizeCodexPayload(
  method: string,
  params: Record<string, unknown>,
): {
  threadId?: string;
  turnId?: string;
  toolName?: string;
  error?: string;
  details: Record<string, unknown>;
} {
  const turn = asRecord(params.turn);
  const thread = asRecord(params.thread);
  const item = asRecord(params.item);
  const error = asRecord(params.error) ?? asRecord(turn?.error);
  const itemType = readString(item?.type);
  const fileChanges = Array.isArray(item?.changes) ? item.changes : [];

  return {
    threadId: firstString(params.threadId, thread?.id, item?.threadId, turn?.threadId) ?? undefined,
    turnId: firstString(params.turnId, turn?.id, item?.turnId) ?? undefined,
    toolName:
      firstString(item?.tool, item?.server, params.tool, params.name, item?.command) ?? undefined,
    error: readString(error?.message) ?? undefined,
    details: pruneUndefined({
      method,
      threadId:
        firstString(params.threadId, thread?.id, item?.threadId, turn?.threadId) ?? undefined,
      turnId: firstString(params.turnId, turn?.id, item?.turnId) ?? undefined,
      itemId: firstString(item?.id, params.itemId) ?? undefined,
      itemType: itemType ?? undefined,
      itemStatus: readString(item?.status) ?? undefined,
      command: firstString(item?.command, params.command) ?? undefined,
      cwd: firstString(item?.cwd, params.cwd) ?? undefined,
      tool: firstString(item?.tool, item?.server, params.tool, params.name) ?? undefined,
      exitCode: readNumber(item?.exitCode) ?? undefined,
      durationMs: readNumber(item?.durationMs) ?? undefined,
      activeFlags: readActiveFlags(params.status) ?? undefined,
      reason: readString(params.reason) ?? undefined,
      diff:
        typeof params.diff === 'string'
          ? params.diff.length > 0
          : fileChanges.some((change) => Boolean(readString(asRecord(change)?.diff))),
      error: readString(error?.message) ?? undefined,
      codexErrorInfo: asRecord(error?.codexErrorInfo) ?? undefined,
      additionalDetails: error?.additionalDetails ?? undefined,
      plan: Array.isArray(params.plan) ? params.plan : undefined,
    }),
  };
}

function completedTurnEventName(params: Record<string, unknown>): string {
  const status = readString(asRecord(params.turn)?.status) ?? 'completed';
  switch (status) {
    case 'completed':
      return 'codex.turn.completed';
    case 'interrupted':
      return 'codex.turn.interrupted';
    default:
      return 'codex.turn.failed';
  }
}

function approvalRequestMessage(method: string, details: Record<string, unknown>): string {
  const command = readString(details.command);
  switch (method) {
    case 'item/commandExecution/requestApproval':
      return command
        ? `Approval requested for command: ${command}`
        : 'Approval requested for command execution.';
    case 'item/fileChange/requestApproval':
      return 'Approval requested for file changes.';
    default:
      return 'Codex requested operator input.';
  }
}

function threadStatusMessage(details: Record<string, unknown>): string {
  const activeFlags = readStringArray(details.activeFlags);
  if (!activeFlags || activeFlags.length === 0) {
    return 'Thread status updated.';
  }
  return `Thread status updated: ${activeFlags.join(', ')}`;
}

function planUpdatedMessage(details: Record<string, unknown>): string {
  const plan = Array.isArray(details.plan) ? details.plan : [];
  if (plan.length === 0) {
    return 'Plan updated.';
  }
  return `Plan updated (${plan.length} steps).`;
}

function diffUpdatedMessage(details: Record<string, unknown>): string {
  return details.diff === true ? 'Diff updated with file changes.' : 'Diff updated.';
}

function turnCompletedMessage(eventName: string, error: string | undefined): string {
  switch (eventName) {
    case 'codex.turn.completed':
      return 'Turn completed.';
    case 'codex.turn.interrupted':
      return error ? `Turn interrupted: ${error}` : 'Turn interrupted.';
    default:
      return error ? `Turn failed: ${error}` : 'Turn failed.';
  }
}

function codexErrorMessage(error: string | undefined, details: Record<string, unknown>): string {
  const codexErrorInfo = asRecord(details.codexErrorInfo);
  const type = readString(codexErrorInfo?.type);
  const httpStatusCode = readNumber(codexErrorInfo?.httpStatusCode);
  const prefix = [type, httpStatusCode === null ? null : `HTTP ${httpStatusCode}`]
    .filter((value): value is string => Boolean(value))
    .join(' / ');
  if (prefix && error) return `${prefix}: ${error}`;
  if (prefix) return prefix;
  return error ?? 'Codex app-server reported an error.';
}

function commandCompletedMessage(
  status: string | null,
  exitCode: number | null,
  durationMs: number | null,
): string {
  if (status === 'declined') return 'Command declined.';
  if (status === 'failed') {
    const parts = [
      exitCode === null ? null : `exit ${exitCode}`,
      durationMs === null ? null : `${durationMs}ms`,
    ].filter((value): value is string => Boolean(value));
    return parts.length > 0 ? `Command failed (${parts.join(', ')}).` : 'Command failed.';
  }
  const segments = [
    exitCode === null ? null : `exit ${exitCode}`,
    durationMs === null ? null : `${durationMs}ms`,
  ].filter((value): value is string => Boolean(value));
  if (segments.length === 0) return 'Command finished.';
  return `Command finished with ${segments.join(' in ')}.`;
}

function fileChangeCompletedMessage(status: string | null): string {
  switch (status) {
    case 'declined':
      return 'File changes declined.';
    case 'failed':
      return 'File changes failed.';
    default:
      return 'Applied file changes.';
  }
}

function toolCallCompletedMessage(toolName: string | null, status: string | null): string {
  const name = toolName ?? 'unknown tool';
  switch (status) {
    case 'failed':
      return `Tool failed: ${name}`;
    case 'declined':
      return `Tool declined: ${name}`;
    default:
      return `Tool completed: ${name}`;
  }
}

function dynamicToolCompletedMessage(toolName: string | null, status: string | null): string {
  const name = toolName ?? 'unknown tool';
  switch (status) {
    case 'failed':
      return `Dynamic tool failed: ${name}`;
    case 'declined':
      return `Dynamic tool declined: ${name}`;
    default:
      return `Dynamic tool completed: ${name}`;
  }
}

function pruneUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length > 0 ? strings : null;
}

function readActiveFlags(value: unknown): string[] | null {
  return readStringArray(asRecord(value)?.activeFlags);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') return value;
  }
  return null;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function formatHookFailure(
  hookName: string,
  result: {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  },
): string {
  const output = firstNonEmptyLine(result.stderr) ?? firstNonEmptyLine(result.stdout);
  const suffix = output
    ? `: ${truncate(output, 200)}`
    : result.timedOut
      ? ' (timed out)'
      : result.exitCode === null
        ? ''
        : ` (exit ${result.exitCode})`;
  return `${hookName} hook failed${suffix}`;
}

function firstNonEmptyLine(value: string): string | null {
  for (const line of value.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}
