import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWorkflow } from "../src/workflow-loader.js";

describe("loadWorkflow", () => {
  it("parses YAML front matter and trims the prompt body", async () => {
    const dir = await mkdtemp(join(tmpdir(), "symphony-workflow-"));
    const path = join(dir, "WORKFLOW.md");
    await writeFile(path, "---\ntracker:\n  kind: linear\n---\n\nHello {{ issue.identifier }}\n");

    const workflow = await loadWorkflow(path);

    expect(workflow).toEqual({
      path,
      directory: dir,
      config: { tracker: { kind: "linear" } },
      promptTemplate: "Hello {{ issue.identifier }}",
    });
  });

  it("treats files without front matter as prompt-only workflows", async () => {
    const dir = await mkdtemp(join(tmpdir(), "symphony-workflow-"));
    const path = join(dir, "WORKFLOW.md");
    await writeFile(path, "Run issue {{ issue.identifier }}\n");

    const workflow = await loadWorkflow(path);

    expect(workflow.config).toEqual({});
    expect(workflow.promptTemplate).toBe("Run issue {{ issue.identifier }}");
  });
});
