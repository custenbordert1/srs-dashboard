export const P181_SOURCE_PHASE = "P181" as const;

/** Which candidate pool P152 evaluates before safety gates. */
export type SendQueueProfile = "operator" | "autonomous";

export type OperatorSendQueueCohort =
  | "explicit"
  | "p178_ready"
  | "newest_applicants"
  | "manual_selection";

/**
 * Operator-controlled send scope. Future UI can pass only `candidateIds`.
 * When `candidateIds` is non-empty it takes precedence over cohort and filters.
 */
export type OperatorSendQueueScope = {
  candidateIds?: string[];
  cohort?: OperatorSendQueueCohort | string;
  newestApplicants?: number;
  recruiters?: string[];
  assignedDMs?: string[];
  projects?: string[];
  states?: string[];
};

export type PaperworkSendQueueInput = {
  profile: SendQueueProfile;
  scope?: OperatorSendQueueScope;
};

export type PaperworkSendQueueSummary = {
  profile: SendQueueProfile;
  scope?: OperatorSendQueueScope;
  globalCandidateCount: number;
  scopedCandidateCount: number;
  /** True when operator profile would not expand into the global eligible pool. */
  operatorScopedOnly: boolean;
};

export type P181ScopedQueueValidationReport = {
  sourcePhase: typeof P181_SOURCE_PHASE;
  generatedAt: string;
  readOnly: true;
  autonomous: {
    globalPoolCount: number;
    eligibleCount: number;
    projectedSendCount: number;
    topCandidateIds: string[];
  };
  operator: {
    defaultScope: OperatorSendQueueScope;
    scopedPoolCount: number;
    eligibleCount: number;
    projectedSendCount: number;
    scopedCandidateIds: string[];
    p178ReadyCount: number;
    wouldLeakToGlobalPool: false;
  };
  comparison: {
    autonomousOnlyCandidateIds: string[];
    operatorOnlyCandidateIds: string[];
    sharedEligibleIds: string[];
  };
  safetyConfirmation: string[];
};
