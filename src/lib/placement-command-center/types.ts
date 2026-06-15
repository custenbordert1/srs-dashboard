import type { StaffingRiskLevel } from "@/lib/coverage-risk-engine/types";
import type { DistrictManager } from "@/lib/dm-territory-map";

export type PlacementFunnelStageId =
  | "applied"
  | "reviewed"
  | "contacted"
  | "paperwork"
  | "signed"
  | "ready-for-mel"
  | "placed"
  | "completed-first-project";

export type PlacementCoverageRisk = "green" | "yellow" | "red";

export type ProjectFillOutcome = "likely-to-fill" | "at-risk" | "critical";

export type PlacementFunnelStageRow = {
  id: PlacementFunnelStageId;
  label: string;
  count: number;
  conversionPercent: number | null;
  dropOffPercent: number | null;
  avgDaysInStage: number | null;
  trend: "up" | "down" | "flat";
};

export type StoreCoverageRow = {
  opportunityId: string;
  store: string;
  client: string;
  project: string;
  openCalls: number;
  candidatesAssigned: number;
  candidatesInPipeline: number;
  coveragePercent: number;
  risk: PlacementCoverageRisk;
  staffingRisk: StaffingRiskLevel;
};

export type ProjectFillForecastRow = {
  opportunityId: string;
  projectName: string;
  client: string;
  currentFillRatePercent: number;
  requiredFillRatePercent: number;
  projectedFinishDate: string | null;
  outcome: ProjectFillOutcome;
  confidenceScore: number;
  reason: string;
};

export type ConversionSegmentRow = {
  segmentKey: string;
  segmentLabel: string;
  applicationToContact: number | null;
  contactToPaperwork: number | null;
  paperworkToSigned: number | null;
  signedToMel: number | null;
  melToFirstProject: number | null;
};

export type RecruiterPlacementScorecardRow = {
  recruiterName: string;
  placements: number;
  conversionRatePercent: number;
  avgTimeToPlacementDays: number | null;
  melReadyCount: number;
  projectCompletions: number;
  score: number;
};

export type DmCoverageScorecardRow = {
  dmName: DistrictManager | string;
  coveragePercent: number;
  repUtilizationPercent: number;
  placementVelocity: number;
  openCallReduction: number;
  openCalls: number;
  score: number;
};

export type OpenCallRecoveryAction = {
  id: string;
  opportunityId: string;
  store: string;
  client: string;
  project: string;
  issue: string;
  suggestedAction: string;
  severity: "critical" | "high" | "medium";
  agingDays: number | null;
};

export type ExecutivePlacementBoardRow = {
  id: string;
  category: "project" | "state" | "coverage-gap" | "improving-territory";
  label: string;
  detail: string;
  metric: string;
  severity: PlacementCoverageRisk;
};

export type PlacementCommandCenterSnapshot = {
  fetchedAt: string;
  funnel: PlacementFunnelStageRow[];
  storeCoverage: StoreCoverageRow[];
  projectForecasts: ProjectFillForecastRow[];
  conversionByRecruiter: ConversionSegmentRow[];
  conversionByDm: ConversionSegmentRow[];
  conversionByProject: ConversionSegmentRow[];
  conversionByState: ConversionSegmentRow[];
  recruiterScorecard: RecruiterPlacementScorecardRow[];
  dmScorecard: DmCoverageScorecardRow[];
  openCallRecovery: OpenCallRecoveryAction[];
  executiveBoard: ExecutivePlacementBoardRow[];
  summary: {
    totalOpenCalls: number;
    avgCoveragePercent: number;
    placements30d: number;
    criticalProjects: number;
  };
};
