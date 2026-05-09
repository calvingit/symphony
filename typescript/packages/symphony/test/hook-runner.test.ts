import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runHook } from "../src/hook-runner.js";

describe("runHook", () => {
  it("runs shell scripts in the workspace directory", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "symphony-hook-"));
    const result = await runHook({ script: "printf ok > hook.txt", cwd, timeoutMs: 1000 });

    expect(result.ok).toBe(true);
    await expect(readFile(join(cwd, "hook.txt"), "utf8")).resolves.toBe("ok");
  });
});
