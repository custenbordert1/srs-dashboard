export const P176_SOURCE_PHASE = "P176";

export type P176CandidateSnapshot = {
  rank: number;
  candidateId: string;
  name: string;
  email: string;
  appliedAt: string;
  assignedRecruiter: string;
  p157Recommendation: string | null;
  p157Confidence: number | null;
  paperworkEligible: boolean;
  blockers: string[];
  duplicateBlocked: boolean;
  assignedInThisRun: boolean;
};

export type P176RecruiterAssignmentReport = {
  sourcePhase: typeof P176_SOURCE_PHASE;
  generatedAt: string;
  dryRun: boolean;
  readOnlyPaperwork: true;
  noBreezyWrites: true;
  noDropboxWrites: true;
  summary: {
    newest25Count: number;
    recruitersAssigned: number;
    stillBlockedCount: number;
    duplicateBlockedCount: number;
    paperworkEligibleBefore: number;
    paperworkEligibleAfter: number;
    newlyPaperworkEligible: number;
    expectedPaperworkSendCount: number;
    dropboxApiProjection: {
      postRequests: number;
      getRequests: number;
      totalRequests: number;
      withinBudget: boolean;
      budgetCeiling: number;
    };
    noDuplicatePaperworkRisk: boolean;
    paperworkSent: false;
  };
  before: P176CandidateSnapshot[];
  after: P176CandidateSnapshot[];
  assignments: Array<{
    candidateId: string;
    name: string;
    email: string;
    recruiter: string;
    confidence: number;
    reason: string;
    skippedReason?: string;
  }>;
  rollbackPath: string | null;
  conclusion: string;
};
