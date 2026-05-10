import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface AppServerTurnResult {
  threadId: string | null;
  turnId: string | null;
  status: "completed" | "failed" | "timed_out";
}

export interface AppServerToolCall {
  name: string;
  arguments: unknown;
}

export interface AppServerEvent {
  method: string;
  params?: Record<string, any>;
}

export function runAppServerTurn(input: {
  command: string;
  cwd: string;
  prompt: string;
  timeoutMs: number;
  executeTool?: (call: AppServerToolCall) => Promise<unknown>;
  onEvent?: (event: AppServerEvent) => void;
}): Promise<AppServerTurnResult> {
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

    child.stdin.write(JSON.stringify({ prompt: input.prompt }) + "\n");
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      try {
        const event = JSON.parse(line);
        input.onEvent?.(event);
        threadId = event.params?.threadId ?? threadId;
        turnId = event.params?.turnId ?? turnId;
        if (isToolCall(event) && input.executeTool) {
          void input.executeTool({
            name: event.params.name ?? event.params.tool,
            arguments: event.params.arguments,
          }).then((result) => {
            child.stdin.write(JSON.stringify({
              method: "item/tool/result",
              params: { callId: event.params.callId, result },
            }) + "\n");
          }).catch((error: unknown) => {
            child.stdin.write(JSON.stringify({
              method: "item/tool/result",
              params: { callId: event.params.callId, result: { success: false, error: String(error) } },
            }) + "\n");
          });
        }
      } catch {
        return;
      }
    });
    child.on("close", (code) => {
      if (settled) return;
      clearTimeout(timer);
      setTimeout(() => {
        resolve({ threadId, turnId, status: code === 0 ? "completed" : "failed" });
      }, 0);
    });
  });
}

export const runFakeAppServerTurn = runAppServerTurn;

function isToolCall(event: any): boolean {
  return event?.method === "item/tool/call" && (typeof event.params?.name === "string" || typeof event.params?.tool === "string");
}
