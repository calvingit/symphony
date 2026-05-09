# Symphony TypeScript

This directory contains the TypeScript Symphony implementation and a Next.js local Linear-compatible
tracker for development.

## Install

```bash
pnpm install
```

## Run local Linear-compatible tracker

```bash
pnpm dev:linear
```

The GraphQL endpoint is:

```text
http://localhost:3001/graphql
```

Default local bearer token:

```text
local-dev-token
```

## Run Symphony against local tracker

```bash
pnpm --filter @symphony/symphony-cli dev -- ./WORKFLOW.local.md --port 4010
```

Status API:

```text
http://localhost:4010/api/v1/state
```

## Validate

```bash
pnpm test
pnpm typecheck
```
