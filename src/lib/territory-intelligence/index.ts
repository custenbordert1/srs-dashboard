export {
  TERRITORY_COVERAGE_THRESHOLD,
  resolveCoverageHealthTier,
  type CoverageHealthTier,
} from "@/lib/territory-intelligence/coverage-tier";
export {
  aggregateActiveRepsByState,
  buildTerritoryHealth,
  countActiveRepsForDm,
  countActiveRepsFromOnboardingFallback,
  countApplicantsLast7Days,
  countHiredFromCandidates,
  countOpenCallsForDm,
  countOpenCallsFromDemandSignals,
  countReadyForMel,
  countWorkflowPaperworkSent,
  countWorkflowReadyForMel,
  filterCandidatesByStates,
  filterJobsByStates,
  isHiredStage,
} from "@/lib/territory-intelligence/metric-calculators";
export {
  buildAttentionScore,
  buildDmTerritoryRollups,
  buildRecruitingPipelineFromDashboardSnapshot,
  buildRecruitingPipelineMetrics,
  buildTerritoryMetricsForStates,
  buildTerritoryMetricsFromDashboardSnapshot,
  countNeedsAttentionFromAlertSummary,
  topTerritoriesNeedingAttention,
  type TerritoryIntelligenceContext,
} from "@/lib/territory-intelligence/build-territory-rollup";
export type {
  RecruitingPipelineMetrics,
  TerritoryDemandSignals,
  TerritoryMetrics,
  TerritoryOnboardingSignals,
  TerritoryRollupRow,
} from "@/lib/territory-intelligence/types";
