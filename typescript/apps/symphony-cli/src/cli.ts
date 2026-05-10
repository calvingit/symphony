import { Command } from "commander";
import { startSymphony } from "./main.js";

export interface CliArgs {
  workflowPath: string;
  port: number | null;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const userArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const program = new Command();
  program
    .argument("[workflowPath]", "path to WORKFLOW.md", "WORKFLOW.md")
    .option("--port <port>", "status API port", (value) => Number(value), null)
    .exitOverride();
  program.parse(userArgv, { from: "user" });
  const opts = program.opts<{ port: number | null }>();
  return { workflowPath: program.args[0] ?? "WORKFLOW.md", port: opts.port };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseCliArgs(process.argv.slice(2));
  await startSymphony(args);
}
