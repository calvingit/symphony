import { LinearClient, createOrchestrator, loadWorkflow, resolveConfig, runAgentAttempt } from "@symphony/symphony";
import { startStatusServer } from "./status-server.js";

export async function startSymphony(input: { workflowPath: string; port: number | null }): Promise<void> {
  const workflow = await loadWorkflow(input.workflowPath);
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

  const orchestrator = createOrchestrator({
    tracker: {
      fetchCandidateIssues: (states) => client.fetchCandidateIssues(states),
      fetchIssuesByStates: async () => [],
      fetchIssueStatesByIds: async () => new Map(),
    },
    runIssue: (issue, attempt) => runAgentAttempt({ issue, attempt, workflowPrompt: workflow.promptTemplate, config }),
    activeStates: config.tracker.activeStates,
    terminalStates: config.tracker.terminalStates,
    maxConcurrentAgents: config.agent.maxConcurrentAgents,
    maxConcurrentAgentsByState: config.agent.maxConcurrentAgentsByState,
  });

  if (input.port !== null) {
    await startStatusServer({ port: input.port, snapshot: () => orchestrator.snapshot() });
  }

  await orchestrator.tick();
  setInterval(() => {
    void orchestrator.tick();
  }, config.polling.intervalMs);
}
