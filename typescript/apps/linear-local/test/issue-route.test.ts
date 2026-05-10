import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("POST /api/issues", () => {
  const originalDbPath = process.env.LINEAR_LOCAL_DB_PATH;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalDbPath === undefined) {
      delete process.env.LINEAR_LOCAL_DB_PATH;
    } else {
      process.env.LINEAR_LOCAL_DB_PATH = originalDbPath;
    }
  });

  it("returns 400 when projectSlug is missing", async () => {
    const { POST } = await import("../app/api/issues/route");

    const response = await POST(
      new Request("http://localhost/api/issues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Create project first" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({ error: "projectSlug required" });
    expect(response.status).toBe(400);
  });

  it("returns 404 when projectSlug does not exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "linear-local-issue-route-"));
    process.env.LINEAR_LOCAL_DB_PATH = join(root, "linear-local.db");

    const { POST } = await import("../app/api/issues/route");

    const response = await POST(
      new Request("http://localhost/api/issues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Unknown project", projectSlug: "missing-project" }),
      }),
    );

    await expect(response.json()).resolves.toEqual({ error: "project not found" });
    expect(response.status).toBe(404);
  });
});
