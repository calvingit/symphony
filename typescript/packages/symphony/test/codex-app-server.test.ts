import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runFakeAppServerTurn } from "../src/codex-app-server.js";

describe("codex app-server client", () => {
  it("launches the command in the workspace cwd", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "symphony-app-server-"));
    const result = await runFakeAppServerTurn({
      command: "node -e \"console.log(JSON.stringify({method:'thread/started',params:{threadId:'thread-1'}})); console.log(JSON.stringify({method:'turn/completed',params:{turnId:'turn-1'}}));\"",
      cwd,
      prompt: "work",
      timeoutMs: 1000,
    });

    expect(result.threadId).toBe("thread-1");
    expect(result.turnId).toBe("turn-1");
  });
});
