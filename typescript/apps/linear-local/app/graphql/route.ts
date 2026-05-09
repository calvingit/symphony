import { join } from "node:path";
import { createLinearGraphqlServer, createSqliteStore } from "@symphony/linear-schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let yoga: any;

function getYoga() {
  if (!yoga) {
    const databasePath = process.env.LINEAR_LOCAL_DB ?? join(process.cwd(), ".linear-local.sqlite");
    const token = process.env.LINEAR_LOCAL_TOKEN ?? "local-dev-token";
    const store = createSqliteStore(databasePath);
    store.seedDefaultProject("symphony-local");
    yoga = createLinearGraphqlServer({ store, token });
  }
  return yoga;
}

async function handle(request: Request): Promise<Response> {
  return getYoga().fetch(request);
}

export { handle as GET, handle as POST };
