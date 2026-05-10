import { serve } from "@hono/node-server";
import { Hono } from "hono";

export async function startStatusServer(input: { port: number; snapshot: () => unknown }): Promise<void> {
  const app = new Hono();
  app.get("/api/v1/state", (context) => context.json(input.snapshot()));
  app.get("/api/v1/runs", (context) => {
    const snapshot = input.snapshot() as { progress?: unknown };
    return context.json(snapshot.progress ?? { runs: [], events: [] });
  });
  app.post("/api/v1/refresh", (context) => context.json({ queued: true, coalesced: false, operations: ["poll", "reconcile"] }, 202));
  serve({ fetch: app.fetch, port: input.port, hostname: "127.0.0.1" });
}
