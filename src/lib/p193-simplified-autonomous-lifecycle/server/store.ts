import "server-only";

/**
 * App Router / Route Handler entry for P193 persistence.
 * Re-exports filesystem persistence under a server-only boundary.
 */
export {
  emptyStore,
  readP193LifecycleStore,
  writeP193LifecycleStore,
  readP193Flags,
  writeP193Flags,
  upsertP193Record,
  transitionP193State,
  listP193Records,
  createP193Record,
} from "@/lib/p193-simplified-autonomous-lifecycle/server/persistence";
export type { P193LifecycleStoreFile } from "@/lib/p193-simplified-autonomous-lifecycle/server/persistence";
