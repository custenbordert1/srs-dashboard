export type {
  CoverageRiskSnapshot,
  CoverageRiskExecutiveSummary,
  DmCoverageRiskAlerts,
  OpportunityCoverageRow,
  StaffingRiskLevel,
  StateStaffingDensityRow,
  NearbyRepCounts,
} from "@/lib/coverage-risk-engine/types";

export { buildCoverageRiskSnapshot } from "@/lib/coverage-risk-engine/build-coverage-risk-snapshot";
export { scoreOpportunityCoverage, classifyStaffingRisk } from "@/lib/coverage-risk-engine/opportunity-coverage";
export { countRepsNearOpportunity } from "@/lib/coverage-risk-engine/rep-proximity";
