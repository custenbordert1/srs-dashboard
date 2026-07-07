import type { CoverageStatus } from "@/lib/autonomous-recruiting-engine/types";

export const P156_SOURCE_PHASE = "P156" as const;

export type P156PriorityFactorId =
  | "projectUrgency"
  | "daysUntilProjectStart"
  | "openCallDemand"
  | "applicationAge"
  | "distanceToOpenStores"
  | "candidateStage"
  | "recruiterAssignmentStatus"
  | "previousResponsiveness"
  | "paperworkCompletionLikelihood"
  | "activeHiringCampaigns"
  | "continuityVsOneTime"
  | "territoryShortages"
  | "candidateQuality";

export type P156PriorityLevel = "critical" | "high" | "medium" | "low";

export type P156FactorBreakdown = {
  factorId: P156PriorityFactorId;
  label: string;
  subscore: number;
  weight: number;
  weightedContribution: number;
  explanation: string | null;
};

export type P156PrioritizedCandidate = {
  candidateId: string;
  candidateName: string;
  email: string | null;
  priorityScore: number;
  priorityLevel: P156PriorityLevel;
  reasoning: string[];
  recommendedNextAction: string;
  recruiter: string;
  dm: string;
  position: string;
  positionId: string;
  project: string | null;
  territory: string;
  state: string | null;
  openDemand: number;
  daysInPipeline: number | null;
  workflowStatus: string;
  factorBreakdown: P156FactorBreakdown[];
};

export type P156RiskPosition = {
  positionName: string;
  positionId: string;
  urgency: CoverageStatus;
  openDemand: number;
  candidateCount: number;
  topCandidateScore: number;
};

export type P156DemandMarket = {
  territory: string;
  dmName: string;
  states: string[];
  openCalls: number;
  coverageStatus: CoverageStatus;
  coverageNeedScore: number;
};

export type P156QueueFilters = {
  recruiter: string | null;
  dm: string | null;
  state: string | null;
  project: string | null;
  priorityMin: number | null;
  priorityMax: number | null;
  stage: string | null;
};

export type P156QueueSections = {
  topPriority: P156PrioritizedCandidate[];
  highestRiskPositions: P156RiskPosition[];
  highestDemandMarkets: P156DemandMarket[];
  readyForPaperwork: P156PrioritizedCandidate[];
  awaitingRecruiter: P156PrioritizedCandidate[];
  awaitingFollowUp: P156PrioritizedCandidate[];
  readyForMel: P156PrioritizedCandidate[];
};

export type P156PrioritizedQueue = {
  generatedAt: string;
  readOnly: true;
  sourcePhase: typeof P156_SOURCE_PHASE;
  filters: P156QueueFilters;
  candidates: P156PrioritizedCandidate[];
  sections: P156QueueSections;
  filterOptions: {
    recruiters: string[];
    dms: string[];
    states: string[];
    projects: string[];
    stages: string[];
  };
  warnings: string[];
};

export type P156ScoringContext = {
  openDemand: number;
  coverageStatus: CoverageStatus;
  coverageNeedScore: number;
  territoryLabel: string;
  dmName: string;
  daysUntilProjectStart: number | null;
  hasActiveCampaign: boolean;
  isContinuityProject: boolean;
  nearestDistanceMiles: number | null;
  referenceMs: number;
};
