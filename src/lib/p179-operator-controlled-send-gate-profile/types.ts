export const P179_SOURCE_PHASE = "P179" as const;

export type SendGateProfile = "operator" | "autonomous";

export type SendCycleGateFactorId =
  | "runner_running"
  | "processing_lock_held"
  | "continuous_mode_enabled"
  | "daemon_active"
  | "dropbox_budget_exceeded"
  | "dropbox_throttling"
  | "duplicate_protection_disabled"
  | "production_readiness_below_threshold"
  | "production_readiness_unavailable"
  | "no_eligible_candidates"
  | "last_cycle_errors"
  | "min_wait_since_last_cycle"
  | "p154_env_disabled"
  | "runner_unhealthy"
  | "dropbox_unhealthy"
  | "scheduler_not_ready"
  | "executive_not_approved";

export type SendCycleGateFactor = {
  id: SendCycleGateFactorId;
  message: string;
};

export type SendCycleGateEvaluation = {
  profile: SendGateProfile;
  pass: boolean;
  blockingFactors: string[];
  warnings: string[];
  schedulerRecommendation: string;
  approvalAction: string;
  readinessScore: number | null;
  runnerHealthy: boolean;
  runnerStatus: string;
  dropboxWithinBudget: boolean;
  healthScore: number;
};

export type P179CandidateSendRow = {
  candidateId: string;
  name: string;
  email: string;
  assignedRecruiter: string;
  workflowStatus: string | null;
  p152Eligible: boolean;
  p152Blockers: string[];
  p157Action: string | null;
  p169Outcome: string | null;
  operatorSendAllowed: boolean;
  autonomousSendAllowed: boolean;
  operatorBlockers: string[];
  autonomousBlockers: string[];
};

export type P179OperatorSendValidationReport = {
  sourcePhase: typeof P179_SOURCE_PHASE;
  generatedAt: string;
  readOnly: true;
  gateProfiles: {
    operator: SendCycleGateEvaluation;
    autonomous: SendCycleGateEvaluation;
  };
  summary: {
    paperworkReadyCount: number;
    operatorGateProfilePass: boolean;
    operatorSendAllowed: boolean;
    autonomousSendAllowed: boolean;
    maxSendsWithinDropboxBudget: number;
    projectedSendCount: number;
    projectedDropboxApiCalls: number;
    dropboxWithinBudget: boolean;
    blockedCandidateCount: number;
    warningCount: number;
  };
  candidates: P179CandidateSendRow[];
  blockedCandidates: P179CandidateSendRow[];
  warnings: string[];
  safetyConfirmation: string[];
};
