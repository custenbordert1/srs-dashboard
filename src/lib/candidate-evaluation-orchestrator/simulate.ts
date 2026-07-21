/**
 * Dry-run / replay — reuse P240/P242; do not fork simulate logic.
 */
export {
  applyP240FreshNewReplayReset,
  resetToFreshNewState,
  refreshBreezyCandidateData,
  validateP240FreshNewReset,
  hashP240FreshnessState,
  simulateP240CandidatePath,
} from "@/lib/p240-autonomous-new-applicant-pipeline/simulate";

export type { P240CandidateTrace } from "@/lib/p240-autonomous-new-applicant-pipeline/types";
