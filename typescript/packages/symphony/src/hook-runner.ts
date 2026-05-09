import { spawn } from "node:child_process";

export interface HookResult {
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function runHook(input: { script: string | null; cwd: string; timeoutMs: number }): Promise<HookResult> {
  if (!input.script) {
    return Promise.resolve({ ok: true, exitCode: 0, signal: null, stdout: "", stderr: "", timedOut: false });
  }

  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", input.script], { cwd: input.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ ok: exitCode === 0 && !timedOut, exitCode, signal, stdout, stderr, timedOut });
    });
  });
}
