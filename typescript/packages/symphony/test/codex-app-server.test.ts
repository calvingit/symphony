import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAppServerTurn, runFakeAppServerTurn } from '../src/codex-app-server.js';

describe('codex app-server client', () => {
  it('sends initialize, initialized, thread/start, and turn/start in order', async () => {
    const server = await createFakeAppServer(`
count=0
while IFS= read -r line; do
  count=$((count + 1))
  printf 'JSON:%s\n' "$line" >> "$TRACE_FILE"
  case "$count" in
    1)
      printf '%s\n' '{"id":0,"result":{}}'
      ;;
    2)
      ;;
    3)
      printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-1"}}}'
      ;;
    4)
      printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-1","status":"inProgress"}}}'
      printf '%s\n' '{"method":"thread/started","params":{"thread":{"id":"thread-1"}}}'
      printf '%s\n' '{"method":"turn/started","params":{"threadId":"thread-1","turn":{"id":"turn-1","status":"inProgress"}}}'
      printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-1","turn":{"id":"turn-1","status":"completed"}}}'
      exit 0
      ;;
  esac
done
`);

    const result = await runFakeAppServerTurn({
      command: server.command,
      cwd: server.cwd,
      prompt: 'work',
      timeoutMs: 1000,
      readTimeoutMs: 1000,
    });

    const messages = await readTraceMessages(server.traceFile);
    expect(messages.map((message) => message.method)).toEqual([
      'initialize',
      'initialized',
      'thread/start',
      'turn/start',
    ]);
    expect(messages[2]?.params?.dynamicTools).toEqual([
      expect.objectContaining({
        name: 'linear_graphql',
        inputSchema: expect.objectContaining({
          required: ['query'],
        }),
      }),
    ]);
    expect(result).toMatchObject({
      status: 'completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      error: null,
    });
  });

  it('executes dynamic tool calls and returns normalized JSON-RPC results', async () => {
    const server = await createFakeAppServer(`
count=0
while IFS= read -r line; do
  count=$((count + 1))
  printf 'JSON:%s\n' "$line" >> "$TRACE_FILE"
  case "$count" in
    1)
      printf '%s\n' '{"id":0,"result":{}}'
      ;;
    2)
      ;;
    3)
      printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-2"}}}'
      ;;
    4)
      printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-2","status":"inProgress"}}}'
      printf '%s\n' '{"id":99,"method":"item/tool/call","params":{"name":"linear_graphql","callId":"call-1","threadId":"thread-2","turnId":"turn-2","arguments":{"query":"query Viewer { viewer { id } }"}}}'
      ;;
    5)
      printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-2","turn":{"id":"turn-2","status":"completed"}}}'
      exit 0
      ;;
  esac
done
`);

    const result = await runAppServerTurn({
      command: server.command,
      cwd: server.cwd,
      prompt: 'work',
      timeoutMs: 1000,
      readTimeoutMs: 1000,
      executeTool: async (call) => ({
        success: true,
        body: { data: { viewer: { id: 'usr_123' } }, tool: call.name },
      }),
    });

    const messages = await readTraceMessages(server.traceFile);
    const toolResult = messages.find((message) => message.id === 99);
    expect(toolResult).toMatchObject({
      id: 99,
      result: {
        success: true,
        output: JSON.stringify({ data: { viewer: { id: 'usr_123' } }, tool: 'linear_graphql' }),
        contentItems: [
          {
            type: 'inputText',
            text: JSON.stringify({ data: { viewer: { id: 'usr_123' } }, tool: 'linear_graphql' }),
          },
        ],
      },
    });
    expect(result).toMatchObject({
      threadId: 'thread-2',
      turnId: 'turn-2',
      status: 'completed',
      error: null,
    });
  });

  it('fails the run when Codex requests unsupported approval flow', async () => {
    const server = await createFakeAppServer(`
count=0
while IFS= read -r line; do
  count=$((count + 1))
  printf 'JSON:%s\n' "$line" >> "$TRACE_FILE"
  case "$count" in
    1)
      printf '%s\n' '{"id":0,"result":{}}'
      ;;
    2)
      ;;
    3)
      printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-3"}}}'
      ;;
    4)
      printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-3","status":"inProgress"}}}'
      printf '%s\n' '{"id":77,"method":"item/commandExecution/requestApproval","params":{"threadId":"thread-3","turnId":"turn-3","command":"git status","cwd":"/tmp"}}'
      ;;
    5)
      sleep 1
      ;;
  esac
done
`);

    const result = await runAppServerTurn({
      command: server.command,
      cwd: server.cwd,
      prompt: 'work',
      timeoutMs: 1000,
      readTimeoutMs: 1000,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('unsupported approval flow');
  });

  it('fails on invalid stdout JSON without crashing the caller', async () => {
    const server = await createFakeAppServer(`
count=0
while IFS= read -r line; do
  count=$((count + 1))
  case "$count" in
    1)
      printf '%s\n' '{"id":0,"result":{}}'
      ;;
    2)
      ;;
    3)
      printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-4"}}}'
      ;;
    4)
      printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-4","status":"inProgress"}}}'
      printf '%s\n' '{not valid json}'
      sleep 1
      ;;
  esac
done
`);

    const result = await runAppServerTurn({
      command: server.command,
      cwd: server.cwd,
      prompt: 'work',
      timeoutMs: 1000,
      readTimeoutMs: 1000,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('invalid JSON');
  });

  it('fails when the app-server exits before the turn completes', async () => {
    const server = await createFakeAppServer(`
count=0
while IFS= read -r line; do
  count=$((count + 1))
  case "$count" in
    1)
      printf '%s\n' '{"id":0,"result":{}}'
      ;;
    2)
      ;;
    3)
      printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-5"}}}'
      ;;
    4)
      printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-5","status":"inProgress"}}}'
      exit 1
      ;;
  esac
done
`);

    const result = await runAppServerTurn({
      command: server.command,
      cwd: server.cwd,
      prompt: 'work',
      timeoutMs: 1000,
      readTimeoutMs: 1000,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('exited before the turn completed');
  });

  it('kills the child process and returns timed_out when the turn stalls', async () => {
    const server = await createFakeAppServer(`
count=0
while IFS= read -r line; do
  count=$((count + 1))
  case "$count" in
    1)
      printf '%s\n' '{"id":0,"result":{}}'
      ;;
    2)
      ;;
    3)
      printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-6"}}}'
      ;;
    4)
      printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-6","status":"inProgress"}}}'
      printf '%s\n' '{"method":"thread/started","params":{"thread":{"id":"thread-6"}}}'
      printf '%s\n' '{"method":"turn/started","params":{"threadId":"thread-6","turn":{"id":"turn-6","status":"inProgress"}}}'
      sleep 5
      ;;
  esac
done
`);

    const result = await runAppServerTurn({
      command: server.command,
      cwd: server.cwd,
      prompt: 'work',
      timeoutMs: 300,
      readTimeoutMs: 1000,
    });

    expect(result.status).toBe('timed_out');
    expect(result.error).toContain('timed out');
  });
});

async function createFakeAppServer(scriptBody: string): Promise<{
  command: string;
  cwd: string;
  traceFile: string;
}> {
  const cwd = await mkdtemp(join(tmpdir(), 'symphony-app-server-'));
  const scriptPath = join(cwd, 'fake-codex');
  const traceFile = join(cwd, 'trace.log');
  await writeFile(
    scriptPath,
    `#!/bin/sh
${scriptBody}
`,
  );
  await chmod(scriptPath, 0o755);
  return {
    cwd,
    traceFile,
    command: `TRACE_FILE=${shellQuote(traceFile)} ${shellQuote(scriptPath)} app-server`,
  };
}

async function readTraceMessages(traceFile: string): Promise<Array<Record<string, any>>> {
  const trace = await readFile(traceFile, 'utf8');
  return trace
    .split('\n')
    .filter((line) => line.startsWith('JSON:'))
    .map((line) => JSON.parse(line.slice('JSON:'.length)) as Record<string, any>);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
