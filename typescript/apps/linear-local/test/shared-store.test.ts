import { beforeEach, describe, expect, it, vi } from "vitest";

describe("getStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("falls back to the in-memory store when sqlite initialization fails", async () => {
    vi.mock("@symphony/linear-schema", async () => {
      const actual =
        await vi.importActual<typeof import("@symphony/linear-schema")>("@symphony/linear-schema");
      return {
        ...actual,
        createSqliteStore: () => {
          throw new Error("sqlite unavailable");
        },
      };
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getStore } = await import("../lib/shared-store");

    const store = await getStore();
    const projects = await store.listProjects();

    expect(projects.map((project) => project.slugId)).toContain("symphony-local");
    expect(warn).toHaveBeenCalledWith(
      "Falling back to in-memory linear-local store",
      expect.objectContaining({ error: "sqlite unavailable" }),
    );
  });
});
