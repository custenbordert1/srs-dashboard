/**
 * @deprecated Import from `client-projection` instead.
 * Kept as a thin re-export that must NOT import the server store.
 */
export {
  projectCandidateRowToP193,
  projectLegacyRowToStatusViewModel,
  toP193CandidateStatusViewModel,
} from "@/lib/p193-simplified-autonomous-lifecycle/client-projection";
export type {
  P193CandidateStatusViewModel,
  P193LegacyRowProjectionInput,
} from "@/lib/p193-simplified-autonomous-lifecycle/client-projection";
