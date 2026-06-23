export {
  pauseAutopilot,
  resumeAutopilot,
  setAutopilotMode,
  loadAutopilotPolicy,
  saveAutopilotPolicy,
  listAutopilotRuns,
  recordAutopilotRun,
} from "@/lib/autonomous-recruiting-autopilot/autopilot-policy-store";
export { loadRecommendationFeedbackIndex, saveRecommendationFeedbackIndex } from "@/lib/autonomous-recruiting-autopilot/recommendation-feedback-store";
export { applyRecommendationFeedbackToAds } from "@/lib/autonomous-recruiting-autopilot/apply-feedback-priority";
export {
  approveCorrelationWithP59Accountability,
  recordP59ExecutionOutcome,
  P59_SOURCE_MODULE,
  P59_SOURCE_PHASE,
  P59_SYSTEM_ACTOR,
} from "@/lib/autonomous-recruiting-autopilot/bridge-p59-accountability";
export { buildAutopilotPerformance } from "@/lib/autonomous-recruiting-autopilot/build-autopilot-performance";
export {
  buildRecommendationFeedback,
  buildAndPersistRecommendationFeedback,
} from "@/lib/autonomous-recruiting-autopilot/build-recommendation-feedback";
export { buildAutopilotDashboardSnapshot } from "@/lib/autonomous-recruiting-autopilot/build-autopilot-dashboard-snapshot";
export {
  runAutopilotPlanning,
  executeEligibleRecommendations,
  evaluateApprovalRules,
  resolveAutopilotAutonomy,
} from "@/lib/autonomous-recruiting-autopilot/run-autopilot-planning";
export type {
  AutopilotDashboardSnapshot,
  AutopilotOperatingMode,
  AutopilotPerformanceMetrics,
  AutopilotPlanningResult,
  AutopilotPolicy,
  AutopilotRunEntry,
  RecommendationEffectivenessRow,
  RecommendationFeedbackIndex,
  RecommendationFeedbackSnapshot,
} from "@/lib/autonomous-recruiting-autopilot/types";
