export const P152_SOURCE_PHASE = "P152";
export const P152_DEFAULT_MAX_SENDS = 10;

export type ImmediatePaperworkHardBlocker =
  | "unassigned_recruiter"
  | "duplicate_candidate"
  | "archived_candidate"
  | "disqualified_candidate"
  | "invalid_email"
  | "paperwork_already_sent"
  | "paperwork_already_completed"
  | "active_signature_request";

export type LegacyPaperworkBlocker =
  | "p83_require_approval"
  | "workflow_not_paperwork_needed"
  | "action_not_send_paperwork"
  | "p144_confidence_threshold"
  | "missing_resume"
  | "manual_review_required"
  | "dm_needs_assignment"
  | "published_job_required"
  | "already_contacted_cooldown"
  | "operational_fit"
  | "p145_queue_exclusion"
  | "other";

export type ImmediatePaperworkCandidateRow = {
  candidateId: string;
  candidateName: string;
  email: string | null;
  recruiter: string;
  workflowStatus: string;
  paperworkStatus: string;
  eligible: boolean;
  hardBlockers: string[];
  primaryHardBlocker: ImmediatePaperworkHardBlocker | null;
  legacyBlockersBypassed: string[];
  projectedSend: boolean;
};

export type ImmediatePaperworkSendQueueReport = {
  profile: "operator" | "autonomous";
  scopedCandidateCount: number;
  globalCandidateCount: number;
  operatorScopedOnly: boolean;
};

export type ImmediatePaperworkPolicyReport = {
  sourcePhase: typeof P152_SOURCE_PHASE;
  generatedAt: string;
  dryRun: boolean;
  immediatePaperworkEnabled: boolean;
  sendQueue: ImmediatePaperworkSendQueueReport;
  candidatesEvaluated: number;
  eligibleCount: number;
  excludedCount: number;
  projectedSendCount: number;
  sentCount: number;
  blockedCount: number;
  failedCount: number;
  skippedCount: number;
  duplicatesPrevented: number;
  exclusionSummary: Record<string, number>;
  legacyBypassSummary: Record<string, number>;
  bypassedRules: string[];
  candidates: ImmediatePaperworkCandidateRow[];
  executionItems: ImmediatePaperworkExecutionItem[];
  executionTimeMs: number;
  maxSendsLimit: number;
  capReached: boolean;
  stoppedOnError: boolean;
  /** Candidate IDs that received live paperwork during this P152 run. */
  sentCandidateIds: string[];
  safetyFlags: {
    breezyWrites: false;
    executeBatchCalled: false;
    paperworkSent: boolean;
  };
  rollbackRecommendation: string;
};

export type ImmediatePaperworkExecutionItem = {
  candidateId: string;
  candidateName: string;
  email: string;
  recruiter: string;
  project: string;
  sendResult: "sent" | "skipped" | "blocked" | "failed" | "duplicatePrevented";
  reason: string;
  executionMode: "dry_run" | "live";
  signatureRequestId: string | null;
};
