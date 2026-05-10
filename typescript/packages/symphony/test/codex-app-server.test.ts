import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAppServerTurn, runFakeAppServerTurn } from "../src/codex-app-server.js";

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

  it("dispatches app-server tool calls and writes results", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "symphony-app-server-"));
    const command = `node -e "const readline=require('node:readline'); console.log(JSON.stringify({method:'thread/started',params:{threadId:'thread-1'}})); console.log(JSON.stringify({method:'item/tool/call',params:{callId:'call-1',name:'linear_graphql',arguments:{query:'query Viewer { viewer { id } }'}}})); readline.createInterface({input:process.stdin}).on('line', line => { const msg = JSON.parse(line); if (msg.method === 'item/tool/result') { console.log(JSON.stringify({method:'turn/completed',params:{turnId:'turn-1'}})); setTimeout(() => process.exit(0), 10); } });"`;

    const result = await runAppServerTurn({
      command,
      cwd,
      prompt: "work",
      timeoutMs: 1000,
      executeTool: async (call) => ({ success: true, name: call.name }),
    });

    expect(result).toMatchObject({ threadId: "thread-1", turnId: "turn-1", status: "completed" });
  });

  it("reports lifecycle events from app-server output", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "symphony-app-server-"));
    const events: string[] = [];

    await runAppServerTurn({
      command: "node -e \"console.log(JSON.stringify({method:'thread/started',params:{threadId:'thread-1'}})); console.log(JSON.stringify({method:'turn/completed',params:{turnId:'turn-1'}}));\"",
      cwd,
      prompt: "work",
      timeoutMs: 1000,
      onEvent: (event) => events.push(event.method),
    });

    expect(events).toEqual(["thread/started", "turn/completed"]);
  });
});
