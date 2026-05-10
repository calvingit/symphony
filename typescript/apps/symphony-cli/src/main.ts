import { isAbsolute, resolve } from "node:path";
import { LinearClient, cleanupWorkspaceForIssue, createOrchestrator, createRunProgressTracker, loadWorkflow, resolveConfig, runAgentAttempt } from "@symphony/symphony";
import { startStatusServer } from "./status-server.js";

export async function startSymphony(input: { workflowPath: string; port: number | null }): Promise<void> {
  const workflow = await loadWorkflow(resolveWorkflowPath(input.workflowPath, process.env.INIT_CWD));
  const config = resolveConfig(workflow.config, {
    workflowDirectory: workflow.directory,
    env: process.env as Record<string, string | undefined>,
    homeDirectory: process.env.HOME ?? "/tmp",
    tempDirectory: process.env.TMPDIR ?? "/tmp",
  });

  if (!config.tracker.apiKey || !config.tracker.projectSlug) {
    throw new Error("invalid_config: tracker.api_key and tracker.project_slug are required");
  }

  const client = new LinearClient({
    endpoint: config.tracker.endpoint,
    apiKey: config.tracker.apiKey,
    projectSlug: config.tracker.projectSlug,
    fetch,
  });
  const progress = createRunProgressTracker();

  async function cleanupIssue(issue: { identifier: string }) {
    await cleanupWorkspaceForIssue({
      root: config.workspace.root,
      identifier: issue.identifier,
      beforeRemove: config.hooks.beforeRemove,
      timeoutMs: config.hooks.timeoutMs,
    });
  }

  for (const terminalIssue of await client.fetchIssuesByStates(config.tracker.terminalStates)) {
    await cleanupIssue(terminalIssue);
  }

  const orchestrator = createOrchestrator({
    tracker: {
      fetchCandidateIssues: (states) => client.fetchCandidateIssues(states),
      fetchIssuesByStates: (states) => client.fetchIssuesByStates(states),
      fetchIssueStatesByIds: (ids) => client.fetchIssuesByIds(ids),
    },
    runIssue: async (issue, attempt) => {
      if (issue.state !== "In Progress") {
        await client.updateIssueState(issue.id, "In Progress");
      }

      const result = await runAgentAttempt({
        issue,
        attempt,
        workflowPrompt: workflow.promptTemplate,
        config,
        onProgress: progress.record,
      });

      const terminalState = result.status === "normal" ? "Done" : "Rework";
      await client.updateIssueState(issue.id, terminalState);
      return result;
    },
    onProgress: progress.record,
    cleanupIssue,
    activeStates: config.tracker.activeStates,
    terminalStates: config.tracker.terminalStates,
    maxConcurrentAgents: config.agent.maxConcurrentAgents,
    maxConcurrentAgentsByState: config.agent.maxConcurrentAgentsByState,
    maxRetryBackoffMs: config.agent.maxRetryBackoffMs,
  });

  if (input.port !== null) {
    await startStatusServer({
      port: input.port,
      snapshot: () => ({ ...orchestrator.snapshot(), progress: progress.snapshot() }),
    });
  }

  await orchestrator.tick();
  setInterval(() => {
    void orchestrator.tick();
  }, config.polling.intervalMs);
}

export function resolveWorkflowPath(workflowPath: string, initCwd: string | undefined): string {
  if (isAbsolute(workflowPath)) {
    return workflowPath;
  }

  return resolve(initCwd ?? process.cwd(), workflowPath);
}
