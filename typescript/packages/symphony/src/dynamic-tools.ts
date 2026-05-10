export interface ToolResult {
  success: boolean;
  body?: unknown;
  error?: { code: string; message: string };
}

export interface LinearGraphqlContext {
  endpoint: string;
  apiKey: string | null;
  fetch: typeof fetch;
}

export interface DynamicToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const LINEAR_GRAPHQL_TOOL = 'linear_graphql';
const LINEAR_GRAPHQL_DESCRIPTION =
  "Execute a raw GraphQL query or mutation against Linear using Symphony's configured auth.";
const LINEAR_GRAPHQL_INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['query'],
  properties: {
    query: {
      type: 'string',
      description: 'GraphQL query or mutation document to execute against Linear.',
    },
    variables: {
      type: ['object', 'null'],
      description: 'Optional GraphQL variables object.',
      additionalProperties: true,
    },
  },
} satisfies Record<string, unknown>;

export function getDynamicToolSpecs(): DynamicToolSpec[] {
  return [
    {
      name: LINEAR_GRAPHQL_TOOL,
      description: LINEAR_GRAPHQL_DESCRIPTION,
      inputSchema: LINEAR_GRAPHQL_INPUT_SCHEMA,
    },
  ];
}

export async function executeLinearGraphqlTool(argumentsValue: unknown, context: LinearGraphqlContext): Promise<ToolResult> {
  const normalized = normalizeArguments(argumentsValue);
  if (!normalized.ok) {
    return { success: false, error: normalized.error };
  }
  if (!context.apiKey) {
    return { success: false, error: { code: "missing_auth", message: "Symphony is missing Linear auth." } };
  }

  try {
    const response = await context.fetch(context.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: normalized.query, variables: normalized.variables }),
    });

    const body = await response.json();
    if (!response.ok) {
      return { success: false, body, error: { code: "linear_api_status", message: `Linear GraphQL request failed with HTTP ${response.status}.` } };
    }

    return { success: !hasGraphqlErrors(body), body };
  } catch (error) {
    return { success: false, error: { code: "linear_api_request", message: `Linear GraphQL request failed: ${String(error)}` } };
  }
}

function normalizeArguments(value: unknown): { ok: true; query: string; variables: Record<string, unknown> } | { ok: false; error: { code: string; message: string } } {
  if (typeof value === "string") {
    const query = value.trim();
    return query ? { ok: true, query, variables: {} } : invalid("`linear_graphql` requires a non-empty `query` string.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid("`linear_graphql` expects either a GraphQL query string or an object with `query` and optional `variables`.");
  }

  const input = value as Record<string, unknown>;
  if (typeof input.query !== "string" || input.query.trim() === "") {
    return invalid("`linear_graphql` requires a non-empty `query` string.");
  }

  if (input.variables !== undefined && (!input.variables || typeof input.variables !== "object" || Array.isArray(input.variables))) {
    return invalid("`linear_graphql.variables` must be a JSON object when provided.");
  }

  return { ok: true, query: input.query.trim(), variables: (input.variables as Record<string, unknown> | undefined) ?? {} };
}

function invalid(message: string) {
  return { ok: false as const, error: { code: "invalid_arguments", message } };
}

function hasGraphqlErrors(body: unknown): boolean {
  return Boolean(body && typeof body === "object" && Array.isArray((body as { errors?: unknown }).errors));
}
