import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import YAML from "yaml";

export interface WorkflowDefinition {
  path: string;
  directory: string;
  config: Record<string, unknown>;
  promptTemplate: string;
}

export class WorkflowError extends Error {
  constructor(
    readonly code:
      | "missing_workflow_file"
      | "workflow_parse_error"
      | "workflow_front_matter_not_a_map",
    message: string,
  ) {
    super(message);
  }
}

export async function loadWorkflow(workflowPath: string): Promise<WorkflowDefinition> {
  const absolutePath = resolve(workflowPath);
  let raw: string;

  try {
    raw = await readFile(absolutePath, "utf8");
  } catch {
    throw new WorkflowError("missing_workflow_file", `Workflow file not found: ${absolutePath}`);
  }

  const { frontMatter, body } = splitFrontMatter(raw);
  const config = parseFrontMatter(frontMatter);

  return {
    path: absolutePath,
    directory: dirname(absolutePath),
    config,
    promptTemplate: body.trim(),
  };
}

function splitFrontMatter(raw: string): { frontMatter: string | null; body: string } {
  if (!raw.startsWith("---\n")) {
    return { frontMatter: null, body: raw };
  }

  const end = raw.indexOf("\n---", 4);
  if (end === -1) {
    throw new WorkflowError("workflow_parse_error", "Workflow front matter is missing a closing delimiter.");
  }

  const afterDelimiter = raw.indexOf("\n", end + 4);
  return {
    frontMatter: raw.slice(4, end),
    body: afterDelimiter === -1 ? "" : raw.slice(afterDelimiter + 1),
  };
}

function parseFrontMatter(frontMatter: string | null): Record<string, unknown> {
  if (frontMatter === null) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(frontMatter);
  } catch (error) {
    throw new WorkflowError("workflow_parse_error", `Workflow YAML failed to parse: ${String(error)}`);
  }

  if (parsed === null) {
    return {};
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new WorkflowError("workflow_front_matter_not_a_map", "Workflow front matter must decode to an object.");
  }

  return parsed as Record<string, unknown>;
}
