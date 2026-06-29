export {
  buildCandidateAdvancementDecision,
  buildCandidateAdvancementDecisions,
} from "@/lib/candidate-advancement-engine/build-advancement-decision";
export { applyCandidateAdvancements } from "@/lib/candidate-advancement-engine/apply-candidate-advancements";
export type { CandidateAdvancementApplyResult } from "@/lib/candidate-advancement-engine/apply-candidate-advancements";
export {
  ADVANCEMENT_ACTION_LABELS,
  type CandidateAdvancementAction,
  type CandidateAdvancementDecision,
  type CandidateAdvancementEngineOptions,
  type CandidateAdvancementPolicy,
} from "@/lib/candidate-advancement-engine/types";
