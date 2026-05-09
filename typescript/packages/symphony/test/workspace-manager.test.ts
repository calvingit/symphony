import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorkspaceForIssue, sanitizeWorkspaceKey } from "../src/workspace-manager.js";

describe("workspace manager", () => {
  it("sanitizes issue identifiers", () => {
    expect(sanitizeWorkspaceKey("MT/../1 @x")).toBe("MT_.._1__x");
  });

  it("creates workspaces under the configured root", async () => {
    const root = await mkdtemp(join(tmpdir(), "symphony-workspaces-"));
    const workspace = await createWorkspaceForIssue(root, "LOC-1");

    expect(workspace.path.startsWith(root)).toBe(true);
    await expect(stat(workspace.path)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
  });
});
