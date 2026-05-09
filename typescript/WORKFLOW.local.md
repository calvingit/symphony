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
    printf 'workspace ready\n' > .symphony-workspace
agent:
  max_concurrent_agents: 1
  max_turns: 1
codex:
  command: node -e "console.log(JSON.stringify({method:'thread/started',params:{threadId:'thread-local'}})); console.log(JSON.stringify({method:'turn/completed',params:{turnId:'turn-local'}}));"
---

You are working on local issue {{ issue.identifier }}.

Title: {{ issue.title }}
Description: {{ issue.description }}
