import type { Issue } from "@symphony/core";
import { renderPrompt } from "./prompt-renderer.js";
import { createWorkspaceForIssue } from "./workspace-manager.js";
import { runHook } from "./hook-runner.js";
import { runFakeAppServerTurn } from "./codex-app-server.js";
import type { EffectiveConfig } from "./config.js";

export async function runAgentAttempt(input: {
  issue: Issue;
  attempt: number | null;
  workflowPrompt: string;
  config: EffectiveConfig;
}): Promise<{ status: "normal" | "failed"; error?: string }> {
  const workspace = await createWorkspaceForIssue(input.config.workspace.root, input.issue.identifier);
  if (workspace.createdNow) {
    const afterCreate = await runHook({ script: input.config.hooks.afterCreate, cwd: workspace.path, timeoutMs: input.config.hooks.timeoutMs });
    if (!afterCreate.ok) return { status: "failed", error: "after_create hook failed" };
  }

  const beforeRun = await runHook({ script: input.config.hooks.beforeRun, cwd: workspace.path, timeoutMs: input.config.hooks.timeoutMs });
  if (!beforeRun.ok) return { status: "failed", error: "before_run hook failed" };

  const prompt = await renderPrompt(input.workflowPrompt, { issue: input.issue, attempt: input.attempt });
  const turn = await runFakeAppServerTurn({
    command: input.config.codex.command,
    cwd: workspace.path,
    prompt,
    timeoutMs: input.config.codex.turnTimeoutMs,
  });

  await runHook({ script: input.config.hooks.afterRun, cwd: workspace.path, timeoutMs: input.config.hooks.timeoutMs });
  return turn.status === "completed" ? { status: "normal" } : { status: "failed", error: turn.status };
}
