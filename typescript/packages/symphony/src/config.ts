import { isAbsolute, join, resolve } from "node:path";

export interface ResolveConfigContext {
  workflowDirectory: string;
  env: Record<string, string | undefined>;
  homeDirectory: string;
  tempDirectory: string;
}

export interface EffectiveConfig {
  tracker: {
    kind: "linear";
    endpoint: string;
    apiKey: string | undefined;
    projectSlug: string | undefined;
    activeStates: string[];
    terminalStates: string[];
    pollingIntervalMs: number;
  };
  workspace: {
    root: string;
  };
  hooks: {
    timeoutMs: number;
  };
  agent: {
    maxConcurrentAgents: number;
    maxConcurrentAgentsByState: Map<string, number>;
    maxTurns: number;
    maxRetryBackoffMs: number;
  };
  codex: {
    command: string;
    turnTimeoutMs: number;
    readTimeoutMs: number;
    stallTimeoutMs: number;
  };
}

export function resolveConfig(raw: unknown, context: ResolveConfigContext): EffectiveConfig {
  const config = asRecord(raw) ?? {};
  const tracker = asRecord(config.tracker) ?? {};
  const workspace = asRecord(config.workspace) ?? {};
  const hooks = asRecord(config.hooks) ?? {};
  const agent = asRecord(config.agent) ?? {};
  const codex = asRecord(config.codex) ?? {};

  return {
    tracker: {
      kind: "linear",
      endpoint: readString(tracker.endpoint) ?? "https://api.linear.app/graphql",
      apiKey: resolveTrackerApiKey(readString(tracker.api_key), context.env),
      projectSlug: readString(tracker.project_slug),
      activeStates: readStringArray(tracker.active_states) ?? ["Todo", "In Progress"],
      terminalStates: readStringArray(tracker.terminal_states) ?? [
        "Closed",
        "Cancelled",
        "Canceled",
        "Duplicate",
        "Done",
      ],
      pollingIntervalMs: readPositiveInteger(tracker.polling_interval_ms) ?? 30000,
    },
    workspace: {
      root: resolveWorkspaceRoot(readString(workspace.root), context),
    },
    hooks: {
      timeoutMs: readPositiveInteger(hooks.timeout_ms) ?? 60000,
    },
    agent: {
      maxConcurrentAgents: readPositiveInteger(agent.max_concurrent_agents) ?? 10,
      maxConcurrentAgentsByState: readPositiveIntegerMap(agent.max_concurrent_agents_by_state),
      maxTurns: readPositiveInteger(agent.max_turns) ?? 20,
      maxRetryBackoffMs: readPositiveInteger(agent.max_retry_backoff_ms) ?? 300000,
    },
    codex: {
      command: readString(codex.command) ?? "codex app-server",
      turnTimeoutMs: readPositiveInteger(codex.turn_timeout_ms) ?? 3600000,
      readTimeoutMs: readPositiveInteger(codex.read_timeout_ms) ?? 5000,
      stallTimeoutMs: readPositiveInteger(codex.stall_timeout_ms) ?? 300000,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return undefined;
  }

  return value;
}

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    return Number(value);
  }

  return undefined;
}

function readPositiveIntegerMap(value: unknown): Map<string, number> {
  const record = asRecord(value);
  const result = new Map<string, number>();

  if (record === null) {
    return result;
  }

  for (const [state, rawValue] of Object.entries(record)) {
    const coerced = readPositiveInteger(rawValue);
    if (coerced !== undefined) {
      result.set(state.toLowerCase(), coerced);
    }
  }

  return result;
}

function resolveTrackerApiKey(value: string | undefined, env: Record<string, string | undefined>): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    return env[value.slice(1)];
  }

  return value;
}

function resolveWorkspaceRoot(value: string | undefined, context: ResolveConfigContext): string {
  const root = value ?? join(context.tempDirectory, "symphony_workspaces");
  const expanded = root === "~" ? context.homeDirectory : root.replace(/^~(?=\/)/, context.homeDirectory);

  return isAbsolute(expanded) ? expanded : resolve(context.workflowDirectory, expanded);
}
