---
tracker:
  kind: linear
  endpoint: http://localhost:3001/graphql
  api_key: local-dev-token
  project_slug: symphony-local
  active_states:
    - Todo
    - In Progress
    - Rework
    - Merging
  terminal_states:
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
    - Done
polling:
  interval_ms: 5000
workspace:
  root: /private/tmp/symphony-fallback-workspaces
hooks:
  after_create: |
    set -euo pipefail
    if [ "$(git rev-parse --show-toplevel)" != "$PWD" ]; then
      echo "workspace git root mismatch: $(git rev-parse --show-toplevel)" >&2
      exit 1
    fi
    printf 'workspace ready\n' > .symphony-workspace
  before_run: |
    set -euo pipefail
    TOPLEVEL="$(git rev-parse --show-toplevel 2>/dev/null || true)"
    if [ "${TOPLEVEL:-}" != "$PWD" ]; then
      echo "workspace is not a git repo: $PWD" >&2
      exit 1
    fi
agent:
  max_concurrent_agents: 1
  max_turns: 1
codex:
  command: |
    node -e '
    const readline = require("node:readline");
    const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    const write = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

    rl.on("line", (line) => {
      const payload = JSON.parse(line);
      if (payload.method === "initialize") {
        write({ id: payload.id, result: {} });
        return;
      }
      if (payload.method === "thread/start") {
        write({ id: payload.id, result: { thread: { id: "thread-local" } } });
        return;
      }
      if (payload.method === "turn/start") {
        const threadId = payload.params?.threadId ?? "thread-local";
        write({ id: payload.id, result: { turn: { id: "turn-local", status: "inProgress" } } });
        setTimeout(() => {
          write({ method: "thread/started", params: { thread: { id: threadId } } });
          write({ method: "turn/started", params: { threadId, turn: { id: "turn-local", status: "inProgress" } } });
          write({ method: "turn/completed", params: { threadId, turn: { id: "turn-local", status: "completed" } } });
          process.exit(0);
        }, 100);
      }
    });
    '
---

You are working on local issue {{ issue.identifier }}.

Title: {{ issue.title }}
Description: {{ issue.description }}
