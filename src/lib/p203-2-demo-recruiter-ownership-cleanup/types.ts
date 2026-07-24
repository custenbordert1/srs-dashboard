/** P203.2 — Demo recruiter ownership cleanup. */

export const P203_2_SOURCE_PHASE = "P203.2" as const;
export const P203_2_SCHEMA_VERSION = 1 as const;
export const P203_2_MAX_BATCH = 100 as const;

export type P2032Classification =
  | "safe_automatic_repair"
  | "operator_confirmation_required"
  | "historical_only"
  | "conflicting_evidence"
  | "unresolved";

export type P2032Confidence = "high" | "medium" | "low" | "none";

export type P2032ReplacementSource =
  | "manual_audit"
  | "production_auto_audit"
  | "ownership_ledger"
  | "territory_routing"
  | "recruiting_team_policy"
  | "unassigned_policy"
  | "none";

/** Explicit production policy for demo-pollution remediations. */
export const P203_2_PRODUCTION_POLICY = {
  /**
   * When the only ownership evidence is invalid demo assignment (no prior valid
   * named owner), remediate to Recruiting Team — not Taylor mass-assignment.
   */
  allowRecruitingTeamFallbackWhenDemoOnlyEvidence: true,
  /** Do not mass-clear to Unassigned. */
  allowUnassignedFallback: false,
  /** Territory routing alone may propose Taylor but must not auto-apply mass Taylor. */
  allowAutomaticTaylorFromTerritoryOnly: false,
  /** Historical / terminal statuses stay in preview for operator review. */
  autoRepairHistorical: false,
} as const;

export type P2032StatusBucket =
  | "active"
  | "historical"
  | "paperwork_pending"
  | "paperwork_sent"
  | "signed"
  | "archived"
  | "workflow"
  | "ingestion";

export type P2032PreviewRow = {
  candidateId: string;
  redactedCandidateId: string;
  currentDemoOwner: string;
  proposedReplacement: string | null;
  replacementEvidence: string;
  replacementSource: P2032ReplacementSource;
  confidence: P2032Confidence;
  workflowVersion: number;
  expectedOwnershipVersion: number;
  expectedRecruiter: string;
  candidateStatus: string;
  paperworkStatus: string | null;
  statusBuckets: P2032StatusBucket[];
  classification: P2032Classification;
  operatorReviewRequired: boolean;
  idempotencyKey: string;
};

export type P2032OperatorLocalRow = P2032PreviewRow & {
  candidateName: string | null;
  email: string | null;
  phone: string | null;
  state: string | null;
  city: string | null;
};

export type P2032AuditCounts = {
  scannedWorkflows: number;
  scannedIngestion: number;
  demoOwnedWorkflows: number;
  byDemoRecruiter: Record<string, number>;
  byStatusBucket: Record<P2032StatusBucket, number>;
  byWorkflowStatus: Record<string, number>;
  selectorDemoNames: number;
  actingRecruiterDemoHits: number;
};

export type P2032CleanupAttempt = {
  candidateId: string;
  ok: boolean;
  detail: string;
  previousRecruiter: string | null;
  newRecruiter: string | null;
  ownershipVersionAfter: number | null;
  lifecycleFieldsChanged: string[];
  paperworkFieldsChanged: string[];
};

export type P2032Authorization = {
  actor: string;
  authorizedAt: string;
  expiresAt: string;
  fingerprint: string;
  maxBatch: number;
  allowProductionWrites: true;
};
