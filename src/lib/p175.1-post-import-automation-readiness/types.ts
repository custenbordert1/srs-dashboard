export const P1751_SOURCE_PHASE = "P175.1";

export type P1751CandidateValidationRow = {
  rank: number;
  candidateId: string;
  name: string;
  email: string;
  appliedAt: string;
  positionName: string;
  ingestionSource: string | null;
  foundInP170: boolean;
  p157Recommendation: string | null;
  p157Confidence: number | null;
  p157Evaluated: boolean;
  p169Outcome: string | null;
  p171State: string | null;
  paperworkEligible: boolean;
  blockers: string[];
  duplicatePaperworkRisk: boolean;
  activeSignatureConflict: boolean;
  invalidEmail: boolean;
};

export type P1751AutomationReadinessReport = {
  sourcePhase: typeof P1751_SOURCE_PHASE;
  generatedAt: string;
  readOnly: true;
  checks: {
    ingestionCount371: boolean;
    ingestionCountActual: number;
    p170Newest25Discoverable: boolean;
    p170DiscoverableCount: number;
    p157Newest25Evaluated: boolean;
    p157EvaluatedCount: number;
    p169Newest25Mapped: boolean;
    p171Newest25Mapped: boolean;
    noDuplicatePaperworkRisk: boolean;
    noActiveSignatureConflicts: boolean;
    noInvalidEmails: boolean;
    noSyntheticIdDuplicates: boolean;
  };
  globalValidation: {
    invalidEmailCount: number;
    invalidEmailSample: string[];
    duplicatePaperworkRiskCount: number;
    activeSignatureConflictCount: number;
    syntheticIdMismatchCount: number;
    syntheticIdCollisionCount: number;
    exportSourceCount: number;
    mergedSourceCount: number;
    apiSourceCount: number;
  };
  newest25: P1751CandidateValidationRow[];
  paperworkSummary: {
    paperworkEligibleCount: number;
    expectedPaperworkSendCount: number;
    dropboxApiProjection: {
      postRequests: number;
      getRequests: number;
      totalRequests: number;
      withinBudget: boolean;
      budgetCeiling: number;
    };
  };
  controlledOperatorSendCycle: {
    safe: boolean;
    reasons: string[];
    p169GatesPass: boolean;
    p169BlockingFactors: string[];
  };
  conclusion: string;
};
