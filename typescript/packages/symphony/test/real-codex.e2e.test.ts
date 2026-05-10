import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Issue } from "@symphony/core";
import { runAgentAttempt } from "../src/agent-runner.js";
import { createRunProgressTracker } from "../src/run-progress.js";
import type { EffectiveConfig } from "../src/config.js";

const maybeIt = process.env.SYMPHONY_REAL_CODEX_E2E === "1" ? it : it.skip;

describe("real Codex app-server", () => {
  maybeIt(
    "runs a real Codex turn and records progress snapshot data",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "symphony-real-codex-"));
      const tracker = createRunProgressTracker();
      const result = await runAgentAttempt({
        issue: {
          id: "issue-real-codex",
          identifier: "LOC-REAL-1",
          title: "Real Codex smoke test",
          description: "Ask Codex to create a tiny marker file in the workspace.",
          state: "Todo",
          url: null,
          labels: [],
          branchName: null,
          priority: null,
          updatedAt: null,
          createdAt: null,
          blockedBy: [],
        } satisfies Issue,
        attempt: null,
        workflowPrompt: `
Create a file named real-codex-smoke.txt in the current workspace.
Write exactly one line: real-codex-ok
You may run one small shell command if helpful.
Finish after the file is created.
`,
        config: {
          tracker: {
            kind: "linear",
            endpoint: "http://localhost/graphql",
            apiKey: "local-dev-token",
            projectSlug: "symphony-local",
            activeStates: ["Todo", "In Progress"],
            terminalStates: ["Done"],
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
            command: process.env.SYMPHONY_REAL_CODEX_COMMAND ?? "codex app-server",
            turnTimeoutMs: 120000,
            readTimeoutMs: 10000,
            stallTimeoutMs: 120000,
            approvalPolicy: "never",
            threadSandbox: "workspace-write",
            turnSandboxPolicy: "workspace-write",
          },
        } satisfies EffectiveConfig,
        onProgress: tracker.record,
      });

      const snapshot = tracker.snapshot();
      const run = snapshot.runs[0];
      const eventNames = snapshot.events.map((event) => event.eventName);
      expect(run?.threadId).toBeTruthy();
      expect(run?.turnId).toBeTruthy();
      expect(eventNames).toEqual(
        expect.arrayContaining(["codex.thread.started", "codex.turn.started"]),
      );
      expect(
        eventNames.some((name) =>
          name === "codex.command.started" ||
          name === "codex.file_change.started" ||
          name === "codex.command.completed" ||
          name === "codex.file_change.completed",
        ),
      ).toBe(true);
      expect(
        result.status === "normal" || (result.status === "failed" && typeof result.error === "string" && result.error.length > 0),
      ).toBe(true);

      if (result.status === "normal") {
        const marker = await readFile(join(root, "LOC-REAL-1", "real-codex-smoke.txt"), "utf8");
        expect(marker.trim()).toBe("real-codex-ok");
      }
    },
    180000,
  );
});
