export const P134_SOURCE_PHASE = "P134";
export const P134_ANALYSIS_MODE = "previewOnly" as const;

export type RemediationBlockerId =
  | "recruiter_assignment_missing"
  | "mapping_confidence_below_threshold"
  | "unpublished_closed_job"
  | "missing_published_replacement"
  | "questionnaire_incomplete"
  | "resume_missing"
  | "paperwork_ready_missing"
  | "invalid_email"
  | "duplicate_risk"
  | "already_sent"
  | "template_missing"
  | "approval_policy_threshold"
  | "project_mapping_issue"
  | "ready_after_approval_signoff"
  | "additional_blocker";

export type RemediationTier = 1 | 2 | 3;

export type RemediationBlockerSeverity = "critical" | "high" | "medium" | "low";

export type RemediationBlockerOwner =
  | "recruiter"
  | "operations"
  | "mapping_reviewer"
  | "system"
  | "candidate";

export type RemediationBlocker = {
  id: RemediationBlockerId;
  label: string;
  severity: RemediationBlockerSeverity;
  owner: RemediationBlockerOwner;
  systemCapable: boolean;
  manualActionRequired: boolean;
  estimatedMinutesToResolve: number;
  expectedScoreImprovement: number;
  expectedDecisionAfterFix: string;
  detail: string;
  remediationSteps: string[];
};

export type CandidateRemediationPlan = {
  candidateId: string;
  candidateName: string;
  email: string;
  currentScore: number;
  currentDecision: string;
  scoreGapToAutoApprove: number;
  tier: RemediationTier;
  tierReason: string;
  blockers: RemediationBlocker[];
  manualActionCount: number;
  remediationPlan: string[];
  simulatedPostFixScore: number;
  simulatedPostFixDecision: string;
  eligibilityStatus: string;
  p106BlockerCategory: string | null;
};

export type PaperworkRemediationEngineReport = {
  sourcePhase: typeof P134_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P134_ANALYSIS_MODE;
  summary: {
    totalCandidatesEvaluated: number;
    blockedCandidateCount: number;
    autoApprovedCount: number;
    tier1Count: number;
    tier2Count: number;
    tier3Count: number;
    estimatedApprovalsUnlocked: number;
    autoApproveThreshold: number;
  };
  blockersByCategory: Array<{ id: RemediationBlockerId; label: string; count: number }>;
  tierCounts: { tier1: number; tier2: number; tier3: number };
  closestToAutoApproved: Array<{
    candidateId: string;
    candidateName: string;
    approvalScore: number;
    scoreGap: number;
    tier: RemediationTier;
    topBlocker: string;
  }>;
  approvalsUnlockedByFix: Array<{
    fixId: RemediationBlockerId;
    label: string;
    candidatesUnlocked: number;
  }>;
  topRecurringRootCauses: Array<{ cause: string; count: number; tier: RemediationTier }>;
  candidatePlans: CandidateRemediationPlan[];
  executivePanel: {
    totalBlockedCandidates: number;
    blockersByCategory: Array<{ id: string; label: string; count: number }>;
    tier1Count: number;
    tier2Count: number;
    tier3Count: number;
    closestToAutoApproved: PaperworkRemediationEngineReport["closestToAutoApproved"];
    approvalsUnlockedByFix: PaperworkRemediationEngineReport["approvalsUnlockedByFix"];
    topRecurringRootCauses: PaperworkRemediationEngineReport["topRecurringRootCauses"];
  };
  goNoGo: "GO" | "GO WITH CONDITIONS" | "NO-GO";
  goNoGoReason: string;
  executeBatchCalled: false;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
};
