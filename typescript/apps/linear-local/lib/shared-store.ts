import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { LocalLinearStore } from "@symphony/linear-schema";

let store: LocalLinearStore | undefined;
let storePromise: Promise<LocalLinearStore> | undefined;

export async function getStore(): Promise<LocalLinearStore> {
  if (store) return store;
  if (!storePromise) {
    storePromise = createStore();
  }
  store = await storePromise;
  return store;
}

async function createStore(): Promise<LocalLinearStore> {
  const { createSqliteStore } = await import("@symphony/linear-schema");
  const repoRoot = findGitRoot(process.cwd()) ?? process.cwd();
  const dbPath =
    process.env.LINEAR_LOCAL_DB_PATH ?? resolve(repoRoot, "typescript/tmp/linear-local.db");
  mkdirSync(dirname(dbPath), { recursive: true });
  const nextStore = createSqliteStore(dbPath);
  await nextStore.seedDefaultProject("symphony-local");
  await nextStore.updateProject("symphony-local", {
    name: "Symphony Local",
    workspace: {
      kind: "local",
      localPath: repoRoot,
      remoteUrl: null,
      baseBranch: "main",
    },
  });
  return nextStore;
}

function findGitRoot(start: string): string | null {
  let current = resolve(start);
  while (true) {
    if (existsSync(resolve(current, ".git"))) {
      return current;
    }
    const parent = resolve(current, "..");
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
