import type { Issue } from "@symphony/core";
import { renderPrompt } from "./prompt-renderer.js";
import { createWorkspaceForIssue } from "./workspace-manager.js";
import { runHook } from "./hook-runner.js";
import { runAppServerTurn } from "./codex-app-server.js";
import type { EffectiveConfig } from "./config.js";
import { executeLinearGraphqlTool } from "./dynamic-tools.js";
import type { RunProgressEventInput, RunProgressStatus } from "./run-progress.js";

export async function runAgentAttempt(input: {
  issue: Issue;
  attempt: number | null;
  workflowPrompt: string;
  config: EffectiveConfig;
  onProgress?: (event: RunProgressEventInput) => void;
}): Promise<{ status: "normal" | "failed"; error?: string }> {
  const emit = (status: RunProgressStatus, extra: Partial<RunProgressEventInput> = {}) => {
    input.onProgress?.({ issue: input.issue, attempt: input.attempt, status, ...extra });
  };

  emit("preparing_workspace");
  const workspace = await createWorkspaceForIssue(input.config.workspace.root, input.issue.identifier);
  if (workspace.createdNow) {
    emit("running_hooks", { message: "after_create" });
    const afterCreate = await runHook({ script: input.config.hooks.afterCreate, cwd: workspace.path, timeoutMs: input.config.hooks.timeoutMs });
    if (!afterCreate.ok) {
      emit("failed", { error: "after_create hook failed" });
      return { status: "failed", error: "after_create hook failed" };
    }
  }

  emit("running_hooks", { message: "before_run" });
  const beforeRun = await runHook({ script: input.config.hooks.beforeRun, cwd: workspace.path, timeoutMs: input.config.hooks.timeoutMs });
  if (!beforeRun.ok) {
    emit("failed", { error: "before_run hook failed" });
    return { status: "failed", error: "before_run hook failed" };
  }

  const prompt = await renderPrompt(input.workflowPrompt, { issue: input.issue, attempt: input.attempt });
  emit("running_codex");
  const turn = await runAppServerTurn({
    command: input.config.codex.command,
    cwd: workspace.path,
    prompt,
    timeoutMs: input.config.codex.turnTimeoutMs,
    onEvent: (event) => {
      if (event.method === "thread/started") {
        emit("running_codex", { threadId: event.params?.threadId ?? null });
      }
      if (event.method === "item/tool/call") {
        emit("tool_call", {
          threadId: event.params?.threadId ?? null,
          toolName: event.params?.name ?? event.params?.tool ?? null,
        });
      }
      if (event.method === "turn/completed") {
        emit("completed", { threadId: event.params?.threadId ?? null, turnId: event.params?.turnId ?? null });
      }
    },
    executeTool: async (call) => {
      if (call.name !== "linear_graphql") {
        return { success: false, error: { code: "unsupported_tool", message: `Unsupported tool: ${call.name}` } };
      }
      return executeLinearGraphqlTool(call.arguments, {
        endpoint: input.config.tracker.endpoint,
        apiKey: input.config.tracker.apiKey ?? null,
        fetch,
      });
    },
  });

  emit("running_hooks", { message: "after_run", threadId: turn.threadId, turnId: turn.turnId });
  await runHook({ script: input.config.hooks.afterRun, cwd: workspace.path, timeoutMs: input.config.hooks.timeoutMs });
  if (turn.status === "completed") {
    emit("completed", { threadId: turn.threadId, turnId: turn.turnId });
    return { status: "normal" };
  }
  emit("failed", { threadId: turn.threadId, turnId: turn.turnId, error: turn.status });
  return { status: "failed", error: turn.status };
}
