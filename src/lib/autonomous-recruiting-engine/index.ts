export { buildCoverageNeeds } from "@/lib/autonomous-recruiting-engine/build-coverage-needs";
export { buildPostingRecommendations } from "@/lib/autonomous-recruiting-engine/build-posting-recommendations";
export {
  buildHiringRecommendations,
  countHiringRecommendationsByAction,
  resolveHiringAction,
} from "@/lib/autonomous-recruiting-engine/build-hiring-recommendations";
export {
  buildAutopilotSnapshot,
  HOURS_SAVED_FORMULA,
} from "@/lib/autonomous-recruiting-engine/build-autopilot-snapshot";
export {
  DEFAULT_APPROVAL_RULES,
  evaluateApprovalRules,
  applyApprovalRulesToAds,
} from "@/lib/autonomous-recruiting-engine/approval-rules";
export {
  listApprovalRules,
  saveApprovalRules,
  recordRuleTrigger,
  upsertApprovalRule,
} from "@/lib/autonomous-recruiting-engine/approval-rules-store";
export type {
  AutonomousRecruitingSnapshot,
  ApprovalRule,
  AutopilotKpis,
  CoverageStatus,
  HiringRecommendation,
  HiringRecommendationAction,
  PipelineFlowStep,
  PostingApprovalStatus,
  RecommendedAd,
  TerritoryCoverageNeed,
} from "@/lib/autonomous-recruiting-engine/types";
