import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanupWorkspaceForIssue, createWorkspaceForIssue, sanitizeWorkspaceKey } from "../src/workspace-manager.js";

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

  it("runs before_remove before deleting terminal workspaces", async () => {
    const root = await mkdtemp(join(tmpdir(), "symphony-workspaces-"));
    const workspace = await createWorkspaceForIssue(root, "LOC-1");

    await cleanupWorkspaceForIssue({
      root,
      identifier: "LOC-1",
      beforeRemove: "printf removed > ../removed.txt",
      timeoutMs: 1000,
    });

    await expect(readFile(join(root, "removed.txt"), "utf8")).resolves.toBe("removed");
    await expect(stat(workspace.path)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
