import type { CoverageStatus } from "@/lib/autonomous-recruiting-engine/types";
import type { ExecutionCorrelation } from "@/lib/autonomous-recruiting-execution/execution-correlation";

export type HiringReadinessStatus = "ready-to-place" | "needs-action" | "blocked";

export type HiringReadinessRow = {
  candidateId: string;
  candidateName: string;
  territory: string;
  city: string;
  state: string;
  status: HiringReadinessStatus;
  candidateScore: number;
  grade: string;
  confidence: string;
  paperworkStatus: string;
  workflowStatus: string;
  readyForMel: boolean;
  missingRequirements: string[];
};

export type PlacementConfidence = "high" | "medium" | "low";

export type PlacementRecommendation = {
  candidateId: string;
  candidateName: string;
  placementScore: number;
  confidence: PlacementConfidence;
  recommendedTerritory: string;
  recommendedProject: string;
  recommendedProjectId: string;
  distanceMiles: number | null;
  coverageUrgency: CoverageStatus;
  readinessStatus: HiringReadinessStatus;
  reasons: string[];
};

export type PlacementFunnelStageId =
  | "coverage-need"
  | "job-posted"
  | "applicants-scored"
  | "candidate-recommended"
  | "paperwork-triggered"
  | "paperwork-completed"
  | "ready-for-mel"
  | "placement-recommended"
  | "coverage-filled"
  | "outcome-verified";

export type PlacementFunnelStage = {
  id: PlacementFunnelStageId;
  label: string;
  count: number;
  detail?: string;
};

export type PaperworkBottleneck = {
  candidateId: string;
  candidateName: string;
  territory: string;
  workflowStatus: string;
  paperworkStatus: string;
  daysInStage: number | null;
  blocker: string;
};

export type CoverageGapAwaitingCandidate = {
  territoryKey: string;
  territoryLabel: string;
  coverageStatus: CoverageStatus;
  openCalls: number;
  pipelineCandidates: number;
  readyCandidates: number;
  recommendedAction: string;
};

export type PlacementQueueItem = {
  candidateId: string;
  candidateName: string;
  readinessStatus: HiringReadinessStatus;
  placementScore: number;
  recommendedProject: string | null;
  matchLabel: PlacementMatchLabel | null;
  correlationId: string | null;
  correlationStatus: ExecutionCorrelation["status"] | null;
  approvalStatus: "pending" | "approved" | "rejected" | "needs-review" | null;
};

export type PlacementMatchLabel =
  | "Strong Match"
  | "Good Match"
  | "Review Needed"
  | "Do Not Recommend";

export type PlacementFitScores = {
  placementConfidence: number;
  territoryFit: number;
  projectFit: number;
  distanceFit: number;
  availabilityFit: number;
  readinessFit: number;
};

export type PlacementExecutionRecommendation = PlacementRecommendation & {
  recommendationId: string;
  matchLabel: PlacementMatchLabel;
  fitScores: PlacementFitScores;
};

export type PlacementOutcomeMetrics = {
  recommendedPlacements: number;
  approvedPlacements: number;
  placementSuccessRate: number | null;
  coverageGapsFilled: number;
  placementRoi: number | null;
  timeToFillImprovementDays: number | null;
  recommendationAccuracy: number | null;
};

export type AutoPlacementOpportunity = {
  candidateId: string;
  candidateName: string;
  territory: string;
  placementScore: number;
  recommendedProject: string;
  correlationId: string | null;
  hiringAction: string | null;
  coverageUrgency: CoverageStatus;
};

export type TimeToFillMetric = {
  territoryLabel: string;
  territoryKey: string;
  applicants: number;
  targetApplicants: number;
  timeToFillDays: number | null;
  readyForPlacement: number;
};

export type PlacementCommandCenterSnapshot = {
  fetchedAt: string;
  funnel: PlacementFunnelStage[];
  readiness: HiringReadinessRow[];
  placementRecommendations: PlacementRecommendation[];
  readyForPlacement: HiringReadinessRow[];
  paperworkBottlenecks: PaperworkBottleneck[];
  coverageGaps: CoverageGapAwaitingCandidate[];
  placementQueue: PlacementQueueItem[];
  autoPlacementOpportunities: AutoPlacementOpportunity[];
  timeToFill: TimeToFillMetric[];
  kpis: {
    readyForPlacement: number;
    needsAction: number;
    blocked: number;
    openCoverageGaps: number;
    autoPlacementCount: number;
    avgTimeToFillDays: number | null;
    recommendedPlacements: number;
    approvedPlacements: number;
    placementSuccessRate: number | null;
    coverageGapsFilled: number;
    placementRoi: number | null;
  };
  placementExecutionRecommendations: PlacementExecutionRecommendation[];
  placementOutcomes: PlacementOutcomeMetrics;
};
