import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli.js";

describe("parseCliArgs", () => {
  it("uses WORKFLOW.md by default", () => {
    expect(parseCliArgs([])).toEqual({ workflowPath: "WORKFLOW.md", port: null });
  });

  it("accepts --port and explicit workflow path", () => {
    expect(parseCliArgs(["--port", "4010", "LOCAL_WORKFLOW.md"])).toEqual({
      workflowPath: "LOCAL_WORKFLOW.md",
      port: 4010,
    });
  });
});
