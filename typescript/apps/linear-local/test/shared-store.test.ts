import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("getStore", () => {
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

  it("falls back to the json-file store without creating a default project", async () => {
    const root = await mkdtemp(join(tmpdir(), "linear-local-json-fallback-"));
    const dbPath = join(root, "linear-local.db");
    process.env.LINEAR_LOCAL_DB_PATH = dbPath;
    vi.mock("@symphony/linear-schema", async () => {
      const actual =
        await vi.importActual<typeof import("@symphony/linear-schema")>("@symphony/linear-schema");
      const { createJsonFileStore } = await vi.importActual<
        typeof import("../../../packages/linear-schema/src/json-file-store.js")
      >("../../../packages/linear-schema/src/json-file-store.js");
      return {
        ...actual,
        createJsonFileStore,
        createSqliteStore: () => {
          throw new Error("sqlite unavailable");
        },
      };
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getStore } = await import("../lib/shared-store");

    const store = await getStore();
    await store.createProject({
      slugId: "demo",
      name: "Demo",
      workspace: { kind: "local", localPath: "/repo/demo", remoteUrl: null, baseBranch: "main" },
    });
    const projects = await store.listProjects();

    expect(projects.map((project) => project.slugId)).toEqual(["demo"]);
    expect(warn).toHaveBeenCalledWith(
      "Falling back to json-file linear-local store",
      expect.objectContaining({ dbPath, error: "sqlite unavailable" }),
    );
    await expect(readFile(`${dbPath}.json`, "utf8")).resolves.toContain('"slugId": "demo"');

    vi.resetModules();
    const { getStore: getStoreAgain } = await import("../lib/shared-store");
    const persistedProjects = await (await getStoreAgain()).listProjects();
    expect(persistedProjects.map((project) => project.slugId)).toContain("demo");
  });
});
