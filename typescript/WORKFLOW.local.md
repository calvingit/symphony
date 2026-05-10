---
tracker:
  kind: linear
  endpoint: http://localhost:3001/graphql
  api_key: local-dev-token
  active_states:
    - Todo
    - In Progress
    - Rework
    - Merging
  terminal_states:
    - Closed
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
      echo "workspace is not a git repo root: $PWD" >&2
      exit 1
    fi
agent:
  max_concurrent_agents: 1
  max_turns: 1
codex:
  command: codex app-server
  approval_policy: never
  thread_sandbox: danger-full-access
  turn_sandbox_policy: danger-full-access
---

You are working on local issue {{ issue.identifier }}.

Title: {{ issue.title }}
Description: {{ issue.description }}
