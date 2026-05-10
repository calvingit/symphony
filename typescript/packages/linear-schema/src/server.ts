import { createSchema, createYoga } from "graphql-yoga";
import { resolvers } from "./resolvers.js";
import { typeDefs } from "./schema.js";
import type { LocalLinearStore } from "./store.js";

export interface LocalLinearContext {
  store: LocalLinearStore;
}

export function createLinearGraphqlServer(input: { store: LocalLinearStore; token: string; allowUnauthenticatedLocal?: boolean }) {
  return createYoga<LocalLinearContext>({
    schema: createSchema({ typeDefs, resolvers }),
    context: ({ request }) => {
      const auth = request.headers.get("authorization");
      if (!input.allowUnauthenticatedLocal && auth !== `Bearer ${input.token}`) {
        throw new Error("unauthorized");
      }
      return { store: input.store };
    },
  });
}
