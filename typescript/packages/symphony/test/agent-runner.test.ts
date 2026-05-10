import { execFile } from 'node:child_process';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { Issue } from '@symphony/core';
import { runAgentAttempt } from '../src/agent-runner.js';
import { createRunProgressTracker } from '../src/run-progress.js';
import type { EffectiveConfig } from '../src/config.js';

const execFileAsync = promisify(execFile);

describe('runAgentAttempt', () => {
  it('maps Codex lifecycle and command events into run progress', async () => {
    const root = await mkdtemp(join(tmpdir(), 'symphony-agent-runner-'));
    const command = await createFakeCodexCommand(
      root,
      `
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
      printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-10"}}}'
      ;;
    4)
      printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-10","status":"inProgress"}}}'
      printf '%s\n' '{"method":"thread/started","params":{"thread":{"id":"thread-10"}}}'
      printf '%s\n' '{"method":"turn/started","params":{"threadId":"thread-10","turn":{"id":"turn-10","status":"inProgress"}}}'
      printf '%s\n' '{"method":"item/started","params":{"threadId":"thread-10","turnId":"turn-10","item":{"id":"item-1","type":"commandExecution","command":"pnpm test","cwd":"/tmp/workspace","status":"inProgress"}}}'
      printf '%s\n' '{"method":"item/commandExecution/outputDelta","params":{"threadId":"thread-10","turnId":"turn-10","itemId":"item-1","delta":"running tests"}}'
      printf '%s\n' '{"method":"item/completed","params":{"threadId":"thread-10","turnId":"turn-10","item":{"id":"item-1","type":"commandExecution","command":"pnpm test","cwd":"/tmp/workspace","status":"completed","exitCode":0,"durationMs":25}}}'
      printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-10","turn":{"id":"turn-10","status":"completed"}}}'
      exit 0
      ;;
  esac
done
`,
    );

    const tracker = createRunProgressTracker();
    const result = await runAgentAttempt({
      issue: issue('LOC-10'),
      attempt: null,
      workflowPrompt: 'Work on {{ issue.identifier }}',
      config: config(root, command),
      onProgress: tracker.record,
    });

    const snapshot = tracker.snapshot();
    expect(result.status).toBe('normal');
    expect(snapshot.runs[0]).toEqual(
      expect.objectContaining({
        issueId: 'issue-LOC-10',
        status: 'completed',
        threadId: 'thread-10',
        turnId: 'turn-10',
      }),
    );
    expect(snapshot.events.map((event) => [event.status, event.eventName])).toEqual(
      expect.arrayContaining([
        ['running_codex', 'codex.thread.started'],
        ['running_codex', 'codex.turn.started'],
        ['tool_call', 'codex.command.started'],
        ['tool_call', 'codex.command.output'],
        ['running_codex', 'codex.command.completed'],
        ['completed', 'codex.turn.completed'],
      ]),
    );
  });

  it('maps app-server error events and failed turn completion into failed run progress', async () => {
    const root = await mkdtemp(join(tmpdir(), 'symphony-agent-runner-'));
    const command = await createFakeCodexCommand(
      root,
      `
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
      printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-11"}}}'
      ;;
    4)
      printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-11","status":"inProgress"}}}'
      printf '%s\n' '{"method":"error","params":{"threadId":"thread-11","turnId":"turn-11","error":{"message":"model exploded","codexErrorInfo":{"type":"InternalServerError"}}}}'
      printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-11","turn":{"id":"turn-11","status":"failed","error":{"message":"model exploded","codexErrorInfo":{"type":"InternalServerError"}}}}}'
      exit 0
      ;;
  esac
done
`,
    );

    const tracker = createRunProgressTracker();
    const result = await runAgentAttempt({
      issue: issue('LOC-11'),
      attempt: null,
      workflowPrompt: 'Work on {{ issue.identifier }}',
      config: config(root, command),
      onProgress: tracker.record,
    });

    const snapshot = tracker.snapshot();
    expect(result).toEqual({
      status: 'failed',
      error: 'model exploded',
    });
    expect(snapshot.runs[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        threadId: 'thread-11',
        turnId: 'turn-11',
        error: 'model exploded',
      }),
    );
    expect(snapshot.events.map((event) => event.eventName)).toEqual(
      expect.arrayContaining(['codex.error', 'codex.turn.failed']),
    );
  });

  it('exposes workspace and issue context to hooks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'symphony-agent-hooks-'));
    const repoPath = await createGitRepo(await mkdtemp(join(tmpdir(), 'symphony-agent-repo-')));
    const command = await createFakeCodexCommand(
      root,
      `
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
      printf '%s\n' '{"id":1,"result":{"thread":{"id":"thread-hook"}}}'
      ;;
    4)
      printf '%s\n' '{"id":2,"result":{"turn":{"id":"turn-hook","status":"inProgress"}}}'
      printf '%s\n' '{"method":"turn/completed","params":{"threadId":"thread-hook","turn":{"id":"turn-hook","status":"completed"}}}'
      exit 0
      ;;
  esac
done
`,
    );

    const issueData = issue('LOC-12');
    issueData.branchName = 'feature/loc-12';
    issueData.project = {
      slugId: 'repo-loc-12',
      name: 'Repo LOC 12',
      workspace: {
        kind: 'local',
        localPath: repoPath,
        remoteUrl: null,
        baseBranch: 'main',
      },
    };
    const result = await runAgentAttempt({
      issue: issueData,
      attempt: 3,
      workflowPrompt: 'Work on {{ issue.identifier }}',
      config: {
        ...config(root, command),
        hooks: {
          afterCreate:
            'printf "%s\\n%s\\n%s\\n%s\\n%s\\n%s" "$SYMPHONY_WORKSPACE_PATH" "$SYMPHONY_ISSUE_IDENTIFIER" "$SYMPHONY_ISSUE_BRANCH_NAME" "$SYMPHONY_PROJECT_SLUG" "$SYMPHONY_PROJECT_LOCAL_PATH" "$SYMPHONY_ATTEMPT" > hook-env.txt',
          beforeRun: null,
          afterRun: null,
          beforeRemove: null,
          timeoutMs: 1000,
        },
      },
    });

    expect(result.status).toBe('normal');
    const workspacePath = join(repoPath, '.worktrees', 'LOC-12');
    await expect(readFile(join(workspacePath, 'hook-env.txt'), 'utf8')).resolves.toBe(
      `${workspacePath}\nLOC-12\nfeature/loc-12\nrepo-loc-12\n${repoPath}\n3`,
    );
  });

  it('surfaces hook stderr in the failed run error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'symphony-agent-hook-failure-'));
    const result = await runAgentAttempt({
      issue: issue('LOC-13'),
      attempt: null,
      workflowPrompt: 'Work on {{ issue.identifier }}',
      config: {
        ...config(root, "printf 'should not run\\n'"),
        hooks: {
          afterCreate: 'echo "workspace is not a git repo root: $PWD" >&2; exit 1',
          beforeRun: null,
          afterRun: null,
          beforeRemove: null,
          timeoutMs: 1000,
        },
      },
    });

    expect(result).toEqual({
      status: 'failed',
      error: expect.stringContaining('after_create hook failed: workspace is not a git repo root:'),
    });
  });
});

function issue(identifier: string): Issue {
  return {
    id: `issue-${identifier}`,
    identifier,
    title: `Issue ${identifier}`,
    description: 'Test issue',
    state: 'Todo',
    url: null,
    labels: [],
    branchName: null,
    priority: null,
    updatedAt: null,
    createdAt: null,
    blockedBy: [],
  };
}

function config(root: string, command: string): EffectiveConfig {
  return {
    tracker: {
      kind: 'linear',
      endpoint: 'http://localhost/graphql',
      apiKey: 'local-dev-token',
      projectSlug: 'symphony-local',
      activeStates: ['Todo', 'In Progress'],
      terminalStates: ['Done'],
    },
    polling: {
      intervalMs: 1000,
    },
    workspace: {
      root,
    },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 1000,
    },
    agent: {
      maxConcurrentAgents: 1,
      maxConcurrentAgentsByState: new Map(),
      maxTurns: 1,
      maxRetryBackoffMs: 1000,
    },
    codex: {
      command,
      turnTimeoutMs: 2000,
      readTimeoutMs: 1000,
      stallTimeoutMs: 1000,
      approvalPolicy: 'never',
      threadSandbox: 'workspace-write',
      turnSandboxPolicy: 'workspace-write',
    },
  };
}

async function createFakeCodexCommand(root: string, scriptBody: string): Promise<string> {
  const scriptPath = join(root, 'fake-codex');
  await writeFile(
    scriptPath,
    `#!/bin/sh
${scriptBody}
`,
  );
  await chmod(scriptPath, 0o755);
  return shellQuote(scriptPath);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

async function createGitRepo(repoPath: string): Promise<string> {
  await execFileAsync('git', ['init', '-b', 'main', repoPath]);
  await git(repoPath, ['config', 'user.email', 'test@example.com']);
  await git(repoPath, ['config', 'user.name', 'Test User']);
  await writeFile(join(repoPath, 'README.md'), '# Demo\n', 'utf8');
  await git(repoPath, ['add', 'README.md']);
  await git(repoPath, ['commit', '-m', 'init']);
  const result = await execFileAsync('git', ['-C', repoPath, 'rev-parse', '--show-toplevel']);
  return String(result.stdout).trim();
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', ['-C', cwd, ...args]);
}
