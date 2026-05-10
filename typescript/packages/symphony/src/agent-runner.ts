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
      details: pruneUndefined({
        line: event.raw ? truncate(event.raw, 200) : undefined,
      }),
    });
    return;
  }

  if (event.channel === 'invalid_json') {
    emit('failed', {
      eventName: 'codex.invalid_json',
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
        details: summary.details,
      });
      return;
    case 'turn/started':
      emit('running_codex', {
        threadId: summary.threadId ?? null,
        turnId: summary.turnId ?? null,
        eventName: 'codex.turn.started',
        details: summary.details,
      });
      return;
    case 'turn/plan/updated':
      emit('running_codex', {
        threadId: summary.threadId ?? null,
        turnId: summary.turnId ?? null,
        eventName: 'codex.plan.updated',
        details: summary.details,
      });
      return;
    case 'turn/diff/updated':
      emit('running_codex', {
        threadId: summary.threadId ?? null,
        turnId: summary.turnId ?? null,
        eventName: 'codex.diff.updated',
        details: summary.details,
      });
      return;
    case 'item/commandExecution/outputDelta':
      emit('tool_call', {
        threadId: summary.threadId ?? null,
        turnId: summary.turnId ?? null,
        toolName: summary.toolName ?? null,
        eventName: 'codex.command.output',
        details: summary.details,
      });
      return;
    case 'item/agentMessage/delta':
      emit('running_codex', {
        threadId: summary.threadId ?? null,
        turnId: summary.turnId ?? null,
        eventName: 'codex.agent_message.delta',
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
        details: summary.details,
      });
    }
  }
}

function codexItemEvent(
  method: string,
  params: Record<string, unknown>,
): { status: RunProgressStatus; eventName: string; toolName?: string | null } | null {
  const item = asRecord(params.item);
  const itemType = readString(item?.type);
  if (!itemType) return null;

  if (method === 'item/started') {
    switch (itemType) {
      case 'commandExecution':
        return {
          status: 'tool_call',
          eventName: 'codex.command.started',
          toolName: readString(item?.command),
        };
      case 'fileChange':
        return { status: 'tool_call', eventName: 'codex.file_change.started' };
      case 'mcpToolCall':
        return {
          status: 'tool_call',
          eventName: 'codex.tool_call.started',
          toolName: readString(item?.tool) ?? readString(item?.server),
        };
      case 'dynamicToolCall':
        return {
          status: 'tool_call',
          eventName: 'codex.dynamic_tool.started',
          toolName: readString(item?.tool),
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
          toolName: readString(item?.command),
        };
      case 'fileChange':
        return { status: 'running_codex', eventName: 'codex.file_change.completed' };
      case 'mcpToolCall':
        return {
          status: 'running_codex',
          eventName: 'codex.tool_call.completed',
          toolName: readString(item?.tool) ?? readString(item?.server),
        };
      case 'dynamicToolCall':
        return {
          status: 'running_codex',
          eventName: 'codex.dynamic_tool.completed',
          toolName: readString(item?.tool),
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
      exitCode: readNumber(item?.exitCode) ?? undefined,
      durationMs: readNumber(item?.durationMs) ?? undefined,
      diff:
        typeof params.diff === 'string'
          ? params.diff.length > 0
          : fileChanges.some((change) => Boolean(readString(asRecord(change)?.diff))),
      error: readString(error?.message) ?? undefined,
      codexErrorInfo: asRecord(error?.codexErrorInfo) ?? undefined,
      outputPreview: firstString(params.delta, item?.aggregatedOutput)
        ? truncate(firstString(params.delta, item?.aggregatedOutput) ?? '', 200)
        : undefined,
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
