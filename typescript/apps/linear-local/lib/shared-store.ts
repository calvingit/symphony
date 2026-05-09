import { createInMemoryStore } from "@symphony/linear-schema/store";
import type { LocalLinearStore } from "@symphony/linear-schema/store";

let store: LocalLinearStore | undefined;

export function getStore(): LocalLinearStore {
  if (!store) {
    store = createInMemoryStore();
    store.seedDefaultProject("symphony-local");
  }
  return store;
}
