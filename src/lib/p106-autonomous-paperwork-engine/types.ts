export const P106_SOURCE_PHASE = "P106";
export const P106_DEFAULT_MODE = "dryRun" as const;

export type AutonomousPaperworkRunMode = "dryRun" | "executeOne" | "executeSafeSingles";

export type PaperworkBlockerCategory =
  | "invalid_email"
  | "unpublished_job"
  | "duplicate_risk"
  | "already_sent"
  | "missing_questionnaire"
  | "missing_resume"
  | "missing_candidate_match"
  | "p84_gate_failed"
  | "call_first_required"
  | "terminal_status"
  | "unknown_manual_review";

export type AutonomousPaperworkCandidateResult = {
  candidateId: string;
  candidateName: string;
  email: string;
  positionId: string | null;
  positionTitle: string | null;
  recruiter: string | null;
  dm: string | null;
  category: "ready_to_send" | "sent" | "skipped_already_sent" | "blocked";
  blockerCategory: PaperworkBlockerCategory | null;
  blockerReason: string | null;
  recommendedFix: string | null;
  p84Eligible: boolean;
  autoRepairable: boolean;
  autoRepaired: boolean;
  signatureRequestId: string | null;
  sentAt: string | null;
  workflowStatus: string | null;
  onboardingStatus: string | null;
};

export type AutonomousPaperworkMetrics = {
  candidatesEvaluated: number;
  readyToSend: number;
  sent: number;
  skippedAlreadySent: number;
  blockedInvalidEmail: number;
  blockedUnpublishedJob: number;
  blockedDuplicateRisk: number;
  blockedP84: number;
  blockedManualReview: number;
  remainingActionNeeded: number;
  autoRepairedCount: number;
};

export type AutonomousPaperworkReport = {
  sourcePhase: typeof P106_SOURCE_PHASE;
  generatedAt: string;
  sectionTitle: string;
  mode: AutonomousPaperworkRunMode;
  mtdOnly: boolean;
  metrics: AutonomousPaperworkMetrics;
  readyToSend: AutonomousPaperworkCandidateResult[];
  sent: AutonomousPaperworkCandidateResult[];
  blocked: AutonomousPaperworkCandidateResult[];
  skippedAlreadySent: AutonomousPaperworkCandidateResult[];
  candidates: AutonomousPaperworkCandidateResult[];
  gates: {
    p99Ready: boolean;
    p101Go: boolean;
    p100LocksPass: boolean;
    liveSendEnabled: boolean;
    detail: string[];
  };
  artifactPaths: {
    p97Audit: string;
    p97Rollback: string;
    p100Audit: string;
  };
  runSummary: string | null;
};

export type AutonomousPaperworkRunResult = {
  ok: boolean;
  mode: AutonomousPaperworkRunMode;
  stoppedEarly: boolean;
  stopReason: string | null;
  sendsThisRun: number;
  report: AutonomousPaperworkReport;
  warnings: string[];
};
