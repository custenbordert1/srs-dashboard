export const P254_PHASE = "P254-eligibility-forensics";
export const P254_OPS_DATE = "2026-07-23";
export const P254_SOURCE_ARTIFACT = "artifacts/p253-live-send.json";

/** Exact failure groups requested by P254. */
export const P254_FAILURE_GROUPS = [
  "Already sent",
  "Already signed",
  "Packet pending",
  "Missing recruiter",
  "Missing DM",
  "Coverage unknown",
  "Distance exceeded",
  "Duplicate",
  "Missing phone",
  "Missing email",
  "Missing identity",
  "Qualification failure",
  "Other",
] as const;

export type P254FailureGroup = (typeof P254_FAILURE_GROUPS)[number];

export type P254RecoverableIssue =
  | "missing_recruiter"
  | "missing_dm"
  | "coverage_blocked"
  | "missing_phone"
  | "missing_email"
  | "missing_identity";

export const P254_RECOVERABLE_ISSUES: P254RecoverableIssue[] = [
  "missing_recruiter",
  "missing_dm",
  "coverage_blocked",
  "missing_phone",
  "missing_email",
  "missing_identity",
];

export type P254CandidateForensic = {
  candidateId: string;
  name: string;
  workflowStage: string;
  breezyStage: string | null;
  dropboxSignStatus: string;
  recruiter: string;
  districtManager: string;
  distanceMiles: number | null;
  coverageKnown: boolean;
  eligibilityResult: string;
  exactGateFailed: string;
  failureGroup: P254FailureGroup;
  allBlockers: string[];
  automaticallyRecoverable: boolean;
  requiredAction: string;
  signatureRequestId: string | null;
  location: string;
};

export type P254FailureGroupBucket = {
  group: P254FailureGroup;
  count: number;
  automaticallyRecoverable: number;
  requiringManualAction: number;
  candidateIds: string[];
};

export type P254RecoverableImpact = {
  issue: P254RecoverableIssue;
  label: string;
  candidatesWithIssue: number;
  /** Exact count that would become eligible if only this issue were fixed. */
  wouldBecomeEligibleIfFixed: number;
  candidateIdsThatWouldBecomeEligible: string[];
};

export type P254Totals = {
  reviewed: number;
  blocked: number;
  eligible: number;
  automaticallyRecoverable: number;
  requiringManualAction: number;
};

export type P254MissionResult = {
  phase: typeof P254_PHASE;
  opsDate: typeof P254_OPS_DATE;
  generatedAt: string;
  mode: "read_only_forensics";
  sourceArtifact: string;
  sourceGeneratedAt: string | null;
  p253Mode: string | null;
  p253AbortReason: string | null;
  totals: P254Totals;
  failureGroups: P254FailureGroupBucket[];
  recoverableImpact: P254RecoverableImpact[];
  candidates: P254CandidateForensic[];
  enrichment: {
    durableWorkflowRead: boolean;
    durableIngestionRead: boolean;
    breezyStagesResolved: number;
    durablePaths: string[];
  };
  safety: {
    paperworkSends: 0;
    workflowWrites: 0;
    dropboxWrites: 0;
    breezyWrites: 0;
    melWrites: 0;
  };
  artifacts: string[];
};
