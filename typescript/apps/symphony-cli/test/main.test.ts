import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWorkflowPath } from "../src/main.js";

describe("resolveWorkflowPath", () => {
  it("resolves relative workflow paths from INIT_CWD", () => {
    expect(resolveWorkflowPath("./WORKFLOW.local.md", "/repo/root")).toBe(
      resolve("/repo/root", "./WORKFLOW.local.md"),
    );
  });

  it("preserves absolute workflow paths", () => {
    expect(resolveWorkflowPath("/repo/root/WORKFLOW.local.md", "/other")).toBe(
      "/repo/root/WORKFLOW.local.md",
    );
  });
});
