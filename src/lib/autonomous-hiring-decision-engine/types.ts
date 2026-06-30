export const P87_SOURCE_PHASE = "P87";
export const P87_PREVIEW_MODE = true as const;

export type HiringRecommendationAction =
  | "fast_track"
  | "recruiter_review"
  | "hold"
  | "reject"
  | "missing_information";

export const HIRING_RECOMMENDATION_LABELS: Record<HiringRecommendationAction, string> = {
  fast_track: "Fast Track",
  recruiter_review: "Recruiter Review",
  hold: "Hold",
  reject: "Reject",
  missing_information: "Missing Information",
};

export type HiringDecisionConfidence = "high" | "medium" | "low";

export type HiringDecisionRules = {
  fastTrack: {
    allowedGrades: string[];
    allowedConfidence: HiringDecisionConfidence[];
    requireResume: boolean;
    requireQuestionnaire: boolean;
    requireTransportationConfirmed: boolean;
    requireSmartphoneConfirmed: boolean;
    maxNegativeContributors: number;
    requirePublishedJob: boolean;
  };
  reject: {
    disqualifyingGrades: string[];
    rejectOnNoTransportation: boolean;
    rejectTerminalStatuses: string[];
  };
  hold: {
    holdOnClosedJob: boolean;
    holdOnMissingResume: boolean;
    holdOnMissingQuestionnaire: boolean;
    holdOnDuplicatePaperwork: boolean;
    holdOnAlreadyHired: string[];
  };
  missingInformation: {
    requireBothResumeAndQuestionnaireUnavailable: boolean;
  };
  timeSavedMinutes: Record<HiringRecommendationAction, number>;
};

export type HiringDecisionExplanation = {
  overallRecommendation: HiringRecommendationAction;
  recommendationLabel: string;
  confidence: HiringDecisionConfidence;
  confidenceScore: number;
  positiveFactors: string[];
  negativeFactors: string[];
  missingData: string[];
  recommendedRecruiterAction: string;
  estimatedTimeSavedMinutes: number;
  reasoningBullets: string[];
};

export type HiringDecision = {
  candidateId: string;
  candidateName: string;
  email: string;
  positionName: string;
  workflowStatus: string;
  grade: string;
  candidateGrade: string;
  confidence: HiringDecisionConfidence;
  action: HiringRecommendationAction;
  explanation: HiringDecisionExplanation;
  generatedAt: string;
};

export type HiringDecisionQueueId =
  | "fast_track"
  | "recruiter_review"
  | "hold"
  | "reject"
  | "missing_information";

export type HiringDecisionQueues = Record<HiringDecisionQueueId, HiringDecision[]>;

export type HiringDecisionExecutiveMetrics = {
  fastTrackCandidates: number;
  readyForPaperwork: number;
  needsReview: number;
  missingInformation: number;
  blockedCandidates: number;
  holdCandidates: number;
  rejectCandidates: number;
  averageCandidateQuality: number | null;
  averageConfidenceScore: number | null;
  recruiterTimeSavedMinutes: number;
  recruiterHoursSaved: number;
  totalCandidates: number;
};

export type HiringDecisionSimulationResult = {
  sourcePhase: typeof P87_SOURCE_PHASE;
  previewMode: typeof P87_PREVIEW_MODE;
  generatedAt: string;
  mtdRangeLabel: string;
  totalCandidates: number;
  fastTrackCount: number;
  recruiterReviewCount: number;
  holdCount: number;
  rejectCount: number;
  missingInformationCount: number;
  averageConfidence: number | null;
  estimatedRecruiterHoursSaved: number;
  topBlockReasons: Array<{ reason: string; count: number }>;
  readyForPaperworkCount: number;
  readyForP84Count: number;
  queues: HiringDecisionQueues;
  decisions: HiringDecision[];
  executiveMetrics: HiringDecisionExecutiveMetrics;
  p88PreviewNote: string;
};

export type P87FeatureFlags = {
  enabled: boolean;
  previewMode: boolean;
  refreshOnIngestion: boolean;
  updatedAt: string;
};

export type HiringDecisionPreviewSnapshot = {
  sourcePhase: typeof P87_SOURCE_PHASE;
  previewMode: typeof P87_PREVIEW_MODE;
  generatedAt: string;
  simulation: HiringDecisionSimulationResult;
};
