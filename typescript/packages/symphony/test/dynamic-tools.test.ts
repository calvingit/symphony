import { describe, expect, it, vi } from "vitest";
import { executeLinearGraphqlTool } from "../src/dynamic-tools.js";

describe("executeLinearGraphqlTool", () => {
  it("accepts object input and returns success for GraphQL data", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { viewer: { id: "u1" } } }), { status: 200 }));

    const result = await executeLinearGraphqlTool(
      { query: "query Viewer { viewer { id } }", variables: {} },
      { endpoint: "http://local/graphql", apiKey: "token", fetch },
    );

    expect(result.success).toBe(true);
    expect(result.body).toEqual({ data: { viewer: { id: "u1" } } });
  });

  it("rejects blank query strings", async () => {
    const result = await executeLinearGraphqlTool(" ", {
      endpoint: "http://local/graphql",
      apiKey: "token",
      fetch: vi.fn(),
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("invalid_arguments");
  });
});
