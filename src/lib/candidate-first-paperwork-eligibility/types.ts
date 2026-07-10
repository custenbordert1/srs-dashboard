export const P151_1_SOURCE_PHASE = "P151.1";
export const P151_1_DEFAULT_MAX_SENDS = 10;

export type CandidateFirstRecommendedAction =
  | "Send Paperwork"
  | "Assign Recruiter"
  | "Manual Review"
  | "Do Not Send";

export type CandidateFirstCountCategory =
  | "Send Paperwork"
  | "Assign Recruiter"
  | "Manual Review"
  | "Do Not Send"
  | "Already Sent"
  | "Duplicate"
  | "Invalid Email";

export type CandidateFirstPaperworkRow = {
  candidateId: string;
  candidateName: string;
  cityState: string;
  email: string | null;
  phone: string | null;
  applicationDate: string | null;
  originalJobStatus: "published" | "closed_or_unpublished" | "unknown";
  originalJobName: string;
  nearestActiveNeed: string | null;
  operationalFitScore: number | null;
  recommendedAction: CandidateFirstRecommendedAction;
  sendPaperworkEligible: boolean;
  reason: string;
  blockers: string[];
  warnings: string[];
  manualReviewReason: string | null;
  recruiterAssigned: boolean;
  dmTerritory: string | null;
  confidence: number;
  hasResume: boolean;
  questionnaireReady: boolean | null;
  duplicateStatus: boolean;
  priorPaperworkStatus: string;
  countCategory: CandidateFirstCountCategory;
};

export type CandidateFirstPaperworkReport = {
  sourcePhase: typeof P151_1_SOURCE_PHASE;
  generatedAt: string;
  dryRun: boolean;
  candidateFirstEnabled: boolean;
  candidatesEvaluated: number;
  categoryCounts: Record<CandidateFirstCountCategory, number>;
  actionCounts: Record<CandidateFirstRecommendedAction, number>;
  sentCount: number;
  skippedCount: number;
  blockedCount: number;
  failedCount: number;
  duplicatesPrevented: number;
  executionTimeMs: number;
  safetyFlags: {
    breezyWrites: false;
    executeBatchCalled: false;
    breezyCandidateMovement: false;
    candidateFirstEnabled: boolean;
  };
  rollbackRecommendation: string;
  candidates: CandidateFirstPaperworkRow[];
};
