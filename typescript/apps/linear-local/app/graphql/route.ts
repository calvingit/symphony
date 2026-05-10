import { createLinearGraphqlServer } from "@symphony/linear-schema/server";
import { getStore } from "../../lib/shared-store";

const store = getStore();
const token = process.env.LINEAR_LOCAL_TOKEN ?? "local-dev-token";
const yoga = createLinearGraphqlServer({ store, token, allowUnauthenticatedLocal: true });

async function handle(request: Request): Promise<Response> {
  return yoga.fetch(request);
}

export { handle as GET, handle as POST };
