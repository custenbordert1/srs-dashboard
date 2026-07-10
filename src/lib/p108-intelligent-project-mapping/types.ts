export const P108_SOURCE_PHASE = "P108";
export const P108_DEFAULT_MODE = "dryRun" as const;

export type P108RunMode = "dryRun" | "analysis";

export type MappingDecision = "AUTO_MAP" | "REVIEW" | "NO_MATCH";

export type MappingReviewAction = "approve" | "reject" | "skip";

export type JobSignals = {
  client: string | null;
  projectCode: string | null;
  roleType: string | null;
  normalizedTitle: string;
};

export type MappingFactorScore = {
  factor: string;
  points: number;
  maxPoints: number;
  matched: boolean;
  detail: string;
};

export type CandidateMappingRecommendation = {
  candidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  appliedDate: string | null;
  currentClosedPosition: {
    positionId: string;
    title: string;
    city: string;
    state: string;
    breezyStatus: string;
    postingAgeDays: number | null;
  };
  recommendedProjectId: string | null;
  recommendedPositionId: string | null;
  recommendedPositionTitle: string | null;
  recommendedCity: string | null;
  recommendedState: string | null;
  confidenceScore: number;
  mappingDecision: MappingDecision;
  mappingReason: string[];
  factorScores: MappingFactorScore[];
  explanationHeadline: string;
  recruiter: string | null;
  territoryDm: string | null;
  distanceMiles: number | null;
  coverageDemandScore: number;
};

export type MappingReviewQueueItem = {
  candidateId: string;
  currentClosedPosition: CandidateMappingRecommendation["currentClosedPosition"];
  recommendedPosition: {
    positionId: string | null;
    title: string | null;
    city: string | null;
    state: string | null;
  };
  confidence: number;
  mappingDecision: MappingDecision;
  explanation: string[];
  explanationHeadline: string;
  availableActions: MappingReviewAction[];
  priorDecision: MappingReviewAction | null;
};

export type ProjectMappingAnalytics = {
  autoMapCount: number;
  reviewCount: number;
  noMatchCount: number;
  averageConfidence: number;
  topBlockedProjects: Array<{
    positionId: string;
    title: string;
    city: string;
    state: string;
    candidateCount: number;
    averageConfidence: number;
    dominantDecision: MappingDecision;
  }>;
  topRecoverableProjects: Array<{
    positionId: string;
    title: string;
    city: string;
    state: string;
    candidateCount: number;
    autoMapCount: number;
    averageConfidence: number;
  }>;
  recoveredApplicants: number;
  candidatesSaved: number;
  coverageImpact: {
    openMelOpportunitiesInScope: number;
    statesWithDemand: string[];
    autoMapStates: string[];
    potentialCoverageGain: number;
  };
};

export type ProjectMappingReport = {
  sourcePhase: typeof P108_SOURCE_PHASE;
  generatedAt: string;
  mode: P108RunMode;
  summary: string;
  metrics: ProjectMappingAnalytics & {
    closedAdCandidatesEvaluated: number;
    publishedPositionsConsidered: number;
  };
  recommendations: CandidateMappingRecommendation[];
  candidateExamples: {
    highestConfidence: CandidateMappingRecommendation[];
    lowestConfidence: CandidateMappingRecommendation[];
  };
  reviewQueue: MappingReviewQueueItem[];
  warnings: string[];
};

export type MappingReviewRecord = {
  candidateId: string;
  sourcePositionId: string;
  recommendedPositionId: string | null;
  action: MappingReviewAction;
  decidedAt: string;
  decidedBy?: string;
  confidenceScore: number;
};
