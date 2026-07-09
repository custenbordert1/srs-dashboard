export const P1761_SOURCE_PHASE = "P176.1";

export type P1761CandidateRow = {
  rank: number;
  candidateId: string;
  name: string;
  email: string;
  appliedAt: string;
  assignedRecruiter: string;
  p157Before: string | null;
  p157After: string | null;
  p157Confidence: number | null;
  p157ActionChanged: boolean;
  p152EligibleBefore: boolean;
  p152EligibleAfter: boolean;
  p152BlockersAfter: string[];
  p169Outcome: string | null;
  readyForPaperwork: boolean;
  duplicateBlocked: boolean;
  assignedInP176: boolean;
};

export type P1761PatriciaIrbyValidation = {
  assignedToLogan: boolean;
  assignedRecruiter: string;
  p170Discoverable: boolean;
  p157Evaluated: boolean;
  p157Action: string | null;
  p152PaperworkEligible: boolean;
  readyForSend: boolean;
  blockers: string[];
};

export type P1761PostAssignmentReport = {
  sourcePhase: typeof P1761_SOURCE_PHASE;
  generatedAt: string;
  readOnly: true;
  p176Baseline: {
    artifactPath: string;
    generatedAt: string | null;
    recruitersAssigned: number;
  };
  summary: {
    newest25Count: number;
    p157AssignRecruiterBefore: number;
    p157SendPaperworkAfter: number;
    p157ActionChangedCount: number;
    p152EligibleBefore: number;
    p152EligibleAfter: number;
    readyForPaperworkCount: number;
    stillBlockedCount: number;
    duplicateBlockedCount: number;
    projectedDropboxApiCalls: number;
    dropboxWithinBudget: boolean;
    controlledOperatorSendSafe: boolean;
  };
  newest25: P1761CandidateRow[];
  readyForPaperwork: Array<{
    candidateId: string;
    name: string;
    email: string;
    recruiter: string;
    p157Action: string;
    p169Outcome: string;
  }>;
  stillBlocked: Array<{
    candidateId: string;
    name: string;
    blockers: string[];
  }>;
  patriciaIrby: P1761PatriciaIrbyValidation;
  controlledOperatorSendCycle: {
    safe: boolean;
    reasons: string[];
    p169GatesPass: boolean;
    p169BlockingFactors: string[];
  };
  conclusion: string;
};
