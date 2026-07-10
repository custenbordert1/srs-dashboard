export {
  buildCandidateFirstPaperworkReport,
  getP151CandidateFirstMaxSends,
  isP151CandidateFirstPaperworkEnabled,
} from "@/lib/candidate-first-paperwork-eligibility/build-candidate-first-report";
export {
  detectCandidateFirstHardBlockers,
  evaluateCandidateFirstPaperwork,
  CANDIDATE_FIRST_CONFIDENCE_MIN,
} from "@/lib/candidate-first-paperwork-eligibility/evaluate-candidate-first-paperwork";
export {
  findNearestActiveOperationalNeed,
  hasOperationalFit,
  resolveOriginalJobStatus,
} from "@/lib/candidate-first-paperwork-eligibility/match-active-operational-need";
export { formatCandidateFirstPaperworkMarkdown } from "@/lib/candidate-first-paperwork-eligibility/format-candidate-first-markdown";
export type {
  CandidateFirstCountCategory,
  CandidateFirstPaperworkReport,
  CandidateFirstPaperworkRow,
  CandidateFirstRecommendedAction,
} from "@/lib/candidate-first-paperwork-eligibility/types";
export {
  P151_1_DEFAULT_MAX_SENDS,
  P151_1_SOURCE_PHASE,
} from "@/lib/candidate-first-paperwork-eligibility/types";
