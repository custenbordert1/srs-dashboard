import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type {
  CandidateQuestionnaireIntelligence,
  CandidateReadinessScore,
  CandidateResumeIntelligence,
} from "@/lib/candidate-readiness/types";
import type { PaperworkStatus, CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";

export type PlacementCandidateInput = {
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  state: string;
  workflowStatus: CandidateWorkflowStatus;
  paperworkStatus: PaperworkStatus;
  paperworkError: string | null;
  questionnaireIntelligence: CandidateQuestionnaireIntelligence;
  resumeIntelligence: CandidateResumeIntelligence;
  candidateGrade: CandidateReadinessScore;
  skillTags: string[];
  travelFitScore: number | null;
  retailExperienceScore: number | null;
  merchandisingExperienceScore: number | null;
  intelligenceTravelRadius: number;
  distanceMiles: number | null;
};

export function toPlacementCandidateInput(row: ScoredCandidateWorkflowRow): PlacementCandidateInput {
  return {
    candidateId: row.candidateId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    city: row.city ?? "",
    state: row.state ?? "",
    workflowStatus: row.workflowStatus,
    paperworkStatus: row.paperworkStatus,
    paperworkError: row.paperworkError,
    questionnaireIntelligence: row.questionnaireIntelligence,
    resumeIntelligence: row.resumeIntelligence,
    candidateGrade: row.candidateGrade,
    skillTags: row.skillTags,
    travelFitScore: row.travelFitScore,
    retailExperienceScore: row.retailExperienceScore,
    merchandisingExperienceScore: row.merchandisingExperienceScore,
    intelligenceTravelRadius: row.intelligence?.factors?.travelRadius ?? row.travelFitScore ?? 0,
    distanceMiles: row.distanceMiles,
  };
}

export const P68_SOURCE_PHASE = "P68";
export const P68_1_SOURCE_PHASE = "P68.1";
export const P68_PREVIEW_MODE = true as const;

/** Future: Recruiting → Onboarding → Placement → Project Assignment → Performance → Retention */
export const WORKFORCE_PLACEMENT_PIPELINE_STAGES = [
  "recruiting_intelligence",
  "autonomous_onboarding",
  "workforce_placement_intelligence",
  "project_assignment",
  "representative_performance",
  "retention_intelligence",
] as const;

export type WorkforcePlacementPipelineStage = (typeof WORKFORCE_PLACEMENT_PIPELINE_STAGES)[number];

export type PlacementEligibilityStatus = "eligible" | "human_review" | "not_ready_for_work";

export type PlacementEligibilityRequirement = {
  id: string;
  label: string;
  complete: boolean;
  blocking: boolean;
  detail: string | null;
};

export type PlacementEligibilityResult = {
  candidateId: string;
  status: PlacementEligibilityStatus;
  requirements: PlacementEligibilityRequirement[];
  missingReasons: string[];
  readyForWork: boolean;
};

export type MarketDemandFactors = {
  openStoreCount: number;
  activeRepresentativeCount: number;
  staffingShortage: boolean;
  openOpportunityCount: number;
  futureWorkloadScore: number;
  coverageRatio: number | null;
  priorityOverrideBoost: number;
  /** Extensible slots for future business rules */
  extensions: Record<string, number>;
};

export type PriorityMarketLevel = "critical" | "high" | "elevated";

export type PriorityMarketOverride = {
  marketKey: string;
  marketLabel: string;
  level: PriorityMarketLevel;
  reason: string;
  expiresAt: string;
  scoreBoost: number;
  previewOnly: true;
};

export type MarketIntelligenceRow = {
  marketKey: string;
  marketLabel: string;
  city: string;
  state: string;
  dmName: string | null;
  openStoreCount: number;
  activeRepresentativeCount: number;
  openOpportunityCount: number;
  demandScore: number;
  demandFactors: MarketDemandFactors;
  priorityOverride: PriorityMarketOverride | null;
  recommended: boolean;
  staffingShortage: boolean;
};

export type MarketCapacityStatus =
  | "healthy"
  | "watch"
  | "understaffed"
  | "critical"
  | "surplus_capacity";

export type MarketCapacityPlan = {
  marketKey: string;
  marketLabel: string;
  demandScore: number;
  openStoreCount: number;
  activeRepresentativeCount: number;
  recommendedNewReps: number;
  idealRepresentativeCount: number;
  storesPerRep: number | null;
  status: MarketCapacityStatus;
  statusLabel: string;
  reason: string;
  previewOnly: true;
};

export type MarketRecommendationReason = {
  id: string;
  label: string;
  positive: boolean;
};

export type WorkforceMarketRecommendation = {
  candidateId: string;
  candidateName: string;
  candidateCity: string;
  candidateState: string;
  recommendedMarketKey: string;
  recommendedMarketLabel: string;
  demandScore: number;
  confidenceScore: number;
  confidenceLabel: "high" | "medium" | "low";
  reasoning: MarketRecommendationReason[];
  coverageImpact: string;
  previewOnly: true;
};

export type HumanReviewQueueEntry = {
  candidateId: string;
  candidateName: string;
  city: string;
  state: string;
  reasons: string[];
  requirements: PlacementEligibilityRequirement[];
  readyForWork: boolean;
};

export type WorkforcePlacementCandidateSnapshot = {
  candidateId: string;
  candidateName: string;
  email: string | null;
  city: string;
  state: string;
  previewMode: true;
  readyForWork: boolean;
  eligibility: PlacementEligibilityResult;
  recommendation: WorkforceMarketRecommendation | null;
  humanReviewRequired: boolean;
};

export type WorkforcePlacementDashboardSnapshot = {
  previewMode: true;
  sourcePhase: typeof P68_SOURCE_PHASE;
  fetchedAt: string;
  pipelineStage: WorkforcePlacementPipelineStage;
  coverageOpportunities: MarketIntelligenceRow[];
  recommendedMarkets: MarketIntelligenceRow[];
  priorityMarkets: PriorityMarketOverride[];
  readyForWorkCandidates: WorkforcePlacementCandidateSnapshot[];
  humanReviewQueue: HumanReviewQueueEntry[];
  recommendations: WorkforceMarketRecommendation[];
  workforcePlanning: MarketCapacityPlan[];
  sampleCapacityPlan: MarketCapacityPlan | null;
  metrics: {
    totalReadyForWork: number;
    eligibleForPlacement: number;
    humanReviewCount: number;
    candidatesAwaitingPlacement: number;
    averageMarketDemand: number;
    recommendedMarketCount: number;
    priorityMarketCount: number;
    totalRecommendedNewReps: number;
    understaffedMarketCount: number;
    healthyMarketCount: number;
    watchMarketCount: number;
    marketsNeedingHires: number;
  };
  sampleCandidateId: string | null;
  sampleRecommendation: WorkforceMarketRecommendation | null;
};

export type WorkforcePlacementPreviewInput = {
  candidates: ScoredCandidateWorkflowRow[];
  opportunities: MelOpportunity[];
  activeReps: ActiveRep[];
  fetchedAt?: string;
};

export type WorkforcePlacementPreviewResult = {
  ok: true;
  previewMode: typeof P68_PREVIEW_MODE;
  fetchedAt: string;
  dashboard: WorkforcePlacementDashboardSnapshot;
  warnings: string[];
};
