import { createLinearGraphqlServer } from "@symphony/linear-schema/server";
import { createInMemoryStore } from "@symphony/linear-schema/store";

let yoga: { fetch: (...args: any[]) => Promise<Response> } | undefined;

function getYoga() {
  if (!yoga) {
    const token = process.env.LINEAR_LOCAL_TOKEN ?? "local-dev-token";
    const store = createInMemoryStore();
    store.seedDefaultProject("symphony-local");
    yoga = createLinearGraphqlServer({ store, token });
  }
  return yoga;
}

async function handle(request: Request): Promise<Response> {
  return getYoga().fetch(request);
}

export { handle as GET, handle as POST };
