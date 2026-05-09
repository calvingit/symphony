import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface AppServerTurnResult {
  threadId: string | null;
  turnId: string | null;
  status: "completed" | "failed" | "timed_out";
}

export function runFakeAppServerTurn(input: { command: string; cwd: string; prompt: string; timeoutMs: number }): Promise<AppServerTurnResult> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", input.command], { cwd: input.cwd, stdio: ["pipe", "pipe", "pipe"] });
    let threadId: string | null = null;
    let turnId: string | null = null;
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGTERM");
      resolve({ threadId, turnId, status: "timed_out" });
    }, input.timeoutMs);

    child.stdin.end(JSON.stringify({ prompt: input.prompt }) + "\n");
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      try {
        const event = JSON.parse(line);
        threadId = event.params?.threadId ?? threadId;
        turnId = event.params?.turnId ?? turnId;
      } catch {
        return;
      }
    });
    child.on("close", (code) => {
      if (settled) return;
      clearTimeout(timer);
      resolve({ threadId, turnId, status: code === 0 ? "completed" : "failed" });
    });
  });
}
