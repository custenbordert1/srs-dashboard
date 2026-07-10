export { buildP1682ExecutiveReadinessAdvisor } from "@/lib/p168.2-executive-readiness-advisor/build-readiness-advisor";
export {
  calculateReadinessProgress,
  buildCurrentReadiness,
  P1682_REQUIRED_READINESS_SCORE,
} from "@/lib/p168.2-executive-readiness-advisor/calculate-readiness-progress";
export { estimateNextReadyTime } from "@/lib/p168.2-executive-readiness-advisor/estimate-next-ready-time";
export {
  buildActionPlan,
  buildWhyWaiting,
  buildWhatMustChange,
  buildRemainingBlockers,
} from "@/lib/p168.2-executive-readiness-advisor/build-action-plan";
export {
  buildReadinessDelta,
  buildTimelineFromSnapshots,
  snapshotFromDecisionCenter,
} from "@/lib/p168.2-executive-readiness-advisor/build-readiness-delta";
export { emptyP1682ReadinessAdvisorReport } from "@/lib/p168.2-executive-readiness-advisor/empty-report";
export { formatP1682Markdown, trendArrow, trendTone } from "@/lib/p168.2-executive-readiness-advisor/presentation";
export type {
  P1682ExecutiveReadinessAdvisorReport,
  P1682ActionPlanItem,
  P1682EstimatedReady,
  P1682ReadinessDelta,
  P1682TimelineEntry,
  P1682Trend,
} from "@/lib/p168.2-executive-readiness-advisor/types";
export { P168_2_SOURCE_PHASE } from "@/lib/p168.2-executive-readiness-advisor/types";
