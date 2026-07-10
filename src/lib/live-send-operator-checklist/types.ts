export const P101_SOURCE_PHASE = "P101";
export const P101_EXPECTED_CANDIDATE_COUNT = 27;

export type OperatorChecklistItemId =
  | "p97_persistence_complete"
  | "p99_readiness_approved"
  | "p100_controlled_send_ready"
  | "p84_live_send_enabled"
  | "rollback_artifact_present"
  | "audit_log_present"
  | "candidate_count_eligible"
  | "duplicate_risk_zero"
  | "invalid_email_zero"
  | "already_sent_excluded";

export type OperatorChecklistItem = {
  id: OperatorChecklistItemId;
  label: string;
  satisfied: boolean;
  detail: string;
};

export type LiveSendOperatorChecklistReport = {
  sourcePhase: typeof P101_SOURCE_PHASE;
  generatedAt: string;
  sectionTitle: "Live Send Operator Checklist";
  cohortLabel: string;
  goNoGo: "GO" | "NO-GO";
  goNoGoReason: string;
  checklist: OperatorChecklistItem[];
  metrics: {
    p97PersistedCount: number;
    p99ReadinessApproved: boolean;
    p100ReadyToSend: number;
    p100AlreadySent: number;
    candidateCount: number;
    eligibleCohortCount: number;
    duplicateRiskCount: number;
    invalidEmailCount: number;
    liveSend: boolean;
    p84Enabled: boolean;
    p84LiveMode: boolean;
  };
  remainingActionsBeforeExecuteOne: string[];
  recommendedFirstLiveSendApproach: string[];
  artifactPaths: {
    p97Rollback: string;
    p97Audit: string;
    p99Approval: string;
    p100State: string;
    p100Audit: string;
  };
  executeOneCommand: {
    method: "POST";
    path: "/api/controlled-live-send";
    body: {
      mode: "executeOne";
      executiveApprovalFlag: true;
    };
  };
  executeBatchCommand: {
    method: "POST";
    path: "/api/controlled-live-send";
    body: {
      mode: "executeBatch";
      executiveApprovalFlag: true;
      confirmationPhrase: "SEND 27 PAPERWORK PACKETS";
      candidateCount: number;
    };
    prerequisite: string;
  };
};
