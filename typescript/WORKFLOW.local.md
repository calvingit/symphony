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
  root: ./tmp/workspaces
hooks:
  after_create: |
    set -euo pipefail
    if [ ! -d .git ]; then
      if [ "${SYMPHONY_PROJECT_WORKSPACE_KIND:-}" = "local" ] && [ -n "${SYMPHONY_PROJECT_LOCAL_PATH:-}" ]; then
        git clone "$SYMPHONY_PROJECT_LOCAL_PATH" .
      elif [ "${SYMPHONY_PROJECT_WORKSPACE_KIND:-}" = "remote" ] && [ -n "${SYMPHONY_PROJECT_REMOTE_URL:-}" ]; then
        git clone "$SYMPHONY_PROJECT_REMOTE_URL" .
      else
        echo "project workspace config missing" >&2
        exit 1
      fi
    fi
    if [ "$(git rev-parse --show-toplevel)" != "$PWD" ]; then
      echo "workspace git root mismatch: $(git rev-parse --show-toplevel)" >&2
      exit 1
    fi
    TARGET_BRANCH="${SYMPHONY_ISSUE_BRANCH_NAME:-${SYMPHONY_PROJECT_BASE_BRANCH:-main}}"
    if [ -n "${TARGET_BRANCH:-}" ]; then
      git checkout -B "$TARGET_BRANCH" "origin/$TARGET_BRANCH" 2>/dev/null || git checkout -B "$TARGET_BRANCH"
    fi
    printf 'workspace ready\n' > .symphony-workspace
  before_run: |
    set -euo pipefail
    TOPLEVEL="$(git rev-parse --show-toplevel 2>/dev/null || true)"
    if [ "${TOPLEVEL:-}" != "$PWD" ]; then
      echo "workspace is not a git repo root: $PWD" >&2
      exit 1
    fi
    TARGET_BRANCH="${SYMPHONY_ISSUE_BRANCH_NAME:-${SYMPHONY_PROJECT_BASE_BRANCH:-main}}"
    if [ -n "${TARGET_BRANCH:-}" ]; then
      git checkout -B "$TARGET_BRANCH" "origin/$TARGET_BRANCH" 2>/dev/null || git checkout -B "$TARGET_BRANCH"
    fi
agent:
  max_concurrent_agents: 1
  max_turns: 1
codex:
  command: codex app-server
---

You are working on local issue {{ issue.identifier }}.

Title: {{ issue.title }}
Description: {{ issue.description }}
