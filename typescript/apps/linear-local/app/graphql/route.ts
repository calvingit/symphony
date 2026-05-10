import { createLinearGraphqlServer } from "@symphony/linear-schema/server";
import { getStore } from "../../lib/shared-store";

const token = process.env.LINEAR_LOCAL_TOKEN ?? "local-dev-token";

async function handle(request: Request): Promise<Response> {
  const store = await getStore();
  const yoga = createLinearGraphqlServer({ store, token, allowUnauthenticatedLocal: true });
  return yoga.fetch(request);
}

export { handle as GET, handle as POST };
