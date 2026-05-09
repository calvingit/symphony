import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadWorkflow, WorkflowError } from "../src/workflow-loader.js";

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

  it("rejects YAML front matter that parses to null", async () => {
    const dir = await mkdtemp(join(tmpdir(), "symphony-workflow-"));
    const path = join(dir, "WORKFLOW.md");
    await writeFile(path, "---\nnull\n---\nPrompt\n");

    await expect(loadWorkflow(path)).rejects.toMatchObject({
      code: "workflow_front_matter_not_a_map",
    });
  });

  it("rejects malformed YAML front matter", async () => {
    const dir = await mkdtemp(join(tmpdir(), "symphony-workflow-"));
    const path = join(dir, "WORKFLOW.md");
    await writeFile(path, "---\ntracker:\n  kind: [linear\n---\nPrompt\n");

    await expect(loadWorkflow(path)).rejects.toMatchObject({
      code: "workflow_parse_error",
    } satisfies Partial<WorkflowError>);
  });

  it("rejects scalar front matter", async () => {
    const dir = await mkdtemp(join(tmpdir(), "symphony-workflow-"));
    const path = join(dir, "WORKFLOW.md");
    await writeFile(path, "---\nlinear\n---\nPrompt\n");

    await expect(loadWorkflow(path)).rejects.toMatchObject({
      code: "workflow_front_matter_not_a_map",
    } satisfies Partial<WorkflowError>);
  });

  it("rejects array front matter", async () => {
    const dir = await mkdtemp(join(tmpdir(), "symphony-workflow-"));
    const path = join(dir, "WORKFLOW.md");
    await writeFile(path, "---\n- tracker\n---\nPrompt\n");

    await expect(loadWorkflow(path)).rejects.toMatchObject({
      code: "workflow_front_matter_not_a_map",
    } satisfies Partial<WorkflowError>);
  });

  it("rejects missing workflow files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "symphony-workflow-"));
    const path = join(dir, "MISSING.md");

    await expect(loadWorkflow(path)).rejects.toMatchObject({
      code: "missing_workflow_file",
    } satisfies Partial<WorkflowError>);
  });
});
