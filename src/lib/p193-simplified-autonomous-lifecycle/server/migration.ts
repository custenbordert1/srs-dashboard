import "server-only";

/**
 * Server-only migration helpers for persisting projected legacy rows.
 * Pure mapping lives in shared migrationAdapter / client-projection.
 */
export { mapLegacyWorkflowToP193State } from "@/lib/p193-simplified-autonomous-lifecycle/migrationAdapter";
export { projectCandidateRowToP193 } from "@/lib/p193-simplified-autonomous-lifecycle/client-projection";
export {
  upsertP193Record,
  listP193Records,
} from "@/lib/p193-simplified-autonomous-lifecycle/server/persistence";
