export const P132_SOURCE_PHASE = "P132";
export const P132_INVESTIGATION_MODE = "readOnly" as const;
export const P132_TARGET_CANDIDATE_ID = "92fa58cc5870";
export const P132_TARGET_CANDIDATE_NAME = "Tyree nicole Gilley";

export type HasResumeCalculationSite = {
  id: string;
  module: string;
  description: string;
  rule: string;
};

export type ResumeDetectionInvestigationReport = {
  sourcePhase: typeof P132_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P132_INVESTIGATION_MODE;
  targetCandidateId: typeof P132_TARGET_CANDIDATE_ID;
  targetCandidateName: typeof P132_TARGET_CANDIDATE_NAME;
  hasResumeCalculationSites: HasResumeCalculationSite[];
  storedIngestionRecord: {
    hasResume: boolean;
    resumeText: string;
    resumeFields: import("@/lib/breezy-api").BreezyCandidateResumeFields | undefined;
    resumeAssets: import("@/lib/recruiting-intelligence/resume-assets").BreezyResumeAsset[] | undefined;
    questionnaireEnrichmentAttemptedAt: string | undefined;
  };
  breezyRawPayload: {
    detailAvailable: boolean;
    documentsAvailable: boolean;
    resumeEndpointAvailable: boolean;
    rawDocuments: unknown;
    rawResume: unknown;
    detailResumeRelatedKeys: string[];
  };
  resumeSourceFindings: {
    primaryResumeSource: string;
    sourcesChecked: string[];
    conclusion: string;
  };
  parserComparison: {
    legacyRuleResult: boolean;
    fixedRuleResult: boolean;
    resumeAssetsDetected: number;
  };
  rootCause: string;
  remediation: string[];
  postFixSimulation: {
    hasResume: boolean;
    approvalScoreDeltaEstimate: number;
  };
  p131Recheck: import("@/lib/p131-manual-fix-verification-first-pilot-recheck/types").ManualFixVerificationReport | null;
  goNoGo: "GO" | "GO WITH CONDITIONS" | "NO-GO";
  goNoGoReason: string;
  executeBatchCalled: false;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
};
