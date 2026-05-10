import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { getDynamicToolSpecs } from './dynamic-tools.js';

export interface AppServerTurnResult {
  threadId: string | null;
  turnId: string | null;
  status: 'completed' | 'failed' | 'timed_out';
  error: string | null;
}

export interface AppServerToolCall {
  name: string | null;
  arguments: unknown;
  callId: string | null;
  threadId: string | null;
  turnId: string | null;
}

export interface AppServerEvent {
  channel: 'notification' | 'request' | 'stderr' | 'invalid_json';
  method?: string;
  params?: Record<string, unknown>;
  raw?: string;
}

export function runAppServerTurn(input: {
  command: string;
  cwd: string;
  prompt: string;
  timeoutMs: number;
  readTimeoutMs?: number;
  approvalPolicy?: string;
  threadSandbox?: string;
  turnSandboxPolicy?: Record<string, unknown> | string;
  executeTool?: (call: AppServerToolCall) => Promise<unknown>;
  onEvent?: (event: AppServerEvent) => void;
}): Promise<AppServerTurnResult> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', input.command], {
      cwd: input.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let threadId: string | null = null;
    let turnId: string | null = null;
    let settled = false;
    let finishedTurn = false;
    const pending = new Map<
      number,
      {
        method: string;
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >();
    const stderrLines: string[] = [];
    const stdout = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const stderr = createInterface({ input: child.stderr, crlfDelay: Infinity });
    let nextRequestId = 0;
    const timer = setTimeout(() => {
      finalize('timed_out', `Codex app-server turn timed out after ${input.timeoutMs}ms.`, true);
    }, input.timeoutMs);

    stdout.on('line', (line) => {
      void handleStdoutLine(line);
    });
    stderr.on('line', (line) => {
      stderrLines.push(line);
      if (stderrLines.length > 50) stderrLines.shift();
      input.onEvent?.({ channel: 'stderr', raw: line });
    });
    child.stdin.on('error', (error) => {
      if (settled) return;
      finalize('failed', `Failed to write to Codex app-server stdin: ${String(error)}`, false);
    });
    child.on('error', (error) => {
      if (settled) return;
      finalize('failed', `Failed to start Codex app-server: ${String(error)}`, false);
    });
    child.on('close', (code) => {
      if (settled) return;
      if (finishedTurn) {
        finalize('completed', null, false);
        return;
      }
      finalize('failed', describeProcessExit(code, stderrLines), false);
    });

    void startTurn();

    function finalize(
      status: AppServerTurnResult['status'],
      error: string | null,
      killChild: boolean,
    ): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stdout.close();
      stderr.close();
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error(error ?? `Codex app-server ${status}.`));
      }
      pending.clear();
      if (killChild && child.exitCode === null && !child.killed) {
        child.kill('SIGTERM');
      }
      resolve({ threadId, turnId, status, error });
    }

    function sendMessage(message: Record<string, unknown>): void {
      if (settled || child.stdin.destroyed) return;
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    function sendNotification(method: string, params: Record<string, unknown> = {}): void {
      sendMessage({ method, params });
    }

    function sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
      if (settled) {
        return Promise.reject(new Error('Codex app-server session already settled.'));
      }
      const id = nextRequestId++;
      const timeoutMs = input.readTimeoutMs ?? 5000;
      sendMessage({ method, id, params });
      return new Promise((requestResolve, requestReject) => {
        const requestTimer = setTimeout(() => {
          pending.delete(id);
          requestReject(new Error(`Timed out waiting for Codex app-server response to ${method}.`));
        }, timeoutMs);
        pending.set(id, {
          method,
          resolve: requestResolve,
          reject: requestReject,
          timer: requestTimer,
        });
      });
    }

    async function startTurn(): Promise<void> {
      try {
        await sendRequest('initialize', {
          clientInfo: {
            name: 'symphony',
            title: 'Symphony',
            version: '0.1.0',
          },
          capabilities: {
            experimentalApi: true,
          },
        });
        sendNotification('initialized', {});
        const threadResult = asRecord(
          await sendRequest('thread/start', {
            cwd: input.cwd,
            approvalPolicy: input.approvalPolicy ?? 'never',
            sandbox: normalizeThreadSandbox(input.threadSandbox),
            serviceName: 'symphony',
            dynamicTools: getDynamicToolSpecs(),
          }),
        );
        threadId = readThreadId(threadResult) ?? threadId;
        const turnResult = asRecord(
          await sendRequest('turn/start', {
            threadId,
            input: [{ type: 'text', text: input.prompt }],
            cwd: input.cwd,
            approvalPolicy: input.approvalPolicy ?? 'never',
            sandboxPolicy: normalizeTurnSandboxPolicy(input.turnSandboxPolicy, input.cwd),
          }),
        );
        turnId = readTurnId(turnResult) ?? turnId;
      } catch (error) {
        finalize('failed', normalizeError(error), true);
      }
    }

    async function handleStdoutLine(line: string): Promise<void> {
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        input.onEvent?.({ channel: 'invalid_json', raw: line });
        finalize(
          'failed',
          `Received invalid JSON from Codex app-server stdout: ${truncate(line, 200)}`,
          true,
        );
        return;
      }

      const payload = asRecord(message);
      if (!payload) {
        input.onEvent?.({ channel: 'invalid_json', raw: line });
        finalize('failed', 'Received non-object JSON from Codex app-server stdout.', true);
        return;
      }

      updateIdsFromPayload(payload);

      if (isResponse(payload)) {
        handleResponse(payload);
        return;
      }

      if (isRequest(payload)) {
        input.onEvent?.({
          channel: 'request',
          method: readString(payload.method) ?? undefined,
          params: asRecord(payload.params) ?? undefined,
          raw: line,
        });
        await handleServerRequest(payload);
        return;
      }

      if (isNotification(payload)) {
        const method = readString(payload.method) ?? undefined;
        const params = asRecord(payload.params) ?? undefined;
        input.onEvent?.({ channel: 'notification', method, params, raw: line });
        if (method === 'turn/completed') {
          handleTurnCompleted(params);
          return;
        }
        if (method === 'error') {
          // Keep streaming in case the server also emits a terminal turn event, but remember the failure.
          if (!finishedTurn) {
            threadId = readString(params?.threadId) ?? threadId;
            turnId = readString(params?.turnId) ?? turnId;
          }
          return;
        }
      }
    }

    function handleResponse(payload: Record<string, unknown>): void {
      const id = typeof payload.id === 'number' ? payload.id : Number.NaN;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      clearTimeout(entry.timer);
      if (payload.error) {
        const error = asRecord(payload.error);
        entry.reject(
          new Error(
            `Codex app-server ${entry.method} failed: ${readString(error?.message) ?? 'unknown error'}`,
          ),
        );
        return;
      }
      entry.resolve(payload.result);
    }

    async function handleServerRequest(payload: Record<string, unknown>): Promise<void> {
      const method = readString(payload.method);
      const id = typeof payload.id === 'number' ? payload.id : null;
      const params = asRecord(payload.params) ?? {};
      if (!method || id === null) return;

      if (method === 'item/tool/call') {
        const toolName = readString(params.name) ?? readString(params.tool) ?? null;
        const call: AppServerToolCall = {
          name: toolName,
          arguments: params.arguments,
          callId: readString(params.callId) ?? null,
          threadId: readString(params.threadId) ?? threadId,
          turnId: readString(params.turnId) ?? turnId,
        };
        let result: unknown;
        try {
          result = input.executeTool
            ? await input.executeTool(call)
            : {
                success: false,
                error: {
                  code: 'unsupported_tool',
                  message: `Unsupported dynamic tool: ${toolName ?? 'unknown'}.`,
                },
              };
        } catch (error) {
          result = {
            success: false,
            error: { code: 'tool_execution_error', message: normalizeError(error) },
          };
        }
        sendMessage({ id, result: normalizeDynamicToolResult(result) });
        return;
      }

      if (
        method === 'item/commandExecution/requestApproval' ||
        method === 'item/fileChange/requestApproval'
      ) {
        if (!settled && !child.stdin.destroyed) {
          child.stdin.write(`${JSON.stringify({ id, result: { decision: 'decline' } })}\n`, () =>
            finalize('failed', `Codex requested unsupported approval flow (${method}).`, true),
          );
        }
        return;
      }

      if (method === 'item/tool/requestUserInput') {
        finalize(
          'failed',
          'Codex requested unsupported operator input flow (item/tool/requestUserInput).',
          true,
        );
        return;
      }
    }

    function handleTurnCompleted(params: Record<string, unknown> | undefined): void {
      const turn = asRecord(params?.turn);
      const status = readString(turn?.status) ?? 'completed';
      threadId = readString(turn?.threadId) ?? readString(params?.threadId) ?? threadId;
      turnId = readString(turn?.id) ?? readString(params?.turnId) ?? turnId;
      finishedTurn = status === 'completed';
      if (status === 'completed') {
        finalize('completed', null, true);
        return;
      }
      if (status === 'failed') {
        const errorMessage =
          readString(asRecord(turn?.error)?.message) ??
          readString(asRecord(params?.error)?.message) ??
          'Codex turn failed.';
        finalize('failed', errorMessage, true);
        return;
      }
      if (status === 'interrupted') {
        finalize('failed', 'Codex turn was interrupted.', true);
        return;
      }
      finalize('failed', `Codex turn ended with unexpected status: ${status}.`, true);
    }

    function updateIdsFromPayload(payload: Record<string, unknown>): void {
      const params = asRecord(payload.params);
      const result = asRecord(payload.result);
      const turn = asRecord(params?.turn);
      const thread = asRecord(params?.thread);
      const item = asRecord(params?.item);
      const resultTurn = asRecord(result?.turn);
      const resultThread = asRecord(result?.thread);
      const resultItem = asRecord(result?.item);
      threadId =
        firstString(
          params?.threadId,
          result?.threadId,
          thread?.id,
          resultThread?.id,
          resultThread?.threadId,
          item?.threadId,
          resultItem?.threadId,
        ) ?? threadId;
      turnId =
        firstString(
          params?.turnId,
          result?.turnId,
          turn?.id,
          resultTurn?.id,
          item?.turnId,
          resultItem?.turnId,
        ) ?? turnId;
    }
  });
}

export const runFakeAppServerTurn = runAppServerTurn;

function isResponse(payload: Record<string, unknown>): boolean {
  return payload.id !== undefined && (payload.result !== undefined || payload.error !== undefined);
}

function isRequest(payload: Record<string, unknown>): boolean {
  return payload.id !== undefined && typeof payload.method === 'string';
}

function isNotification(payload: Record<string, unknown>): boolean {
  return payload.id === undefined && typeof payload.method === 'string';
}

function normalizeThreadSandbox(value: string | undefined): string {
  switch (value) {
    case 'read-only':
    case 'readOnly':
      return 'read-only';
    case 'workspace-write':
    case 'workspaceWrite':
      return 'workspace-write';
    case 'danger-full-access':
    case 'dangerFullAccess':
      return 'danger-full-access';
    default:
      return value ?? 'workspace-write';
  }
}

function normalizeTurnSandboxPolicy(
  value: Record<string, unknown> | string | undefined,
  cwd: string,
): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  switch (value) {
    case 'read-only':
    case 'readOnly':
      return { type: 'readOnly' };
    case 'danger-full-access':
    case 'dangerFullAccess':
      return { type: 'dangerFullAccess' };
    default:
      return {
        type: 'workspaceWrite',
        writableRoots: [cwd],
        networkAccess: true,
      };
  }
}

function normalizeDynamicToolResult(result: unknown): Record<string, unknown> {
  const normalized = asRecord(result);
  if (!normalized || typeof normalized.success !== 'boolean') {
    const output = safeJsonStringify(result);
    return {
      success: false,
      output,
      contentItems: [{ type: 'inputText', text: output }],
    };
  }

  const output = readString(normalized.output) ?? dynamicToolOutput(normalized);
  const contentItems = Array.isArray(normalized.contentItems)
    ? normalized.contentItems
    : [{ type: 'inputText', text: output }];
  return {
    ...normalized,
    output,
    contentItems,
  };
}

function dynamicToolOutput(result: Record<string, unknown>): string {
  const body = result.body;
  if (body !== undefined) return safeJsonStringify(body);
  const error = result.error;
  if (error !== undefined) return safeJsonStringify(error);
  return safeJsonStringify(result);
}

function describeProcessExit(code: number | null, stderrLines: string[]): string {
  const stderrPreview =
    stderrLines.length > 0 ? ` Stderr: ${truncate(stderrLines.join(' | '), 300)}` : '';
  if (code === 127 || stderrLines.some((line) => line.includes('command not found'))) {
    return `Codex command not found or failed to launch.${stderrPreview}`;
  }
  if (code === 0) {
    return `Codex app-server exited before the turn completed.${stderrPreview}`;
  }
  return `Codex app-server exited before the turn completed with code ${code ?? 'unknown'}.${stderrPreview}`;
}

function readThreadId(result: Record<string, unknown> | null): string | null {
  if (!result) return null;
  return firstString(result.threadId, asRecord(result.thread)?.id, result.id);
}

function readTurnId(result: Record<string, unknown> | null): string | null {
  if (!result) return null;
  return firstString(result.turnId, asRecord(result.turn)?.id, result.id);
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

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') return value;
  }
  return null;
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeJsonStringify(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return typeof json === 'string' ? json : String(value);
  } catch {
    return String(value);
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
