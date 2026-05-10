import { spawn } from "node:child_process";

export interface HookResult {
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function runHook(input: {
  script: string | null;
  cwd: string;
  timeoutMs: number;
  env?: Record<string, string | undefined>;
}): Promise<HookResult> {
  if (!input.script) {
    return Promise.resolve({ ok: true, exitCode: 0, signal: null, stdout: "", stderr: "", timedOut: false });
  }

  const script = input.script;

  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", script], {
      cwd: input.cwd,
      env: mergeHookEnv(input.env),
      stdio: ["ignore", "pipe", "pipe"],
    }) as import("node:child_process").ChildProcess;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ ok: exitCode === 0 && !timedOut, exitCode, signal, stdout, stderr, timedOut });
    });
  });
}

function mergeHookEnv(
  env: Record<string, string | undefined> | undefined,
): NodeJS.ProcessEnv {
  if (!env) {
    return process.env;
  }
  return Object.fromEntries(
    Object.entries({ ...process.env, ...env }).filter(([, value]) => value !== undefined),
  );
}
